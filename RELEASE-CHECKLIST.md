# Release Checklist (Web/PWA)

Use esta lista antes de cada publicação em produção.

## 1) Preparação de versão
- [ ] Atualizar versão em `js/app-version.js` (`version`, `stage`, `label`).
- [ ] Se houve mudança em arquivos estáticos, fazer bump de `SW_VERSION` em `sw.js`.
- [ ] Revisar `manifest.json` (nome, ícones, `start_url`, `scope`).

## 2) Build e arquivos publicados
- [ ] Garantir deploy de todos os arquivos: `index.html`, `sw.js`, `manifest.json`, `css/`, `js/`, `libs/`, `assets/`.
- [ ] Confirmar que não há dependência CDN crítica no `index.html`.
- [ ] Confirmar que `sw.js` está acessível em produção (`/sw.js` ou `./sw.js` conforme rota).

## 3) Teste funcional mínimo (smoke test)
- [ ] Abrir app e carregar turmas.
- [ ] Criar/editar/excluir turma.
- [ ] Adicionar aluno manualmente.
- [ ] Importar CSV de alunos.
- [ ] Gerar QR Codes (PDF).
- [ ] Iniciar scanner e ler QR.
- [ ] Finalizar chamada e exportar CSV.
- [ ] Abrir Relatórios e gerar PDF mensal.

## 4) Teste PWA/offline (obrigatório)
- [ ] Instalar/abrir como PWA.
- [ ] Com internet: app carrega normalmente.
- [ ] Sem internet: app abre e navega no fluxo principal.
- [ ] Publicar uma nova versão de teste e validar aviso de atualização.
- [ ] Confirmar que atualização aplica versão nova após recarregar.

## 5) Segurança e compatibilidade
- [ ] Verificar console sem erros críticos (erros bloqueantes, CSP, SW, permissões).
- [ ] Confirmar câmera em HTTPS (ou localhost no desenvolvimento).
- [ ] Confirmar funcionamento em pelo menos:
  - [ ] Chrome Android
  - [ ] Firefox desktop
  - [ ] Safari iOS (quando disponível)
- [ ] Executar roteiro de validação iOS remoto em `QA-IOS-REMOTO.md`.

## 6) Dados e recuperação
- [ ] Testar exportação de backup (JSON).
- [ ] Testar importação de backup.
- [ ] Confirmar persistência após fechar/reabrir navegador.

## 7) Aprovação final
- [ ] Versão exibida em `Menu > Sobre` correta.
- [ ] Data/hora de release registrada internamente.
- [ ] Publicação concluída e validada em produção.
