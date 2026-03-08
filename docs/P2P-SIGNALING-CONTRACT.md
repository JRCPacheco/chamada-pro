# Contrato de Sinalizacao P2P (Sessao Curta v1)

## Objetivo
Trocar oferta/resposta WebRTC via backend leve, sem trafegar dados da turma no servidor.

## Regras de sessao
- `schemaVersion`: `1`
- Sessao curta: TTL padrao de `45s`
- Token unico por papel:
- `senderToken`: consultar resposta
- `receiverToken`: enviar resposta
- `receiverToken` e emitido uma unica vez ao resolver o codigo curto
- Expiracao invalida reutilizacao de codigo/token

## Endpoints

### `POST /api/p2p/sessions`
Cria sessao a partir da oferta do emissor.

Body:
```json
{
  "schemaVersion": 1,
  "ttlSec": 45,
  "offer": { "type": "offer", "sdp": "..." }
}
```

Response:
```json
{
  "sessionId": "sess_abc123",
  "sessionCode": "7H4K2P",
  "senderToken": "tok_sender_x",
  "expiresAt": "2026-03-08T18:10:00.000Z"
}
```

### `GET /api/p2p/sessions/by-code/{sessionCode}`
Resolve codigo curto para oferta.

Response:
```json
{
  "sessionId": "sess_abc123",
  "receiverToken": "tok_receiver_y",
  "offer": { "type": "offer", "sdp": "..." },
  "expiresAt": "2026-03-08T18:10:00.000Z"
}
```

### `PUT /api/p2p/sessions/{sessionId}/answer`
Salva resposta do receptor.

Header:
- `X-Session-Token: <receiverToken>`

Body:
```json
{
  "schemaVersion": 1,
  "answer": { "type": "answer", "sdp": "..." }
}
```

Response:
```json
{ "ok": true }
```

### `GET /api/p2p/sessions/{sessionId}/answer`
Consulta status da resposta (polling do emissor).

Header:
- `X-Session-Token: <senderToken>`

Responses:
```json
{ "status": "pending" }
```
```json
{ "status": "ready", "answer": { "type": "answer", "sdp": "..." } }
```
```json
{ "status": "expired" }
```

## Erros esperados
- `400`: payload invalido
- `401`: token invalido
- `404`: sessao nao encontrada
- `409`: sessao ja respondida/consumida
- `409`: sessao ja pareada por outro receptor
- `410`: sessao expirada

## Privacidade
- Servidor trafega apenas sinalizacao SDP/ICE.
- Payload da turma continua no DataChannel P2P.
- Nao armazenar dados pessoais da turma em logs de sinalizacao.
