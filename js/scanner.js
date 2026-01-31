// ===== SCANNER MODULE =====
// Gerenciamento do scanner de QR Code

const scanner = {

    html5QrCode: null,
    scanning: false,
    currentFacingMode: 'environment',
    torchEnabled: false,
    wakeLock: null,
    chamadaAtual: null,
    presencasTemp: [],
    ultimaLeitura: 0,

    // Iniciar nova chamada
    iniciarChamada() {
        if (!turmas.turmaAtual) {
            utils.mostrarToast('Nenhuma turma selecionada', 'error');
            return;
        }

        const turma = storage.getTurmaById(turmas.turmaAtual.id);
        const totalAlunos = turma.alunos ? Object.keys(turma.alunos).length : 0;

        if (totalAlunos === 0) {
            utils.mostrarToast('Adicione alunos antes de iniciar a chamada', 'warning');
            return;
        }

        // Inicializar chamada
        this.chamadaAtual = {
            turmaId: turma.id,
            turmaNome: turma.nome,
            data: new Date().toISOString(),
            dataFormatada: utils.formatarDataHora(new Date()),
            presencas: []
        };

        this.presencasTemp = [];

        // Atualizar UI
        document.getElementById('scanner-turma-nome').textContent = turma.nome;
        document.getElementById('scanner-data-hora').textContent = this.chamadaAtual.dataFormatada;
        document.getElementById('contador-presencas').textContent = '0';
        document.getElementById('lista-presencas-live').innerHTML = '';
        document.getElementById('feedback').textContent = '';
        document.getElementById('feedback').className = 'feedback';

        // Mostrar tela de scanner
        app.mostrarTela('tela-scanner');

        // Inicializar scanner
        setTimeout(() => {
            this.iniciarScanner();
        }, 300);
    },

    // Inicializar scanner HTML5
    async iniciarScanner() {
        if (!this.html5QrCode) {
            this.html5QrCode = new Html5Qrcode('reader');
        }

        if (this.scanning) return;

        try {
            const config = storage.getConfig();
            const constraints = this.torchEnabled
                ? { facingMode: this.currentFacingMode, advanced: [{ torch: true }] }
                : { facingMode: this.currentFacingMode };

            await this.html5QrCode.start(
                constraints,
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0
                },
                (decodedText) => this.onScanSuccess(decodedText),
                (errorMessage) => {
                    // Ignorar erros de scan contínuos
                }
            );

            this.scanning = true;
            this.atualizarStatusCamera();

            // Wake Lock
            if (config.wakeLock) {
                this.requestWakeLock();
            }

            utils.mostrarToast('Câmera ativada! Escaneie os QR Codes', 'success');

        } catch (error) {
            console.error('Erro ao iniciar câmera:', error);
            utils.mostrarToast('Erro ao iniciar câmera. Verifique as permissões.', 'error');
        }
    },

    // Parar scanner
    async pararScanner() {
        if (!this.scanning) return;

        try {
            await this.html5QrCode.stop();
        } catch (error) {
            console.error('Erro ao parar scanner:', error);
        } finally {
            this.scanning = false;
            this.atualizarStatusCamera();
            this.releaseWakeLock();
        }
    },

    // Callback de sucesso no scan
    onScanSuccess(decodedText) {
        // Debounce - evitar leituras duplicadas muito rápidas
        const agora = Date.now();
        if (agora - this.ultimaLeitura < 1500) return;
        this.ultimaLeitura = agora;

        // Verificar se já foi registrado
        if (this.presencasTemp.some(p => p.matricula === decodedText)) {
            this.mostrarFeedback('Aluno já registrado!', 'warning');
            utils.tocarSom('error');
            return;
        }

        // Buscar aluno
        const turma = storage.getTurmaById(this.chamadaAtual.turmaId);
        const aluno = turma.alunos ? turma.alunos[decodedText] : null;

        if (!aluno) {
            this.mostrarFeedback(`Matrícula ${decodedText} não encontrada`, 'warning');
            utils.tocarSom('error');
            return;
        }

        // Registrar presença
        const presenca = {
            matricula: decodedText,
            nome: aluno.nome,
            hora: new Date().toISOString(),
            horaFormatada: utils.formatarHora(new Date()),
            status: 'P' // Default: Presente
        };

        this.presencasTemp.push(presenca);
        this.chamadaAtual.presencas = this.presencasTemp;

        // Feedback visual e sonoro
        this.mostrarFeedback(`✓ ${aluno.nome}`, 'success');
        utils.tocarSom('success');
        utils.vibrar([50, 50, 100]);

        // Atualizar lista
        this.atualizarListaPresencas();
    },

    // Mostrar feedback visual
    mostrarFeedback(mensagem, tipo) {
        const feedback = document.getElementById('feedback');
        feedback.textContent = mensagem;
        feedback.className = `feedback ${tipo}`;

        // Feedback visual na tela inteira (Pulse)
        const scannerEl = document.querySelector('.qr-reader');
        if (scannerEl) {
            scannerEl.classList.remove('pulse-success', 'pulse-error');
            void scannerEl.offsetWidth; // Trigger reflow
            scannerEl.classList.add(tipo === 'success' ? 'pulse-success' : 'pulse-error');
        }

        // Limpar após 3 segundos
        setTimeout(() => {
            feedback.textContent = '';
            feedback.className = 'feedback';
            if (scannerEl) scannerEl.classList.remove('pulse-success', 'pulse-error');
        }, 3000);
    },

    // Atualizar lista de presenças em tempo real
    atualizarListaPresencas() {
        const container = document.getElementById('lista-presencas-live');
        const contador = document.getElementById('contador-presencas');

        contador.textContent = this.presencasTemp.length;

        // Mostrar últimas 5 presenças
        const ultimas = this.presencasTemp.slice(-5).reverse();

        container.innerHTML = ultimas.map(p => {
            const iniciais = utils.getIniciais(p.nome);
            const cor = utils.getCorFromString(p.nome);

            return `
                <div class="presenca-item">
                    <div class="presenca-item-icon" style="background: ${cor}">
                        ${iniciais}
                    </div>
                    <div class="presenca-item-info">
                        <h5>${utils.escapeHtml(p.nome)}</h5>
                        <small>${p.horaFormatada}</small>
                    </div>
                </div>
            `;
        }).join('');
    },

    // Atualizar status da câmera
    atualizarStatusCamera() {
        const status = document.getElementById('camera-status');
        const modo = this.currentFacingMode === 'environment' ? 'Traseira' : 'Frontal';
        const estado = this.scanning ? 'Ativa' : 'Inativa';
        const lanterna = this.torchEnabled ? 'On' : 'Off';

        status.textContent = `Câmera: ${estado} | Modo: ${modo} | Lanterna: ${lanterna}`;
    },

    // Alternar câmera
    async alternarCamera() {
        this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';

        if (this.scanning) {
            await this.pararScanner();
            await this.iniciarScanner();
        } else {
            this.atualizarStatusCamera();
        }
    },

    // Alternar lanterna
    async alternarLanterna() {
        const supports = !!(navigator.mediaDevices?.getSupportedConstraints()?.torch);

        if (!supports) {
            utils.mostrarToast('Lanterna não suportada neste dispositivo', 'warning');
            return;
        }

        this.torchEnabled = !this.torchEnabled;

        if (this.scanning) {
            await this.pararScanner();
            await this.iniciarScanner();
        } else {
            this.atualizarStatusCamera();
        }
    },

    // Wake Lock
    async requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');

                this.wakeLock.addEventListener('release', () => {
                    this.wakeLock = null;
                });

                // Re-adquirir ao voltar para a aba
                document.addEventListener('visibilitychange', async () => {
                    if (!document.hidden && this.scanning && !this.wakeLock) {
                        try {
                            this.wakeLock = await navigator.wakeLock.request('screen');
                        } catch (err) {
                            console.error('Erro ao re-adquirir wake lock:', err);
                        }
                    }
                });
            }
        } catch (err) {
            console.error('Wake Lock não suportado:', err);
        }
    },

    releaseWakeLock() {
        if (this.wakeLock) {
            this.wakeLock.release();
            this.wakeLock = null;
        }
    },

    // Finalizar chamada
    async finalizarChamada() {
        if (this.presencasTemp.length === 0) {
            if (!utils.confirmar('Nenhuma presença foi registrada. Deseja finalizar mesmo assim?')) {
                return;
            }
        }

        // Parar scanner
        await this.pararScanner();

        // Salvar chamada
        const chamadaId = storage.addChamada(this.chamadaAtual);

        if (chamadaId) {
            utils.mostrarToast('Chamada finalizada!', 'success');

            // Mostrar resumo
            chamadas.mostrarResumo(this.chamadaAtual);
        } else {
            utils.mostrarToast('Erro ao salvar chamada', 'error');
        }
    }
};

// Event listeners para controles do scanner
document.addEventListener('DOMContentLoaded', () => {
    const btnToggleCamera = document.getElementById('btn-toggle-camera');
    const btnTorch = document.getElementById('btn-torch');
    const btnFinalizar = document.getElementById('btn-finalizar-chamada');

    if (btnToggleCamera) {
        btnToggleCamera.onclick = () => scanner.alternarCamera();
    }

    if (btnTorch) {
        btnTorch.onclick = () => scanner.alternarLanterna();
    }

    if (btnFinalizar) {
        btnFinalizar.onclick = () => scanner.finalizarChamada();
    }

    // Parar scanner ao sair da tela
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && scanner.scanning) {
            scanner.pararScanner();
        }
    });
});
