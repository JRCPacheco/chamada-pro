// ===== ESCOLAS MODULE =====
// Gerenciamento de escolas (Multi-School Support)
// Migrado para IndexedDB

const escolas = {

    fotoNovaTemp: null,
    fotoEditarTemp: null,

    // Listar escolas no modal de gerenciamento
    async listarEscolas() {
        const escolasArray = await db.getAll('escolas');
        const container = document.getElementById('lista-escolas-gerenciar');

        if (!container) return;

        if (escolasArray.length === 0) {
            container.innerHTML = '<p class="text-muted">Nenhuma escola cadastrada</p>';
            return;
        }

        const allTurmas = await db.getAll('turmas');

        container.innerHTML = escolasArray.map(escola => {
            const isDefault = escola.id === 'default';
            const turmasDaEscola = allTurmas.filter(t => t.escolaId === escola.id || t.escola_id === escola.id);
            const temTurmas = turmasDaEscola.length > 0;
            const logoHtml = escola.foto
                ? `<img src="${escola.foto}" class="escola-item-logo" alt="Logo">`
                : `<div class="escola-foto-preview-mini" style="width:36px;height:36px;font-size:18px;cursor:default;pointer-events:none;"><span>&#127979;</span></div>`;

            return `
                <div class="escola-item" data-action="escolas-abrir-editar-item" data-escola-id="${escola.id}" role="button" tabindex="0" title="Editar escola">
                    ${logoHtml}
                    <div class="escola-item-info">
                        <strong>${utils.escapeHtml(escola.nome)}</strong>
                        <div class="escola-item-meta">
                            ${temTurmas ? `<span class="count-badge">${turmasDaEscola.length} turma${turmasDaEscola.length !== 1 ? 's' : ''}</span>` : '<span class="count-badge empty">Sem turmas</span>'}
                            ${isDefault ? '<span class="badge-default">Padrão</span>' : ''}
                        </div>
                    </div>
                    <div class="escola-item-actions">
                        ${!isDefault ? `
                            <button class="btn-icon btn-sm" data-action="escolas-excluir-item" data-escola-id="${escola.id}" title="Excluir">
                                &#128465;&#65039;
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

        // Validar nome Ãºnico (case-insensitive)
        const escolasArray = await db.getAll('escolas');
        const nomeNormalizado = nome.toLowerCase();
        const jaExiste = escolasArray.some(e => e.nome.toLowerCase() === nomeNormalizado);

        if (jaExiste) {
            utils.mostrarToast('JÃ¡ existe uma escola com este nome', 'warning');
            input.focus();
            return;
        }

        // Adicionar escola
        const novaEscola = {
            nome: nome,
            foto: this.fotoNovaTemp || null,
            criadaEm: new Date().toISOString()
        };

        try {
            await db.add('escolas', novaEscola);
            utils.mostrarToast('Escola adicionada com sucesso!', 'success');
            utils.vibrar([50]);
            input.value = '';
            this.fotoNovaTemp = null;
            this.resetarFotoNova();

            await this.listarEscolas();
            await this.atualizarTodosDropdowns();
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao adicionar escola', 'error');
        }
    },

    // Processar foto para nova escola
    processarFotoNova(file) {
        this._processarFoto(file, (base64) => {
            this.fotoNovaTemp = base64;
            const preview = document.getElementById('escola-foto-preview-nova');
            if (preview) {
                preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
            }
            const btnRemover = document.getElementById('btn-remover-foto-nova-escola');
            if (btnRemover) btnRemover.style.display = '';
        });
    },

    removerFotoNova() {
        this.fotoNovaTemp = null;
        this.resetarFotoNova();
    },

    resetarFotoNova() {
        const preview = document.getElementById('escola-foto-preview-nova');
        if (preview) preview.innerHTML = '<span>&#127979;</span>';
        const btnRemover = document.getElementById('btn-remover-foto-nova-escola');
        if (btnRemover) btnRemover.style.display = 'none';
        const input = document.getElementById('input-escola-foto-nova');
        if (input) input.value = '';
    },

    // Processar foto para ediÃ§Ã£o de escola
    processarFotoEditar(file) {
        this._processarFoto(file, (base64) => {
            this.fotoEditarTemp = base64;
            const preview = document.getElementById('escola-foto-preview-editar');
            if (preview) {
                preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
            }
            const btnRemover = document.getElementById('btn-remover-foto-editar-escola');
            if (btnRemover) btnRemover.style.display = '';
        });
    },

    removerFotoEditar() {
        this.fotoEditarTemp = null;
        const preview = document.getElementById('escola-foto-preview-editar');
        if (preview) preview.innerHTML = '<span>&#127979;</span>';
        const btnRemover = document.getElementById('btn-remover-foto-editar-escola');
        if (btnRemover) btnRemover.style.display = 'none';
        const input = document.getElementById('input-escola-foto-editar');
        if (input) input.value = '';
    },

    // Helper interno para processar foto (redimensionar)
    _processarFoto(file, callback) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                const maxSide = 256;
                if (w > h) { if (w > maxSide) { h *= maxSide / w; w = maxSide; } }
                else { if (h > maxSide) { w *= maxSide / h; h = maxSide; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                const base64 = canvas.toDataURL('image/jpeg', 0.7);
                if (base64.length > 60000) {
                    utils.mostrarToast('Logo muito grande, tente outra imagem', 'warning');
                    return;
                }
                callback(base64);
            };
            img.onerror = () => utils.mostrarToast('Erro ao carregar imagem', 'error');
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    // Abrir modal de ediÃ§Ã£o (com suporte a foto)
    async abrirModalEditar(id) {
        try {
            const escola = await db.get('escolas', id);
            if (!escola) {
                utils.mostrarToast('Escola nÃ£o encontrada', 'error');
                return;
            }

            this.fotoEditarTemp = escola.foto || null;
            document.getElementById('input-editar-escola-id').value = id;
            document.getElementById('input-editar-escola-nome').value = escola.nome;

            const preview = document.getElementById('escola-foto-preview-editar');
            const btnRemover = document.getElementById('btn-remover-foto-editar-escola');

            if (escola.foto && preview) {
                preview.innerHTML = `<img src="${escola.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
                if (btnRemover) btnRemover.style.display = '';
            } else {
                if (preview) preview.innerHTML = '<span>&#127979;</span>';
                if (btnRemover) btnRemover.style.display = 'none';
            }

            app.abrirModal('modal-editar-escola');
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao abrir ediÃ§Ã£o', 'error');
        }
    },

    // Salvar ediÃ§Ã£o de escola (com foto)
    async salvarEdicaoEscola() {
        const id = document.getElementById('input-editar-escola-id').value;
        const novoNome = (document.getElementById('input-editar-escola-nome').value || '').trim();

        if (!novoNome) {
            utils.mostrarToast('Informe o nome da escola', 'warning');
            return;
        }

        try {
            const escola = await db.get('escolas', id);
            if (!escola) {
                utils.mostrarToast('Escola nÃ£o encontrada', 'error');
                return;
            }

            const escolasArray = await db.getAll('escolas');
            const jaExiste = escolasArray.some(e => e.id !== id && e.nome.toLowerCase() === novoNome.toLowerCase());
            if (jaExiste) {
                utils.mostrarToast('JÃ¡ existe uma escola com este nome', 'warning');
                return;
            }

            escola.nome = novoNome;
            escola.foto = this.fotoEditarTemp !== undefined ? this.fotoEditarTemp : (escola.foto || null);

            await db.put('escolas', escola);
            utils.mostrarToast('Escola atualizada!', 'success');
            app.fecharModal('modal-editar-escola');
            await this.listarEscolas();
            await this.atualizarTodosDropdowns();
        } catch (e) {
            console.error(e);
            utils.mostrarToast('Erro ao editar escola', 'error');
        }
    },


    // Excluir escola
    async excluirEscola(id) {
        // Bloquear exclusÃ£o da escola padrÃ£o
        if (id === 'default') {
            utils.mostrarToast('A escola padrÃ£o nÃ£o pode ser excluÃ­da', 'warning');
            return;
        }

        try {
            // Verificar se hÃ¡ turmas vinculadas usando INDEX
            const turmasVinculadas = await db.getByIndex('turmas', 'escolaId', id);

            if (turmasVinculadas.length > 0) {
                utils.mostrarToast(
                    `NÃ£o Ã© possÃ­vel excluir: existem ${turmasVinculadas.length} turma${turmasVinculadas.length !== 1 ? 's' : ''} vinculada${turmasVinculadas.length !== 1 ? 's' : ''} a esta escola`,
                    'warning'
                );
                return;
            }

            // Excluir escola
            await db.delete('escolas', id);

            utils.mostrarToast('Escola excluÃ­da', 'success');
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
        const selectedValue = select.value; // Preservar seleÃ§Ã£o atual

        // Popular options
        const options = escolasArray.map(escola => {
            const sufixoAtual = (selectId === 'filter-escola' && escola.id === 'default') ? ' (Escola atual)' : '';
            return `<option value="${escola.id}">${utils.escapeHtml(escola.nome)}${sufixoAtual}</option>`;
        }).join('');

        // Se for filtro, adicionar opÃ§Ã£o "Todas"
        if (selectId === 'filter-escola') {
            select.innerHTML = `<option value="">Todas as Escolas</option>${options}`;
        } else {
            select.innerHTML = `<option value="">Selecione uma escola...</option>${options}`;
        }

        // Restaurar seleÃ§Ã£o se possÃ­vel
        if (selectedValue) {
            select.value = selectedValue;
        }
    },

    async obterEscolaPreferencialId() {
        const escolasArray = await db.getAll('escolas');
        if (!escolasArray.length) return '';

        const escolaDefault = escolasArray.find(e => e.id === 'default');
        if (escolaDefault) return escolaDefault.id;

        return escolasArray[0].id || '';
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

        // Limpar campos
        const input = document.getElementById('input-nova-escola');
        if (input) input.value = '';
        this.fotoNovaTemp = null;
        this.resetarFotoNova();
    }
};


