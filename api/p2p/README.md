# P2P Signaling API (PHP + MySQL)

Backend mínimo para sessão curta de sinalização WebRTC.

## Rotas
- `POST /api/p2p/sessions`
- `GET /api/p2p/sessions/by-code/{sessionCode}`
- `PUT /api/p2p/sessions/{sessionId}/answer`
- `GET /api/p2p/sessions/{sessionId}/answer`

## Configuracao (Hostinger)
Voce pode usar variaveis de ambiente OU arquivo local:
- copie `config.local.php.example` para `config.local.php` e ajuste credenciais.

Variaveis suportadas:

- `P2P_DB_HOST`
- `P2P_DB_PORT` (default `3306`)
- `P2P_DB_NAME`
- `P2P_DB_USER`
- `P2P_DB_PASS`
- `P2P_DB_CHARSET` (default `utf8mb4`)
- `P2P_DEFAULT_TTL_SEC` (default `45`)
- `P2P_MAX_TTL_SEC` (default `120`)
- `P2P_CLEANUP_HOURS` (default `24`)

## Banco
Execute o script [`schema.sql`](./schema.sql) no MySQL.

## Deploy
1. Suba a pasta `api/p2p` para o mesmo domínio do app.
2. Garanta `mod_rewrite` habilitado no Apache.
3. Teste com uma chamada `POST /api/p2p/sessions`.
