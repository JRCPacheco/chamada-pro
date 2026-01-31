// ===== CHAMADAS MODULE =====
// Gerenciamento de chamadas e histórico

const chamadas = {

    chamadaResumo: null,

    // Listar histórico de chamadas
    listarHistorico() {
        if (!turmas.turmaAtual) return;

        const chamadas = storage.getChamadasByTurma(turmas.turmaAtual.id);
        const container = document.getElementById('lista-historico');
        const emptyState = document.getElementById('empty-historico');

        if (chamadas.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            this.renderizarHistorico(chamadas);
        }
    },

    // Renderizar histórico
    renderizarHistorico(chamadasArray) {
        const container = document.getElementById('lista-historico');
        const turma = storage.getTurmaById(turmas.turmaAtual.id);
        const totalAlunos = turma.alunos ? Object.keys(turma.alunos).length : 0;

        container.innerHTML = chamadasArray.map(chamada => {
            // Contar presentes (P) e não contar faltas (F) e justificadas (J)
            const presentes = chamada.presencas.filter(p => p.status === 'P').length;
            const percentual = utils.calcularPercentual(presentes, totalAlunos);
            
            return `
                <div class="historico-card" data-chamada-id="${chamada.id}">
                    <div class="historico-header">
                        <h4>${utils.formatarData(chamada.data)}</h4>
                        <span class="historico-badge">${percentual}%</span>
                    </div>
                    <div class="historico-meta">
                        ${utils.formatarHora(chamada.data)} • 
                        ${presentes} de ${totalAlunos} presentes
                    </div>
                </div>
            `;
        }).join('');

        // Adicionar event listeners
        document.querySelectorAll('.historico-card').forEach(card => {
            card.addEventListener('click', function() {
                chamadas.verDetalhes(this.dataset.chamadaId);
            });
        });
    },

    // Ver detalhes de uma chamada
    verDetalhes(chamadaId) {
        const todasChamadas = storage.getChamadas();
        const chamada = todasChamadas.find(c => c.id === chamadaId);
        
        if (chamada) {
            this.mostrarResumo(chamada);
        }
    },

    // Mostrar resumo da chamada
    mostrarResumo(chamada) {
        this.chamadaResumo = chamada;

        const turma = storage.getTurmaById(chamada.turmaId);
        const totalAlunos = turma.alunos ? Object.keys(turma.alunos).length : 0;
        
        // Contar por status: P = presente, F = falta, J = falta justificada
        const presentes = chamada.presencas.filter(p => p.status === 'P').length;
        const faltas = chamada.presencas.filter(p => p.status === 'F').length;
        const justificadas = chamada.presencas.filter(p => p.status === 'J').length;
        const ausentes = totalAlunos - presentes - justificadas; // Apenas faltas não justificadas
        const percentual = utils.calcularPercentual(presentes, totalAlunos);

        // Atualizar informações
        document.getElementById('resumo-info').textContent = 
            `${chamada.turmaNome} - ${utils.formatarDataHora(chamada.data)}`;
        
        document.getElementById('resumo-presentes').textContent = presentes;
        document.getElementById('resumo-ausentes').textContent = ausentes;
        document.getElementById('resumo-percentual').textContent = percentual + '%';

        // Lista de presentes
        const listaPresentes = document.getElementById('resumo-lista-presentes');
        const presentesComStatus = chamada.presencas.filter(p => p.status === 'P');
        if (presentesComStatus.length > 0) {
            listaPresentes.innerHTML = presentesComStatus
                .sort((a, b) => a.nome.localeCompare(b.nome))
                .map(p => `
                    <div class="resumo-lista-item">
                        ✓ ${utils.escapeHtml(p.nome)} <small>(${p.horaFormatada})</small>
                    </div>
                `).join('');
        } else {
            listaPresentes.innerHTML = '<p class="text-muted">Nenhum aluno presente</p>';
        }

        // Lista de ausentes (faltas não justificadas)
        const listaAusentes = document.getElementById('resumo-lista-ausentes');
        const presencasMatriculas = chamada.presencas.map(p => p.matricula);
        const alunosAusentes = Object.values(turma.alunos)
            .filter(a => !presencasMatriculas.includes(a.matricula))
            .sort((a, b) => a.nome.localeCompare(b.nome));

        if (alunosAusentes.length > 0) {
            listaAusentes.innerHTML = alunosAusentes.map(a => `
                <div class="resumo-lista-item">
                    ✗ ${utils.escapeHtml(a.nome)}
                </div>
            `).join('');
        } else {
            listaAusentes.innerHTML = '<p class="text-muted">Nenhum aluno ausente</p>';
        }

        // Mostrar tela de resumo
        app.mostrarTela('tela-resumo');
    },

    // Exportar chamada como CSV
    exportarCSV() {
        if (!this.chamadaResumo) return;

        const turma = storage.getTurmaById(this.chamadaResumo.turmaId);
        const todosAlunos = Object.values(turma.alunos);
        const presencasMatriculas = this.chamadaResumo.presencas.map(p => p.matricula);

        const dados = todosAlunos.map(aluno => {
            const presenca = this.chamadaResumo.presencas.find(p => p.matricula === aluno.matricula);
            let status = 'Ausente';
            let hora = '-';
            
            if (presenca) {
                // Tratar registros antigos sem status como "P"
                const statusTratado = presenca.status || 'P';
                switch (statusTratado) {
                    case 'P':
                        status = 'Presente';
                        hora = presenca.horaFormatada;
                        break;
                    case 'F':
                        status = 'Falta';
                        hora = presenca.horaFormatada || '-';
                        break;
                    case 'J':
                        status = 'Falta Justificada';
                        hora = presenca.horaFormatada || '-';
                        break;
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
        const filename = `chamada_${turma.nome}_${utils.formatarData(this.chamadaResumo.data)}.csv`
            .replace(/[^a-z0-9.-]/gi, '_');

        utils.downloadFile(filename, csv, 'text/csv;charset=utf-8;');
        utils.mostrarToast('CSV exportado com sucesso!', 'success');
    },

    // Compartilhar chamada
    async compartilhar() {
        if (!this.chamadaResumo) return;

        const turma = storage.getTurmaById(this.chamadaResumo.turmaId);
        const totalAlunos = turma.alunos ? Object.keys(turma.alunos).length : 0;
        
        // Contar por status
        const presentes = this.chamadaResumo.presencas.filter(p => p.status === 'P').length;
        const faltas = this.chamadaResumo.presencas.filter(p => p.status === 'F').length;
        const justificadas = this.chamadaResumo.presencas.filter(p => p.status === 'J').length;
        const percentual = utils.calcularPercentual(presentes, totalAlunos);

        let texto = `📋 Chamada - ${turma.nome}\n`;
        texto += `📅 ${utils.formatarDataHora(this.chamadaResumo.data)}\n\n`;
        texto += `✅ Presentes: ${presentes} de ${totalAlunos} (${percentual}%)\n`;
        if (faltas > 0) texto += `❌ Faltas: ${faltas}\n`;
        if (justificadas > 0) texto += `📄 Faltas Justificadas: ${justificadas}\n`;
        texto += '\n';
        
        texto += '--- PRESENTES ---\n';
        this.chamadaResumo.presencas
            .filter(p => (p.status || 'P') === 'P')
            .sort((a, b) => a.nome.localeCompare(b.nome))
            .forEach(p => {
                texto += `✓ ${p.nome}\n`;
            });

        const ausentes = totalAlunos - presentes - justificadas;
        if (ausentes > 0) {
            texto += '\n--- AUSENTES ---\n';
            const presencasMatriculas = this.chamadaResumo.presencas.map(p => p.matricula);
            Object.values(turma.alunos)
                .filter(a => !presencasMatriculas.includes(a.matricula))
                .sort((a, b) => a.nome.localeCompare(b.nome))
                .forEach(a => {
                    texto += `✗ ${a.nome}\n`;
                });
        }

        if (justificadas > 0) {
            texto += '\n--- FALTAS JUSTIFICADAS ---\n';
            this.chamadaResumo.presencas
                .filter(p => p.status === 'J')
                .sort((a, b) => a.nome.localeCompare(b.nome))
                .forEach(p => {
                    texto += `📄 ${p.nome}\n`;
                });
        }

        const compartilhado = await utils.compartilhar({
            title: `Chamada - ${turma.nome}`,
            text: texto
        });

        if (compartilhado) {
            utils.mostrarToast('Chamada compartilhada!', 'success');
        }
    },

    // Exportar histórico completo
    exportarHistorico() {
        if (!turmas.turmaAtual) return;

        const turma = storage.getTurmaById(turmas.turmaAtual.id);
        const chamadas = storage.getChamadasByTurma(turma.id);

        if (chamadas.length === 0) {
            utils.mostrarToast('Nenhuma chamada para exportar', 'warning');
            return;
        }

        // Criar dados consolidados
        const dados = [];
        chamadas.forEach(chamada => {
            chamada.presencas.forEach(presenca => {
                // Tratar registros antigos sem status como "P"
                const statusTratado = presenca.status || 'P';
                let statusTexto = 'Presente';
                
                switch (statusTratado) {
                    case 'P':
                        statusTexto = 'Presente';
                        break;
                    case 'F':
                        statusTexto = 'Falta';
                        break;
                    case 'J':
                        statusTexto = 'Falta Justificada';
                        break;
                }
                
                dados.push({
                    data: utils.formatarData(chamada.data),
                    hora: utils.formatarHora(chamada.data),
                    matricula: presenca.matricula,
                    nome: presenca.nome,
                    status: statusTexto,
                    horaPresenca: presenca.horaFormatada
                });
            });
        });

        const colunas = [
            { field: 'data', label: 'Data' },
            { field: 'hora', label: 'Hora Chamada' },
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
    },

    // Deletar chamada
    deletarChamada(chamadaId) {
        if (!utils.confirmar('Tem certeza que deseja excluir esta chamada?')) {
            return;
        }

        const todasChamadas = storage.getChamadas();
        const chamadas = todasChamadas.filter(c => c.id !== chamadaId);

        if (storage.saveChamadas(chamadas)) {
            utils.mostrarToast('Chamada excluída', 'success');
            this.listarHistorico();
        } else {
            utils.mostrarToast('Erro ao excluir chamada', 'error');
        }
    }
};
