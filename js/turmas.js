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

        if (turmas.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            this.renderizarTurmas(turmas);
        }

        // Atualizar estatísticas
        this.atualizarStats();

        // Busca em tempo real
        if (searchInput) {
            searchInput.oninput = utils.debounce(() => {
                const busca = searchInput.value;
                const turmasFiltradas = utils.filtrarPorBusca(turmas, busca, ['nome', 'descricao']);
                this.renderizarTurmas(turmasFiltradas);
            }, 300);
        }
    },

    // Renderizar lista de turmas
    renderizarTurmas(turmasArray) {
        const container = document.getElementById('lista-turmas');

        if (turmasArray.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Nenhuma turma encontrada</p></div>';
            return;
        }

        container.innerHTML = turmasArray.map(turma => {
            const totalAlunos = turma.alunos ? Object.keys(turma.alunos).length : 0;
            const chamadas = storage.getChamadasByTurma(turma.id);

            return `
                <div class="turma-card" data-turma-id="${turma.id}">
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

        // Focar no primeiro campo
        setTimeout(() => {
            document.getElementById('input-turma-nome').focus();
        }, 100);
    },

    // Salvar nova turma
    salvarNovaTurma() {
        const nome = document.getElementById('input-turma-nome').value.trim();
        const descricao = document.getElementById('input-turma-descricao').value.trim();

        if (!nome) {
            utils.mostrarToast('Por favor, informe o nome da turma', 'warning');
            document.getElementById('input-turma-nome').focus();
            return;
        }

        const novaTurma = {
            nome: nome,
            descricao: descricao
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

    // Deletar turma
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
    }
};
