// ===== ALUNOS MODULE =====
// Gerenciamento de alunos

const alunos = {

    alunoEmEdicao: null,
    fotoTemp: null,
    qrImportado: null,

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
            const avatarHtml = aluno.foto
                ? `<img src="${aluno.foto}" class="aluno-avatar" style="object-fit: cover;">`
                : `<div class="aluno-avatar" style="background: linear-gradient(135deg, ${cor} 0%, ${utils.adjustColor(cor, -40)} 100%)">${iniciais}</div>`;

            return `
                <div class="aluno-card">
                    ${avatarHtml}
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
            btn.addEventListener('click', function () {
                alunos.editar(this.dataset.matricula);
            });
        });

        document.querySelectorAll('.btn-deletar-aluno').forEach(btn => {
            btn.addEventListener('click', function () {
                alunos.deletar(this.dataset.matricula);
            });
        });
    },

    // Mostrar modal de novo aluno
    mostrarModalNovoAluno() {
        // Validar se há uma turma selecionada
        if (!turmas.turmaAtual) {
            utils.mostrarToast('Erro: Nenhuma turma selecionada', 'error');
            return;
        }

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
        document.getElementById('input-aluno-obs').value = '';
        document.getElementById('input-aluno-pontos').value = 0;

        // Focar no primeiro campo
        setTimeout(() => {
            document.getElementById('input-aluno-nome').focus();
        }, 100);
    },

    // Salvar novo aluno
    salvarNovoAluno() {
        // Validar se há uma turma selecionada
        if (!turmas.turmaAtual) {
            utils.mostrarToast('Erro: Nenhuma turma selecionada', 'error');
            return;
        }

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

        // Obter aluno em edição se existir
        const turma = storage.getTurmaById(turmas.turmaAtual.id);
        const alunoEditando = this.alunoEmEdicao ? turma.alunos[this.alunoEmEdicao] : null;

        const aluno = {
            matricula: matricula,
            nome: nome,
            email: email,
            foto: this.fotoTemp,
            observacoes: document.getElementById('input-aluno-obs')?.value || '',
            pontosExtra: parseInt(document.getElementById('input-aluno-pontos')?.value || '0', 10),
            qrId: alunoEditando?.qrId || this.qrImportado?.id || utils.gerarQrId()
        };

        // Adicionar ou atualizar aluno
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
            this.qrImportado = null;
            app.fecharModal('modal-novo-aluno');
            this.listar();
            turmas.abrirDetalhes(turmas.turmaAtual.id); // Atualizar contadores
        } else {
            utils.mostrarToast('Erro ao salvar aluno', 'error');
        }
    },

    // Resetar preview e variável temporária
    resetarPreviewFoto() {
        this.fotoTemp = null;
        const preview = document.getElementById('aluno-foto-preview');
        if (preview) {
            preview.style.backgroundImage = 'none';
            document.getElementById('foto-placeholder-icon').style.display = 'block';
            document.getElementById('foto-placeholder-text').style.display = 'block';
        }
    },

    // Processar foto (redimensionar e comprimir)
    processarFoto(file) {
        if (!file) return;

        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;
                        const maxSide = 256;

                        // Redimensionamento proporcional (Maior lado = 256px)
                        if (width > height) {
                            if (width > maxSide) {
                                height *= maxSide / width;
                                width = maxSide;
                            }
                        } else {
                            if (height > maxSide) {
                                width *= maxSide / height;
                                height = maxSide;
                            }
                        }

                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        // JPEG 0.7 para economia de espaço
                        const base64 = canvas.toDataURL('image/jpeg', 0.7);

                        // Blindagem extra (60KB)
                        if (base64.length > 60000) {
                            utils.mostrarToast('Foto muito grande, tente outra', 'warning');
                            return;
                        }

                        this.fotoTemp = base64;
                        this.atualizarPreviewFoto(base64);
                    } catch (err) {
                        console.error('Erro no processamento canvas:', err);
                        utils.mostrarToast('Erro ao processar imagem', 'error');
                        this.resetarPreviewFoto();
                    }
                };
                img.onerror = () => {
                    utils.mostrarToast('Erro ao carregar imagem', 'error');
                    this.resetarPreviewFoto();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error('Erro ao ler arquivo:', err);
            utils.mostrarToast('Falha na leitura do arquivo', 'error');
        }
    },

    // Escolher foto do dispositivo (galeria/arquivos)
    carregarFotoDeArquivo(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        // Limite de 5MB
        if (file.size > 5 * 1024 * 1024) {
            utils.mostrarToast('Imagem muito grande (máx 5MB)', 'warning');
            event.target.value = '';
            return;
        }

        // Garantir tipo MIME válido
        if (!file.type || !file.type.startsWith('image/')) {
            utils.mostrarToast('Arquivo não é imagem', 'warning');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            this.fotoTemp = e.target.result;
            this.atualizarPreviewFoto(this.fotoTemp);
            utils.mostrarToast('Foto carregada!', 'success');
            // Limpar input file após leitura
            event.target.value = '';
        };

        reader.onerror = () => {
            utils.mostrarToast('Erro ao ler imagem', 'error');
            event.target.value = '';
        };

        reader.readAsDataURL(file);
    },

    // Atualizar preview visual no modal
    atualizarPreviewFoto(base64) {
        const preview = document.getElementById('aluno-foto-preview');
        if (preview) {
            preview.style.backgroundImage = `url(${base64})`;
            preview.style.backgroundSize = 'cover';
            preview.style.backgroundPosition = 'center';
            document.getElementById('foto-placeholder-icon').style.display = 'none';
            document.getElementById('foto-placeholder-text').style.display = 'none';
        }
    },

    // Aplicar dados do QR importado ao formulário
    aplicarDadosQrImportado(dados) {
        this.qrImportado = dados;
        if (dados.n) document.getElementById('input-aluno-nome').value = dados.n;
        if (dados.m) document.getElementById('input-aluno-matricula').value = dados.m;
        if (dados.e) document.getElementById('input-aluno-email').value = dados.e;
        if (dados.o) document.getElementById('input-aluno-obs').value = dados.o;
        utils.mostrarToast('Dados importados do QR Code!', 'success');
    },

    // Ler QR existente para importar dados
    lerQrExistente() {
        scanner.lerQrParaCadastro((dados) => {
            if (dados) {
                this.aplicarDadosQrImportado(dados);
            }
        });
    },

    // Editar aluno
    editar(matricula) {
        // Validar se há uma turma selecionada
        if (!turmas.turmaAtual) {
            utils.mostrarToast('Erro: Nenhuma turma selecionada', 'error');
            return;
        }

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
        document.getElementById('input-aluno-obs').value = aluno.observacoes || '';
        document.getElementById('input-aluno-pontos').value = aluno.pontosExtra || 0;

        // Carregar foto
        if (aluno.foto) {
            this.fotoTemp = aluno.foto;
            this.atualizarPreviewFoto(aluno.foto);
        } else {
            this.resetarPreviewFoto();
        }

        // Focar no primeiro campo
        setTimeout(() => {
            document.getElementById('input-aluno-nome').focus();
        }, 100);
    },

    // Deletar aluno
    deletar(matricula) {
        // Validar se há uma turma selecionada
        if (!turmas.turmaAtual) {
            utils.mostrarToast('Erro: Nenhuma turma selecionada', 'error');
            return;
        }

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
        // Validar se há uma turma selecionada
        if (!turmas.turmaAtual) {
            utils.mostrarToast('Erro: Nenhuma turma selecionada', 'error');
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.txt';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const processCsvText = (text) => {
                const alunos = utils.parseCSV(text);

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

            const reader = new FileReader();
            reader.onload = function (e) {
                const text = e.target.result;

                const looksBroken = /Ã.|�|\uFFFD/.test(text);

                if (looksBroken) {
                    const readerLatin = new FileReader();
                    readerLatin.onload = function (ev) {
                        processCsvText(ev.target.result);
                    };
                    readerLatin.readAsText(file, 'ISO-8859-1');
                } else {
                    processCsvText(text);
                }
            };

            reader.readAsText(file, 'UTF-8');
        };

        input.click();
    },

    // Gerar QR Codes em PDF
    gerarQRCodesPDF() {
        // Validar se há uma turma selecionada
        if (!turmas.turmaAtual) {
            utils.mostrarToast('Erro: Nenhuma turma selecionada', 'error');
            return;
        }

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
