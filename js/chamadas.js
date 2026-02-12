// ===== CHAMADAS MODULE =====
// Gerenciamento de chamadas e histórico
// Migrado para IndexedDB

const chamadas = {

    chamadaResumo: null,
    relatorioMensalAtual: null,
    relatorioMensalInicializado: false,
    alunosCache: {}, // Cache temporário de alunos para visualização

    // Listar histórico de chamadas
    async listarHistorico() {
        if (!turmas.turmaAtual) return;

        try {
            this.inicializarRelatorioMensalUI();
            const container = document.getElementById('lista-historico');
            const emptyState = document.getElementById('empty-historico');

            // Buscar dados
            let chamadasArray = await db.getByIndex('chamadas', 'turmaId', turmas.turmaAtual.id);
            // Ordenar por data (decrescente)
            chamadasArray.sort((a, b) => new Date(b.data) - new Date(a.data));

            // Buscar total de alunos da turma para cálculo de %
            const alunosTurma = await db.getByIndex('alunos', 'turmaId', turmas.turmaAtual.id);
            const totalAlunos = alunosTurma.length;

            if (chamadasArray.length === 0) {
                container.innerHTML = '';
                emptyState.style.display = 'block';
            } else {
                emptyState.style.display = 'none';
                this.renderizarHistorico(chamadasArray, totalAlunos);
            }

            const relatorioContainer = document.getElementById('relatorio-mensal-container');
            if (relatorioContainer && relatorioContainer.style.display !== 'none') {
                await this.atualizarRelatorioMensal();
            }
        } catch (error) {
            console.error("Erro ao listar histórico:", error);
            utils.mostrarToast("Erro ao carregar histórico", "error");
        }
    },

    // Renderizar histórico
    renderizarHistorico(chamadasArray, totalAlunos) {
        const container = document.getElementById('lista-historico');

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

            return `
                <div class="historico-card" data-chamada-id="${chamada.id}">
                    <div class="historico-header">
                        <h4>${utils.formatarData(dataExibicao)}</h4>
                        <span class="historico-badge">${percentual}%</span>
                    </div>
                    <div class="historico-meta">
                        ${presentes} de ${totalAlunos} presentes
                    </div>
                </div>
            `;
        }).join('');

        // Adicionar event listeners
        document.querySelectorAll('.historico-card').forEach(card => {
            card.addEventListener('click', function () {
                chamadas.verDetalhes(this.dataset.chamadaId);
            });
        });
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
        document.getElementById('resumo-info').textContent =
            `${turma.nome} - ${utils.formatarData(chamada.data)}`;

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
                    ✓ ${utils.escapeHtml(r.nome)} <small>(${r.horaFormatada})</small>
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
                    ✗ ${utils.escapeHtml(r.nome)}
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
                    status: status,
                    hora: hora
                };
            });

            const colunas = [
                { field: 'matricula', label: 'Matrícula' },
                { field: 'nome', label: 'Nome' },
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

            let texto = `📋 Chamada - ${turma.nome}\n`;
            texto += `📅 ${utils.formatarData(chamada.data)}\n\n`;
            texto += `✅ Presentes: ${presentes} de ${totalAlunos} (${percentual}%)\n`;
            if (faltas > 0) texto += `❌ Faltas: ${faltas}\n`;
            texto += '\n';

            const sortNome = (a, b) => a.localeCompare(b);

            if (listaPresentes.length > 0) {
                texto += '--- PRESENTES ---\n';
                listaPresentes.sort(sortNome).forEach(nome => texto += `✓ ${nome}\n`);
            }

            if (listaAusentes.length > 0) {
                texto += '\n--- AUSENTES ---\n';
                listaAusentes.sort(sortNome).forEach(nome => texto += `✗ ${nome}\n`);
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

        const agora = new Date();
        const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
        inputMes.value = inputMes.value || mesAtual;

        inputMes.addEventListener('change', async () => {
            await this.atualizarRelatorioMensal();
        });

        this.relatorioMensalInicializado = true;
    },

    async toggleRelatorioMensal() {
        const container = document.getElementById('relatorio-mensal-container');
        if (!container) return;

        const abrir = container.style.display === 'none' || !container.style.display;
        container.style.display = abrir ? 'block' : 'none';

        if (abrir) {
            await this.atualizarRelatorioMensal();
        }
    },

    async atualizarRelatorioMensal() {
        if (!turmas.turmaAtual) return;

        const inputMes = document.getElementById('relatorio-mensal-mes');
        if (!inputMes) return;

        const [anoStr, mesStr] = (inputMes.value || '').split('-');
        const ano = Number(anoStr);
        const mes = Number(mesStr);

        if (!ano || !mes) return;

        try {
            const relatorio = await this.gerarRelatorioMensal(turmas.turmaAtual.id, ano, mes);
            this.relatorioMensalAtual = relatorio;
            this.renderizarRelatorioMensal(relatorio);
        } catch (error) {
            console.error('Erro ao atualizar relatorio mensal:', error);
            utils.mostrarToast('Erro ao gerar relatorio mensal', 'error');
        }
    },

    async gerarRelatorioMensal(turmaId, ano, mes) {
        const alunos = await db.getByIndex('alunos', 'turmaId', turmaId);
        const chamadasTurma = await db.getByIndex('chamadas', 'turmaId', turmaId);

        const mesPad = String(mes).padStart(2, '0');
        const prefixo = `${ano}-${mesPad}`;
        const chamadasMes = chamadasTurma.filter(c => (c.data || '').startsWith(prefixo));

        const diasNoMes = new Date(ano, mes, 0).getDate();
        const diasDoMes = Array.from({ length: diasNoMes }, (_, i) => String(i + 1).padStart(2, '0'));
        const alunosOrdenados = [...alunos].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        const matrizRelatorio = {};

        const normalizarStatus = (status) => {
            if (status === 'P' || !status) return 'P';
            return 'F';
        };

        const ajustarTotais = (linha, status, delta) => {
            if (status === 'P') linha.totalP += delta;
            if (status === 'F') linha.totalF += delta;
        };

        alunosOrdenados.forEach(aluno => {
            const dias = {};
            diasDoMes.forEach(d => { dias[d] = ''; });
            matrizRelatorio[aluno.id] = {
                alunoId: aluno.id,
                nome: aluno.nome || '',
                matricula: aluno.matricula || '',
                dias,
                totalP: 0,
                totalF: 0
            };
        });

        chamadasMes.forEach(chamada => {
            const dia = (chamada.data || '').slice(8, 10);
            if (!dia || !diasDoMes.includes(dia)) return;

            // Em cada dia com chamada, ausência é o padrão para todos.
            // Depois, os registros explícitos (P/F) sobrescrevem essa base.
            alunosOrdenados.forEach(aluno => {
                const linhaBase = matrizRelatorio[aluno.id];
                if (!linhaBase) return;
                if (!linhaBase.dias[dia]) {
                    linhaBase.dias[dia] = 'F';
                    linhaBase.totalF += 1;
                }
            });

            const registros = chamada.registros && typeof chamada.registros === 'object'
                ? chamada.registros
                : {};

            Object.entries(registros).forEach(([alunoId, reg]) => {
                const linha = matrizRelatorio[alunoId];
                if (!linha) return;

                const novoStatus = normalizarStatus(reg?.status);
                if (!novoStatus) return;

                const statusAnterior = linha.dias[dia] || '';
                if (statusAnterior === novoStatus) return;

                ajustarTotais(linha, statusAnterior, -1);
                linha.dias[dia] = novoStatus;
                ajustarTotais(linha, novoStatus, 1);
            });
        });

        return {
            turmaId,
            turmaNome: turmas.turmaAtual?.nome || '',
            ano,
            mes,
            mesPad,
            alunosOrdenados,
            diasDoMes,
            matrizRelatorio
        };
    },

    renderizarRelatorioMensal(relatorio) {
        const wrap = document.getElementById('relatorio-mensal-tabela-wrap');
        if (!wrap) return;

        const { alunosOrdenados, diasDoMes, matrizRelatorio } = relatorio;
        if (!alunosOrdenados || alunosOrdenados.length === 0) {
            wrap.innerHTML = '<p class="text-muted" style="padding: 12px;">Nenhum aluno cadastrado na turma.</p>';
            return;
        }

        const headerDias = diasDoMes.map(d => `<th>${d}</th>`).join('');
        const linhas = alunosOrdenados.map(aluno => {
            const linha = matrizRelatorio[aluno.id];
            const celulasDias = diasDoMes.map(d => {
                const status = linha.dias[d] || '';
                const classe = status ? `cell-status-${status}` : '';
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

        wrap.innerHTML = `
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
        `;
    },

    exportarRelatorioMensalCSV(relatorio = this.relatorioMensalAtual) {
        if (!relatorio) {
            utils.mostrarToast('Gere o relatorio mensal primeiro', 'warning');
            return;
        }

        const { alunosOrdenados, diasDoMes, matrizRelatorio, ano, mesPad, turmaNome } = relatorio;
        const esc = (v) => {
            const s = String(v ?? '');
            return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const header = ['Aluno', 'Matricula', ...diasDoMes, 'Total P', 'Total F'];
        const linhas = [header.map(esc).join(';')];

        alunosOrdenados.forEach(aluno => {
            const linha = matrizRelatorio[aluno.id];
            const row = [
                linha.nome || '',
                linha.matricula || '',
                ...diasDoMes.map(d => linha.dias[d] || ''),
                linha.totalP,
                linha.totalF
            ];
            linhas.push(row.map(esc).join(';'));
        });

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
            const canvas = this.gerarCanvasRelatorioMensal(relatorio);
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const drawW = pageW - 20;
            const title = `Relatorio Mensal - ${relatorio.turmaNome} - ${relatorio.mesPad}/${relatorio.ano}`;

            doc.setFontSize(12);
            doc.text(title, 10, 8);

            const ratio = drawW / canvas.width;
            const usableH = pageH - 16;
            const maxSlicePx = Math.max(1, Math.floor(usableH / ratio));

            let offsetY = 0;
            let page = 0;
            while (offsetY < canvas.height) {
                const sliceH = Math.min(maxSlicePx, canvas.height - offsetY);
                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = canvas.width;
                sliceCanvas.height = sliceH;
                const sctx = sliceCanvas.getContext('2d');
                sctx.drawImage(canvas, 0, offsetY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

                if (page > 0) {
                    doc.addPage('a4', 'landscape');
                    doc.setFontSize(12);
                    doc.text(`${title} (cont.)`, 10, 8);
                }

                const drawH = sliceH * ratio;
                doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 10, 12, drawW, drawH);

                offsetY += sliceH;
                page++;
            }

            const turmaSlug = (relatorio.turmaNome || 'turma').replace(/[^a-z0-9._-]/gi, '_');
            const filename = `relatorio_mensal_${turmaSlug}_${relatorio.ano}_${relatorio.mesPad}.pdf`;
            doc.save(filename);
            utils.mostrarToast('Relatorio mensal PDF exportado', 'success');
        } catch (error) {
            console.error('Erro ao exportar PDF mensal:', error);
            utils.mostrarToast('Erro ao exportar PDF mensal', 'error');
        }
    },

    gerarCanvasRelatorioMensal(relatorio) {
        const { alunosOrdenados, diasDoMes, matrizRelatorio } = relatorio;

        const rowH = 26;
        const headerH = 30;
        const colAluno = 220;
        const colMatricula = 120;
        const colDia = 26;
        const colTotal = 64;

        const colsDiasW = diasDoMes.length * colDia;
        const width = colAluno + colMatricula + colsDiasW + (colTotal * 2);
        const height = headerH + (alunosOrdenados.length * rowH) + 2;

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
            this.listarHistorico();
        } catch (error) {
            console.error(error);
            utils.mostrarToast('Erro ao excluir chamada', 'error');
        }
    }
};
