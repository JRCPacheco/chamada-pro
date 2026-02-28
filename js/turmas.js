// ===== TURMAS MODULE =====
// Gerenciamento de turmas
// Migrado para IndexedDB

const turmas = {

    turmaAtual: null,
    listaTurmasListenerBound: false,
    listaTurmasDeleteHoldBound: false,
    _deleteHoldTimers: new Map(),
    _deleteHoldTriggered: new Set(),
    gerenciarSelecaoAtiva: false,
    gerenciarSelecionadas: new Set(),
    _atualizarControleSegundoHorarioDetalhe() {
        const input = document.getElementById('input-detalhe-segundo-horario');
        const status = document.getElementById('segundo-horario-status-detalhe');
        if (!input || !status) return;

        const ativo = !!this.turmaAtual?.segundoHorarioAtivo;
        input.checked = ativo;
        status.textContent = ativo
            ? 'Ligado (2 chamadas/dia)'
            : 'Desligado (1 chamada/dia)';
    },

    // Carregar e exibir lista de turmas
    async listar() {
        const container = document.getElementById('lista-turmas');
        const emptyState = document.getElementById('empty-turmas');
        const adicionarTurmaWrapper = document.getElementById('adicionar-turma-wrapper');
        const searchInput = document.getElementById('search-turmas');
        const filterEscola = document.getElementById('filter-escola');

        // Config. state
        const config = await app._getAppConfig(); // Internal API usage
        const multi_escola = config.multi_escola;

        let turmasArray = [];

        // Estratégia de carregamento baseada em filtro
        if (multi_escola && filterEscola && filterEscola.value) {
            turmasArray = await db.getByIndex('turmas', 'escolaId', filterEscola.value);
        } else {
            turmasArray = await db.getAll('turmas');
        }

        if (turmasArray.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            if (adicionarTurmaWrapper) adicionarTurmaWrapper.style.display = 'none';
        } else {
            emptyState.style.display = 'none';
            if (adicionarTurmaWrapper) adicionarTurmaWrapper.style.display = '';

            // Filtragem local por busca de texto (nome/descricao)
            if (searchInput && searchInput.value.trim()) {
                turmasArray = utils.filtrarPorBusca(turmasArray, searchInput.value, ['nome', 'descricao']);
            }

            await this.renderizarTurmas(turmasArray);
        }

        // Atualizar estatísticas
        await this.atualizarStats();

        // Busca em tempo real (debounce)
        if (searchInput && !searchInput.oninput) {
            searchInput.oninput = utils.debounce(() => {
                this.listar();
            }, 300);
        }
    },

    // Renderizar lista de turmas (SEM N+1 QUERIES)
    async renderizarTurmas(turmasArray) {
        const container = document.getElementById('lista-turmas');
        const config = await app._getAppConfig();
        const multi_escola = config.multi_escola;

        if (turmasArray.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Nenhuma turma encontrada</p></div>';
            return;
        }

        // Carregar todas as escolas para mapear nomes (se multi-escola)
        let escolasMap = {};
        if (multi_escola) {
            const escolasAll = await db.getAll('escolas');
            escolasAll.forEach(e => escolasMap[e.id] = e.nome);
        }

        // PERFORMANCE FIX: Carregar TUDO uma vez, mapear em memória
        // Evita N+1 queries (78 transações para 39 turmas -> 2 transações totais)
        const todosAlunos = await db.getAll('alunos');
        const todasChamadas = await db.getAll('chamadas');

        // Construir mapas de contagem por turmaId
        const mapAlunosPorTurma = {};
        todosAlunos.forEach(aluno => {
            if (aluno.turmaId) {
                mapAlunosPorTurma[aluno.turmaId] = (mapAlunosPorTurma[aluno.turmaId] || 0) + 1;
            }
        });

        const mapChamadasPorTurma = {};
        todasChamadas.forEach(chamada => {
            if (chamada.turmaId) {
                mapChamadasPorTurma[chamada.turmaId] = (mapChamadasPorTurma[chamada.turmaId] || 0) + 1;
            }
        });

        // Renderizar usando mapas (sync, sem await)
        const iconSchool = '<svg class="icon-svg icon-14" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 4l9 6.5"/><path d="M5 10v9h14v-9"/><path d="M9 19v-5h6v5"/><path d="M9 10h.01"/><path d="M15 10h.01"/></svg>';
        const iconTrash = '<svg class="icon-svg icon-16" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
        const iconUsers = '<svg class="icon-svg icon-14" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a3 3 0 0 1 0 5.75"/></svg>';
        const iconCalls = '<svg class="icon-svg icon-14" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2h8"/><path d="M9 2v2"/><path d="M15 2v2"/><rect x="4" y="4" width="16" height="18" rx="2"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>';

        const cardsHtml = turmasArray.map(turma => {
            const totalAlunos = mapAlunosPorTurma[turma.id] || 0;
            const totalChamadas = mapChamadasPorTurma[turma.id] || 0;

            // Badge de escola
            let escolaBadge = '';
            if (multi_escola && turma.escolaId) {
                const nomeEscola = escolasMap[turma.escolaId];
                if (nomeEscola) {
                    escolaBadge = `<span class="escola-badge">${iconSchool} ${utils.escapeHtml(nomeEscola)}</span>`;
                }
            }

            return `
                <div class="turma-card" data-turma-id="${turma.id}">
                    ${escolaBadge}
                    <div class="turma-card-header">
                        <h3>${utils.escapeHtml(turma.nome)}</h3>
                        <button type="button" class="turma-delete-btn" data-turma-id="${turma.id}" aria-label="Excluir turma" title="Segure por 1 segundo para excluir">
                            ${iconTrash}
                        </button>
                    </div>
                    <p>${turma.descricao ? utils.escapeHtml(turma.descricao) : 'Sem descrição'}</p>
                    <div class="turma-meta">
                        <span>${iconUsers} ${totalAlunos} aluno${totalAlunos !== 1 ? 's' : ''}</span>
                        <span>${iconCalls} ${totalChamadas} chamada${totalChamadas !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = cardsHtml;

        if (container && !this.listaTurmasListenerBound) {
            container.addEventListener('click', (e) => {
                const btnDelete = e.target.closest('.turma-delete-btn');
                if (btnDelete && container.contains(btnDelete)) return;

                const card = e.target.closest('.turma-card');
                if (!card || !container.contains(card)) return;
                const turmaId = card.dataset.turmaId;
                if (!turmaId) return;
                this.abrirDetalhes(turmaId);
            });
            this.listaTurmasListenerBound = true;
        }

        if (container && !this.listaTurmasDeleteHoldBound) {
            const clearHold = (btn, pointerId = null) => {
                const key = pointerId !== null ? `${btn.dataset.turmaId}:${pointerId}` : btn.dataset.turmaId;
                const timer = this._deleteHoldTimers.get(key);
                if (timer) {
                    clearTimeout(timer);
                    this._deleteHoldTimers.delete(key);
                }
                btn.classList.remove('holding');
            };

            container.addEventListener('pointerdown', (e) => {
                const btn = e.target.closest('.turma-delete-btn');
                if (!btn || !container.contains(btn)) return;
                e.preventDefault();
                e.stopPropagation();

                const turmaId = btn.dataset.turmaId;
                if (!turmaId) return;

                const key = `${turmaId}:${e.pointerId}`;
                btn.classList.add('holding');

                const timer = setTimeout(() => {
                    this._deleteHoldTriggered.add(key);
                    btn.classList.remove('holding');
                    utils.vibrar([40]);
                    this.excluirTurma(turmaId);
                    this._deleteHoldTimers.delete(key);
                }, 1000);

                this._deleteHoldTimers.set(key, timer);
            });

            const endHold = (e) => {
                const btn = e.target.closest('.turma-delete-btn');
                if (!btn || !container.contains(btn)) return;

                const turmaId = btn.dataset.turmaId;
                if (!turmaId) return;

                const key = `${turmaId}:${e.pointerId}`;
                const holdCompleted = this._deleteHoldTriggered.has(key);
                if (holdCompleted) {
                    this._deleteHoldTriggered.delete(key);
                    clearHold(btn, e.pointerId);
                    return;
                }

                clearHold(btn, e.pointerId);
                utils.mostrarToast('Segure por 1 segundo para excluir a turma', 'warning');
            };

            container.addEventListener('pointerup', endHold);
            container.addEventListener('pointercancel', endHold);
            container.addEventListener('pointerleave', endHold);
            this.listaTurmasDeleteHoldBound = true;
        }
    },

    // Atualizar estatísticas gerais
    async atualizarStats() {
        // Stats requer contagem global
        // Isso pode ser pesado, mas para PWA local é ok
        const allTurmas = await db.getAll('turmas');
        const allAlunos = await db.getAll('alunos');
        const allChamadas = await db.getAll('chamadas');

        document.getElementById('total-turmas').textContent = allTurmas.length;
        document.getElementById('total-alunos').textContent = allAlunos.length;
        document.getElementById('total-chamadas').textContent = allChamadas.length;
    },

    // Mostrar modal de nova turma
    async mostrarModalNovaTurma() {
        const modal = document.getElementById('modal-nova-turma');
        modal.classList.add('active');

        // Limpar campos
        document.getElementById('input-turma-nome').value = '';
        document.getElementById('input-turma-descricao').value = '';
        const segundoHorarioInput = document.getElementById('input-turma-segundo-horario');
        if (segundoHorarioInput) segundoHorarioInput.checked = false;

        // MULTI ESCOLA: Popularizar dropdown de escolas
        const config = await app._getAppConfig();
        if (config.multi_escola) {
            await escolas.renderizarDropdown('input-turma-escola');
            const escolaPreferencialId = await escolas.obterEscolaPreferencialId();
            const selectEscola = document.getElementById('input-turma-escola');
            if (selectEscola && escolaPreferencialId) {
                selectEscola.value = escolaPreferencialId;
            }
        }

        // Focar no primeiro campo
        setTimeout(() => {
            document.getElementById('input-turma-nome').focus();
        }, 100);
    },

    // Salvar nova turma
    async salvarNovaTurma() {
        const nome = document.getElementById('input-turma-nome').value.trim();
        const descricao = document.getElementById('input-turma-descricao').value.trim();

        // MULTI ESCOLA: Capturar escola_id
        const config = await app._getAppConfig();
        let escolaId = 'default';

        if (config.multi_escola) {
            escolaId = document.getElementById('input-turma-escola').value;
            if (!escolaId) {
                utils.mostrarToast('Por favor, selecione uma escola', 'warning');
                document.getElementById('input-turma-escola').focus();
                return;
            }
        }

        if (!nome) {
            utils.mostrarToast('Por favor, informe o nome da turma', 'warning');
            document.getElementById('input-turma-nome').focus();
            return;
        }

        const segundoHorarioAtivo = !!document.getElementById('input-turma-segundo-horario')?.checked;

        const novaTurma = {
            // id: 'turma_' + Date.now(),
            nome: nome,
            descricao: descricao,
            escolaId: escolaId, // Usando camelCase conforme schema novo? Validar se db.js usa escolaId ou escola_id no index
            segundoHorarioAtivo: segundoHorarioAtivo,
            // O index no db.js é 'escolaId'. Mantendo consistencia
            criadaEm: new Date().toISOString()
            // REMOVIDO: alunos: {} -> Alunos agora são store independente
        };

        try {
            await db.add('turmas', novaTurma);
            app.fecharModal('modal-nova-turma');

            // Atualizar lista (se falhar, apenas loga erro mas considera sucesso na criação)
            try {
                await this.listar();
            } catch (listError) {
                console.error("Erro ao atualizar lista:", listError);
            }

            utils.mostrarToast('Turma criada com sucesso!', 'success');
            utils.vibrar([50, 50, 50]);
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao criar turma: ' + (e.message || ''), 'error');
        }
    },

    // Abrir detalhes da turma
    async abrirDetalhes(turmaId) {
        try {
            this.turmaAtual = await db.get('turmas', turmaId);

            if (!this.turmaAtual) {
                utils.mostrarToast('Turma não encontrada', 'error');
                return;
            }

            const iconSchool = '<svg class="icon-svg icon-16" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 4l9 6.5"/><path d="M5 10v9h14v-9"/><path d="M9 19v-5h6v5"/><path d="M9 10h.01"/><path d="M15 10h.01"/></svg>';
            const iconTurma = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/></svg>';

            // Atualizar informações da turma UI
            document.getElementById('turma-nome-detalhe').innerHTML =
                `<span class="turma-headline-icon">${iconTurma}</span><span>${utils.escapeHtml(this.turmaAtual.nome)}</span>`;
            document.getElementById('turma-descricao-detalhe').textContent =
                this.turmaAtual.descricao || 'Sem descrição';
            this._atualizarControleSegundoHorarioDetalhe();

            // Counts e metadados da turma
            const [alunosDaTurma, chamadasDaTurma, escolaDaTurma] = await Promise.all([
                db.getByIndex('alunos', 'turmaId', turmaId),
                db.getByIndex('chamadas', 'turmaId', turmaId),
                this.turmaAtual.escolaId ? db.get('escolas', this.turmaAtual.escolaId) : Promise.resolve(null)
            ]);

            const escolaEl = document.getElementById('turma-escola-detalhe');
            if (escolaEl) {
                const escolaNome = escolaDaTurma?.nome
                    || (this.turmaAtual.escolaId === 'default' ? 'Escola atual' : 'Sem escola');
                escolaEl.innerHTML =
                    `<span class="turma-headline-icon">${iconSchool}</span><span>${utils.escapeHtml(escolaNome)}</span>`;
            }

            document.getElementById('turma-total-alunos').textContent = alunosDaTurma.length;
            document.getElementById('turma-total-chamadas-realizadas').textContent = chamadasDaTurma.length;

            // Atualizar título do header
            document.getElementById('header-title').textContent = 'Turma';

            // Mostrar botão voltar
            document.getElementById('btn-back').style.display = 'block';

            // Carregar alunos e histórico
            // OBSERVACAO: alunos.js e chamadas.js ainda não foram migrados.
            // Eles usam storage.getTurmaById. Isso vai quebrar se não tiver compatibilidade?
            // "Alunos store separado (NÃO usar ainda aqui)" -> O user disse para não migrar alunos.js.
            // Mas alunos.listar() vai tentar ler do storage antigo ou falhar.
            // Assumimos que a UI vai carregar vazio por enquanto até a proxima rodada.

            if (typeof alunos.listar === 'function') alunos.listar();
            if (typeof chamadas.listarHistorico === 'function') chamadas.listarHistorico();

            // Salvar estado para persistência (Lapidação)
            sessionStorage.setItem('chamada_pro_ultima_turma', turmaId);

            // Mudar para tela de detalhes
            app.mostrarTela('tela-turma-detalhe');
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao abrir turma', 'error');
        }
    },

    async alterarSegundoHorarioDetalhe(inputEl) {
        const turmaId = this.turmaAtual?.id;
        if (!inputEl || !turmaId) return;

        const novoValor = !!inputEl.checked;
        const atualizado = await this.definirSegundoHorario(turmaId, novoValor);
        if (!atualizado) {
            inputEl.checked = !novoValor;
            this._atualizarControleSegundoHorarioDetalhe();
        }
    },

    async definirSegundoHorario(turmaId, novoValor) {
        if (!turmaId) {
            utils.mostrarToast('Turma não encontrada', 'error');
            return false;
        }

        const turma = await db.get('turmas', turmaId);
        if (!turma) {
            utils.mostrarToast('Turma não encontrada', 'error');
            return false;
        }

        const valorAtual = !!turma.segundoHorarioAtivo;
        if (valorAtual === !!novoValor) {
            if (this.turmaAtual && this.turmaAtual.id === turmaId) {
                this.turmaAtual.segundoHorarioAtivo = !!novoValor;
                this._atualizarControleSegundoHorarioDetalhe();
            }
            return true;
        }

        if (!novoValor) {
            const chamadasDaTurma = await db.getByIndex('chamadas', 'turmaId', turmaId);
            const possuiRegistrosSegundoHorario = chamadasDaTurma.some(c => c.slot === 2);
            let mensagem = 'Deseja desativar o 2º horário desta turma?';
            if (possuiRegistrosSegundoHorario) {
                mensagem += '\n\nEsta turma já tem registros no 2º horário. Eles não serão apagados, mas podem deixar de aparecer em alguns relatórios enquanto a opção estiver desativada.';
            }
            if (!confirm(mensagem)) return false;
        }

        turma.segundoHorarioAtivo = !!novoValor;
        await db.put('turmas', turma);

        if (this.turmaAtual && this.turmaAtual.id === turmaId) {
            this.turmaAtual.segundoHorarioAtivo = !!novoValor;
            this._atualizarControleSegundoHorarioDetalhe();
        }

        if (typeof chamadas.atualizarRelatorioMensal === 'function') {
            await chamadas.atualizarRelatorioMensal();
        }

        utils.mostrarToast(
            novoValor ? '2º horário ativado para a turma' : '2º horário desativado para a turma',
            'success'
        );
        return true;
    },

    async exportarBackupTurmaAtual() {
        const turmaId = this.turmaAtual?.id;
        if (!turmaId) {
            utils.mostrarToast('Nenhuma turma selecionada', 'warning');
            return;
        }

        if (typeof exportModule === 'undefined' || typeof exportModule.exportarTurmaJSON !== 'function') {
            utils.mostrarToast('Módulo de exportação indisponível', 'error');
            return;
        }

        try {
            await exportModule.exportarTurmaJSON(turmaId);
        } catch (error) {
            console.error('Erro ao exportar turma:', error);
            utils.mostrarToast('Erro ao exportar backup da turma', 'error');
        }
    },

    async recuperarBackupTurmaAtual() {
        if (typeof exportModule === 'undefined' || typeof exportModule.importarTurmaJSON !== 'function') {
            utils.mostrarToast('Módulo de recuperação indisponível', 'error');
            return;
        }

        try {
            const novaTurmaId = await exportModule.importarTurmaJSON();
            if (!novaTurmaId) return;

            // Atualizar dropdowns de escola após recuperação (caso backup traga escola nova)
            if (typeof escolas?.renderizarDropdown === 'function') {
                await escolas.renderizarDropdown('filter-escola');
                await escolas.renderizarDropdown('input-turma-escola');
                await escolas.renderizarDropdown('input-editar-turma-escola');
            }

            await this.sincronizarFiltroComTurmaImportada(novaTurmaId);
            await this.listar();
            await this.abrirDetalhes(novaTurmaId);
        } catch (error) {
            console.error('Erro ao recuperar turma:', error);
            utils.mostrarToast('Erro ao recuperar backup da turma', 'error');
        }
    },

    async abrirModalGerenciarTurmas() {
        this.gerenciarSelecaoAtiva = false;
        this.gerenciarSelecionadas.clear();
        await this.renderizarModalGerenciarTurmas();
        app.abrirModal('modal-gerenciar-turmas');
    },

    async renderizarModalGerenciarTurmas() {
        const listaEl = document.getElementById('lista-gerenciar-turmas');
        const emptyEl = document.getElementById('empty-gerenciar-turmas');
        if (!listaEl || !emptyEl) return;
        const iconSchool = '<svg class="icon-svg icon-14" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 4l9 6.5"/><path d="M5 10v9h14v-9"/><path d="M9 19v-5h6v5"/><path d="M9 10h.01"/><path d="M15 10h.01"/></svg>';
        const iconUsers = '<svg class="icon-svg icon-14" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a3 3 0 0 1 0 5.75"/></svg>';
        const iconCalls = '<svg class="icon-svg icon-14" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2h8"/><path d="M9 2v2"/><path d="M15 2v2"/><rect x="4" y="4" width="16" height="18" rx="2"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>';

        const [turmasAll, alunosAll, chamadasAll, escolasAll] = await Promise.all([
            db.getAll('turmas'),
            db.getAll('alunos'),
            db.getAll('chamadas'),
            db.getAll('escolas')
        ]);

        if (!turmasAll.length) {
            listaEl.innerHTML = '';
            emptyEl.style.display = '';
            this.atualizarControlesSelecaoGerenciarTurmas(0);
            return;
        }

        const escolasMap = {};
        escolasAll.forEach((e) => { escolasMap[e.id] = e.nome; });

        const countAlunos = {};
        alunosAll.forEach((a) => {
            if (!a.turmaId) return;
            countAlunos[a.turmaId] = (countAlunos[a.turmaId] || 0) + 1;
        });

        const countChamadas = {};
        chamadasAll.forEach((c) => {
            if (!c.turmaId) return;
            countChamadas[c.turmaId] = (countChamadas[c.turmaId] || 0) + 1;
        });

        const cards = turmasAll
            .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
            .map((turma) => {
                const escolaNome = escolasMap[turma.escolaId] || 'Sem escola';
                const selecionada = this.gerenciarSelecionadas.has(turma.id);
                const alunosQtd = countAlunos[turma.id] || 0;
                const chamadasQtd = countChamadas[turma.id] || 0;
                const selectHtml = this.gerenciarSelecaoAtiva
                    ? `<label class="gerenciar-turma-select"><input type="checkbox" data-action="turmas-toggle-item-selecao-gerenciar" data-turma-id="${turma.id}" ${selecionada ? 'checked' : ''}> Selecionar</label>`
                    : '';

                return `
                    <div class="gerenciar-turma-card ${this.gerenciarSelecaoAtiva ? 'gerenciar-turma-card-select' : ''}" data-turma-id="${turma.id}">
                        <div class="gerenciar-turma-card-head">
                            <div>
                                <strong>${utils.escapeHtml(turma.nome || 'Turma')}</strong>
                                <small>${iconSchool} ${utils.escapeHtml(escolaNome)}</small>
                            </div>
                            ${selectHtml}
                        </div>
                        <div class="gerenciar-turma-meta">${iconUsers} ${alunosQtd} alunos <span class="meta-dot">•</span> ${iconCalls} ${chamadasQtd} chamadas</div>
                        <div class="gerenciar-turma-actions">
                            <button class="btn btn-secondary btn-sm" data-action="turmas-abrir-item-gerenciar" data-turma-id="${turma.id}">Abrir</button>
                            <button class="btn btn-secondary btn-sm" data-action="turmas-editar-item-gerenciar" data-turma-id="${turma.id}">Editar</button>
                            <button class="btn btn-secondary btn-sm" data-action="turmas-exportar-item-gerenciar" data-turma-id="${turma.id}">Backup</button>
                            <button class="btn btn-secondary btn-sm" data-action="turmas-exportar-migracao-item-gerenciar" data-turma-id="${turma.id}">Enviar QRCodes</button>
                            <button class="btn btn-danger btn-sm" data-action="turmas-excluir-item-gerenciar" data-turma-id="${turma.id}">Excluir</button>
                        </div>
                    </div>
                `;
            });

        emptyEl.style.display = 'none';
        listaEl.innerHTML = cards.join('');
        this.atualizarControlesSelecaoGerenciarTurmas(turmasAll.length);
    },

    atualizarControlesSelecaoGerenciarTurmas(total) {
        const btnSelTodas = document.getElementById('btn-gerenciar-turmas-selecionar-todas');
        const btnExcluirSel = document.getElementById('btn-gerenciar-turmas-excluir-selecionadas');
        const btnCancelar = document.getElementById('btn-gerenciar-turmas-cancelar-selecao');
        if (!btnSelTodas || !btnExcluirSel || !btnCancelar) return;

        const ativo = this.gerenciarSelecaoAtiva && total > 0;
        btnSelTodas.style.display = ativo ? '' : 'none';
        btnExcluirSel.style.display = ativo ? '' : 'none';
        btnCancelar.style.display = ativo ? '' : 'none';
        btnExcluirSel.textContent = this.gerenciarSelecionadas.size > 0
            ? `Excluir Selecionadas (${this.gerenciarSelecionadas.size})`
            : 'Excluir Selecionadas';
        btnSelTodas.textContent = (this.gerenciarSelecionadas.size > 0 && this.gerenciarSelecionadas.size >= total)
            ? 'Desmarcar Todas'
            : 'Selecionar Todas';
    },

    async alternarSelecaoGerenciarTurmas() {
        this.gerenciarSelecaoAtiva = !this.gerenciarSelecaoAtiva;
        if (!this.gerenciarSelecaoAtiva) this.gerenciarSelecionadas.clear();
        await this.renderizarModalGerenciarTurmas();
    },

    async alternarSelecaoItemGerenciarTurmas(turmaId) {
        if (!turmaId) return;
        if (this.gerenciarSelecionadas.has(turmaId)) this.gerenciarSelecionadas.delete(turmaId);
        else this.gerenciarSelecionadas.add(turmaId);
        await this.renderizarModalGerenciarTurmas();
    },

    async alternarSelecionarTodasGerenciarTurmas() {
        const turmasAll = await db.getAll('turmas');
        if (!turmasAll.length) return;
        if (this.gerenciarSelecionadas.size >= turmasAll.length) this.gerenciarSelecionadas.clear();
        else {
            this.gerenciarSelecionadas.clear();
            turmasAll.forEach((t) => this.gerenciarSelecionadas.add(t.id));
        }
        await this.renderizarModalGerenciarTurmas();
    },

    async cancelarSelecaoGerenciarTurmas() {
        this.gerenciarSelecaoAtiva = false;
        this.gerenciarSelecionadas.clear();
        await this.renderizarModalGerenciarTurmas();
    },

    async recuperarBackupTurmaGlobal() {
        if (typeof exportModule === 'undefined' || typeof exportModule.importarTurmaJSON !== 'function') {
            utils.mostrarToast('Módulo de recuperação indisponível', 'error');
            return;
        }

        try {
            const novaTurmaId = await exportModule.importarTurmaJSON();
            if (!novaTurmaId) return;
            if (typeof escolas?.renderizarDropdown === 'function') {
                await escolas.renderizarDropdown('filter-escola');
                await escolas.renderizarDropdown('input-turma-escola');
                await escolas.renderizarDropdown('input-editar-turma-escola');
            }
            await this.sincronizarFiltroComTurmaImportada(novaTurmaId);
            await this.listar();
            await this.renderizarModalGerenciarTurmas();
        } catch (error) {
            console.error('Erro ao recuperar turma:', error);
            utils.mostrarToast('Erro ao recuperar backup da turma', 'error');
        }
    },

    async importarMigracaoTurmaGlobal() {
        if (typeof exportModule === 'undefined' || typeof exportModule.importarTurmaProfessorJSON !== 'function') {
            utils.mostrarToast('Módulo de compartilhamento de QRCodes indisponível', 'error');
            return;
        }

        try {
            const resultado = await exportModule.importarTurmaProfessorJSON();
            const novaTurmaId = resultado?.novaTurmaId;
            if (!novaTurmaId) return;

            if (typeof escolas?.renderizarDropdown === 'function') {
                await escolas.renderizarDropdown('filter-escola');
                await escolas.renderizarDropdown('input-turma-escola');
                await escolas.renderizarDropdown('input-editar-turma-escola');
            }

            await this.sincronizarFiltroComTurmaImportada(novaTurmaId);
            await this.listar();
            await this.renderizarModalGerenciarTurmas();
        } catch (error) {
            console.error('Erro ao receber QRCodes da turma:', error);
            utils.mostrarToast('Erro ao receber QRCodes da turma', 'error');
        }
    },

    async sincronizarFiltroComTurmaImportada(turmaId) {
        if (!turmaId) return;

        const filterEscola = document.getElementById('filter-escola');
        if (!filterEscola) return;

        const turma = await db.get('turmas', turmaId);
        if (!turma?.escolaId) return;

        if (filterEscola.value && filterEscola.value !== turma.escolaId) {
            filterEscola.value = turma.escolaId;
        }
    },

    async excluirSelecionadasGerenciarTurmas() {
        const ids = Array.from(this.gerenciarSelecionadas);
        if (!ids.length) {
            utils.mostrarToast('Selecione ao menos uma turma', 'warning');
            return;
        }

        const confirmar = utils.confirmar(`Excluir ${ids.length} turma(s) selecionada(s)? Esta ação não pode ser desfeita.`);
        if (!confirmar) return;

        try {
            for (const turmaId of ids) {
                const [alunosDaTurma, chamadasDaTurma] = await Promise.all([
                    db.getByIndex('alunos', 'turmaId', turmaId),
                    db.getByIndex('chamadas', 'turmaId', turmaId)
                ]);
                await Promise.all([
                    db.delete('turmas', turmaId),
                    ...alunosDaTurma.map(a => db.delete('alunos', a.id)),
                    ...chamadasDaTurma.map(c => db.delete('chamadas', c.id))
                ]);
            }

            if (this.turmaAtual && ids.includes(this.turmaAtual.id)) {
                this.turmaAtual = null;
                app.mostrarTela('tela-turmas');
                document.getElementById('header-title').textContent = 'Turmas';
                document.getElementById('btn-back').style.display = 'none';
            }

            this.gerenciarSelecionadas.clear();
            this.gerenciarSelecaoAtiva = false;
            await this.listar();
            await this.renderizarModalGerenciarTurmas();
            utils.mostrarToast('Turmas excluídas com sucesso', 'success');
        } catch (error) {
            console.error('Erro ao excluir turmas selecionadas:', error);
            utils.mostrarToast('Erro ao excluir turmas selecionadas', 'error');
        }
    },

    async abrirItemGerenciarTurmas(turmaId) {
        if (!turmaId) return;
        app.fecharModal('modal-gerenciar-turmas');
        await this.abrirDetalhes(turmaId);
    },

    async editarItemGerenciarTurmas(turmaId) {
        if (!turmaId) return;
        app.fecharModal('modal-gerenciar-turmas');
        await this.mostrarModalEditarTurma(turmaId);
    },

    async exportarItemGerenciarTurmas(turmaId) {
        if (!turmaId) return;
        if (typeof exportModule === 'undefined' || typeof exportModule.exportarTurmaJSON !== 'function') {
            utils.mostrarToast('Módulo de exportação indisponível', 'error');
            return;
        }
        await exportModule.exportarTurmaJSON(turmaId);
    },

    async exportarMigracaoItemGerenciarTurmas(turmaId) {
        if (!turmaId) return;
        if (typeof exportModule === 'undefined' || typeof exportModule.exportarTurmaProfessorJSON !== 'function') {
            utils.mostrarToast('Módulo de compartilhamento de QRCodes indisponível', 'error');
            return;
        }
        await exportModule.exportarTurmaProfessorJSON(turmaId);
    },

    async excluirItemGerenciarTurmas(turmaId) {
        if (!turmaId) return;
        this.gerenciarSelecionadas.clear();
        this.gerenciarSelecionadas.add(turmaId);
        await this.excluirSelecionadasGerenciarTurmas();
    },

    // Editar turma
    async editarTurma(id) {
        await this.mostrarModalEditarTurma(id);
    },

    async mostrarModalEditarTurma(id) {
        const turma = await db.get('turmas', id);
        if (!turma) {
            utils.mostrarToast('Turma não encontrada', 'error');
            return;
        }

        const modal = document.getElementById('modal-editar-turma');
        if (!modal) return;

        await escolas.renderizarDropdown('input-editar-turma-escola');

        document.getElementById('input-editar-turma-id').value = turma.id;
        document.getElementById('input-editar-turma-nome').value = turma.nome || '';
        document.getElementById('input-editar-turma-descricao').value = turma.descricao || '';
        document.getElementById('input-editar-turma-segundo-horario').checked = !!turma.segundoHorarioAtivo;

        const selectEscola = document.getElementById('input-editar-turma-escola');
        if (selectEscola) {
            selectEscola.value = turma.escolaId || 'default';
            if (!selectEscola.value) selectEscola.value = 'default';
        }

        modal.classList.add('active');
        setTimeout(() => document.getElementById('input-editar-turma-nome')?.focus(), 100);
    },

    async salvarEdicaoTurma() {
        const turmaId = document.getElementById('input-editar-turma-id')?.value;
        if (!turmaId) {
            utils.mostrarToast('Turma não encontrada', 'error');
            return;
        }

        const turma = await db.get('turmas', turmaId);
        if (!turma) {
            utils.mostrarToast('Turma não encontrada', 'error');
            return;
        }

        const novoNome = (document.getElementById('input-editar-turma-nome')?.value || '').trim();
        const novaDescricao = (document.getElementById('input-editar-turma-descricao')?.value || '').trim();
        const novaEscolaId = (document.getElementById('input-editar-turma-escola')?.value || '').trim();
        const novoSegundoHorario = !!document.getElementById('input-editar-turma-segundo-horario')?.checked;

        if (!novoNome) {
            utils.mostrarToast('Por favor, informe o nome da turma', 'warning');
            document.getElementById('input-editar-turma-nome')?.focus();
            return;
        }

        if (!novaEscolaId) {
            utils.mostrarToast('Por favor, selecione uma escola', 'warning');
            document.getElementById('input-editar-turma-escola')?.focus();
            return;
        }

        const valorSegundoHorarioAtual = !!turma.segundoHorarioAtivo;
        turma.nome = novoNome;
        turma.descricao = novaDescricao;
        turma.escolaId = novaEscolaId;
        await db.put('turmas', turma);

        if (valorSegundoHorarioAtual !== novoSegundoHorario) {
            await this.definirSegundoHorario(turmaId, novoSegundoHorario);
        }

        app.fecharModal('modal-editar-turma');
        utils.mostrarToast('Turma atualizada', 'success');
        await this.listar();

        if (this.turmaAtual && this.turmaAtual.id === turmaId) {
            await this.abrirDetalhes(turmaId);
        }
    },

    // Editar turma
    async editar(turmaId) {
        try {
            const turma = await db.get('turmas', turmaId);
            if (!turma) return;

            const novoNome = prompt('Novo nome da turma:', turma.nome);
            if (novoNome && novoNome.trim()) {
                turma.nome = novoNome.trim();
                await db.put('turmas', turma);

                utils.mostrarToast('Turma atualizada!', 'success');
                await this.listar();

                if (this.turmaAtual && this.turmaAtual.id === turmaId) {
                    await this.abrirDetalhes(turmaId);
                }
            }
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao editar turma', 'error');
        }
    },

    // Excluir turma (botão da UI)
    async excluirTurma(turmaId) {
        if (!turmaId) {
            utils.mostrarToast('Nenhuma turma selecionada', 'error');
            return;
        }

        if (!this.turmaAtual || this.turmaAtual.id !== turmaId) {
            this.turmaAtual = await db.get('turmas', turmaId);
            if (!this.turmaAtual) {
                utils.mostrarToast('Turma não encontrada', 'error');
                return;
            }
        }

        await this.confirmarExcluirTurma();
    },

    // Confirmar exclusão de turma
    async confirmarExcluirTurma() {
        if (!this.turmaAtual) {
            utils.mostrarToast('Nenhuma turma selecionada', 'error');
            return;
        }

        // Fetch counts para mensagem de alerta
        const alunosDaTurma = await db.getByIndex('alunos', 'turmaId', this.turmaAtual.id);
        const chamadasDaTurma = await db.getByIndex('chamadas', 'turmaId', this.turmaAtual.id);

        const mensagem = `⚠️ **EXCLUSÃO IRREVERSÍVEL** ⚠️\n\n` +
            `Tem certeza que deseja excluir a turma "${this.turmaAtual.nome}"?\n\n` +
            `📌 **Serão excluídos permanentemente:**\n` +
            `• ${alunosDaTurma.length} aluno(s) cadastrado(s)\n` +
            `• ${chamadasDaTurma.length} registro(s) de chamada\n` +
            `• Todos os dados associados\n\n` +
            `Esta ação NÃO pode ser desfeita!`;

        if (confirm(mensagem)) {
            await this.excluirTurmaCompleta(this.turmaAtual.id);
        }
    },

    // Excluir turma e todos os dados associados (Cascade Delete)
    async excluirTurmaCompleta(turmaId) {
        try {
            utils.mostrarToast('Excluindo turma e dados...', 'info');

            // 1. Buscar dados relacionados
            const alunosParaExcluir = await db.getByIndex('alunos', 'turmaId', turmaId);
            const chamadasParaExcluir = await db.getByIndex('chamadas', 'turmaId', turmaId);

            // 2. Cascade Delete (Promise.all para velocidade)
            const deletePromises = [
                // Deletar a turma
                db.delete('turmas', turmaId),
                // Deletar todos os alunos
                ...alunosParaExcluir.map(a => db.delete('alunos', a.id)),
                // Deletar todas as chamadas
                ...chamadasParaExcluir.map(c => db.delete('chamadas', c.id))
            ];

            await Promise.all(deletePromises);

            utils.mostrarToast('Turma e todos os dados associados foram excluídos', 'success');

            // Limpar estado atual
            this.turmaAtual = null;

            // Voltar para lista de turmas
            await this.listar();
            app.mostrarTela('tela-turmas');

            // Limpar título do header
            document.getElementById('header-title').textContent = 'Turmas';

            // Esconder botão voltar
            document.getElementById('btn-back').style.display = 'none';

        } catch (error) {
            console.error('Erro ao excluir turma:', error);
            utils.mostrarToast('Erro ao excluir turma. Tente novamente.', 'error');
        }
    },

    // Deletar turma (mantido para compatibilidade, redireciona para cascade)
    async deletar(turmaId) {
        // Redireciona para logica completa se tiver confirmação simples, mas ideal é usar confirmarExcluirTurma
        if (!utils.confirmar('Tem certeza que deseja excluir esta turma?')) return;

        await this.excluirTurmaCompleta(turmaId);
    },

    // MULTI ESCOLA: Filtrar turmas por escola
    async filtrarPorEscola(escolaId) {
        console.log('?? Filtrando por escola:', escolaId);
        await this.listar();
    }
};




