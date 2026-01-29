// ===== ESCOLAS MODULE =====
// Gerenciamento de escolas (Multi-School Support)

const escolas = {

    // Listar escolas no modal de gerenciamento
    listarEscolas() {
        const escolasArray = storage.getEscolas();
        const container = document.getElementById('lista-escolas-gerenciar');

        if (!container) return;

        if (escolasArray.length === 0) {
            container.innerHTML = '<p class="text-muted">Nenhuma escola cadastrada</p>';
            return;
        }

        container.innerHTML = escolasArray.map(escola => {
            const isDefault = escola.id === 'default';
            const turmasArray = storage.getTurmas().filter(t => t.escola_id === escola.id);
            const temTurmas = turmasArray.length > 0;

            return `
                <div class="escola-item" data-escola-id="${escola.id}">
                    <div class="escola-item-info">
                        <strong>${utils.escapeHtml(escola.nome)}</strong>
                        <div class="escola-item-meta">
                            ${temTurmas ? `<span class="count-badge">${turmasArray.length} turma${turmasArray.length !== 1 ? 's' : ''}</span>` : '<span class="count-badge empty">Sem turmas</span>'}
                            ${isDefault ? '<span class="badge-default">Padrão</span>' : ''}
                        </div>
                    </div>
                    <div class="escola-item-actions">
                        ${!isDefault ? `
                            <button class="btn-icon btn-sm" onclick="escolas.editarEscola('${escola.id}')" title="Editar">
                                ✏️
                            </button>
                            <button class="btn-icon btn-sm" onclick="escolas.excluirEscola('${escola.id}')" title="Excluir">
                                🗑️
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    // Adicionar nova escola
    adicionarEscola() {
        const input = document.getElementById('input-nova-escola');
        const nome = input.value.trim();

        if (!nome) {
            utils.mostrarToast('Por favor, informe o nome da escola', 'warning');
            input.focus();
            return;
        }

        // Validar nome único (case-insensitive)
        const escolasArray = storage.getEscolas();
        const nomeNormalizado = nome.toLowerCase();
        const jaExiste = escolasArray.some(e => e.nome.toLowerCase() === nomeNormalizado);

        if (jaExiste) {
            utils.mostrarToast('Já existe uma escola com este nome', 'warning');
            input.focus();
            return;
        }

        // Adicionar escola
        const novaEscola = {
            nome: nome
        };

        const escolaId = storage.addEscola(novaEscola);

        if (escolaId) {
            utils.mostrarToast('Escola adicionada com sucesso!', 'success');
            utils.vibrar([50]);
            input.value = '';
            this.listarEscolas();

            // Atualizar dropdowns se necessário
            this.atualizarTodosDropdowns();
        } else {
            utils.mostrarToast('Erro ao adicionar escola', 'error');
        }
    },

    // Editar escola
    editarEscola(id) {
        const escolasArray = storage.getEscolas();
        const escola = escolasArray.find(e => e.id === id);

        if (!escola) {
            utils.mostrarToast('Escola não encontrada', 'error');
            return;
        }

        const novoNome = prompt('Novo nome da escola:', escola.nome);

        if (!novoNome || !novoNome.trim()) {
            return; // Cancelado
        }

        const nomeNormalizado = novoNome.trim().toLowerCase();

        // Validar nome único (exceto ela mesma)
        const jaExiste = escolasArray.some(e =>
            e.id !== id && e.nome.toLowerCase() === nomeNormalizado
        );

        if (jaExiste) {
            utils.mostrarToast('Já existe uma escola com este nome', 'warning');
            return;
        }

        // Atualizar escola
        escola.nome = novoNome.trim();
        storage.saveEscolas(escolasArray);

        utils.mostrarToast('Escola atualizada!', 'success');
        this.listarEscolas();
        this.atualizarTodosDropdowns();
    },

    // Excluir escola
    excluirEscola(id) {
        // Bloquear exclusão da escola padrão
        if (id === 'default') {
            utils.mostrarToast('A escola padrão não pode ser excluída', 'warning');
            return;
        }

        // Verificar se há turmas vinculadas
        const turmas = storage.getTurmas().filter(t => t.escola_id === id);

        if (turmas.length > 0) {
            utils.mostrarToast(
                `Não é possível excluir: existem ${turmas.length} turma${turmas.length !== 1 ? 's' : ''} vinculada${turmas.length !== 1 ? 's' : ''} a esta escola`,
                'warning'
            );
            return;
        }

        // Excluir escola
        const escolasArray = storage.getEscolas();
        const filtered = escolasArray.filter(e => e.id !== id);
        storage.saveEscolas(filtered);

        utils.mostrarToast('Escola excluída', 'success');
        this.listarEscolas();
        this.atualizarTodosDropdowns();
    },

    // Renderizar dropdown de escolas
    renderizarDropdown(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;

        const escolasArray = storage.getEscolas();
        const selectedValue = select.value; // Preservar seleção atual

        // Popular options
        const options = escolasArray.map(escola => {
            return `<option value="${escola.id}">${utils.escapeHtml(escola.nome)}</option>`;
        }).join('');

        // Se for filtro, adicionar opção "Todas"
        if (selectId === 'filter-escola') {
            select.innerHTML = `<option value="">Todas as Escolas</option>${options}`;
        } else {
            select.innerHTML = `<option value="">Selecione uma escola...</option>${options}`;
        }

        // Restaurar seleção se possível
        if (selectedValue) {
            select.value = selectedValue;
        }
    },

    // Atualizar todos os dropdowns existentes
    atualizarTodosDropdowns() {
        this.renderizarDropdown('input-turma-escola');
        this.renderizarDropdown('filter-escola');
    },

    // Mostrar modal de gerenciamento
    mostrarModalGerenciar() {
        const modal = document.getElementById('modal-gerenciar-escolas');
        if (!modal) return;

        modal.classList.add('active');
        this.listarEscolas();

        // Limpar input
        const input = document.getElementById('input-nova-escola');
        if (input) input.value = '';
    }
};
