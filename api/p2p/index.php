<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET,POST,PUT,OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Session-Token');
    http_response_code(204);
    exit;
}

final class HttpError extends RuntimeException
{
    public int $status;
    public string $codeName;

    public function __construct(int $status, string $codeName, string $message)
    {
        parent::__construct($message);
        $this->status = $status;
        $this->codeName = $codeName;
    }
}

function json_out(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function now_utc(): DateTimeImmutable
{
    return new DateTimeImmutable('now', new DateTimeZone('UTC'));
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $cfg = p2p_config()['db'];
    if (!$cfg['name'] || !$cfg['user']) {
        throw new HttpError(500, 'SERVER_CONFIG_ERROR', 'Banco de dados nao configurado');
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $cfg['host'],
        $cfg['port'],
        $cfg['name'],
        $cfg['charset']
    );

    $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new HttpError(400, 'INVALID_JSON', 'Payload JSON invalido');
    }
    return $data;
}

function require_sdp(array $obj, string $fieldName): array
{
    $sdp = $obj[$fieldName] ?? null;
    if (!is_array($sdp)) {
        throw new HttpError(400, 'INVALID_PAYLOAD', "Campo {$fieldName} invalido");
    }
    $type = trim((string)($sdp['type'] ?? ''));
    $text = trim((string)($sdp['sdp'] ?? ''));
    if ($type === '' || $text === '') {
        throw new HttpError(400, 'INVALID_PAYLOAD', "Campo {$fieldName} incompleto");
    }
    return ['type' => $type, 'sdp' => $text];
}

function build_route_path(): string
{
    $uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    if ($scriptDir !== '' && strpos($uriPath, $scriptDir) === 0) {
        $uriPath = substr($uriPath, strlen($scriptDir));
    }
    if ($uriPath === '' || $uriPath === false) {
        return '/';
    }
    if ($uriPath[0] !== '/') {
        $uriPath = '/' . $uriPath;
    }
    return $uriPath;
}

function hash_token(string $token): string
{
    return hash('sha256', $token);
}

function token_from_header(): string
{
    $token = trim((string)($_SERVER['HTTP_X_SESSION_TOKEN'] ?? ''));
    if ($token === '') {
        throw new HttpError(401, 'TOKEN_REQUIRED', 'Token da sessao ausente');
    }
    return $token;
}

function random_token(int $bytes = 24): string
{
    return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
}

function random_code(int $size = 6): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $max = strlen($alphabet) - 1;
    $out = '';
    for ($i = 0; $i < $size; $i++) {
        $out .= $alphabet[random_int(0, $max)];
    }
    return $out;
}

function cleanup_expired(PDO $pdo): void
{
    $cfg = p2p_config()['api'];
    $hours = max(1, (int)$cfg['cleanupHours']);
    $sql = "DELETE FROM p2p_sessions WHERE expires_at < (UTC_TIMESTAMP() - INTERVAL {$hours} HOUR)";
    $pdo->exec($sql);
}

function fetch_by_code(PDO $pdo, string $sessionCode): ?array
{
    $st = $pdo->prepare('SELECT * FROM p2p_sessions WHERE session_code = :c LIMIT 1');
    $st->execute([':c' => $sessionCode]);
    $row = $st->fetch();
    return is_array($row) ? $row : null;
}

function fetch_by_session_id(PDO $pdo, string $sessionId): ?array
{
    $st = $pdo->prepare('SELECT * FROM p2p_sessions WHERE session_id = :sid LIMIT 1');
    $st->execute([':sid' => $sessionId]);
    $row = $st->fetch();
    return is_array($row) ? $row : null;
}

function is_expired(array $row): bool
{
    $exp = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', (string)$row['expires_at'], new DateTimeZone('UTC'));
    if (!$exp) return true;
    return $exp < now_utc();
}

function require_schema_version(array $body): void
{
    $expected = p2p_config()['api']['schemaVersion'];
    $received = isset($body['schemaVersion']) ? (int)$body['schemaVersion'] : 0;
    if ($received !== $expected) {
        throw new HttpError(400, 'INVALID_SCHEMA_VERSION', 'schemaVersion invalido');
    }
}

function create_session(PDO $pdo): void
{
    $body = read_json_body();
    require_schema_version($body);
    $offer = require_sdp($body, 'offer');

    $cfg = p2p_config()['api'];
    $ttl = isset($body['ttlSec']) ? (int)$body['ttlSec'] : (int)$cfg['defaultTtlSec'];
    $ttl = max(15, min((int)$cfg['maxTtlSec'], $ttl));
    $exp = now_utc()->add(new DateInterval('PT' . $ttl . 'S'));

    $sessionId = 'sess_' . bin2hex(random_bytes(8));
    $senderToken = random_token(24);
    $sessionCode = '';
    for ($i = 0; $i < 6; $i++) {
        $cand = random_code(6);
        $exists = fetch_by_code($pdo, $cand);
        if (!$exists) {
            $sessionCode = $cand;
            break;
        }
    }
    if ($sessionCode === '') {
        throw new HttpError(500, 'CODE_GENERATION_FAILED', 'Falha ao gerar codigo de sessao');
    }

    $st = $pdo->prepare(
        'INSERT INTO p2p_sessions
         (session_id, session_code, sender_token_hash, receiver_token_hash, offer_json, answer_json, status, expires_at, created_at, receiver_claimed_at, answered_at, consumed_at)
         VALUES
         (:sid, :scode, :sth, NULL, :offer, NULL, :status, :exp, UTC_TIMESTAMP(), NULL, NULL, NULL)'
    );
    $st->execute([
        ':sid' => $sessionId,
        ':scode' => $sessionCode,
        ':sth' => hash_token($senderToken),
        ':offer' => json_encode($offer, JSON_UNESCAPED_UNICODE),
        ':status' => 'pending',
        ':exp' => $exp->format('Y-m-d H:i:s'),
    ]);

    json_out(200, [
        'sessionId' => $sessionId,
        'sessionCode' => $sessionCode,
        'senderToken' => $senderToken,
        'expiresAt' => $exp->format(DateTimeInterface::ATOM),
    ]);
}

function get_offer_by_code(PDO $pdo, string $sessionCode): void
{
    $row = fetch_by_code($pdo, strtoupper(trim($sessionCode)));
    if (!$row) {
        throw new HttpError(404, 'SESSION_NOT_FOUND', 'Sessao nao encontrada');
    }
    if (is_expired($row)) {
        throw new HttpError(410, 'SESSION_EXPIRED', 'Sessao expirada');
    }
    if (($row['status'] ?? '') === 'consumed') {
        throw new HttpError(409, 'SESSION_ALREADY_USED', 'Sessao ja utilizada');
    }

    $offer = json_decode((string)$row['offer_json'], true);
    if (!is_array($offer) || !isset($offer['type'], $offer['sdp'])) {
        throw new HttpError(500, 'CORRUPT_SESSION', 'Oferta da sessao invalida');
    }
    if (!empty($row['receiver_claimed_at'])) {
        throw new HttpError(409, 'SESSION_RECEIVER_ALREADY_CLAIMED', 'Sessao ja foi pareada por outro receptor');
    }

    // Token do receptor e emitido uma unica vez para evitar reuso.
    $receiverTokenRaw = random_token(24);
    $st = $pdo->prepare(
        'UPDATE p2p_sessions
         SET receiver_token_hash = :rth,
             receiver_claimed_at = UTC_TIMESTAMP()
         WHERE id = :id AND receiver_claimed_at IS NULL'
    );
    $st->execute([
        ':rth' => hash_token($receiverTokenRaw),
        ':id' => $row['id'],
    ]);
    if ($st->rowCount() === 0) {
        throw new HttpError(409, 'SESSION_RECEIVER_ALREADY_CLAIMED', 'Sessao ja foi pareada por outro receptor');
    }

    json_out(200, [
        'sessionId' => $row['session_id'],
        'receiverToken' => $receiverTokenRaw,
        'offer' => $offer,
        'expiresAt' => (new DateTimeImmutable((string)$row['expires_at'], new DateTimeZone('UTC')))->format(DateTimeInterface::ATOM),
    ]);
}

function submit_answer(PDO $pdo, string $sessionId): void
{
    $body = read_json_body();
    require_schema_version($body);
    $answer = require_sdp($body, 'answer');
    $tokenHash = hash_token(token_from_header());

    $row = fetch_by_session_id($pdo, $sessionId);
    if (!$row) {
        throw new HttpError(404, 'SESSION_NOT_FOUND', 'Sessao nao encontrada');
    }
    if (is_expired($row)) {
        throw new HttpError(410, 'SESSION_EXPIRED', 'Sessao expirada');
    }
    if (!hash_equals((string)$row['receiver_token_hash'], $tokenHash)) {
        throw new HttpError(401, 'INVALID_TOKEN', 'Token da sessao invalido');
    }
    if (!empty($row['answer_json'])) {
        throw new HttpError(409, 'ANSWER_ALREADY_SUBMITTED', 'Sessao ja possui resposta');
    }

    $st = $pdo->prepare(
        'UPDATE p2p_sessions
         SET answer_json = :answer, status = :status, answered_at = UTC_TIMESTAMP()
         WHERE id = :id'
    );
    $st->execute([
        ':answer' => json_encode($answer, JSON_UNESCAPED_UNICODE),
        ':status' => 'ready',
        ':id' => $row['id'],
    ]);

    json_out(200, ['ok' => true]);
}

function get_answer(PDO $pdo, string $sessionId): void
{
    $tokenHash = hash_token(token_from_header());
    $row = fetch_by_session_id($pdo, $sessionId);
    if (!$row) {
        throw new HttpError(404, 'SESSION_NOT_FOUND', 'Sessao nao encontrada');
    }
    if (is_expired($row)) {
        json_out(200, ['status' => 'expired']);
    }
    if (!hash_equals((string)$row['sender_token_hash'], $tokenHash)) {
        throw new HttpError(401, 'INVALID_TOKEN', 'Token da sessao invalido');
    }
    if (($row['status'] ?? '') === 'consumed') {
        throw new HttpError(409, 'SESSION_ALREADY_USED', 'Sessao ja consumida');
    }
    if (empty($row['answer_json'])) {
        json_out(200, ['status' => 'pending']);
    }

    $answer = json_decode((string)$row['answer_json'], true);
    if (!is_array($answer) || !isset($answer['type'], $answer['sdp'])) {
        throw new HttpError(500, 'CORRUPT_SESSION', 'Resposta da sessao invalida');
    }

    // Invalida reuso apos o emissor consumir a resposta.
    $st = $pdo->prepare('UPDATE p2p_sessions SET status = :status, consumed_at = UTC_TIMESTAMP() WHERE id = :id');
    $st->execute([
        ':status' => 'consumed',
        ':id' => $row['id'],
    ]);

    json_out(200, [
        'status' => 'ready',
        'answer' => $answer,
    ]);
}

try {
    $pdo = db();
    cleanup_expired($pdo);

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $route = build_route_path();

    if ($method === 'POST' && $route === '/sessions') {
        create_session($pdo);
    }

    if ($method === 'GET' && preg_match('#^/sessions/by-code/([a-zA-Z0-9]+)$#', $route, $m)) {
        get_offer_by_code($pdo, $m[1]);
    }

    if ($method === 'PUT' && preg_match('#^/sessions/([a-zA-Z0-9_]+)/answer$#', $route, $m)) {
        submit_answer($pdo, $m[1]);
    }

    if ($method === 'GET' && preg_match('#^/sessions/([a-zA-Z0-9_]+)/answer$#', $route, $m)) {
        get_answer($pdo, $m[1]);
    }

    throw new HttpError(404, 'NOT_FOUND', 'Rota nao encontrada');
} catch (HttpError $e) {
    json_out($e->status, [
        'error' => $e->codeName,
        'message' => $e->getMessage(),
    ]);
} catch (Throwable $e) {
    error_log('[p2p-api] ' . $e->getMessage());
    json_out(500, [
        'error' => 'INTERNAL_ERROR',
        'message' => 'Erro interno ao processar requisicao',
    ]);
}
