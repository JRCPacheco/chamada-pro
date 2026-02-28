// ===== CHAMADAS MODULE =====
// Gerenciamento de chamadas e histórico
// Migrado para IndexedDB

const chamadas = {

    chamadaResumo: null,
    relatorioMensalAtual: null,
    relatorioMensalInicializado: false,
    resumoMensalVisivel: false,
    tabelaMensalVisivel: false,
    alunosCache: {}, // Cache temporário de alunos para visualização
    historicoSelecaoAtiva: false,
    chamadasSelecionadas: new Set(),

    _parseAnoMes(valor) {
        const match = String(valor || '').trim().match(/^(\d{4})-(\d{2})$/);
        if (!match) return null;

        const ano = Number(match[1]);
        const mes = Number(match[2]);

        if (!Number.isInteger(ano) || !Number.isInteger(mes) || ano < 2000 || ano > 2100 || mes < 1 || mes > 12) {
            return null;
        }

        return { ano, mes, valorNormalizado: `${match[1]}-${match[2]}` };
    },

    atualizarControlesSelecaoHistorico(totalChamadas = 0) {
        const btnSelecionar = document.getElementById('btn-historico-selecionar');
        const btnSelecionarTodas = document.getElementById('btn-historico-selecionar-todas');
        const btnExcluirSelecionadas = document.getElementById('btn-historico-excluir-selecionadas');
        const btnCancelarSelecao = document.getElementById('btn-historico-cancelar-selecao');

        if (!btnSelecionar || !btnSelecionarTodas || !btnExcluirSelecionadas || !btnCancelarSelecao) {
            return;
        }

        if (!this.historicoSelecaoAtiva) {
            btnSelecionar.style.display = '';
            btnSelecionarTodas.style.display = 'none';
            btnExcluirSelecionadas.style.display = 'none';
            btnCancelarSelecao.style.display = 'none';
            return;
        }

        btnSelecionar.style.display = 'none';
        btnSelecionarTodas.style.display = '';
        btnExcluirSelecionadas.style.display = '';
        btnCancelarSelecao.style.display = '';

        const selecionadasCount = this.chamadasSelecionadas.size;
        const todasSelecionadas = totalChamadas > 0 && selecionadasCount === totalChamadas;

        btnSelecionarTodas.textContent = todasSelecionadas ? 'Desmarcar Todas' : 'Selecionar Todas';
        btnExcluirSelecionadas.textContent = selecionadasCount > 0
            ? `Excluir Selecionadas (${selecionadasCount})`
            : 'Excluir Selecionadas';
        btnExcluirSelecionadas.disabled = selecionadasCount === 0;
    },

    alternarModoSelecaoHistorico() {
        this.historicoSelecaoAtiva = !this.historicoSelecaoAtiva;
        if (!this.historicoSelecaoAtiva) {
            this.chamadasSelecionadas.clear();
        }
        this.listarHistorico();
    },

    cancelarModoSelecaoHistorico() {
        this.historicoSelecaoAtiva = false;
        this.chamadasSelecionadas.clear();
        this.listarHistorico();
    },

    alternarSelecionarTodasHistorico() {
        const checkboxes = Array.from(document.querySelectorAll('.historico-select-checkbox'));
        if (!checkboxes.length) return;

        const todasMarcadas = checkboxes.every(cb => cb.checked);
        this.chamadasSelecionadas.clear();

        checkboxes.forEach(cb => {
            cb.checked = !todasMarcadas;
            if (!todasMarcadas) {
                this.chamadasSelecionadas.add(cb.dataset.chamadaId);
            }
        });

        this.atualizarControlesSelecaoHistorico(checkboxes.length);
    },

    async excluirChamadasSelecionadas() {
        const ids = Array.from(this.chamadasSelecionadas);
        if (ids.length === 0) {
            utils.mostrarToast('Selecione ao menos uma chamada', 'warning');
            return;
        }

        const confirmacaoInicial = utils.confirmar(
            `Você selecionou ${ids.length} chamada(s). Deseja continuar com a exclusão?`
        );
        if (!confirmacaoInicial) return;

        const confirmacaoFinal = utils.confirmar(
            `Confirma a exclusão PERMANENTE de ${ids.length} chamada(s)?`
        );
        if (!confirmacaoFinal) return;

        try {
            await Promise.all(ids.map(id => db.delete('chamadas', id)));
            this.chamadasSelecionadas.clear();
            this.historicoSelecaoAtiva = false;
            utils.mostrarToast(`${ids.length} chamada(s) excluída(s)`, 'success');
            await this.atualizarUIPosExclusao();
        } catch (error) {
            console.error(error);
            utils.mostrarToast('Erro ao excluir chamadas selecionadas', 'error');
        }
    },

    async atualizarUIPosExclusao() {
        if (!turmas.turmaAtual?.id) {
            await this.listarHistorico();
            return;
        }

        const chamadasDaTurma = await db.getByIndex('chamadas', 'turmaId', turmas.turmaAtual.id);
        const totalEl = document.getElementById('turma-total-chamadas-realizadas');
        if (totalEl) totalEl.textContent = chamadasDaTurma.length;

        if (typeof turmas.atualizarStats === 'function') {
            await turmas.atualizarStats();
        }

        await this.listarHistorico();
    },

    // Listar histórico de chamadas
    async listarHistorico() {
        if (!turmas.turmaAtual) return;

        try {
            this.inicializarRelatorioMensalUI();
            const container = document.getElementById('lista-historico');
            const emptyState = document.getElementById('empty-historico');

            // Buscar dados
            let chamadasArray = await db.getByIndex('chamadas', 'turmaId', turmas.turmaAtual.id);
            // Ordenar por início da sessão (decrescente), fallback para data legacy
            const toMs = (chamada) => {
                const ref = chamada.iniciadoEm || chamada.criadoEm || chamada.data;
                const ms = new Date(ref).getTime();
                return Number.isFinite(ms) ? ms : 0;
            };
            chamadasArray.sort((a, b) => toMs(b) - toMs(a));

            // Buscar total de alunos da turma para cálculo de %
            const alunosTurma = await db.getByIndex('alunos', 'turmaId', turmas.turmaAtual.id);
            const totalAlunos = alunosTurma.length;

            if (chamadasArray.length === 0) {
                this.chamadasSelecionadas.clear();
                this.historicoSelecaoAtiva = false;
                container.innerHTML = '';
                emptyState.style.display = 'block';
            } else {
                emptyState.style.display = 'none';
                this.renderizarHistorico(chamadasArray, totalAlunos);
            }

            this.atualizarControlesSelecaoHistorico(chamadasArray.length);

            await this.atualizarRelatorioMensal();
        } catch (error) {
            console.error("Erro ao listar histórico:", error);
            utils.mostrarToast("Erro ao carregar histórico", "error");
        }
    },

    // Renderizar histórico
    renderizarHistorico(chamadasArray, totalAlunos) {
        const container = document.getElementById('lista-historico');
        const selecaoAtiva = this.historicoSelecaoAtiva;

        container.innerHTML = chamadasArray.map(chamada => {
            // Contar presentes (P)
            // Suporte híbrido: 'registros' (novo) vs 'presencas' (legacy array)
            let presentes = 0;

            if (chamada.registros) {
                presentes = Object.values(chamada.registros).filter(r => r.status === 'P').length;
            } else if (Array.isArray(chamada.presencas)) {
                presentes = chamada.presencas.filter(p => p.status === 'P').length;
            }

            const percentual = utils.calcularPercentual(presentes, totalAlunos);
            const dataExibicao = chamada.data; // Já é YYYY-MM-DD ou ISO
            const horaRef = chamada.iniciadoEm || chamada.criadoEm || '';
            const horaExibicao = horaRef ? utils.formatarHora(new Date(horaRef)) : '--:--';
            const marcada = this.chamadasSelecionadas.has(chamada.id);

            return `
                <div class="historico-card ${selecaoAtiva ? 'historico-card-select-mode' : ''}" data-chamada-id="${chamada.id}">
                    <div class="historico-header">
                        <h4>${utils.formatarData(dataExibicao)} <small>${horaExibicao}</small></h4>
                        <span class="historico-badge">${percentual}%</span>
                    </div>
                    <div class="historico-meta">
                        ${presentes} de ${totalAlunos} presentes
                    </div>
                    <div class="historico-card-actions">
                        ${selecaoAtiva ? `
                        <label class="historico-select-label">
                            <input type="checkbox" class="historico-select-checkbox"
                                data-chamada-id="${chamada.id}" ${marcada ? 'checked' : ''}>
                            Selecionar
                        </label>
                        ` : '<span></span>'}
                        <button class="btn btn-danger btn-sm btn-historico-delete" data-chamada-id="${chamada.id}">
                            Excluir
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Adicionar event listeners
        document.querySelectorAll('.historico-card').forEach(card => {
            card.addEventListener('click', function (event) {
                if (event.target.closest('.btn-historico-delete') || event.target.closest('.historico-select-label')) {
                    return;
                }
                if (chamadas.historicoSelecaoAtiva) {
                    return;
                }
                chamadas.verDetalhes(this.dataset.chamadaId);
            });
        });

        document.querySelectorAll('.btn-historico-delete').forEach(btn => {
            btn.addEventListener('click', async function (event) {
                event.stopPropagation();
                await chamadas.deletarChamada(this.dataset.chamadaId);
            });
        });

        document.querySelectorAll('.historico-select-checkbox').forEach(checkbox => {
            checkbox.addEventListener('click', event => event.stopPropagation());
            checkbox.addEventListener('change', function () {
                const chamadaId = this.dataset.chamadaId;
                if (this.checked) chamadas.chamadasSelecionadas.add(chamadaId);
                else chamadas.chamadasSelecionadas.delete(chamadaId);
                chamadas.atualizarControlesSelecaoHistorico(chamadasArray.length);
            });
        });

        this.atualizarControlesSelecaoHistorico(chamadasArray.length);
    },

    // Ver detalhes de uma chamada
    async verDetalhes(chamadaId) {
        try {
            const chamada = await db.get('chamadas', chamadaId);

            if (chamada) {
                // Precisamos dos alunos para mostrar nomes
                const alunosTurma = await db.getByIndex('alunos', 'turmaId', chamada.turmaId);
                const turma = await db.get('turmas', chamada.turmaId);

                // Mapear alunos para acesso rápido
                this.alunosCache = {};
                alunosTurma.forEach(a => this.alunosCache[a.id] = a);

                this.mostrarResumo(chamada, turma, alunosTurma);
            }
        } catch (error) {
            console.error("Erro ao ver detalhes:", error);
            utils.mostrarToast("Erro ao carregar detalhes", "error");
        }
    },

    // Mostrar resumo da chamada
    mostrarResumo(chamada, turma, todosAlunos) {
        this.chamadaResumo = chamada;

        const totalAlunos = todosAlunos.length;

        let presentes = 0;
        let faltas = 0;

        // Normalizar registros para array processável
        let registrosProcessados = [];

        // Função helper para obter nome
        const getNome = (aluno) => aluno.nome;

        todosAlunos.forEach(aluno => {
            let status = 'F'; // Default para Ausente
            let hora = '-';

            if (chamada.registros) {
                // Modelo Novo
                const reg = chamada.registros[aluno.id];
                if (reg) {
                    status = reg.status || 'P'; // Se existe registro mas sem status, P
                    hora = reg.ts ? utils.formatarHora(new Date(reg.ts)) : '-';
                }
            } else if (Array.isArray(chamada.presencas)) {
                // Legacy
                const presenca = chamada.presencas.find(p => p.matricula === aluno.matricula);
                if (presenca) {
                    status = presenca.status || 'P';
                    hora = presenca.horaFormatada || '-';
                }
            }

            if (status === 'P') presentes++;
            else {
                status = 'F'; // Força 'F' para contagem
                faltas++;
            }

            registrosProcessados.push({
                nome: getNome(aluno),
                status: status,
                horaFormatada: hora
            });
        });

        const percentual = utils.calcularPercentual(presentes, totalAlunos);

        // Atualizar informações
        const horaRef = chamada.iniciadoEm || chamada.criadoEm || '';
        const horaExibicao = horaRef ? utils.formatarHora(new Date(horaRef)) : '--:--';
        document.getElementById('resumo-info').textContent =
            `${turma.nome} - ${utils.formatarData(chamada.data)} ${horaExibicao}`;

        document.getElementById('resumo-presentes').textContent = presentes;
        document.getElementById('resumo-ausentes').textContent = faltas;
        document.getElementById('resumo-percentual').textContent = percentual + '%';

        // Lista de presentes
        const listaPresentes = document.getElementById('resumo-lista-presentes');
        const listaPresentesHtml = registrosProcessados
            .filter(r => r.status === 'P')
            .sort((a, b) => a.nome.localeCompare(b.nome))
            .map(r => `
                <div class="resumo-lista-item">
                    <span class="icon-inline" aria-hidden="true"><svg class="icon-svg icon-16" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span>
                    ${utils.escapeHtml(r.nome)} <small>(${r.horaFormatada})</small>
                </div>
            `).join('');

        listaPresentes.innerHTML = listaPresentesHtml || '<p class="text-muted">Nenhum aluno presente</p>';

        // Lista de ausentes (faltas não justificadas)
        const listaAusentes = document.getElementById('resumo-lista-ausentes');
        const listaAusentesHtml = registrosProcessados
            .filter(r => r.status === 'F')
            .sort((a, b) => a.nome.localeCompare(b.nome))
            .map(r => `
                <div class="resumo-lista-item">
                    <span class="icon-inline" aria-hidden="true"><svg class="icon-svg icon-16" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></span>
                    ${utils.escapeHtml(r.nome)}
                </div>
            `).join('');

        listaAusentes.innerHTML = listaAusentesHtml || '<p class="text-muted">Nenhum aluno ausente</p>';

        // Mostrar tela de resumo
        app.mostrarTela('tela-resumo');
    },

    // Exportar chamada como CSV
    async exportarCSV() {
        if (!this.chamadaResumo) return;

        try {
            const chamada = this.chamadaResumo;
            const turma = await db.get('turmas', chamada.turmaId);
            const todosAlunos = await db.getByIndex('alunos', 'turmaId', chamada.turmaId);
            const slotNumero = (chamada.slot === 2) ? 2 : 1;
            const slotLabel = slotNumero === 2 ? '2º horário' : '1º horário';
            const horaInicioChamada = (chamada.iniciadoEm || chamada.criadoEm)
                ? utils.formatarHora(new Date(chamada.iniciadoEm || chamada.criadoEm))
                : '-';

            const dados = todosAlunos.map(aluno => {
                let status = 'Falta';
                let hora = '-';

                if (chamada.registros) {
                    const reg = chamada.registros[aluno.id];
                    if (reg) {
                        const s = reg.status || 'P';
                        if (s === 'P') { status = 'Presente'; hora = reg.ts ? utils.formatarHora(new Date(reg.ts)) : '-'; }
                    }
                } else if (Array.isArray(chamada.presencas)) {
                    const presenca = chamada.presencas.find(p => p.matricula === aluno.matricula);
                    if (presenca) {
                        const s = presenca.status || 'P';
                        if (s === 'P') { status = 'Presente'; hora = presenca.horaFormatada || '-'; }
                    }
                }

                return {
                    matricula: aluno.matricula,
                    nome: aluno.nome,
                    horarioChamada: slotLabel,
                    inicioChamada: horaInicioChamada,
                    status: status,
                    hora: hora
                };
            });

            const colunas = [
                { field: 'matricula', label: 'Matrícula' },
                { field: 'nome', label: 'Nome' },
                { field: 'horarioChamada', label: 'Horário da Chamada' },
                { field: 'inicioChamada', label: 'Início da Chamada' },
                { field: 'status', label: 'Status' },
                { field: 'hora', label: 'Horário' }
            ];

            const csv = utils.gerarCSV(dados, colunas);
            const filename = `chamada_${turma.nome}_${utils.formatarData(chamada.data)}.csv`
                .replace(/[^a-z0-9.-]/gi, '_');

            utils.downloadFile(filename, csv, 'text/csv;charset=utf-8;');
            utils.mostrarToast('CSV exportado com sucesso!', 'success');
        } catch (error) {
            console.error(error);
            utils.mostrarToast("Erro ao exportar CSV", "error");
        }
    },

    // Compartilhar chamada
    async compartilhar() {
        if (!this.chamadaResumo) return;

        try {
            const chamada = this.chamadaResumo;
            const turma = await db.get('turmas', chamada.turmaId);
            const todosAlunos = await db.getByIndex('alunos', 'turmaId', chamada.turmaId);

            const totalAlunos = todosAlunos.length;
            let presentes = 0;
            let faltas = 0;

            const listaPresentes = [];
            const listaAusentes = [];

            // Helper
            const getNome = (a) => a.nome;

            todosAlunos.forEach(aluno => {
                let status = 'F';

                if (chamada.registros) {
                    const reg = chamada.registros[aluno.id];
                    if (reg) status = reg.status || 'P';
                } else if (Array.isArray(chamada.presencas)) {
                    const presenca = chamada.presencas.find(p => p.matricula === aluno.matricula);
                    if (presenca) status = presenca.status || 'P';
                }

                if (status === 'P') {
                    presentes++;
                    listaPresentes.push(getNome(aluno));
                } else {
                    faltas++;
                    listaAusentes.push(getNome(aluno));
                }
            });

            const percentual = utils.calcularPercentual(presentes, totalAlunos);

            let texto = `Chamada - ${turma.nome}\n`;
            texto += `Data: ${utils.formatarData(chamada.data)}\n\n`;
            texto += `Presentes: ${presentes} de ${totalAlunos} (${percentual}%)\n`;
            if (faltas > 0) texto += `Faltas: ${faltas}\n`;
            texto += '\n';

            const sortNome = (a, b) => a.localeCompare(b);

            if (listaPresentes.length > 0) {
                texto += '--- PRESENTES ---\n';
                listaPresentes.sort(sortNome).forEach(nome => texto += `- ${nome}\n`);
            }

            if (listaAusentes.length > 0) {
                texto += '\n--- AUSENTES ---\n';
                listaAusentes.sort(sortNome).forEach(nome => texto += `- ${nome}\n`);
            }

            const compartilhado = await utils.compartilhar({
                title: `Chamada - ${turma.nome}`,
                text: texto
            });

            if (compartilhado) {
                utils.mostrarToast('Chamada compartilhada!', 'success');
            }
        } catch (error) {
            console.error(error);
            utils.mostrarToast("Erro ao compartilhar", "error");
        }
    },

    // Exportar histórico completo
    async exportarHistorico() {
        if (!turmas.turmaAtual) return;

        try {
            const turma = await db.get('turmas', turmas.turmaAtual.id);
            const chamadasArray = await db.getByIndex('chamadas', 'turmaId', turma.id);
            const todosAlunos = await db.getByIndex('alunos', 'turmaId', turma.id);

            if (chamadasArray.length === 0) {
                utils.mostrarToast('Nenhuma chamada para exportar', 'warning');
                return;
            }

            const dados = [];

            chamadasArray.forEach(chamada => {
                const dataStr = utils.formatarData(chamada.data);
                let diaSemana = '-';
                try {
                    diaSemana = new Date(chamada.data).toLocaleDateString('pt-BR', { weekday: 'short' });
                } catch (e) { }

                todosAlunos.forEach(aluno => {
                    let status = 'Falta';
                    let horaPresenca = '-';
                    const slotNumero = (chamada.slot === 2) ? 2 : 1;
                    const slotLabel = slotNumero === 2 ? '2º horário' : '1º horário';
                    const horaInicioChamada = (chamada.iniciadoEm || chamada.criadoEm)
                        ? utils.formatarHora(new Date(chamada.iniciadoEm || chamada.criadoEm))
                        : '-';

                    if (chamada.registros) {
                        const reg = chamada.registros[aluno.id];
                        if (reg) {
                            const s = reg.status || 'P';
                            if (s === 'P') { status = 'Presente'; horaPresenca = reg.ts ? utils.formatarHora(new Date(reg.ts)) : '-'; }
                        }
                    } else if (Array.isArray(chamada.presencas)) {
                        const presenca = chamada.presencas.find(p => p.matricula === aluno.matricula);
                        if (presenca) {
                            const s = presenca.status || 'P';
                            if (s === 'P') { status = 'Presente'; horaPresenca = presenca.horaFormatada || '-'; }
                        }
                    }

                    dados.push({
                        data: dataStr,
                        diaSemana: diaSemana,
                        horarioChamada: slotLabel,
                        inicioChamada: horaInicioChamada,
                        matricula: aluno.matricula,
                        nome: aluno.nome,
                        status: status,
                        horaPresenca: horaPresenca
                    });
                });
            });

            const colunas = [
                { field: 'data', label: 'Data' },
                { field: 'diaSemana', label: 'Dia' },
                { field: 'horarioChamada', label: 'Horário da Chamada' },
                { field: 'inicioChamada', label: 'Início da Chamada' },
                { field: 'matricula', label: 'Matrícula' },
                { field: 'nome', label: 'Nome' },
                { field: 'status', label: 'Status' },
                { field: 'horaPresenca', label: 'Hora Presença' }
            ];

            const csv = utils.gerarCSV(dados, colunas);
            const filename = `historico_${turma.nome}_completo.csv`
                .replace(/[^a-z0-9.-]/gi, '_');

            utils.downloadFile(filename, csv, 'text/csv;charset=utf-8;');
            utils.mostrarToast('Histórico exportado com sucesso!', 'success');
        } catch (error) {
            console.error(error);
            utils.mostrarToast("Erro ao exportar histórico", "error");
        }
    },

    inicializarRelatorioMensalUI() {
        if (this.relatorioMensalInicializado) return;

        const inputMes = document.getElementById('relatorio-mensal-mes');
        if (!inputMes) return;

        const detector = document.createElement('input');
        detector.setAttribute('type', 'month');
        const suporteMonth = detector.type === 'month';
        if (!suporteMonth) {
            inputMes.type = 'text';
            inputMes.inputMode = 'numeric';
            inputMes.pattern = '\\d{4}-\\d{2}';
            inputMes.placeholder = 'AAAA-MM';
            inputMes.setAttribute('aria-label', 'Mês no formato AAAA-MM');
        }

        const agora = new Date();
        const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
        inputMes.value = inputMes.value || mesAtual;
        this._atualizarRotuloMesSelecionado();

        inputMes.addEventListener('change', async () => {
            const parsed = this._parseAnoMes(inputMes.value);
            if (!parsed) {
                utils.mostrarToast('Informe o mês no formato AAAA-MM', 'warning');
                return;
            }
            inputMes.value = parsed.valorNormalizado;
            this._atualizarRotuloMesSelecionado();
            await this.atualizarRelatorioMensal();
            await this.atualizarPreviewPontos();
        });

        this._atualizarControlesVisibilidadeDiario();
        this.relatorioMensalInicializado = true;
    },

    _atualizarRotuloMesSelecionado() {
        const inputMes = document.getElementById('relatorio-mensal-mes');
        const btnMes = document.getElementById('relatorio-mensal-mes-btn');
        if (!inputMes || !btnMes) return;

        const parsed = this._parseAnoMes(inputMes.value);
        if (!parsed) {
            btnMes.textContent = 'Selecionar mes';
            return;
        }

        const data = new Date(parsed.ano, parsed.mes - 1, 1);
        const mesNome = data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        const mesLabel = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);
        btnMes.textContent = `${mesLabel}/${parsed.ano}`;
    },

    async abrirSeletorMes() {
        this.inicializarRelatorioMensalUI();
        const inputMes = document.getElementById('relatorio-mensal-mes');
        const selectAno = document.getElementById('seletor-mes-ano');
        const selectMes = document.getElementById('seletor-mes-mes');
        if (!inputMes || !selectAno || !selectMes) return;

        const agora = new Date();
        const fallback = {
            ano: agora.getFullYear(),
            mes: agora.getMonth() + 1
        };
        const parsed = this._parseAnoMes(inputMes.value) || fallback;

        const anosDisponiveis = new Set([agora.getFullYear(), parsed.ano]);
        if (turmas.turmaAtual?.id) {
            const chamadasTurma = await db.getByIndex('chamadas', 'turmaId', turmas.turmaAtual.id);
            chamadasTurma.forEach((chamada) => {
                const ref = chamada.data || chamada.iniciadoEm || chamada.criadoEm;
                const ano = Number(String(ref || '').slice(0, 4));
                if (Number.isInteger(ano) && ano >= 2000 && ano <= 2100) {
                    anosDisponiveis.add(ano);
                }
            });
        }

        const anosOrdenados = Array.from(anosDisponiveis).sort((a, b) => b - a);
        selectAno.innerHTML = anosOrdenados.map((ano) => `<option value="${ano}">${ano}</option>`).join('');
        selectAno.value = String(parsed.ano);
        selectMes.value = String(parsed.mes).padStart(2, '0');
        app.abrirModal('modal-seletor-mes');
    },

    async aplicarMesSeletor() {
        const inputMes = document.getElementById('relatorio-mensal-mes');
        const selectAno = document.getElementById('seletor-mes-ano');
        const selectMes = document.getElementById('seletor-mes-mes');
        if (!inputMes || !selectAno || !selectMes) return;

        const ano = Number(selectAno.value);
        const mes = Number(selectMes.value);
        if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
            utils.mostrarToast('Selecao de mes invalida', 'warning');
            return;
        }

        inputMes.value = `${ano}-${String(mes).padStart(2, '0')}`;
        app.fecharModal('modal-seletor-mes');
        this._atualizarRotuloMesSelecionado();
        await this.atualizarRelatorioMensal();
        await this.atualizarPreviewPontos();
    },

    _atualizarControlesVisibilidadeDiario() {
        const resumo = document.getElementById('diario-resumo-cards');
        const tabela = document.getElementById('relatorio-mensal-tabela-wrap');
        const btnResumo = document.getElementById('btn-ver-resumo');
        const btnTabela = document.getElementById('btn-ver-tabela');

        if (resumo) resumo.hidden = !this.resumoMensalVisivel;
        if (tabela) tabela.style.display = this.tabelaMensalVisivel ? 'block' : 'none';
        if (btnResumo) btnResumo.textContent = this.resumoMensalVisivel ? 'Ocultar resumo de frequencia' : 'Ver resumo de frequencia';
        if (btnTabela) btnTabela.textContent = this.tabelaMensalVisivel ? 'Ocultar tabela' : 'Ver tabela completa';
    },

    toggleResumoMensal() {
        this.resumoMensalVisivel = !this.resumoMensalVisivel;
        this._atualizarControlesVisibilidadeDiario();
    },

    async abrirModalRelatorios() {
        if (!turmas.turmaAtual) {
            utils.mostrarToast('Nenhuma turma selecionada', 'warning');
            return;
        }

        app.abrirModal('modal-relatorios');
        // Garante que o relatório está carregado (caso o usuário não tenha visitado o Diário de Classe ainda)
        this.inicializarRelatorioMensalUI();
        if (!this.relatorioMensalAtual) {
            await this.atualizarRelatorioMensal();
        }
        await this.atualizarPreviewPontos();
    },

    async atualizarPreviewPontos() {
        if (!turmas.turmaAtual) return;

        const inputMes = document.getElementById('relatorio-mensal-mes');
        const preview = document.getElementById('relatorio-pontos-preview');
        if (!inputMes || !preview) return;

        const parsed = this._parseAnoMes(inputMes.value);
        if (!parsed) return;
        const { ano, mes } = parsed;

        try {
            const alunos = await db.getByIndex('alunos', 'turmaId', turmas.turmaAtual.id);
            const mesPad = String(mes).padStart(2, '0');
            const prefixo = `${ano}-${mesPad}`;

            let totalEventos = 0;
            const resumo = [];

            for (const aluno of alunos) {
                const eventos = await db.getByIndex('eventos_nota', 'alunoId', aluno.id);
                const eventosMes = eventos.filter(e => (e.dataISO || '').startsWith(prefixo));
                const total = eventosMes.reduce((s, e) => s + (Number(e.valor) || 0), 0);
                if (total > 0) {
                    resumo.push({ nome: aluno.nome, total });
                    totalEventos += total;
                }
            }

            if (resumo.length === 0) {
                preview.innerHTML = '<span>Nenhum ponto registrado para este mês.</span>';
            } else {
                resumo.sort((a, b) => b.total - a.total);
                preview.innerHTML = `<strong>${resumo.length} aluno(s) com pontos | Total: ${totalEventos} pts</strong><br><small>${resumo.slice(0, 5).map(r => `${r.nome}: ${r.total}pts`).join(' • ')}${resumo.length > 5 ? ' ...' : ''}</small>`;
            }
        } catch (e) {
            console.error('Erro ao atualizar preview de pontos:', e);
        }
    },

    async gerarRelatorioPontosPDF() {
        if (!turmas.turmaAtual) {
            utils.mostrarToast('Nenhuma turma selecionada', 'warning');
            return;
        }

        const inputMes = document.getElementById('relatorio-mensal-mes');
        if (!inputMes || !inputMes.value) {
            utils.mostrarToast('Selecione um mês', 'warning');
            return;
        }

        const parsed = this._parseAnoMes(inputMes.value);
        if (!parsed) {
            utils.mostrarToast('Mês inválido', 'warning');
            return;
        }
        const { ano, mes, valorNormalizado } = parsed;
        inputMes.value = valorNormalizado;

        try {
            utils.mostrarToast('Gerando PDF de pontos...', 'info');

            const cfg = await app._getAppConfig();
            const professorNome = String(cfg?.professor_nome || '').trim();
            const mesPad = String(mes).padStart(2, '0');
            const prefixo = `${ano}-${mesPad}`;
            const nomeMes = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

            const turma = turmas.turmaAtual;
            const alunos = await db.getByIndex('alunos', 'turmaId', turma.id);
            alunos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

            // Montar dados por aluno
            const linhasAlunos = [];
            for (const aluno of alunos) {
                const eventos = await db.getByIndex('eventos_nota', 'alunoId', aluno.id);
                const eventosMes = eventos.filter(e => (e.dataISO || '').startsWith(prefixo));
                eventosMes.sort((a, b) => (a.dataISO || '').localeCompare(b.dataISO || ''));
                const total = eventosMes.reduce((s, e) => s + (Number(e.valor) || 0), 0);
                linhasAlunos.push({ aluno, eventos: eventosMes, total });
            }

            // Logo (escola ou padrão)
            const logoData = await utils.carregarLogoParaPDF(turma);

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            let y = 10;

            // Cabeçalho
            if (logoData) {
                doc.addImage(logoData, 'PNG', 10, y, 14, 14);
                doc.setFontSize(14);
                doc.setFont(undefined, 'bold');
                doc.text('Chamada Fácil', 26, y + 9);
            }

            doc.setFontSize(13);
            doc.setFont(undefined, 'bold');
            doc.text(`Pontos Extras • ${turma.nome}`, pageW - 10, y + 5, { align: 'right' });
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`Mês: ${nomeMes}`, pageW - 10, y + 11, { align: 'right' });
            y += 20;

            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.3);
            doc.line(10, y, pageW - 10, y);
            y += 6;

            // Tabela
            const colNome = 80;
            const colMat = 35;
            const colDesc = 55;
            const colData = 22;
            const colPts = 18;
            const tableX = 10;
            const rowH = 7;

            const drawHeader = () => {
                doc.setFillColor(243, 244, 246);
                doc.rect(tableX, y, pageW - 20, rowH, 'F');
                doc.setFontSize(9);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(55, 65, 81);
                doc.text('Aluno', tableX + 2, y + 5);
                doc.text('Matrícula', tableX + colNome + 2, y + 5);
                doc.text('Descrição', tableX + colNome + colMat + 2, y + 5);
                doc.text('Data', tableX + colNome + colMat + colDesc + 2, y + 5);
                doc.text('Pts', tableX + colNome + colMat + colDesc + colData + 2, y + 5);
                doc.setTextColor(0, 0, 0);
                y += rowH;
            };

            drawHeader();

            doc.setFont(undefined, 'normal');
            doc.setFontSize(8.5);

            for (const { aluno, eventos, total } of linhasAlunos) {
                if (eventos.length === 0) continue;

                const needed = eventos.length * rowH + rowH + 4;
                if (y + needed > pageH - 20) {
                    doc.addPage();
                    y = 14;
                    drawHeader();
                }

                // Bloco do aluno
                const blocoY = y;
                eventos.forEach((ev, idx) => {
                    const dataFmt = (ev.dataISO || '').split('-').reverse().join('/');
                    const valor = Number(ev.valor) || 0;
                    const isLast = idx === eventos.length - 1;

                    if (idx === 0) {
                        doc.setFont(undefined, 'bold');
                        doc.text(utils.escapeHtml(aluno.nome).slice(0, 30), tableX + 2, y + 5);
                        doc.text(utils.escapeHtml(aluno.matricula), tableX + colNome + 2, y + 5);
                        doc.setFont(undefined, 'normal');
                    }
                    doc.text((ev.descricao || '').slice(0, 24), tableX + colNome + colMat + 2, y + 5);
                    doc.text(dataFmt, tableX + colNome + colMat + colDesc + 2, y + 5);
                    doc.text(String(valor), tableX + colNome + colMat + colDesc + colData + 2, y + 5);

                    doc.setDrawColor(220, 220, 220);
                    doc.setLineWidth(0.2);
                    doc.line(tableX, y + rowH, pageW - 10, y + rowH);
                    y += rowH;
                });

                // Linha de total do aluno
                doc.setFillColor(255, 249, 230);
                doc.rect(tableX, y, pageW - 20, rowH, 'F');
                doc.setFont(undefined, 'bold');
                doc.setFontSize(8.5);
                doc.text(`Total: ${aluno.nome.split(' ')[0]}`, tableX + 2, y + 5);
                doc.text(`${total} pts`, tableX + colNome + colMat + colDesc + colData + 2, y + 5);
                doc.setFont(undefined, 'normal');
                y += rowH + 2;
            }

            // Assinatura
            if (professorNome) {
                y = Math.max(y + 10, pageH - 24);
                doc.setFontSize(9);
                doc.setTextColor(55, 65, 81);
                doc.text('Assinatura do Professor(a)', pageW - 74, y);
                doc.setDrawColor(107, 114, 128);
                doc.setLineWidth(0.35);
                doc.line(pageW - 74, y + 8, pageW - 12, y + 8);
                doc.setFontSize(8.5);
                doc.text(professorNome, pageW - 74, y + 13);
            }

            const turmaSlug = (turma.nome || 'turma').replace(/[^a-z0-9._-]/gi, '_');
            doc.save(`pontos_extras_${turmaSlug}_${ano}_${mesPad}.pdf`);
            utils.mostrarToast('PDF de pontos gerado!', 'success');
        } catch (e) {
            console.error('Erro ao gerar PDF de pontos:', e);
            utils.mostrarToast('Erro ao gerar PDF de pontos', 'error');
        }
    },

    toggleTabelaMensal() {
        this.tabelaMensalVisivel = !this.tabelaMensalVisivel;
        this._atualizarControlesVisibilidadeDiario();
    },

    renderizarResumoCards(relatorio) {
        const container = document.getElementById('diario-resumo-cards');
        if (!container) return;

        const { alunosOrdenados, matrizHorario1, matrizHorario2, segundoHorarioAtivo, diasDoMes } = relatorio;

        if (!alunosOrdenados || alunosOrdenados.length === 0) {
            container.innerHTML = '<p class="text-muted" style="padding: 12px 0;">Nenhum aluno cadastrado.</p>';
            return;
        }

        const hasChamadas = diasDoMes.some(d =>
            alunosOrdenados.some(a => (matrizHorario1[a.id]?.dias[d] || '') !== '')
        );

        if (!hasChamadas) {
            container.innerHTML = '<p class="text-muted" style="padding: 12px 0;">Nenhuma chamada registrada neste mês.</p>';
            return;
        }

        container.innerHTML = alunosOrdenados.map(aluno => {
            const l1 = matrizHorario1[aluno.id];
            const l2 = segundoHorarioAtivo ? matrizHorario2[aluno.id] : null;
            const p = l1.totalP + (l2 ? l2.totalP : 0);
            const f = l1.totalF + (l2 ? l2.totalF : 0);
            const total = p + f;
            const pct = total > 0 ? Math.round((p / total) * 100) : null;
            const pctClass = pct === null ? '' : pct >= 75 ? 'freq-ok' : 'freq-low';
            const pctText = pct !== null ? `${pct}%` : '—';

            return `
                <div class="diario-resumo-card">
                    <div class="diario-resumo-card-nome" title="${utils.escapeHtml(aluno.nome)}">${utils.escapeHtml(aluno.nome)}</div>
                    <div class="diario-resumo-card-stats">
                        <span class="stat-p">P: ${p}</span>
                        <span class="stat-f">F: ${f}</span>
                        <span class="stat-pct ${pctClass}">${pctText}</span>
                    </div>
                </div>
            `;
        }).join('');
    },

    async atualizarRelatorioMensal() {
        if (!turmas.turmaAtual) return;

        const inputMes = document.getElementById('relatorio-mensal-mes');
        if (!inputMes) return;

        const parsed = this._parseAnoMes(inputMes.value);
        if (!parsed) return;
        const { ano, mes } = parsed;

        try {
            const relatorio = await this.gerarRelatorioMensal(turmas.turmaAtual.id, ano, mes);
            this.relatorioMensalAtual = relatorio;
            this.renderizarResumoCards(relatorio);
            this.renderizarRelatorioMensal(relatorio);
        } catch (error) {
            console.error('Erro ao atualizar relatorio mensal:', error);
            utils.mostrarToast('Erro ao gerar relatorio mensal', 'error');
        }
    },

    async gerarRelatorioMensal(turmaId, ano, mes) {
        const alunos = await db.getByIndex('alunos', 'turmaId', turmaId);
        const chamadasTurma = await db.getByIndex('chamadas', 'turmaId', turmaId);
        const turma = await db.get('turmas', turmaId);
        const segundoHorarioAtivo = !!turma?.segundoHorarioAtivo;

        const mesPad = String(mes).padStart(2, '0');
        const prefixo = `${ano}-${mesPad}`;
        const chamadasMes = chamadasTurma.filter(c => (c.data || '').startsWith(prefixo));

        const diasNoMes = new Date(ano, mes, 0).getDate();
        const diasDoMes = Array.from({ length: diasNoMes }, (_, i) => String(i + 1).padStart(2, '0'));
        const alunosOrdenados = [...alunos].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        const normalizarStatus = (status) => (status === 'P' || !status) ? 'P' : 'F';

        const criarMatriz = () => {
            const matriz = {};
            alunosOrdenados.forEach(aluno => {
                const dias = {};
                diasDoMes.forEach(d => { dias[d] = ''; });
                matriz[aluno.id] = {
                    alunoId: aluno.id,
                    nome: aluno.nome || '',
                    matricula: aluno.matricula || '',
                    dias,
                    totalP: 0,
                    totalF: 0
                };
            });
            return matriz;
        };

        const matrizHorario1 = criarMatriz();
        const matrizHorario2 = criarMatriz();

        const statusAlunoNaSessao = (chamada, aluno) => {
            if (chamada.registros && typeof chamada.registros === 'object') {
                const reg = chamada.registros[aluno.id];
                if (!reg) return 'F';
                return normalizarStatus(reg.status);
            }
            if (Array.isArray(chamada.presencas)) {
                const presenca = chamada.presencas.find(p => p.matricula === aluno.matricula);
                if (!presenca) return 'F';
                return normalizarStatus(presenca.status);
            }
            return 'F';
        };

        const aplicarSessaoNoDia = (matriz, chamada, dia) => {
            alunosOrdenados.forEach(aluno => {
                const linha = matriz[aluno.id];
                if (!linha) return;

                linha.dias[dia] = 'F';
                linha.totalF += 1;
                if (statusAlunoNaSessao(chamada, aluno) === 'P') {
                    linha.dias[dia] = 'P';
                    linha.totalP += 1;
                    linha.totalF -= 1;
                }
            });
        };

        const chamadasPorDia = {};
        chamadasMes.forEach(chamada => {
            const dia = (chamada.data || '').slice(8, 10);
            if (!dia || !diasDoMes.includes(dia)) return;
            if (!chamadasPorDia[dia]) chamadasPorDia[dia] = [];
            chamadasPorDia[dia].push(chamada);
        });

        diasDoMes.forEach(dia => {
            const sessoesDia = (chamadasPorDia[dia] || []).sort((a, b) => {
                const ta = new Date(a.iniciadoEm || a.criadoEm || a.data).getTime();
                const tb = new Date(b.iniciadoEm || b.criadoEm || b.data).getTime();
                return ta - tb;
            });
            if (sessoesDia.length === 0) return;

            const slotsDia = {};
            sessoesDia.forEach(chamada => {
                let slot = (chamada.slot === 1 || chamada.slot === 2) ? chamada.slot : null;
                if (!slot) slot = !slotsDia[1] ? 1 : !slotsDia[2] ? 2 : null;
                if (!slot || slotsDia[slot]) return;
                slotsDia[slot] = chamada;
            });

            if (slotsDia[1]) aplicarSessaoNoDia(matrizHorario1, slotsDia[1], dia);
            if (segundoHorarioAtivo && slotsDia[2]) aplicarSessaoNoDia(matrizHorario2, slotsDia[2], dia);
        });

        return {
            turmaId,
            turmaNome: turmas.turmaAtual?.nome || '',
            ano,
            mes,
            mesPad,
            alunosOrdenados,
            diasDoMes,
            segundoHorarioAtivo,
            matrizHorario1,
            matrizHorario2
        };
    },

    renderizarRelatorioMensal(relatorio) {
        const wrap = document.getElementById('relatorio-mensal-tabela-wrap');
        if (!wrap) return;

        const { alunosOrdenados, diasDoMes, matrizHorario1, matrizHorario2, segundoHorarioAtivo } = relatorio;
        if (!alunosOrdenados || alunosOrdenados.length === 0) {
            wrap.innerHTML = '<p class="text-muted" style="padding: 12px;">Nenhum aluno cadastrado na turma.</p>';
            return;
        }

        const renderTabelaHorario = (titulo, matriz) => {
            const headerDias = diasDoMes.map(d => `<th>${d}</th>`).join('');
            const linhas = alunosOrdenados.map(aluno => {
                const linha = matriz[aluno.id];
                const celulasDias = diasDoMes.map(d => {
                    const status = linha.dias[d] || '';
                    const classe = (status === 'P' || status === 'F') ? `cell-status-${status}` : '';
                    return `<td class="${classe}">${status}</td>`;
                }).join('');

                return `
                    <tr>
                        <td>${utils.escapeHtml(linha.nome || '')}</td>
                        <td class="col-matricula">${utils.escapeHtml(linha.matricula || '')}</td>
                        ${celulasDias}
                        <td>${linha.totalP}</td>
                        <td>${linha.totalF}</td>
                    </tr>
                `;
            }).join('');

            return `
                <div class="relatorio-horario-section">
                    <h4>${titulo}</h4>
                    <table class="table-relatorio-mensal">
                        <thead>
                            <tr>
                                <th>Aluno</th>
                                <th>Matrícula</th>
                                ${headerDias}
                                <th>P</th>
                                <th>F</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${linhas}
                        </tbody>
                    </table>
                </div>
            `;
        };

        let html = renderTabelaHorario('1º Horário', matrizHorario1);
        if (segundoHorarioAtivo) {
            html += renderTabelaHorario('2º Horário', matrizHorario2);
        }
        wrap.innerHTML = html;
    },

    exportarRelatorioMensalCSV(relatorio = this.relatorioMensalAtual) {
        if (!relatorio) {
            utils.mostrarToast('Gere o relatorio mensal primeiro', 'warning');
            return;
        }

        const { alunosOrdenados, diasDoMes, matrizHorario1, matrizHorario2, segundoHorarioAtivo, ano, mesPad, turmaNome } = relatorio;
        const esc = (v) => {
            const s = String(v ?? '');
            return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const montarBloco = (titulo, matriz) => {
            const header = ['Aluno', 'Matricula', ...diasDoMes, 'Total P', 'Total F'];
            const linhas = [titulo, header.map(esc).join(';')];
            alunosOrdenados.forEach(aluno => {
                const linha = matriz[aluno.id];
                const row = [
                    linha.nome || '',
                    linha.matricula || '',
                    ...diasDoMes.map(d => linha.dias[d] || ''),
                    linha.totalP,
                    linha.totalF
                ];
                linhas.push(row.map(esc).join(';'));
            });
            return linhas;
        };

        const linhas = [
            ...montarBloco('1º Horário', matrizHorario1),
            ''
        ];
        if (segundoHorarioAtivo) {
            linhas.push(...montarBloco('2º Horário', matrizHorario2), '');
        }

        const csv = linhas.join('\r\n');
        const turmaSlug = (turmaNome || 'turma').replace(/[^a-z0-9._-]/gi, '_');
        const filename = `relatorio_mensal_${turmaSlug}_${ano}_${mesPad}.csv`;
        utils.downloadFile(filename, csv, 'text/csv;charset=utf-8;');
        utils.mostrarToast('Relatorio mensal CSV exportado', 'success');
    },

    async exportarRelatorioMensalPDF(relatorio = this.relatorioMensalAtual) {
        if (!relatorio) {
            utils.mostrarToast('Gere o relatorio mensal primeiro', 'warning');
            return;
        }

        try {
            const cfg = await app._getAppConfig();
            const professorNome = String(cfg?.professor_nome || '').trim();

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const drawW = pageW - 20;
            const headerTopY = 8;
            const imageTopY = 17;
            const assinaturaAreaTopY = pageH - 32;
            const assinaturaTopY = pageH - 20;
            const assinaturaLineY = pageH - 10;
            const assinaturaNomeY = pageH - 5;
            const assinaturaLineX1 = pageW - 74;
            const assinaturaLineX2 = pageW - 12;
            const usableH = assinaturaAreaTopY - imageTopY;
            const tabelaHeaderPx = 30;
            const tabelaRowPx = 26;

            const desenharAssinatura = () => {
                doc.setDrawColor(107, 114, 128);
                doc.setLineWidth(0.35);
                doc.line(assinaturaLineX1, assinaturaLineY, assinaturaLineX2, assinaturaLineY);

                if (professorNome) {
                    doc.setFontSize(9);
                    doc.text(professorNome, assinaturaLineX1, assinaturaNomeY);
                }
            };

            // Logo (escola ou padrão)
            const turmaParaLogo = turmas.turmaAtual || { escolaId: relatorio.turmaId };
            const logoDataMensal = await utils.carregarLogoParaPDF(turmaParaLogo);
            const escolaDaTurma = turmaParaLogo?.escolaId ? await db.get('escolas', turmaParaLogo.escolaId) : null;
            const usaLogoEscola = !!(escolaDaTurma && escolaDaTurma.foto);
            const nomeEscolaHeader = String(escolaDaTurma?.nome || '').trim();

            const horarios = [{ slot: 1, titulo: '1º Horário' }];
            if (relatorio.segundoHorarioAtivo) {
                horarios.push({ slot: 2, titulo: '2º Horário' });
            }

            let primeiraPagina = true;
            horarios.forEach(({ slot, titulo }) => {
                const canvas = this.gerarCanvasRelatorioMensal(relatorio, slot);
                const title = `Relatorio Mensal - ${relatorio.turmaNome} - ${relatorio.mesPad}/${relatorio.ano} - ${titulo}`;
                const ratio = drawW / canvas.width;
                const maxSlicePx = Math.max(1, Math.floor(usableH / ratio));

                let offsetY = 0;
                let page = 0;
                while (offsetY < canvas.height) {
                    if (!primeiraPagina) {
                        doc.addPage('a4', 'landscape');
                    }
                    // Logo no cabeçalho de cada página
                    if (logoDataMensal) {
                        doc.addImage(logoDataMensal, 'PNG', 10, 4, 10, 10);
                    }
                    if (logoDataMensal) {
                        doc.setFontSize(12);
                        doc.setFont(undefined, 'bold');
                        if (usaLogoEscola && nomeEscolaHeader) {
                            let nomeExibicao = nomeEscolaHeader;
                            const maxHeaderW = 92;
                            while (doc.getTextWidth(nomeExibicao) > maxHeaderW && nomeExibicao.length > 10) {
                                nomeExibicao = `${nomeExibicao.slice(0, -2)}...`;
                            }
                            doc.setTextColor(33, 47, 82);
                            doc.text(nomeExibicao, 22, 10.1);
                        } else {
                            doc.setTextColor(33, 47, 82);
                            doc.text('Chamada', 22, 10.1);
                            doc.setTextColor(106, 191, 87);
                            doc.text('Fácil', 42.5, 10.1);
                        }
                    }

                    doc.setFontSize(12);
                    doc.setFont(undefined, 'normal');
                    doc.setTextColor(17, 24, 39);
                    doc.text(page > 0 ? `${title} (cont.)` : title, pageW - 12, headerTopY, { align: 'right' });

                    const remainingPx = canvas.height - offsetY;
                    let sliceH = remainingPx;
                    if (remainingPx > maxSlicePx) {
                        if (offsetY === 0) {
                            const rowsFit = Math.max(1, Math.floor((maxSlicePx - tabelaHeaderPx) / tabelaRowPx));
                            sliceH = tabelaHeaderPx + (rowsFit * tabelaRowPx);
                        } else {
                            const rowsFit = Math.max(1, Math.floor(maxSlicePx / tabelaRowPx));
                            sliceH = rowsFit * tabelaRowPx;
                        }
                        if (sliceH > remainingPx) {
                            sliceH = remainingPx;
                        }
                    }

                    const sliceCanvas = document.createElement('canvas');
                    sliceCanvas.width = canvas.width;
                    sliceCanvas.height = sliceH;
                    const sctx = sliceCanvas.getContext('2d');
                    sctx.drawImage(canvas, 0, offsetY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

                    const drawH = sliceH * ratio;
                    doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 10, imageTopY, drawW, drawH);
                    desenharAssinatura();

                    offsetY += sliceH;
                    page += 1;
                    primeiraPagina = false;
                }
            });

            const turmaSlug = (relatorio.turmaNome || 'turma').replace(/[^a-z0-9._-]/gi, '_');
            const filename = `relatorio_mensal_${turmaSlug}_${relatorio.ano}_${relatorio.mesPad}.pdf`;
            doc.save(filename);
            utils.mostrarToast('Relatorio mensal PDF exportado', 'success');
        } catch (error) {
            console.error('Erro ao exportar PDF mensal:', error);
            utils.mostrarToast('Erro ao exportar PDF mensal', 'error');
        }
    },

    gerarCanvasRelatorioMensal(relatorio, slot = 1) {
        const { alunosOrdenados, diasDoMes } = relatorio;
        const matrizRelatorio = slot === 2 ? relatorio.matrizHorario2 : relatorio.matrizHorario1;

        const rowH = 26;
        const headerH = 30;
        const colAluno = 220;
        const colMatricula = 120;
        const colDia = 26;
        const colTotal = 64;

        const colsDiasW = diasDoMes.length * colDia;
        const width = colAluno + colMatricula + colsDiasW + (colTotal * 2);
        const height = headerH + (alunosOrdenados.length * rowH);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        const drawCell = (x, y, w, h, text, bg = null) => {
            if (bg) {
                ctx.fillStyle = bg;
                ctx.fillRect(x, y, w, h);
            }
            ctx.strokeStyle = '#d0d7de';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#111827';
            ctx.font = '12px Inter, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(text ?? ''), x + w / 2, y + h / 2);
        };

        let x = 0;
        drawCell(x, 0, colAluno, headerH, 'Aluno', '#f3f4f6');
        x += colAluno;
        drawCell(x, 0, colMatricula, headerH, 'Matrícula', '#f3f4f6');
        x += colMatricula;
        diasDoMes.forEach(d => {
            drawCell(x, 0, colDia, headerH, d, '#f3f4f6');
            x += colDia;
        });
        drawCell(x, 0, colTotal, headerH, 'P', '#f3f4f6');
        x += colTotal;
        drawCell(x, 0, colTotal, headerH, 'F', '#f3f4f6');

        alunosOrdenados.forEach((aluno, i) => {
            const y = headerH + (i * rowH);
            const linha = matrizRelatorio[aluno.id];

            ctx.fillStyle = '#111827';
            ctx.font = '12px Inter, Arial, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#d0d7de';
            ctx.strokeRect(0, y, colAluno, rowH);
            ctx.fillText(String(linha.nome || ''), 8, y + rowH / 2);

            ctx.textAlign = 'left';
            ctx.strokeStyle = '#d0d7de';
            ctx.strokeRect(colAluno, y, colMatricula, rowH);
            ctx.fillText(String(linha.matricula || ''), colAluno + 8, y + rowH / 2);

            let xDia = colAluno + colMatricula;
            diasDoMes.forEach(d => {
                const status = linha.dias[d] || '';
                let bg = null;
                if (status === 'P') bg = '#dff5e3';
                if (status === 'F') bg = '#fde2e1';
                drawCell(xDia, y, colDia, rowH, status, bg);
                xDia += colDia;
            });

            drawCell(xDia, y, colTotal, rowH, linha.totalP);
            xDia += colTotal;
            drawCell(xDia, y, colTotal, rowH, linha.totalF);
        });

        return canvas;
    },

    // Deletar chamada
    async deletarChamada(chamadaId) {
        if (!utils.confirmar('Tem certeza que deseja excluir esta chamada?')) {
            return;
        }

        try {
            await db.delete('chamadas', chamadaId);
            utils.mostrarToast('Chamada excluída', 'success');
            await this.atualizarUIPosExclusao();
        } catch (error) {
            console.error(error);
            utils.mostrarToast('Erro ao excluir chamada', 'error');
        }
    }
};
