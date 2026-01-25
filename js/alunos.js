// ===== ALUNOS MODULE =====
// Gerenciamento de alunos

const alunos = {

    alunoEmEdicao: null,

    // Listar alunos da turma atual
    listar() {
        if (!turmas.turmaAtual) return;

        const turma = storage.getTurmaById(turmas.turmaAtual.id);
        const alunosObj = turma.alunos || {};
        const alunosArray = Object.values(alunosObj);
        
        const container = document.getElementById('lista-alunos');
        const emptyState = document.getElementById('empty-alunos');
        const searchInput = document.getElementById('search-alunos');

        if (alunosArray.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            this.renderizarAlunos(alunosArray);
        }

        // Busca em tempo real
        if (searchInput) {
            searchInput.oninput = utils.debounce(() => {
                const busca = searchInput.value;
                const alunosFiltrados = utils.filtrarPorBusca(alunosArray, busca, ['nome', 'matricula', 'email']);
                this.renderizarAlunos(alunosFiltrados);
            }, 300);
        }
    },

    // Renderizar lista de alunos
    renderizarAlunos(alunosArray) {
        const container = document.getElementById('lista-alunos');
        
        if (alunosArray.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Nenhum aluno encontrado</p></div>';
            return;
        }

        // Ordenar por nome
        alunosArray.sort((a, b) => a.nome.localeCompare(b.nome));

        container.innerHTML = alunosArray.map(aluno => {
            const iniciais = utils.getIniciais(aluno.nome);
            const cor = utils.getCorFromString(aluno.nome);
            
            return `
                <div class="aluno-card">
                    <div class="aluno-avatar" style="background: ${cor}">
                        ${iniciais}
                    </div>
                    <div class="aluno-info">
                        <h4>${utils.escapeHtml(aluno.nome)}</h4>
                        <p>Matrícula: ${utils.escapeHtml(aluno.matricula)}${aluno.email ? ' • ' + aluno.email : ''}</p>
                    </div>
                    <div class="aluno-actions">
                        <button class="btn-icon-sm btn-editar-aluno" data-matricula="${aluno.matricula}" title="Editar">
                            ✏️
                        </button>
                        <button class="btn-icon-sm btn-deletar-aluno" data-matricula="${aluno.matricula}" title="Excluir">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Adicionar event listeners
        document.querySelectorAll('.btn-editar-aluno').forEach(btn => {
            btn.addEventListener('click', function() {
                alunos.editar(this.dataset.matricula);
            });
        });

        document.querySelectorAll('.btn-deletar-aluno').forEach(btn => {
            btn.addEventListener('click', function() {
                alunos.deletar(this.dataset.matricula);
            });
        });
    },

    // Mostrar modal de novo aluno
    mostrarModalNovoAluno() {
        this.alunoEmEdicao = null;
        
        const modal = document.getElementById('modal-novo-aluno');
        modal.classList.add('active');
        
        // Atualizar título
        document.getElementById('modal-aluno-titulo').textContent = 'Novo Aluno';
        document.getElementById('btn-salvar-aluno').textContent = 'Salvar';
        
        // Limpar campos
        document.getElementById('input-aluno-nome').value = '';
        document.getElementById('input-aluno-matricula').value = '';
        document.getElementById('input-aluno-email').value = '';
        
        // Focar no primeiro campo
        setTimeout(() => {
            document.getElementById('input-aluno-nome').focus();
        }, 100);
    },

    // Salvar novo aluno
    salvarNovoAluno() {
        const nome = document.getElementById('input-aluno-nome').value.trim();
        const matricula = document.getElementById('input-aluno-matricula').value.trim();
        const email = document.getElementById('input-aluno-email').value.trim();

        // Validações
        if (!nome) {
            utils.mostrarToast('Por favor, informe o nome do aluno', 'warning');
            document.getElementById('input-aluno-nome').focus();
            return;
        }

        if (!matricula) {
            utils.mostrarToast('Por favor, informe a matrícula', 'warning');
            document.getElementById('input-aluno-matricula').focus();
            return;
        }

        if (email && !utils.validarEmail(email)) {
            utils.mostrarToast('Email inválido', 'warning');
            document.getElementById('input-aluno-email').focus();
            return;
        }

        // Verificar se matrícula já existe (somente para novo aluno)
        if (!this.alunoEmEdicao) {
            const turma = storage.getTurmaById(turmas.turmaAtual.id);
            if (turma.alunos && turma.alunos[matricula]) {
                utils.mostrarToast('Já existe um aluno com esta matrícula', 'warning');
                document.getElementById('input-aluno-matricula').focus();
                return;
            }
        }

        const aluno = {
            nome: nome,
            matricula: matricula,
            email: email
        };

        // Adicionar ou atualizar aluno
        const turma = storage.getTurmaById(turmas.turmaAtual.id);
        if (!turma.alunos) turma.alunos = {};

        // Se está editando e a matrícula mudou, remove o antigo
        if (this.alunoEmEdicao && this.alunoEmEdicao !== matricula) {
            delete turma.alunos[this.alunoEmEdicao];
        }

        turma.alunos[matricula] = aluno;

        if (storage.updateTurma(turma.id, { alunos: turma.alunos })) {
            utils.mostrarToast(
                this.alunoEmEdicao ? 'Aluno atualizado!' : 'Aluno adicionado!',
                'success'
            );
            utils.vibrar([50, 50, 50]);
            app.fecharModal('modal-novo-aluno');
            this.listar();
            turmas.abrirDetalhes(turmas.turmaAtual.id); // Atualizar contadores
        } else {
            utils.mostrarToast('Erro ao salvar aluno', 'error');
        }
    },

    // Editar aluno
    editar(matricula) {
        const turma = storage.getTurmaById(turmas.turmaAtual.id);
        const aluno = turma.alunos[matricula];
        
        if (!aluno) return;

        this.alunoEmEdicao = matricula;
        
        const modal = document.getElementById('modal-novo-aluno');
        modal.classList.add('active');
        
        // Atualizar título
        document.getElementById('modal-aluno-titulo').textContent = 'Editar Aluno';
        document.getElementById('btn-salvar-aluno').textContent = 'Atualizar';
        
        // Preencher campos
        document.getElementById('input-aluno-nome').value = aluno.nome;
        document.getElementById('input-aluno-matricula').value = aluno.matricula;
        document.getElementById('input-aluno-email').value = aluno.email || '';
        
        // Focar no primeiro campo
        setTimeout(() => {
            document.getElementById('input-aluno-nome').focus();
        }, 100);
    },

    // Deletar aluno
    deletar(matricula) {
        if (!utils.confirmar('Tem certeza que deseja excluir este aluno?')) {
            return;
        }

        const turma = storage.getTurmaById(turmas.turmaAtual.id);
        delete turma.alunos[matricula];

        if (storage.updateTurma(turma.id, { alunos: turma.alunos })) {
            utils.mostrarToast('Aluno excluído', 'success');
            this.listar();
            turmas.abrirDetalhes(turmas.turmaAtual.id); // Atualizar contadores
        } else {
            utils.mostrarToast('Erro ao excluir aluno', 'error');
        }
    },

    // Importar alunos via CSV
    importarCSV() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.txt';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const csvText = event.target.result;
                const alunos = utils.parseCSV(csvText);
                
                if (alunos.length === 0) {
                    utils.mostrarToast('Nenhum aluno encontrado no arquivo', 'warning');
                    return;
                }

                // Adicionar alunos
                const turma = storage.getTurmaById(turmas.turmaAtual.id);
                if (!turma.alunos) turma.alunos = {};

                let adicionados = 0;
                let duplicados = 0;

                alunos.forEach(aluno => {
                    if (turma.alunos[aluno.matricula]) {
                        duplicados++;
                    } else {
                        turma.alunos[aluno.matricula] = aluno;
                        adicionados++;
                    }
                });

                storage.updateTurma(turma.id, { alunos: turma.alunos });
                
                utils.mostrarToast(
                    `${adicionados} aluno(s) importado(s)${duplicados > 0 ? ` (${duplicados} duplicado(s) ignorado(s))` : ''}`,
                    'success'
                );
                
                this.listar();
                turmas.abrirDetalhes(turmas.turmaAtual.id);
            };

            reader.readAsText(file);
        };

        input.click();
    },

    // Gerar QR Codes em PDF
    gerarQRCodesPDF() {
        const turma = storage.getTurmaById(turmas.turmaAtual.id);
        const alunosArray = Object.values(turma.alunos || {});
        
        if (alunosArray.length === 0) {
            utils.mostrarToast('Nenhum aluno cadastrado', 'warning');
            return;
        }

        utils.mostrarToast('Gerando PDF...', 'info');
        
        setTimeout(() => {
            qrgen.gerarPDFTurma(turma, alunosArray);
        }, 100);
    }
};
