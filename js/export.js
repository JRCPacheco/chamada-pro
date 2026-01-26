// ===== EXPORT MODULE =====
// Funções de exportação de dados

const exportModule = {

    // Exportar backup completo
    exportarBackup() {
        const backup = storage.exportBackup();
        const json = JSON.stringify(backup, null, 2);
        const filename = `chamada-pro-backup-${utils.formatarData(new Date())}.json`
            .replace(/\//g, '-');

        utils.downloadFile(filename, json, 'application/json');
        utils.mostrarToast('Backup exportado com sucesso!', 'success');
    },

    // Importar backup
    importarBackup() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const backup = JSON.parse(event.target.result);
                    
                    // Validar backup
                    if (!backup.version || !backup.turmas) {
                        throw new Error('Arquivo de backup inválido');
                    }

                    if (!utils.confirmar(
                        'Importar backup irá SUBSTITUIR todos os dados atuais. Deseja continuar?'
                    )) {
                        return;
                    }

                    if (storage.importBackup(backup)) {
                        utils.mostrarToast('Backup importado com sucesso!', 'success');
                        
                        // Recarregar app
                        setTimeout(() => {
                            location.reload();
                        }, 1500);
                    } else {
                        utils.mostrarToast('Erro ao importar backup', 'error');
                    }
                } catch (error) {
                    console.error('Erro ao processar backup:', error);
                    utils.mostrarToast('Arquivo de backup inválido', 'error');
                }
            };

            reader.readAsText(file);
        };

        input.click();
    },

    // Exportar turma como JSON
    exportarTurmaJSON(turmaId) {
        const turma = storage.getTurmaById(turmaId);
        if (!turma) return;

        const chamadas = storage.getChamadasByTurma(turmaId);
        
        const dados = {
            turma: turma,
            chamadas: chamadas,
            exportedAt: new Date().toISOString()
        };

        const json = JSON.stringify(dados, null, 2);
        const filename = `turma_${turma.nome}.json`.replace(/[^a-z0-9.-]/gi, '_');

        utils.downloadFile(filename, json, 'application/json');
        utils.mostrarToast('Turma exportada!', 'success');
    },

    // Exportar lista de alunos como CSV
    exportarAlunosCSV(turmaId) {
        const turma = storage.getTurmaById(turmaId);
        if (!turma) return;

        const alunos = Object.values(turma.alunos || {});
        
        if (alunos.length === 0) {
            utils.mostrarToast('Nenhum aluno para exportar', 'warning');
            return;
        }

        const colunas = [
            { field: 'matricula', label: 'Matrícula' },
            { field: 'nome', label: 'Nome' },
            { field: 'email', label: 'Email' }
        ];

        const csv = utils.gerarCSV(alunos, colunas);
        const filename = `alunos_${turma.nome}.csv`.replace(/[^a-z0-9.-]/gi, '_');

        utils.downloadFile(filename, csv, 'text/csv;charset=utf-8;');
        utils.mostrarToast('Lista de alunos exportada!', 'success');
    },

    // Gerar relatório de frequência geral
    gerarRelatorioFrequencia(turmaId) {
        const turma = storage.getTurmaById(turmaId);
        if (!turma) return;

        const chamadas = storage.getChamadasByTurma(turmaId);
        const alunos = Object.values(turma.alunos || {});

        if (chamadas.length === 0) {
            utils.mostrarToast('Nenhuma chamada para gerar relatório', 'warning');
            return;
        }

        // Calcular frequência por aluno
        const frequencia = alunos.map(aluno => {
            const presencas = chamadas.filter(c => 
                c.presencas.some(p => p.matricula === aluno.matricula)
            ).length;

            const percentual = utils.calcularPercentual(presencas, chamadas.length);

            return {
                matricula: aluno.matricula,
                nome: aluno.nome,
                presencas: presencas,
                totalChamadas: chamadas.length,
                percentual: percentual + '%'
            };
        });

        // Ordenar por nome
        frequencia.sort((a, b) => a.nome.localeCompare(b.nome));

        const colunas = [
            { field: 'matricula', label: 'Matrícula' },
            { field: 'nome', label: 'Nome' },
            { field: 'presencas', label: 'Presenças' },
            { field: 'totalChamadas', label: 'Total Chamadas' },
            { field: 'percentual', label: 'Frequência' }
        ];

        const csv = utils.gerarCSV(frequencia, colunas);
        const filename = `relatorio_frequencia_${turma.nome}.csv`
            .replace(/[^a-z0-9.-]/gi, '_');

        utils.downloadFile(filename, csv, 'text/csv;charset=utf-8;');
        utils.mostrarToast('Relatório de frequência exportado!', 'success');
    }
};
