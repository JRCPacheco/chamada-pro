<?php
declare(strict_types=1);

function p2p_env(string $key, ?string $default = null): ?string
{
    $val = getenv($key);
    if ($val === false || $val === null || $val === '') {
        return $default;
    }
    return $val;
}

function p2p_config(): array
{
    $base = [
        'db' => [
            'host' => p2p_env('P2P_DB_HOST', '127.0.0.1'),
            'port' => (int)p2p_env('P2P_DB_PORT', '3306'),
            'name' => p2p_env('P2P_DB_NAME', ''),
            'user' => p2p_env('P2P_DB_USER', ''),
            'pass' => p2p_env('P2P_DB_PASS', ''),
            'charset' => p2p_env('P2P_DB_CHARSET', 'utf8mb4'),
        ],
        'api' => [
            'schemaVersion' => 1,
            'defaultTtlSec' => (int)p2p_env('P2P_DEFAULT_TTL_SEC', '45'),
            'maxTtlSec' => (int)p2p_env('P2P_MAX_TTL_SEC', '120'),
            'cleanupHours' => (int)p2p_env('P2P_CLEANUP_HOURS', '24'),
        ],
    ];

    $localPath = __DIR__ . '/config.local.php';
    if (is_file($localPath)) {
        $local = require $localPath;
        if (is_array($local)) {
            $base = array_replace_recursive($base, $local);
        }
    }

    return $base;
}
