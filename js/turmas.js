// ===== TURMAS MODULE =====
// Gerenciamento de turmas

const turmas = {

    turmaAtual: null,
    listaTurmasListenerBound: false,

    // Carregar e exibir lista de turmas
    listar() {
        const turmas = storage.getTurmas();
        const container = document.getElementById('lista-turmas');
        const emptyState = document.getElementById('empty-turmas');
        const searchInput = document.getElementById('search-turmas');
        const filterEscola = document.getElementById('filter-escola');

        if (turmas.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';

            // Respect current filter and search
            let turmasFiltradas = turmas;
            const { multi_escola } = storage.getConfig();

            if (multi_escola && filterEscola && filterEscola.value) {
                turmasFiltradas = turmasFiltradas.filter(t => t.escola_id === filterEscola.value);
            }

            if (searchInput && searchInput.value.trim()) {
                turmasFiltradas = utils.filtrarPorBusca(turmasFiltradas, searchInput.value, ['nome', 'descricao']);
            }

            this.renderizarTurmas(turmasFiltradas);
        }

        // Atualizar estatísticas
        this.atualizarStats();

        // Busca em tempo real
        if (searchInput) {
            searchInput.oninput = utils.debounce(() => {
                this.listar(); // Re-use the listar logic for consistent filtering
            }, 300);
        }
    },

    // Renderizar lista de turmas
    renderizarTurmas(turmasArray) {
        const container = document.getElementById('lista-turmas');
        const { multi_escola } = storage.getConfig();

        if (turmasArray.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Nenhuma turma encontrada</p></div>';
            return;
        }

        container.innerHTML = turmasArray.map(turma => {
            const totalAlunos = turma.alunos ? Object.keys(turma.alunos).length : 0;
            const chamadas = storage.getChamadasByTurma(turma.id);

            // MULTI ESCOLA: Badge de escola
            let escolaBadge = '';
            if (multi_escola && turma.escola_id) {
                const escolasArray = storage.getEscolas();
                const escola = escolasArray.find(e => e.id === turma.escola_id);
                if (escola) {
                    escolaBadge = `<span class="escola-badge">🏫 ${utils.escapeHtml(escola.nome)}</span>`;
                }
            }

            return `
                <div class="turma-card" data-turma-id="${turma.id}">
                    ${escolaBadge}
                    <h3>${utils.escapeHtml(turma.nome)}</h3>
                    <p>${turma.descricao ? utils.escapeHtml(turma.descricao) : 'Sem descrição'}</p>
                    <div class="turma-meta">
                        <span>👥 ${totalAlunos} aluno${totalAlunos !== 1 ? 's' : ''}</span>
                        <span>📅 ${chamadas.length} chamada${chamadas.length !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            `;
        }).join('');

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

    // Atualizar estatísticas gerais
    atualizarStats() {
        const stats = storage.getStats();

        document.getElementById('total-turmas').textContent = stats.totalTurmas;
        document.getElementById('total-alunos').textContent = stats.totalAlunos;
        document.getElementById('total-chamadas').textContent = stats.totalChamadas;
    },

    // Mostrar modal de nova turma
    mostrarModalNovaTurma() {
        const modal = document.getElementById('modal-nova-turma');
        modal.classList.add('active');

        // Limpar campos
        document.getElementById('input-turma-nome').value = '';
        document.getElementById('input-turma-descricao').value = '';

        // MULTI ESCOLA: Popularizar dropdown de escolas
        const { multi_escola } = storage.getConfig();
        if (multi_escola) {
            escolas.renderizarDropdown('input-turma-escola');
        }

        // Focar no primeiro campo
        setTimeout(() => {
            document.getElementById('input-turma-nome').focus();
        }, 100);
    },

    // Salvar nova turma
    salvarNovaTurma() {
        const nome = document.getElementById('input-turma-nome').value.trim();
        const descricao = document.getElementById('input-turma-descricao').value.trim();

        // MULTI ESCOLA: Capturar escola_id
        const { multi_escola } = storage.getConfig();
        let escola_id = 'default';

        if (multi_escola) {
            escola_id = document.getElementById('input-turma-escola').value;
            if (!escola_id) {
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

        const novaTurma = {
            nome: nome,
            descricao: descricao,
            escola_id: escola_id // MULTI ESCOLA
        };

        const turmaId = storage.addTurma(novaTurma);

        if (turmaId) {
            utils.mostrarToast('Turma criada com sucesso!', 'success');
            utils.vibrar([50, 50, 50]);
            app.fecharModal('modal-nova-turma');
            this.listar();
        } else {
            utils.mostrarToast('Erro ao criar turma', 'error');
        }
    },

    // Abrir detalhes da turma
    abrirDetalhes(turmaId) {
        this.turmaAtual = storage.getTurmaById(turmaId);

        if (!this.turmaAtual) {
            utils.mostrarToast('Turma não encontrada', 'error');
            return;
        }

        // Atualizar informações da turma
        document.getElementById('turma-nome-detalhe').textContent = this.turmaAtual.nome;
        document.getElementById('turma-descricao-detalhe').textContent =
            this.turmaAtual.descricao || 'Sem descrição';

        const totalAlunos = this.turmaAtual.alunos ? Object.keys(this.turmaAtual.alunos).length : 0;
        const chamadasTurma = storage.getChamadasByTurma(turmaId);

        document.getElementById('turma-total-alunos').textContent = totalAlunos;
        document.getElementById('turma-total-chamadas-realizadas').textContent = chamadasTurma.length;

        // Atualizar título do header
        document.getElementById('header-title').textContent = this.turmaAtual.nome;

        // Mostrar botão voltar
        document.getElementById('btn-back').style.display = 'block';

        // Carregar alunos e histórico
        alunos.listar();
        chamadas.listarHistorico();

        // Salvar estado para persistência (Lapidação)
        sessionStorage.setItem('chamada_pro_ultima_turma', turmaId);

        // Mudar para tela de detalhes
        app.mostrarTela('tela-turma-detalhe');
    },

    // Editar turma
    editar(turmaId) {
        const turma = storage.getTurmaById(turmaId);
        if (!turma) return;

        const novoNome = prompt('Novo nome da turma:', turma.nome);
        if (novoNome && novoNome.trim()) {
            storage.updateTurma(turmaId, { nome: novoNome.trim() });
            utils.mostrarToast('Turma atualizada!', 'success');
            this.listar();
            if (this.turmaAtual && this.turmaAtual.id === turmaId) {
                this.abrirDetalhes(turmaId);
            }
        }
    },

    // Confirmar exclusão de turma
    confirmarExcluirTurma() {
        if (!this.turmaAtual) {
            utils.mostrarToast('Nenhuma turma selecionada', 'error');
            return;
        }

        const totalAlunos = this.turmaAtual.alunos ? Object.keys(this.turmaAtual.alunos).length : 0;
        const chamadasTurma = storage.getChamadasByTurma(this.turmaAtual.id);
        const totalChamadas = chamadasTurma.length;

        const mensagem = `⚠️ **EXCLUSÃO IRREVERSÍVEL** ⚠️\n\n` +
            `Tem certeza que deseja excluir a turma "${this.turmaAtual.nome}"?\n\n` +
            `📊 **Serão excluídos permanentemente:**\n` +
            `• ${totalAlunos} aluno(s) cadastrado(s)\n` +
            `• ${totalChamadas} registro(s) de chamada\n` +
            `• Todos os dados associados\n\n` +
            `Esta ação NÃO pode ser desfeita!`;

        if (confirm(mensagem)) {
            this.excluirTurmaCompleta(this.turmaAtual.id);
        }
    },

    // Excluir turma e todos os dados associados
    excluirTurmaCompleta(turmaId) {
        try {
            // 1. Excluir todos os registros de chamada da turma
            const chamadas = storage.getChamadas();
            const chamadasParaExcluir = chamadas.filter(c => c.turmaId === turmaId);
            
            chamadasParaExcluir.forEach(chamada => {
                storage.deleteChamada(chamada.id);
            });

            // 2. Excluir a turma (isso já exclui os alunos associados)
            if (storage.deleteTurma(turmaId)) {
                utils.mostrarToast('Turma e todos os dados associados foram excluídos', 'success');
                
                // Limpar estado atual
                this.turmaAtual = null;
                
                // Voltar para lista de turmas
                this.listar();
                app.mostrarTela('tela-turmas');
                
                // Limpar título do header
                document.getElementById('header-title').textContent = 'Turmas';
                
                // Esconder botão voltar
                document.getElementById('btn-back').style.display = 'none';
            } else {
                utils.mostrarToast('Erro ao excluir turma', 'error');
            }
        } catch (error) {
            console.error('Erro ao excluir turma:', error);
            utils.mostrarToast('Erro ao excluir turma. Tente novamente.', 'error');
        }
    },

    // Deletar turma (mantido para compatibilidade)
    deletar(turmaId) {
        if (!utils.confirmar('Tem certeza que deseja excluir esta turma? Esta ação não pode ser desfeita.')) {
            return;
        }

        if (storage.deleteTurma(turmaId)) {
            utils.mostrarToast('Turma excluída', 'success');
            this.listar();
            app.mostrarTela('tela-turmas');
        } else {
            utils.mostrarToast('Erro ao excluir turma', 'error');
        }
    },

    // MULTI ESCOLA: Filtrar turmas por escola
    filtrarPorEscola(escolaId) {
        console.log('🏫 Filtrando por escola:', escolaId);
        this.listar(); // Simple: let listar handle the current state of filters
    }
};
