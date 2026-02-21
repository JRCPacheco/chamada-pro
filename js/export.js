// ===== EXPORT MODULE =====
// Funções de exportação de dados
// Migrado para IndexedDB

const exportModule = {
    _formatarStampArquivo(date = new Date()) {
        const d = new Date(date);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${dd}${mm}${yyyy}_${hh}${min}`;
    },

    _slug(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9._-]/gi, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .toLowerCase();
    },

    _normalizarNomeEscola(nome) {
        return String(nome || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    },

    async _resolverEscolaParaTurmaBackup(turmaOriginal, escolaOriginal = null) {
        const escolaIdOriginal = String(turmaOriginal?.escolaId || turmaOriginal?.escola_id || escolaOriginal?.id || '').trim();
        const nomePreferencial = this._normalizarNomeEscola(
            escolaOriginal?.nome ||
            turmaOriginal?.escolaNome ||
            turmaOriginal?.escola_nome ||
            turmaOriginal?.escolaName
        );

        // Sem escola no backup: mantém padrão.
        if (!escolaIdOriginal && !nomePreferencial) {
            return { escolaId: 'default', escolaImportadaNome: null };
        }

        // Tenta reutilizar por ID (quando existir no backup).
        if (escolaIdOriginal) {
            const existente = await db.get('escolas', escolaIdOriginal);
            if (existente) {
                // Caso comum de conflito: backup usa id "default", mas com outro nome de escola.
                // Nessa situação, não devemos sobrescrever/forçar a escola default local.
                const nomeExistente = this._normalizarNomeEscola(existente.nome);
                const nomeConflitante = !!nomePreferencial && nomeExistente.toLowerCase() !== nomePreferencial.toLowerCase();

                if (nomeConflitante) {
                    // Primeiro tenta encontrar escola já existente pelo nome do backup.
                    const escolas = await db.getAll('escolas');
                    const matchNome = escolas.find(
                        (e) => this._normalizarNomeEscola(e.nome).toLowerCase() === nomePreferencial.toLowerCase()
                    );
                    if (matchNome) {
                        return { escolaId: matchNome.id, escolaImportadaNome: null };
                    }

                    // Se não houver, cria nova escola para preservar a identidade do backup.
                    const novaEscolaId = `escola_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                    await db.put('escolas', {
                        id: novaEscolaId,
                        nome: nomePreferencial,
                        criadoEm: new Date().toISOString(),
                        atualizadoEm: new Date().toISOString()
                    });
                    return { escolaId: novaEscolaId, escolaImportadaNome: nomePreferencial };
                }

                return { escolaId: existente.id, escolaImportadaNome: null };
            }

            // ID existe no backup mas não existe localmente: cria escola automaticamente.
            const nome = nomePreferencial || `Escola (${escolaIdOriginal})`;
            await db.put('escolas', {
                id: escolaIdOriginal,
                nome: nome,
                criadoEm: new Date().toISOString(),
                atualizadoEm: new Date().toISOString()
            });
            return { escolaId: escolaIdOriginal, escolaImportadaNome: nome };
        }

        // Backup sem ID, mas com nome: tenta match por nome e cria se necessário.
        const escolas = await db.getAll('escolas');
        const nomeLower = nomePreferencial.toLowerCase();
        const match = escolas.find((e) => String(e.nome || '').trim().toLowerCase() === nomeLower);
        if (match) {
            return { escolaId: match.id, escolaImportadaNome: null };
        }

        const novaEscolaId = `escola_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await db.put('escolas', {
            id: novaEscolaId,
            nome: nomePreferencial,
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString()
        });

        return { escolaId: novaEscolaId, escolaImportadaNome: nomePreferencial };
    },

    // Exportar backup completo (V1 com versionamento)
    async exportarBackup() {
        try {
            utils.mostrarToast('Gerando backup...', 'info');

            const backup = {
                schemaVersion: 1,
                backupType: 'completo',
                appVersion: '0.3.5-beta',
                exportedAt: new Date().toISOString(),
                data: {
                    config: await db.getAll('config'),
                    escolas: await db.getAll('escolas'),
                    turmas: await db.getAll('turmas'),
                    alunos: await db.getAll('alunos'),
                    chamadas: await db.getAll('chamadas'),
                    eventos_nota: await db.getAll('eventos_nota')
                }
            };

            const json = JSON.stringify(backup, null, 2);
            const filename = `bkp${this._formatarStampArquivo()}.json`;

            utils.downloadFile(filename, json, 'application/json');
            utils.mostrarToast('Backup exportado com sucesso!', 'success');
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao exportar backup', 'error');
        }
    },

    // Migrar backup para formato atual se necessário
    migrateBackupIfNeeded(backup) {
        // Formato legacy (v0) - sem schemaVersion
        if (!backup.schemaVersion) {
            console.log('[export] migrando backup v0 para v1');
            return {
                schemaVersion: 1,
                exportedAt: backup.generatedAt || new Date().toISOString(),
                data: {
                    config: backup.config || [],
                    escolas: backup.escolas || [],
                    turmas: backup.turmas || [],
                    alunos: backup.alunos || [],
                    chamadas: backup.chamadas || [],
                    eventos_nota: backup.eventos_nota || []
                }
            };
        }

        // Versão futura - incompatibilidade
        if (backup.schemaVersion > 1) {
            throw new Error(`Backup versão ${backup.schemaVersion} incompatível. Atualize o app.`);
        }

        // Versão atual
        return backup;
    },

    // Importar backup (Atomic Transaction)
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
                    const rawBackup = JSON.parse(event.target.result);

                    // Migrar se necessário
                    const backup = this.migrateBackupIfNeeded(rawBackup);

                    // Validar backup básico
                    if (!backup.data || !backup.data.turmas || !backup.data.alunos) {
                        throw new Error('Arquivo de backup inválido (estruturas ausentes)');
                    }

                    if (!utils.confirmar(
                        'Importar backup irá SUBSTITUIR todos os dados atuais. Deseja continuar?'
                    )) {
                        return;
                    }

                    utils.mostrarToast('Importando dados...', 'info');

                    // TRANSAÇÃO ATÔMICA: All-or-nothing
                    const stores = ['config', 'escolas', 'turmas', 'alunos', 'chamadas', 'eventos_nota'];

                    await db.transaction(stores, 'readwrite', (tx) => {
                        stores.forEach(storeName => {
                            const store = tx.objectStore(storeName);
                            const items = backup.data[storeName] || [];

                            // Limpar store
                            store.clear();

                            // Inserir todos os itens
                            items.forEach(item => {
                                store.put(item);
                            });
                        });
                    });

                    utils.mostrarToast('Backup importado com sucesso!', 'success');

                    // Recarregar app
                    setTimeout(() => {
                        location.reload();
                    }, 1500);

                } catch (error) {
                    console.error('Erro ao processar backup:', error);
                    utils.mostrarToast(
                        error.message || 'Arquivo de backup inválido ou erro na importação',
                        'error'
                    );
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
            const escola = turma.escolaId ? await db.get('escolas', turma.escolaId) : null;

            const dados = {
                schemaVersion: 1,
                backupType: 'turma',
                appVersion: '0.3.5-beta',
                exportedAt: new Date().toISOString(),
                data: {
                    turma: turma,
                    escola: escola,
                    alunos: alunos,
                    chamadas: chamadas
                }
            };

            const json = JSON.stringify(dados, null, 2);
            const turmaSlug = this._slug(turma.nome || 'turma');
            const filename = `bkp_turma_${turmaSlug}_${this._formatarStampArquivo()}.json`;

            utils.downloadFile(filename, json, 'application/json');
            utils.mostrarToast('Turma exportada!', 'success');
        } catch (e) {
            console.error(e);
            utils.mostrarToast("Erro ao exportar turma", 'error');
        }
    },

    migrateTurmaBackupIfNeeded(raw) {
        if (!raw || typeof raw !== 'object') {
            throw new Error('Arquivo inválido');
        }

        // Legacy simples: { turma, alunos, chamadas, exportedAt }
        if (!raw.schemaVersion && raw.turma) {
            return {
                schemaVersion: 1,
                backupType: 'turma',
                appVersion: 'legacy',
                exportedAt: raw.exportedAt || new Date().toISOString(),
                data: {
                    turma: raw.turma,
                    alunos: Array.isArray(raw.alunos) ? raw.alunos : [],
                    chamadas: Array.isArray(raw.chamadas) ? raw.chamadas : []
                }
            };
        }

        if (raw.schemaVersion > 1) {
            throw new Error(`Backup de turma versão ${raw.schemaVersion} incompatível. Atualize o app.`);
        }

        if (raw.backupType !== 'turma') {
            throw new Error('Este arquivo não é um backup de turma');
        }

        if (!raw.data || !raw.data.turma || !Array.isArray(raw.data.alunos) || !Array.isArray(raw.data.chamadas)) {
            throw new Error('Estrutura de backup de turma inválida');
        }

        return raw;
    },

    importarTurmaJSON() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const rawBackup = JSON.parse(event.target.result);
                        const backup = this.migrateTurmaBackupIfNeeded(rawBackup);
                        const turmaOriginal = backup.data.turma || {};
                        const escolaOriginal = backup.data.escola || null;
                        const alunosOriginais = backup.data.alunos || [];
                        const chamadasOriginais = backup.data.chamadas || [];

                        const resumo = `Turma: ${turmaOriginal.nome || 'Sem nome'}\n` +
                            `Alunos: ${alunosOriginais.length}\n` +
                            `Chamadas: ${chamadasOriginais.length}\n\n` +
                            `A turma será restaurada como NOVA turma. Deseja continuar?`;

                        if (!utils.confirmar(resumo)) {
                            resolve(null);
                            return;
                        }

                        utils.mostrarToast('Recuperando turma...', 'info');

                        // Restaurar como nova turma (seguro, sem sobrescrever turma atual)
                        const escolaResolvida = await this._resolverEscolaParaTurmaBackup(turmaOriginal, escolaOriginal);
                        const novaTurma = {
                            ...turmaOriginal,
                            id: undefined,
                            nome: turmaOriginal.nome || 'Turma recuperada',
                            escolaId: escolaResolvida.escolaId || 'default',
                            criadaEm: new Date().toISOString()
                        };
                        delete novaTurma.id;
                        delete novaTurma.escola_id;

                        const novaTurmaId = await db.add('turmas', novaTurma);
                        const mapaAlunoId = {};

                        for (const alunoOriginal of alunosOriginais) {
                            const antigoId = alunoOriginal.id;
                            const novoAluno = {
                                ...alunoOriginal,
                                id: undefined,
                                turmaId: novaTurmaId
                            };
                            delete novoAluno.id;
                            const novoId = await db.add('alunos', novoAluno);
                            if (antigoId) mapaAlunoId[antigoId] = novoId;
                        }

                        for (const chamadaOriginal of chamadasOriginais) {
                            const novaChamada = {
                                ...chamadaOriginal,
                                id: undefined,
                                turmaId: novaTurmaId,
                                turmaNome: novaTurma.nome
                            };
                            delete novaChamada.id;

                            if (novaChamada.registros && typeof novaChamada.registros === 'object') {
                                const novosRegistros = {};
                                Object.entries(novaChamada.registros).forEach(([alunoIdAntigo, reg]) => {
                                    const alunoIdNovo = mapaAlunoId[alunoIdAntigo];
                                    if (alunoIdNovo) novosRegistros[alunoIdNovo] = reg;
                                });
                                novaChamada.registros = novosRegistros;
                            }

                            await db.add('chamadas', novaChamada);
                        }

                        if (escolaResolvida.escolaImportadaNome) {
                            utils.mostrarToast(`Escola "${escolaResolvida.escolaImportadaNome}" adicionada ao cadastro`, 'info');
                        }

                        utils.mostrarToast('Turma recuperada com sucesso!', 'success');
                        resolve(novaTurmaId);
                    } catch (error) {
                        console.error('Erro ao importar backup de turma:', error);
                        utils.mostrarToast(
                            error.message || 'Erro ao recuperar backup da turma',
                            'error'
                        );
                        resolve(null);
                    }
                };

                reader.readAsText(file);
            };

            input.click();
        });
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
