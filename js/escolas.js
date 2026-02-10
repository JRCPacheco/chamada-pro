// ===== ESCOLAS MODULE =====
// Gerenciamento de escolas (Multi-School Support)
// Migrado para IndexedDB

const escolas = {

    // Listar escolas no modal de gerenciamento
    async listarEscolas() {
        const escolasArray = await db.getAll('escolas');
        const container = document.getElementById('lista-escolas-gerenciar');

        if (!container) return;

        if (escolasArray.length === 0) {
            container.innerHTML = '<p class="text-muted">Nenhuma escola cadastrada</p>';
            return;
        }

        // Para contar turmas, precisamos de todas as turmas (ou usar index se fosse performatico, mas getAll é ok aqui)
        const allTurmas = await db.getAll('turmas');

        container.innerHTML = escolasArray.map(escola => {
            const isDefault = escola.id === 'default';
            const turmasDaEscola = allTurmas.filter(t => t.escolaId === escola.id || t.escola_id === escola.id); // Compatibilidade. Comentário do ChatGPT: TODO
            const temTurmas = turmasDaEscola.length > 0;

            return `
                <div class="escola-item" data-escola-id="${escola.id}">
                    <div class="escola-item-info">
                        <strong>${utils.escapeHtml(escola.nome)}</strong>
                        <div class="escola-item-meta">
                            ${temTurmas ? `<span class="count-badge">${turmasDaEscola.length} turma${turmasDaEscola.length !== 1 ? 's' : ''}</span>` : '<span class="count-badge empty">Sem turmas</span>'}
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
    async adicionarEscola() {
        const input = document.getElementById('input-nova-escola');
        const nome = input.value.trim();

        if (!nome) {
            utils.mostrarToast('Por favor, informe o nome da escola', 'warning');
            input.focus();
            return;
        }

        // Validar nome único (case-insensitive)
        const escolasArray = await db.getAll('escolas');
        const nomeNormalizado = nome.toLowerCase();
        const jaExiste = escolasArray.some(e => e.nome.toLowerCase() === nomeNormalizado);

        if (jaExiste) {
            utils.mostrarToast('Já existe uma escola com este nome', 'warning');
            input.focus();
            return;
        }

        // Adicionar escola
        const novaEscola = {
            // id: 'escola_' + Date.now(), //Gerando ID manualmente para manter padrão do projeto
            nome: nome,
            criadaEm: new Date().toISOString()
        };

        try {
            await db.add('escolas', novaEscola);
            utils.mostrarToast('Escola adicionada com sucesso!', 'success');
            utils.vibrar([50]);
            input.value = '';

            await this.listarEscolas();
            await this.atualizarTodosDropdowns();
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao adicionar escola', 'error');
        }
    },

    // Editar escola
    async editarEscola(id) {
        try {
            const escola = await db.get('escolas', id);

            if (!escola) {
                utils.mostrarToast('Escola não encontrada', 'error');
                return;
            }

            const novoNome = prompt('Novo nome da escola:', escola.nome);

            if (!novoNome || !novoNome.trim()) {
                return; // Cancelado
            }

            const nomeNormalizado = novoNome.trim().toLowerCase();
            const escolasArray = await db.getAll('escolas');

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
            await db.put('escolas', escola);

            utils.mostrarToast('Escola atualizada!', 'success');
            await this.listarEscolas();
            await this.atualizarTodosDropdowns();
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao editar escola', 'error');
        }
    },

    // Excluir escola
    async excluirEscola(id) {
        // Bloquear exclusão da escola padrão
        if (id === 'default') {
            utils.mostrarToast('A escola padrão não pode ser excluída', 'warning');
            return;
        }

        try {
            // Verificar se há turmas vinculadas usando INDEX
            const turmasVinculadas = await db.getByIndex('turmas', 'escolaId', id);

            if (turmasVinculadas.length > 0) {
                utils.mostrarToast(
                    `Não é possível excluir: existem ${turmasVinculadas.length} turma${turmasVinculadas.length !== 1 ? 's' : ''} vinculada${turmasVinculadas.length !== 1 ? 's' : ''} a esta escola`,
                    'warning'
                );
                return;
            }

            // Excluir escola
            await db.delete('escolas', id);

            utils.mostrarToast('Escola excluída', 'success');
            await this.listarEscolas();
            await this.atualizarTodosDropdowns();
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao excluir escola', 'error');
        }
    },

    // Renderizar dropdown de escolas
    async renderizarDropdown(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;

        const escolasArray = await db.getAll('escolas');
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
    async atualizarTodosDropdowns() {
        await this.renderizarDropdown('input-turma-escola');
        await this.renderizarDropdown('filter-escola');
    },

    // Mostrar modal de gerenciamento
    async mostrarModalGerenciar() {
        const modal = document.getElementById('modal-gerenciar-escolas');
        if (!modal) return;

        modal.classList.add('active');
        await this.listarEscolas();

        // Limpar input
        const input = document.getElementById('input-nova-escola');
        if (input) input.value = '';
    }
};
