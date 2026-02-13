// ===== TURMAS MODULE =====
// Gerenciamento de turmas
// Migrado para IndexedDB

const turmas = {

    turmaAtual: null,
    listaTurmasListenerBound: false,
    _perguntarSegundoHorario(valorAtual = false) {
        const resposta = prompt('Segundo horÃ¡rio? (S/N):', valorAtual ? 'S' : 'N');
        if (resposta === null) return null;

        const valor = (resposta || '').trim().toLowerCase();
        if (['s', 'sim', 'y', 'yes', '1'].includes(valor)) return true;
        if (['n', 'nao', 'nÃ£o', 'no', '0', ''].includes(valor)) return false;

        utils.mostrarToast('Resposta invÃ¡lida. Use S ou N.', 'warning');
        return null;
    },

    // Carregar e exibir lista de turmas
    async listar() {
        const container = document.getElementById('lista-turmas');
        const emptyState = document.getElementById('empty-turmas');
        const searchInput = document.getElementById('search-turmas');
        const filterEscola = document.getElementById('filter-escola');

        // Config. state
        const config = await app._getAppConfig(); // Internal API usage
        const multi_escola = config.multi_escola;

        let turmasArray = [];

        // EstratÃ©gia de carregamento baseada em filtro
        if (multi_escola && filterEscola && filterEscola.value) {
            turmasArray = await db.getByIndex('turmas', 'escolaId', filterEscola.value);
        } else {
            turmasArray = await db.getAll('turmas');
        }

        if (turmasArray.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';

            // Filtragem local por busca de texto (nome/descricao)
            if (searchInput && searchInput.value.trim()) {
                turmasArray = utils.filtrarPorBusca(turmasArray, searchInput.value, ['nome', 'descricao']);
            }

            await this.renderizarTurmas(turmasArray);
        }

        // Atualizar estatÃ­sticas
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

        // PERFORMANCE FIX: Carregar TUDO uma vez, mapear em memÃ³ria
        // Evita N+1 queries (78 transaÃ§Ãµes para 39 turmas â†’ 2 transaÃ§Ãµes totais)
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
        const cardsHtml = turmasArray.map(turma => {
            const totalAlunos = mapAlunosPorTurma[turma.id] || 0;
            const totalChamadas = mapChamadasPorTurma[turma.id] || 0;

            // Badge de escola
            let escolaBadge = '';
            if (multi_escola && turma.escolaId) {
                const nomeEscola = escolasMap[turma.escolaId];
                if (nomeEscola) {
                    escolaBadge = `<span class="escola-badge">ðŸ« ${utils.escapeHtml(nomeEscola)}</span>`;
                }
            }

            return `
                <div class="turma-card" data-turma-id="${turma.id}">
                    ${escolaBadge}
                    <h3>${utils.escapeHtml(turma.nome)}</h3>
                    <p>${turma.descricao ? utils.escapeHtml(turma.descricao) : 'Sem descriÃ§Ã£o'}</p>
                    <div class="turma-meta">
                        <span>ðŸ‘¥ ${totalAlunos} aluno${totalAlunos !== 1 ? 's' : ''}</span>
                        <span>ðŸ“… ${totalChamadas} chamada${totalChamadas !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = cardsHtml;

        if (container && !this.listaTurmasListenerBound) {
            container.addEventListener('click', (e) => {
                const card = e.target.closest('.turma-card');
                if (!card || !container.contains(card)) return;
                const turmaId = card.dataset.turmaId;
                if (!turmaId) return;
                this.abrirDetalhes(turmaId);
            });
            this.listaTurmasListenerBound = true;
        }
    },

    // Atualizar estatÃ­sticas gerais
    async atualizarStats() {
        // Stats requer contagem global
        // Isso pode ser pesado, mas para PWA local Ã© ok
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
            // O index no db.js Ã© 'escolaId'. Mantendo consistencia
            criadaEm: new Date().toISOString()
            // REMOVIDO: alunos: {} -> Alunos agora sÃ£o store independente
        };

        try {
            await db.add('turmas', novaTurma);
            app.fecharModal('modal-nova-turma');

            // Atualizar lista (se falhar, apenas loga erro mas considera sucesso na criaÃ§Ã£o)
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
                utils.mostrarToast('Turma nÃ£o encontrada', 'error');
                return;
            }

            // Atualizar informaÃ§Ãµes da turma UI
            document.getElementById('turma-nome-detalhe').textContent = this.turmaAtual.nome;
            document.getElementById('turma-descricao-detalhe').textContent =
                this.turmaAtual.descricao || 'Sem descriÃ§Ã£o';

            // Counts async
            const alunosDaTurma = await db.getByIndex('alunos', 'turmaId', turmaId);
            const chamadasDaTurma = await db.getByIndex('chamadas', 'turmaId', turmaId);

            document.getElementById('turma-total-alunos').textContent = alunosDaTurma.length;
            document.getElementById('turma-total-chamadas-realizadas').textContent = chamadasDaTurma.length;

            // Atualizar tÃ­tulo do header
            document.getElementById('header-title').textContent = this.turmaAtual.nome;

            // Mostrar botÃ£o voltar
            document.getElementById('btn-back').style.display = 'block';

            // Carregar alunos e histÃ³rico
            // OBSERVACAO: alunos.js e chamadas.js ainda nÃ£o foram migrados.
            // Eles usam storage.getTurmaById. Isso vai quebrar se nÃ£o tiver compatibilidade?
            // "Alunos store separado (NÃƒO usar ainda aqui)" -> O user disse para nÃ£o migrar alunos.js.
            // Mas alunos.listar() vai tentar ler do storage antigo ou falhar.
            // Assumimos que a UI vai carregar vazio por enquanto atÃ© a proxima rodada.

            if (typeof alunos.listar === 'function') alunos.listar();
            if (typeof chamadas.listarHistorico === 'function') chamadas.listarHistorico();

            // Salvar estado para persistÃªncia (LapidaÃ§Ã£o)
            sessionStorage.setItem('chamada_pro_ultima_turma', turmaId);

            // Mudar para tela de detalhes
            app.mostrarTela('tela-turma-detalhe');
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao abrir turma', 'error');
        }
    },

    // Editar turma
    async editarTurma(id) {
        const turma = await db.get('turmas', id);
        if (!turma) {
            utils.mostrarToast('Turma não encontrada', 'error');
            return;
        }

        const novoNome = prompt('Nome da turma:', turma.nome || '');
        if (!novoNome) return;

        const novaDescricao = prompt('Descrição:', turma.descricao || '');
        const segundoHorarioAtivo = this._perguntarSegundoHorario(!!turma.segundoHorarioAtivo);
        if (segundoHorarioAtivo === null) return;

        turma.nome = novoNome.trim();
        turma.descricao = (novaDescricao || '').trim();
        turma.segundoHorarioAtivo = segundoHorarioAtivo;

        await db.put('turmas', turma);

        utils.mostrarToast('Turma atualizada', 'success');
        await this.listar();

        if (this.turmaAtual && this.turmaAtual.id === id) {
            await this.abrirDetalhes(id);
        }
    },

    // Editar turma
    async editar(turmaId) {
        try {
            const turma = await db.get('turmas', turmaId);
            if (!turma) return;

            const novoNome = prompt('Novo nome da turma:', turma.nome);
            if (novoNome && novoNome.trim()) {
                const segundoHorarioAtivo = this._perguntarSegundoHorario(!!turma.segundoHorarioAtivo);
                if (segundoHorarioAtivo === null) return;

                turma.nome = novoNome.trim();
                turma.segundoHorarioAtivo = segundoHorarioAtivo;
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

    // Excluir turma (botÃ£o da UI)
    async excluirTurma(turmaId) {
        if (!turmaId) {
            utils.mostrarToast('Nenhuma turma selecionada', 'error');
            return;
        }

        if (!this.turmaAtual || this.turmaAtual.id !== turmaId) {
            this.turmaAtual = await db.get('turmas', turmaId);
            if (!this.turmaAtual) {
                utils.mostrarToast('Turma nÃ£o encontrada', 'error');
                return;
            }
        }

        await this.confirmarExcluirTurma();
    },

    // Confirmar exclusÃ£o de turma
    async confirmarExcluirTurma() {
        if (!this.turmaAtual) {
            utils.mostrarToast('Nenhuma turma selecionada', 'error');
            return;
        }

        // Fetch counts para mensagem de alerta
        const alunosDaTurma = await db.getByIndex('alunos', 'turmaId', this.turmaAtual.id);
        const chamadasDaTurma = await db.getByIndex('chamadas', 'turmaId', this.turmaAtual.id);

        const mensagem = `âš ï¸ **EXCLUSÃƒO IRREVERSÃVEL** âš ï¸\n\n` +
            `Tem certeza que deseja excluir a turma "${this.turmaAtual.nome}"?\n\n` +
            `ðŸ“Š **SerÃ£o excluÃ­dos permanentemente:**\n` +
            `â€¢ ${alunosDaTurma.length} aluno(s) cadastrado(s)\n` +
            `â€¢ ${chamadasDaTurma.length} registro(s) de chamada\n` +
            `â€¢ Todos os dados associados\n\n` +
            `Esta aÃ§Ã£o NÃƒO pode ser desfeita!`;

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

            utils.mostrarToast('Turma e todos os dados associados foram excluÃ­dos', 'success');

            // Limpar estado atual
            this.turmaAtual = null;

            // Voltar para lista de turmas
            await this.listar();
            app.mostrarTela('tela-turmas');

            // Limpar tÃ­tulo do header
            document.getElementById('header-title').textContent = 'Turmas';

            // Esconder botÃ£o voltar
            document.getElementById('btn-back').style.display = 'none';

        } catch (error) {
            console.error('Erro ao excluir turma:', error);
            utils.mostrarToast('Erro ao excluir turma. Tente novamente.', 'error');
        }
    },

    // Deletar turma (mantido para compatibilidade, redireciona para cascade)
    async deletar(turmaId) {
        // Redireciona para logica completa se tiver confirmaÃ§Ã£o simples, mas ideal Ã© usar confirmarExcluirTurma
        if (!utils.confirmar('Tem certeza que deseja excluir esta turma?')) return;

        await this.excluirTurmaCompleta(turmaId);
    },

    // MULTI ESCOLA: Filtrar turmas por escola
    async filtrarPorEscola(escolaId) {
        console.log('ðŸ« Filtrando por escola:', escolaId);
        await this.listar();
    }
};



