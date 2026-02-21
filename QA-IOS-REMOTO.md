# QA iOS Remoto (Sem iPhone Físico)

Guia rápido para validar compatibilidade iOS/Safari usando BrowserStack (ou serviço equivalente).

## Ambiente recomendado
- Safari iOS 17 (iPhone 15)
- Safari iOS 16 (iPhone 13)
- Safari iOS 15 (iPhone 12) para regressão

## Pré-requisitos
- App publicado em URL HTTPS pública.
- Build atual já com `SW_VERSION` correto.
- QR Code de teste disponível (arquivo impresso ou em outra tela).

## Roteiro de teste (10-20 min)

### 1) Carregamento inicial
- Abrir URL no Safari iOS remoto.
- Validar que tela inicial carrega sem erro crítico no console.
- Aceite: app abre, navegação básica funciona.

### 2) Permissão de câmera e scanner
- Entrar em turma com alunos.
- Iniciar scanner.
- Conceder permissão de câmera.
- Tentar leitura de QR válido.
- Aceite: câmera abre, leitura registra presença.

### 3) Compartilhamento (Web Share)
- Abrir resumo da chamada.
- Acionar botão de compartilhar.
- Aceite: sheet nativa abre (ou fallback com mensagem amigável se indisponível no ambiente remoto).

### 4) Relatórios e exportação
- Gerar PDF de QR Codes.
- Gerar relatório mensal PDF.
- Exportar CSV.
- Aceite: arquivos são gerados/download iniciados sem erro de runtime.

### 5) PWA e instalação (A2HS)
- No Safari iOS: usar compartilhar -> "Adicionar à Tela de Início".
- Abrir app pelo ícone instalado.
- Aceite: abre em modo app, ícone correto, navegação principal OK.

### 6) Offline + atualização
- Com app já carregado, simular offline.
- Reabrir app instalado/PWA.
- Aceite: app abre offline no fluxo principal.
- Publicar versão de teste nova e validar prompt de atualização.
- Aceite: atualização aplicada após reload.

## Casos de falha comuns
- Câmera não abre: domínio sem HTTPS ou permissão negada.
- Share não abre: limitação do ambiente remoto/teste; validar fallback.
- PWA não instala: manifest/ícones inválidos ou contexto não elegível.
- Offline falha: cache antigo, `SW_VERSION` sem bump, ou assets fora do deploy.

## Registro de evidências (obrigatório)
- Captura de tela do scanner ativo.
- Captura de tela do share sheet (ou mensagem de fallback).
- Captura da instalação na tela inicial.
- Captura do app abrindo em offline.
- Log final com status por item: `PASS` / `FAIL` / `N/A`.

## Template de resultado
| Item | iOS 17 | iOS 16 | iOS 15 | Observações |
|---|---|---|---|---|
| Carregamento inicial |  |  |  |  |
| Câmera/Scanner |  |  |  |  |
| Share |  |  |  |  |
| Export CSV/PDF |  |  |  |  |
| Instalação A2HS |  |  |  |  |
| Offline |  |  |  |  |
| Atualização SW |  |  |  |  |
