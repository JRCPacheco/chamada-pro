// ===== EXPORT MODULE =====
// Funções de exportação de dados
// Migrado para IndexedDB

const exportModule = {
    _getAppVersionLabel() {
        try {
            if (typeof APP_META !== 'undefined' && APP_META && typeof APP_META.label === 'string' && APP_META.label.trim()) {
                return APP_META.label.trim();
            }
            if (typeof APP_META !== 'undefined' && APP_META && typeof APP_META.version === 'string') {
                const stage = APP_META.stage ? `-${APP_META.stage}` : '';
                return `v${APP_META.version}${stage}`;
            }
        } catch (_) { }
        return 'v0.0.0-dev';
    },

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

    _baixarArquivoCompartilhamentoTurma(filename, json) {
        utils.downloadFile(filename, json, 'application/json');
    },

    async _compartilharArquivoCompartilhamentoTurma(filename, json, turmaNome) {
        try {
            if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
                return { ok: false, reason: 'unsupported' };
            }

            // Web Share com arquivo em memória (sem precisar salvar em pasta antes).
            const file = new File([json], filename, { type: 'application/json' });
            const shareData = {
                title: `Turma: ${String(turmaNome || 'Turma').trim()}`,
                text: 'Arquivo .cmf para compartilhar turma entre professores',
                files: [file]
            };

            if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
                return { ok: false, reason: 'cannot_share_files' };
            }

            await navigator.share(shareData);
            return { ok: true };
        } catch (error) {
            if (error?.name === 'AbortError') {
                return { ok: false, reason: 'aborted' };
            }
            console.error('Falha no compartilhamento nativo de turma:', error);
            return { ok: false, reason: 'share_failed' };
        }
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
                // Nessa situação, não devemos sobrescrever/forçar a escola padrão local.
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

            // ID existe no backup, mas não existe localmente: cria escola automaticamente.
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
                appVersion: '0.9.2-beta',
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
            const filename = `bkp${this._formatarStampArquivo()}.chf`;

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
        input.accept = '.chf,.json';

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

                    const confirmarImportacao = await app.confirmarAcao({
                        title: 'Importar backup completo',
                        message: 'Esta ação vai substituir todos os dados atuais do app neste aparelho.',
                        confirmText: 'Importar backup',
                        cancelText: 'Cancelar'
                    });
                    if (!confirmarImportacao) {
                        return;
                    }

                    utils.mostrarToast('Importando dados...', 'info');

                    // Transação atômica: all-or-nothing.
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
                appVersion: '0.9.2-beta',
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
            const filename = `bkp_turma_${turmaSlug}_${this._formatarStampArquivo()}.chf`;

            utils.downloadFile(filename, json, 'application/json');
            utils.mostrarToast('Turma exportada!', 'success');
        } catch (e) {
            console.error(e);
            utils.mostrarToast("Erro ao exportar turma", 'error');
        }
    },

    async exportarTurmaProfessorJSON(turmaId) {
        try {
            const turma = await db.get('turmas', turmaId);
            if (!turma) return;

            const alunosOriginais = await db.getByIndex('alunos', 'turmaId', turmaId);
            const escola = turma.escolaId ? await db.get('escolas', turma.escolaId) : null;

            // Migração entre professores: preserva dados do aluno e qrId, mas remove foto.
            const alunosSemFoto = alunosOriginais.map((aluno) => {
                const alunoClone = { ...aluno };
                delete alunoClone.foto;
                return alunoClone;
            });

            const dados = {
                schemaVersion: 1,
                appVersion: this._getAppVersionLabel(),
                exportedAt: new Date().toISOString(),
                turmaId: String(turma.id || '').trim(),
                turmaNome: String(turma.nome || 'Turma').trim(),
                alunos: alunosSemFoto,
                // Campos extras para dar contexto no import e manter compatibilidade.
                turma: turma,
                escola: escola
            };

            const json = JSON.stringify(dados, null, 2);
            const turmaSlug = this._slug(turma.nome || 'turma');
            const filename = `turma_professor_${turmaSlug}_${this._formatarStampArquivo()}.cmf`;

            const shareResult = await this._compartilharArquivoCompartilhamentoTurma(filename, json, turma.nome);
            if (shareResult.ok) {
                utils.mostrarToast('Arquivo da turma compartilhado', 'success');
                return;
            }

            if (shareResult.reason === 'aborted') {
                utils.mostrarToast('Compartilhamento cancelado', 'warning');
                return;
            }

            this._baixarArquivoCompartilhamentoTurma(filename, json);
            utils.mostrarToast('Compartilhamento indisponivel. Arquivo da turma baixado automaticamente.', 'warning');
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao exportar arquivo da turma', 'error');
        }
    },

    migrateTurmaProfessorBackupIfNeeded(raw) {
        if (!raw || typeof raw !== 'object') {
            throw new Error('Arquivo invalido');
        }

        // Compatibilidade retroativa: converte formato legado (.chf/.json antigo) para .cmf.
        const tiposLegados = ['qrcodes_turma_compartilhamento', 'turma_professor'];
        if (tiposLegados.includes(raw.backupType)) {
            const turmaLegada = raw?.data?.turma;
            const alunosLegados = raw?.data?.alunos;
            if (!turmaLegada || !Array.isArray(alunosLegados)) {
                throw new Error('Estrutura do arquivo da turma invalida');
            }
            raw = {
                schemaVersion: Number(raw.schemaVersion || 1),
                appVersion: raw.appVersion || 'legacy',
                exportedAt: raw.exportedAt || new Date().toISOString(),
                turmaId: String(turmaLegada.id || '').trim(),
                turmaNome: String(turmaLegada.nome || '').trim(),
                alunos: alunosLegados,
                turma: turmaLegada,
                escola: raw?.data?.escola || null
            };
        }

        const schemaVersion = Number(raw.schemaVersion);
        if (!Number.isFinite(schemaVersion)) {
            throw new Error('Arquivo invalido: versao do arquivo ausente');
        }
        if (schemaVersion < 1) {
            throw new Error(`Arquivo da turma na versao ${schemaVersion} nao suportada. Exporte novamente no app mais recente.`);
        }
        if (schemaVersion > 1) {
            throw new Error(`Arquivo da turma na versao ${schemaVersion} incompativel com este app. Atualize o app para importar.`);
        }

        const obrigatorios = ['appVersion', 'exportedAt', 'turmaId', 'turmaNome', 'alunos'];
        for (const campo of obrigatorios) {
            if (raw[campo] === undefined || raw[campo] === null) {
                throw new Error(`Arquivo invalido: campo obrigatorio "${campo}" ausente`);
            }
        }

        if (!String(raw.appVersion || '').trim()) {
            throw new Error('Arquivo invalido: versao do app de origem ausente');
        }

        const exportedAtDate = new Date(raw.exportedAt);
        if (Number.isNaN(exportedAtDate.getTime())) {
            throw new Error('Arquivo invalido: campo "exportedAt" com data/hora invalida');
        }

        if (!Array.isArray(raw.alunos)) {
            throw new Error('Arquivo invalido: campo "alunos" deve ser uma lista');
        }
        if (!String(raw.turmaId || '').trim()) {
            throw new Error('Arquivo invalido: campo "turmaId" vazio');
        }
        if (!String(raw.turmaNome || '').trim()) {
            throw new Error('Arquivo invalido: campo "turmaNome" vazio');
        }

        const idxAlunoInvalido = raw.alunos.findIndex((aluno) => !aluno || typeof aluno !== 'object');
        if (idxAlunoInvalido !== -1) {
            throw new Error(`Arquivo invalido: aluno na posicao ${idxAlunoInvalido + 1} com estrutura invalida`);
        }

        const idxAlunoSemQr = raw.alunos.findIndex((aluno) => !String(aluno?.qrId || '').trim());
        if (idxAlunoSemQr !== -1) {
            throw new Error(`Arquivo invalido: aluno na posicao ${idxAlunoSemQr + 1} sem qrId`);
        }

        if (!raw.turma || typeof raw.turma !== 'object') {
            raw.turma = {
                id: String(raw.turmaId).trim(),
                nome: String(raw.turmaNome).trim()
            };
        }

        return raw;
    },

    async _perguntarAcaoTurmaExistente(turmaNome, turmaId) {
        const resposta = await app.abrirModalEscolha({
            title: 'Turma ja existente',
            message:
                `Ja existe uma turma com este identificador.\n\n` +
                `Turma: ${turmaNome || 'Sem nome'}\n` +
                `ID: ${turmaId}\n\n` +
                `Escolha como deseja continuar a importacao.`,
            options: [
                { value: 'mesclar', label: 'Mesclar alunos nesta turma', variant: 'primary' },
                { value: 'substituir', label: 'Substituir alunos da turma existente', variant: 'secondary' },
                { value: 'cancelar', label: 'Cancelar importacao', variant: 'secondary' }
            ]
        });

        return resposta || 'cancelar';
    },

    async importarTurmaProfessorRaw(rawBackup) {
        const backup = this.migrateTurmaProfessorBackupIfNeeded(rawBackup);
        const turmaOriginal = backup.turma || {};
        const escolaOriginal = backup.escola || null;
        const alunosOriginais = Array.isArray(backup.alunos) ? backup.alunos : [];
        const turmaIdArquivo = String(backup.turmaId || '').trim();
        const turmaExistente = await db.get('turmas', turmaIdArquivo);
        let acaoTurmaExistente = 'nova';
        const exportedAtDate = new Date(backup.exportedAt);
        const exportedAtLabel = Number.isNaN(exportedAtDate.getTime())
            ? String(backup.exportedAt || '')
            : exportedAtDate.toLocaleString('pt-BR');

        const resumo = `Turma: ${backup.turmaNome || turmaOriginal.nome || 'Sem nome'}\n` +
            `ID da turma: ${backup.turmaId}\n` +
            `Alunos no arquivo: ${alunosOriginais.length}\n\n` +
            `Versao do arquivo: v${backup.schemaVersion} | App de origem: ${backup.appVersion}\n` +
            `Exportado em: ${exportedAtLabel}\n\n` +
            `A turma sera importada como nova turma. Deseja continuar?`;

        const confirmarResumo = await app.confirmarAcao({
            title: 'Receber arquivo da turma',
            message: resumo,
            confirmText: 'Continuar importacao',
            cancelText: 'Cancelar'
        });
        if (!confirmarResumo) return null;

        if (turmaExistente) {
            acaoTurmaExistente = await this._perguntarAcaoTurmaExistente(
                backup.turmaNome || turmaExistente.nome,
                turmaIdArquivo
            );
            if (acaoTurmaExistente === 'cancelar') {
                utils.mostrarToast('Importacao do arquivo cancelada', 'warning');
                return null;
            }
        }

        const conflitos = [];
        const qrNoArquivo = new Set();
        for (const aluno of alunosOriginais) {
            const qrId = String(aluno?.qrId || '').trim();
            if (!qrId || qrNoArquivo.has(qrId)) {
                conflitos.push({ qrId, motivo: 'duplicado-no-arquivo', alunoNome: aluno?.nome || '' });
                continue;
            }
            qrNoArquivo.add(qrId);

            const existentes = await db.getByIndex('alunos', 'qrId', qrId);
            if (existentes && existentes.length > 0) {
                const existente = existentes[0];
                const conflitoNaMesmaTurmaId = turmaExistente && String(existente?.turmaId || '') === turmaIdArquivo;
                if (acaoTurmaExistente === 'substituir' && conflitoNaMesmaTurmaId) {
                    continue;
                }
                conflitos.push({
                    qrId,
                    motivo: conflitoNaMesmaTurmaId ? 'ja-existe-na-turma-destino' : 'ja-existe-no-app',
                    alunoNome: aluno?.nome || '',
                    alunoDestinoNome: existente?.nome || ''
                });
            }
        }

        let importarParcialSemConflito = false;
        if (conflitos.length > 0) {
            const preview = conflitos
                .slice(0, 5)
                .map((c, i) => `${i + 1}. QR ${c.qrId || '(vazio)'} - ${c.alunoNome || 'Aluno'}`)
                .join('\n');

            const msgConflito = `Foram encontrados ${conflitos.length} conflito(s) de QR.\n\n` +
                `${preview}${conflitos.length > 5 ? '\n...' : ''}\n\n` +
                `OK: importar apenas alunos sem conflito.\n` +
                `Cancelar: nao importar nada.`;

            const confirmarParcial = await app.confirmarAcao({
                title: 'Conflitos encontrados',
                message: msgConflito,
                confirmText: 'Importar sem conflitos',
                cancelText: 'Cancelar'
            });
            if (!confirmarParcial) {
                utils.mostrarToast('Importacao cancelada por conflito de identificacao dos alunos', 'warning');
                return null;
            }
            importarParcialSemConflito = true;
        }

        const conflitoSet = new Set(conflitos.map((c) => String(c.qrId || '').trim()));
        const alunosSelecionados = importarParcialSemConflito
            ? alunosOriginais.filter((a) => !conflitoSet.has(String(a?.qrId || '').trim()))
            : alunosOriginais.slice();

        if (alunosSelecionados.length === 0) {
            utils.mostrarToast('Nenhum aluno disponivel para importar sem conflito', 'warning');
            return null;
        }

        const modoTexto = acaoTurmaExistente === 'substituir'
            ? 'substituindo turma existente...'
            : (acaoTurmaExistente === 'mesclar' ? 'mesclando na turma existente...' : 'criando nova turma...');
        utils.mostrarToast(`Recebendo arquivo da turma (${modoTexto})`, 'info');

        const escolaResolvida = await this._resolverEscolaParaTurmaBackup(turmaOriginal, escolaOriginal);
        const alunosCriados = [];
        let turmaDestinoId = null;
        let turmaCriadaAgora = false;
        let snapshotTurmaAnterior = turmaExistente ? { ...turmaExistente } : null;
        let snapshotAlunosTurmaAnterior = [];
        let turmaTeveAlunosSubstituidos = false;

        const limparImporteParcial = async () => {
            for (const id of alunosCriados) {
                await db.delete('alunos', id).catch(() => { });
            }
            if (turmaCriadaAgora && turmaDestinoId) {
                await db.delete('turmas', turmaDestinoId).catch(() => { });
            }
            if (turmaTeveAlunosSubstituidos && turmaDestinoId) {
                for (const alunoAnterior of snapshotAlunosTurmaAnterior) {
                    await db.put('alunos', alunoAnterior).catch(() => { });
                }
                if (snapshotTurmaAnterior) {
                    await db.put('turmas', snapshotTurmaAnterior).catch(() => { });
                }
            }
        };

        try {
            if (turmaExistente) {
                turmaDestinoId = turmaExistente.id;
                if (acaoTurmaExistente === 'substituir') {
                    snapshotAlunosTurmaAnterior = await db.getByIndex('alunos', 'turmaId', turmaDestinoId);

                    const turmaAtualizada = {
                        ...turmaExistente,
                        ...turmaOriginal,
                        id: turmaDestinoId,
                        nome: turmaOriginal.nome || backup.turmaNome || turmaExistente.nome || 'Turma',
                        escolaId: escolaResolvida.escolaId || turmaExistente.escolaId || 'default',
                        criadaEm: turmaExistente.criadaEm || new Date().toISOString()
                    };
                    delete turmaAtualizada.escola_id;
                    await db.put('turmas', turmaAtualizada);

                    for (const alunoAnterior of snapshotAlunosTurmaAnterior) {
                        await db.delete('alunos', alunoAnterior.id);
                    }
                    turmaTeveAlunosSubstituidos = true;
                }
            } else {
                const novaTurma = {
                    ...turmaOriginal,
                    id: turmaIdArquivo,
                    nome: turmaOriginal.nome || backup.turmaNome || 'Turma migrada',
                    escolaId: escolaResolvida.escolaId || 'default',
                    criadaEm: new Date().toISOString()
                };
                delete novaTurma.escola_id;
                turmaDestinoId = await db.add('turmas', novaTurma);
                turmaCriadaAgora = true;
            }

            for (const alunoOriginal of alunosSelecionados) {
                const qrId = String(alunoOriginal?.qrId || '').trim();
                if (!qrId) continue;

                const novoAluno = {
                    ...alunoOriginal,
                    id: undefined,
                    turmaId: turmaDestinoId,
                    qrId: qrId,
                    foto: null
                };
                delete novoAluno.id;
                delete novoAluno.foto;

                const novoId = await db.add('alunos', novoAluno);
                alunosCriados.push(novoId);
            }
        } catch (eImport) {
            await limparImporteParcial();
            throw eImport;
        }

        if (escolaResolvida.escolaImportadaNome) {
            utils.mostrarToast(`Escola "${escolaResolvida.escolaImportadaNome}" adicionada ao cadastro`, 'info');
        }

        const sufixoModo = acaoTurmaExistente === 'substituir'
            ? ' (substituicao)'
            : (acaoTurmaExistente === 'mesclar' ? ' (mescla)' : '');
        const msgFinal = importarParcialSemConflito
            ? `Importacao concluida${sufixoModo}: ${alunosCriados.length} aluno(s) importado(s), ${conflitos.length} conflito(s) ignorado(s).`
            : `Importacao concluida${sufixoModo}: ${alunosCriados.length} aluno(s) importado(s).`;

        utils.mostrarToast(msgFinal, 'success');
        return {
            novaTurmaId: turmaDestinoId,
            importados: alunosCriados.length,
            conflitos: conflitos.length,
            parcial: importarParcialSemConflito,
            modo: acaoTurmaExistente
        };
    },

    async importarTurmaProfessorJSON() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.cmf,.json,.chf';

            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) {
                    resolve(null);
                    return;
                }

                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        let rawBackup = null;
                        try {
                            rawBackup = JSON.parse(event.target.result);
                        } catch (_) {
                            throw new Error('Arquivo invalido: conteudo nao esta em JSON valido');
                        }

                        const resultado = await this.importarTurmaProfessorRaw(rawBackup);
                        resolve(resultado);
                    } catch (error) {
                        console.error('Erro ao receber arquivo da turma:', error);
                        const msgErro = String(error?.message || '');
                        const mensagem = msgErro || 'Erro ao receber arquivo da turma';
                        utils.mostrarToast(mensagem, 'error');
                        resolve(null);
                    }
                };

                reader.readAsText(file);
            };

            input.click();
        });
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
            input.accept = '.chf,.json';

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

                        const confirmarRecuperacao = await app.confirmarAcao({
                            title: 'Recuperar turma',
                            message: resumo,
                            confirmText: 'Recuperar como nova',
                            cancelText: 'Cancelar'
                        });
                        if (!confirmarRecuperacao) {
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
                        const qrIdsUsadosImport = new Set();
                        const alunosCriados = [];
                        const chamadasCriadas = [];

                        // Limpa dados parciais criados se o import falhar
                        const limparImporteParcial = async () => {
                            for (const id of chamadasCriadas) {
                                await db.delete('chamadas', id).catch(() => {});
                            }
                            for (const id of alunosCriados) {
                                await db.delete('alunos', id).catch(() => {});
                            }
                            await db.delete('turmas', novaTurmaId).catch(() => {});
                        };

                        const resolverQrIdUnico = async (qrIdOriginal) => {
                            let qrId = String(qrIdOriginal || '').trim();
                            let tentativas = 0;

                            while (!qrId || qrIdsUsadosImport.has(qrId)) {
                                qrId = utils.gerarQrId();
                                tentativas++;
                                if (tentativas > 20) break;
                            }

                            let existentes = await db.getByIndex('alunos', 'qrId', qrId);
                            while ((existentes && existentes.length > 0) || qrIdsUsadosImport.has(qrId)) {
                                qrId = utils.gerarQrId();
                                existentes = await db.getByIndex('alunos', 'qrId', qrId);
                                tentativas++;
                                if (tentativas > 40) {
                                    throw new Error('Não foi possível gerar qrId único para aluno importado');
                                }
                            }

                            qrIdsUsadosImport.add(qrId);
                            return qrId;
                        };

                        try {
                            for (const alunoOriginal of alunosOriginais) {
                                const antigoId = alunoOriginal.id;
                                let qrIdSeguro = await resolverQrIdUnico(alunoOriginal.qrId);

                                let novoId = null;
                                let tentativasInsert = 0;
                                while (!novoId) {
                                    const novoAluno = {
                                        ...alunoOriginal,
                                        id: undefined,
                                        qrId: qrIdSeguro,
                                        turmaId: novaTurmaId
                                    };
                                    delete novoAluno.id;
                                    try {
                                        novoId = await db.add('alunos', novoAluno);
                                    } catch (eInsert) {
                                        if (eInsert?.name === 'ConstraintError' && tentativasInsert < 3) {
                                            // Colisão de qrId: gera um novo completamente aleatório.
                                            tentativasInsert++;
                                            qrIdSeguro = utils.gerarQrId();
                                            qrIdsUsadosImport.add(qrIdSeguro);
                                        } else {
                                            throw eInsert;
                                        }
                                    }
                                }

                                alunosCriados.push(novoId);
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

                                const chamadaId = await db.add('chamadas', novaChamada);
                                chamadasCriadas.push(chamadaId);
                            }
                        } catch (eImport) {
                            // Remove tudo que foi criado para não deixar dados órfãos.
                            await limparImporteParcial();
                            throw eImport;
                        }

                        if (escolaResolvida.escolaImportadaNome) {
                            utils.mostrarToast(`Escola "${escolaResolvida.escolaImportadaNome}" adicionada ao cadastro`, 'info');
                        }

                        utils.mostrarToast('Turma recuperada com sucesso!', 'success');
                        resolve(novaTurmaId);
                    } catch (error) {
                        console.error('Erro ao importar backup de turma:', error);
                        const msg = String(error?.message || '');
                        const ehErroConstraint = error?.name === 'ConstraintError' || /constraint/i.test(msg);
                        const mensagem = ehErroConstraint
                            ? 'Erro de dados no backup: conflito de identificadores únicos (ex.: QR).'
                            : (error.message || 'Erro ao recuperar backup da turma');
                        utils.mostrarToast(
                            mensagem,
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

