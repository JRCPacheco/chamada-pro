# PP-11 - Matriz Minima de Testes de Campo

## Objetivo
Validar o fluxo real de envio/recebimento de turma entre professores com foco em:
- taxa de sucesso P2P,
- uso de fallback,
- tempo total da tarefa,
- erros de importacao.

## Preparacao
1. Ativar sinalizacao no build de piloto (`p2p_signaling=true` e `signaling.enabled=true`).
2. Publicar backend `api/p2p` no mesmo dominio do app.
3. Limpar metricas locais em Configuracoes antes de cada rodada.
4. Executar testes com 2 ou 3 professores.

## Matriz de dispositivos/rede
- Android A: Chrome atualizado, Wi-Fi bom.
- Android B: Chrome desatualizado, 4G medio.
- Android C (opcional): rede fraca/intermitente.

## Cenarios obrigatorios
1. P2P sucesso por sinalizacao.
2. Timeout de 12s e fallback por arquivo.
3. Import de arquivo invalido.
4. Import de versao incompativel (`schemaVersion` maior).

## Registro por execucao
- Professor origem/destino.
- Dispositivo e navegador.
- Tipo de rede.
- Cenário executado.
- Resultado: `success_p2p`, `fallback`, `failed`.
- Tempo total da tarefa (segundos).
- Erro exibido (quando houver).

## Coleta de metricas
No final de cada rodada:
1. Abrir Configuracoes.
2. Clicar em `Ver Resumo do Piloto`.
3. Clicar em `Exportar Metricas do Piloto`.
4. Consolidar JSONs no relatorio final.

## Gate de aceite sugerido
- Taxa de sucesso P2P >= 70% em rede normal.
- 100% dos casos com conclusao via algum caminho (P2P ou fallback).
- Tempo medio <= processo atual do professor.
- Nenhuma sobrescrita silenciosa de dados.
