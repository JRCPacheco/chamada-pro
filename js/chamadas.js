// ===== CHAMADAS MODULE =====
// Gerenciamento de chamadas e histórico
// Migrado para IndexedDB

const chamadas = {

    chamadaResumo: null,
    alunosCache: {}, // Cache temporário de alunos para visualização

    // Listar histórico de chamadas
    async listarHistorico() {
        if (!turmas.turmaAtual) return;

        try {
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
        let justificadas = 0;

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
            else if (status === 'J') justificadas++;
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
                        else if (s === 'J') status = 'Falta Justificada';
                    }
                } else if (Array.isArray(chamada.presencas)) {
                    const presenca = chamada.presencas.find(p => p.matricula === aluno.matricula);
                    if (presenca) {
                        const s = presenca.status || 'P';
                        if (s === 'P') { status = 'Presente'; hora = presenca.horaFormatada || '-'; }
                        else if (s === 'J') status = 'Falta Justificada';
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
            let justificadas = 0;

            const listaPresentes = [];
            const listaAusentes = [];
            const listaJustificadas = [];

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
                } else if (status === 'J') {
                    justificadas++;
                    listaJustificadas.push(getNome(aluno));
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
            if (justificadas > 0) texto += `📄 Faltas Justificadas: ${justificadas}\n`;
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

            if (listaJustificadas.length > 0) {
                texto += '\n--- FALTAS JUSTIFICADAS ---\n';
                listaJustificadas.sort(sortNome).forEach(nome => texto += `📄 ${nome}\n`);
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
                            else if (s === 'J') status = 'Falta Justificada';
                        }
                    } else if (Array.isArray(chamada.presencas)) {
                        const presenca = chamada.presencas.find(p => p.matricula === aluno.matricula);
                        if (presenca) {
                            const s = presenca.status || 'P';
                            if (s === 'P') { status = 'Presente'; horaPresenca = presenca.horaFormatada || '-'; }
                            else if (s === 'J') status = 'Falta Justificada';
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
