// ===== EXPORT MODULE =====
// Funções de exportação de dados
// Migrado para IndexedDB

const exportModule = {

    // Exportar backup completo
    async exportarBackup() {
        try {
            utils.mostrarToast('Gerando backup...', 'info');

            const backup = {
                version: 2,
                generatedAt: new Date().toISOString(),
                config: await db.getAll('config'),
                escolas: await db.getAll('escolas'),
                turmas: await db.getAll('turmas'),
                alunos: await db.getAll('alunos'),
                chamadas: await db.getAll('chamadas'),
                eventos_nota: await db.getAll('eventos_nota')
            };

            const json = JSON.stringify(backup, null, 2);
            const filename = `chamada-pro-backup-${utils.formatarData(new Date())}.json`
                .replace(/\//g, '-');

            utils.downloadFile(filename, json, 'application/json');
            utils.mostrarToast('Backup exportado com sucesso!', 'success');
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao exportar backup', 'error');
        }
    },

    // Importar backup
    importarBackup() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const backup = JSON.parse(event.target.result);

                    // Validar backup básico
                    if (!backup.turmas || !backup.alunos) {
                        throw new Error('Arquivo de backup inválido (estruturas ausentes)');
                    }

                    if (!utils.confirmar(
                        'Importar backup irá SUBSTITUIR todos os dados atuais. Deseja continuar?'
                    )) {
                        return;
                    }

                    utils.mostrarToast('Importando dados...', 'info');

                    // Importação Sequencial para garantir integridade

                    // Stores a limpar e preencher
                    const stores = ['config', 'escolas', 'turmas', 'alunos', 'chamadas', 'eventos_nota'];

                    for (const storeName of stores) {
                        if (backup[storeName] && Array.isArray(backup[storeName])) {
                            // Limpar store atual?
                            // O db.js não tem 'clear' wrapper, mas tem 'delete'.
                            // Para limpar tudo, teríamos que pegar todos IDs e deletar, ou recriar DB.
                            // Wrapper `db` não tem `clear`. Vamos iterar e deletar tudo?
                            // Ou simplesmente fazer `put` (upsert) dos novos e manter os velhos (merge)?
                            // Prompt pediu "Modo snapshot: limpar stores, inserir com db.put".
                            // Vou implementar 'clearStore' helper inline ou lógica de delete all.

                            const currentItems = await db.getAll(storeName);
                            const deletePromises = currentItems.map(item => db.delete(storeName, item.id || item.key));
                            await Promise.all(deletePromises);

                            // Inserir novos
                            const insertPromises = backup[storeName].map(item => db.put(storeName, item));
                            await Promise.all(insertPromises);
                        }
                    }

                    utils.mostrarToast('Backup importado com sucesso!', 'success');

                    // Recarregar app
                    setTimeout(() => {
                        location.reload();
                    }, 1500);

                } catch (error) {
                    console.error('Erro ao processar backup:', error);
                    utils.mostrarToast('Arquivo de backup inválido ou erro na importação', 'error');
                }
            };

            reader.readAsText(file);
        };

        input.click();
    },

    // Exportar turma como JSON
    async exportarTurmaJSON(turmaId) {
        try {
            const turma = await db.get('turmas', turmaId);
            if (!turma) return;

            const chamadas = await db.getByIndex('chamadas', 'turmaId', turmaId);
            const alunos = await db.getByIndex('alunos', 'turmaId', turmaId);

            const dados = {
                turma: turma,
                alunos: alunos,
                chamadas: chamadas,
                exportedAt: new Date().toISOString()
            };

            const json = JSON.stringify(dados, null, 2);
            const filename = `turma_${turma.nome}.json`.replace(/[^a-z0-9.-]/gi, '_');

            utils.downloadFile(filename, json, 'application/json');
            utils.mostrarToast('Turma exportada!', 'success');
        } catch (e) {
            console.error(e);
            utils.mostrarToast("Erro ao exportar turma", 'error');
        }
    },

    // Exportar lista de alunos como CSV
    async exportarAlunosCSV(turmaId) {
        try {
            const turma = await db.get('turmas', turmaId);
            if (!turma) return;

            const alunos = await db.getByIndex('alunos', 'turmaId', turmaId);

            if (alunos.length === 0) {
                utils.mostrarToast('Nenhum aluno para exportar', 'warning');
                return;
            }

            const colunas = [
                { field: 'matricula', label: 'Matrícula' },
                { field: 'nome', label: 'Nome' },
                { field: 'email', label: 'Email' }
            ];

            const csv = utils.gerarCSV(alunos, colunas);
            const filename = `alunos_${turma.nome}.csv`.replace(/[^a-z0-9.-]/gi, '_');

            utils.downloadFile(filename, csv, 'text/csv;charset=utf-8;');
            utils.mostrarToast('Lista de alunos exportada!', 'success');
        } catch (e) {
            console.error(e);
            utils.mostrarToast("Erro ao exportar alunos", 'error');
        }
    },

    // Gerar relatório de frequência geral
    async gerarRelatorioFrequencia(turmaId) {
        try {
            const turma = await db.get('turmas', turmaId);
            if (!turma) return;

            const chamadas = await db.getByIndex('chamadas', 'turmaId', turmaId);
            const alunos = await db.getByIndex('alunos', 'turmaId', turmaId);

            if (chamadas.length === 0) {
                utils.mostrarToast('Nenhuma chamada para gerar relatório', 'warning');
                return;
            }

            // Calcular frequência por aluno
            const frequencia = alunos.map(aluno => {
                const presencas = chamadas.filter(c => {
                    if (c.registros) {
                        const r = c.registros[aluno.id];
                        return r && r.status === 'P';
                    } else if (Array.isArray(c.presencas)) {
                        // legacy
                        return c.presencas.some(p => p.matricula === aluno.matricula && (p.status || 'P') === 'P');
                    }
                    return false;
                }).length;

                const percentual = utils.calcularPercentual(presencas, chamadas.length);

                return {
                    matricula: aluno.matricula,
                    nome: aluno.nome,
                    presencas: presencas,
                    totalChamadas: chamadas.length,
                    percentual: percentual + '%'
                };
            });

            // Ordenar por nome
            frequencia.sort((a, b) => a.nome.localeCompare(b.nome));

            const colunas = [
                { field: 'matricula', label: 'Matrícula' },
                { field: 'nome', label: 'Nome' },
                { field: 'presencas', label: 'Presenças' },
                { field: 'totalChamadas', label: 'Total Chamadas' },
                { field: 'percentual', label: 'Frequência' }
            ];

            const csv = utils.gerarCSV(frequencia, colunas);
            const filename = `relatorio_frequencia_${turma.nome}.csv`
                .replace(/[^a-z0-9.-]/gi, '_');

            utils.downloadFile(filename, csv, 'text/csv;charset=utf-8;');
            utils.mostrarToast('Relatório de frequência exportado!', 'success');
        } catch (e) {
            console.error(e);
            utils.mostrarToast("Erro ao gerar relatório", 'error');
        }
    }
};
