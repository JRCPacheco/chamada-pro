// ===== SCANNER MODULE =====
// Gerenciamento do scanner de QR Code
// Migrado para IndexedDB

const scanner = {

    html5QrCode: null,
    scanning: false,
    currentFacingMode: 'environment',
    torchEnabled: false,
    wakeLock: null,
    chamadaAtual: null,
    ultimaLeitura: 0,

    // Cache de alunos da turma atual para performance
    alunosCache: {},

    // Lock de concorrência para processamento de scan
    scanLock: false,
    feedbackTimeoutId: null,

    // Parse QR Code no formato novo (CF1|ARRAY) ou antigo (CF1|OBJECT)
    parseQrAluno(texto) {
        if (!texto || !texto.startsWith("CF1|")) return null;
        try {
            const json = texto.slice(4);
            const data = JSON.parse(json);

            // NOVO FORMATO: Array [id, matricula, nome]
            if (Array.isArray(data)) {
                return {
                    id: data[0],
                    matricula: data[1],
                    nome: data[2]
                };
            }

            // FORMATO ANTIGO: Objeto {id, m, n}
            // Mapeando para formato padrão do app
            return {
                id: data.id,
                matricula: data.m || data.matricula, // suporte a variantes se houver
                nome: data.n || data.nome
            };
        } catch (e) {
            console.error("Erro parse QR:", e);
            return null;
        }
    },

    // Iniciar nova chamada (DECOUPLED: recebe turmaId como parâmetro)
    async iniciarChamada(turmaId) {
        if (!turmaId) {
            utils.mostrarToast('Nenhuma turma selecionada', 'error');
            return;
        }

        try {
            const turma = await db.get('turmas', turmaId);

            if (!turma) {
                utils.mostrarToast('Turma não encontrada', 'error');
                return;
            }

            // Buscar alunos da turma para cache e contagem
            const alunos = await db.getByIndex('alunos', 'turmaId', turmaId);

            if (alunos.length === 0) {
                utils.mostrarToast('Adicione alunos antes de iniciar a chamada', 'warning');
                return;
            }

            // Popula cache de alunos por ID e matricula (legacy fallback)
            this.alunosCache = {};
            alunos.forEach(a => {
                this.alunosCache[a.id] = a;
                if (a.matricula) this.alunosCache['MAT_' + a.matricula] = a; // Index secundário
            });

            // Definir Data ISO e validar limite diário por turma
            const dataISO = new Date().toISOString().slice(0, 10);
            const chamadasTurma = await db.getByIndex('chamadas', 'turmaId', turmaId);
            const chamadasHoje = chamadasTurma
                .filter(c => c.data === dataISO)
                .sort((a, b) => {
                    const ta = new Date(a.iniciadoEm || a.criadoEm || a.data).getTime();
                    const tb = new Date(b.iniciadoEm || b.criadoEm || b.data).getTime();
                    return ta - tb;
                });

            const segundoHorarioAtivo = !!turma.segundoHorarioAtivo;
            const limiteChamadasDia = segundoHorarioAtivo ? 2 : 1;
            if (chamadasHoje.length >= limiteChamadasDia) {
                utils.mostrarToast('Número de chamadas por dia esgotado para esta turma', 'warning');
                return;
            }

            const slotsUsados = new Set();
            chamadasHoje.forEach(chamada => {
                if (chamada.slot === 1 || chamada.slot === 2) {
                    slotsUsados.add(chamada.slot);
                } else if (!slotsUsados.has(1)) {
                    slotsUsados.add(1);
                } else {
                    slotsUsados.add(2);
                }
            });

            const slot = !slotsUsados.has(1) ? 1 : 2;
            if (slot > limiteChamadasDia) {
                utils.mostrarToast('Número de chamadas por dia esgotado para esta turma', 'warning');
                return;
            }

            const startedAt = new Date().toISOString();
            const chamadaId = `chamada_${turmaId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

            // Criar nova sessão de chamada
            const chamada = {
                id: chamadaId,
                turmaId: turmaId,
                turmaNome: turma.nome, // Desnormalizado para facilidade de uso
                data: dataISO,
                slot: slot,
                iniciadoEm: startedAt,
                criadoEm: startedAt,
                registros: {} // { alunoId: { status: 'P', ts: number } }
            };
            // Salvar imediatamente para garantir existência
            await db.put('chamadas', chamada);

            this.chamadaAtual = chamada;

            // Atualizar UI
            document.getElementById('scanner-turma-nome').textContent = turma.nome;
            const rotuloHorario = slot === 2 ? '2º horário' : '1º horário';
            document.getElementById('scanner-data-hora').textContent = `${utils.formatarData(dataISO)} • ${rotuloHorario}`;

            // Contar presenças iniciais
            const totalPresentes = Object.values(this.chamadaAtual.registros || {}).filter(r => r.status === 'P').length;
            document.getElementById('contador-presencas').textContent = totalPresentes;

            document.getElementById('lista-presencas-live').innerHTML = '';
            document.getElementById('feedback').textContent = '';
            document.getElementById('feedback').className = 'feedback';

            // Se já tiver presenças, mostrar últimas 5 (opcional, mas bom UX)
            this.atualizarListaPresencas();

            // Mostrar tela de scanner
            app.mostrarTela('tela-scanner');

            // Inicializar scanner
            setTimeout(() => {
                this.iniciarScanner();
            }, 300);

        } catch (error) {
            console.error("Erro ao iniciar chamada:", error);
            utils.mostrarToast("Erro ao iniciar chamada", "error");
        }
    },

    // Inicializar scanner HTML5
    async iniciarScanner() {
        if (!this.html5QrCode) {
            this.html5QrCode = new Html5Qrcode('reader');
        }

        if (this.scanning) return;

        try {
            const config = await app._getAppConfig();
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
    async onScanSuccess(decodedText) {
        // Debounce
        const agora = Date.now();
        if (agora - this.ultimaLeitura < 1500) return;
        this.ultimaLeitura = agora;

        // LOCK de concorrência: evitar processamento simultâneo
        if (this.scanLock) {
            console.warn('[scanner] scan locked, aguardando processamento anterior');
            return;
        }

        this.scanLock = true;

        try {
            let aluno = null;
            let qrIdLido = null;

            // 1. Tentar formato novo (CF1|JSON)
            const dadosQr = this.parseQrAluno(decodedText);

            if (dadosQr && dadosQr.id) {
                // QR novo: buscar no banco pelo index qrId
                qrIdLido = dadosQr.id;
                const alunosEncontrados = await db.getByIndex('alunos', 'qrId', qrIdLido);
                if (alunosEncontrados && alunosEncontrados.length > 0) {
                    aluno = alunosEncontrados[0];
                }
            } else {
                // 2. Fallback: formato antigo (matricula direta?)
                // O app antigo salvava matrícula no QR.
                // Tenta achar aluno na turma atual pela matrícula.
                // (Isso é arriscado se matricula repetir em turmas diferentes, mas o scanner valida turmaId abaixo)
                // Na verdade o fallback do código antigo buscava `turma.alunos[matricula]`.
                // Aqui podemos buscar no cache da turma.
                const matricula = decodedText;
                aluno = this.alunosCache['MAT_' + matricula];
            }

            // VALIDAR ALUNO
            if (!aluno) {
                this.mostrarFeedback('Aluno não encontrado no banco', 'error', {
                    nome: 'Desconhecido',
                    estadoAvatar: 'error'
                });
                utils.tocarSom('error');
                return;
            }

            // VALIDAR TURMA (CRÍTICO)
            if (aluno.turmaId !== this.chamadaAtual.turmaId) {
                this.mostrarFeedback('Aluno de outra turma!', 'error', {
                    aluno,
                    estadoAvatar: 'error'
                });
                utils.tocarSom('error');
                return;
            }

            // Verificar duplicidade DESTE SCAN (evitar spam de 'já registrado')
            // Se já está marcado como P recentemente (nos ultimos 5 segundos?), avisa.
            // Mas o requisito diz "se alunoId já existe em chamada.registros → atualizar".
            // Então vamos atualizar o timestamp e dar feedback de sucesso (ou 'já lido').
            // UX: Se já leu, avisa que já foi lido para usuário não ficar tentando.

            const registroExistente = this.chamadaAtual.registros[aluno.id];

            if (registroExistente && registroExistente.status === 'P') {
                // Opcional: Permitir atualizar timestamp?
                // Vamos só avisar.
                this.mostrarFeedback(`Já registrado: ${aluno.nome}`, 'warning', {
                    aluno,
                    duracao: 5000,
                    estadoAvatar: 'success'
                });
                utils.tocarSom('error'); // ou um som neutro
                return;
            }

            // REGISTRAR PRESENÇA (PUT)
            this.chamadaAtual.registros[aluno.id] = {
                status: 'P',
                ts: Date.now()
            };

            // PERSISTIR IMEDIATAMENTE
            await db.put('chamadas', this.chamadaAtual);

            // FEEDBACK
            this.mostrarFeedback(`✓ ${aluno.nome}`, 'success', {
                aluno,
                duracao: 5000,
                estadoAvatar: 'success'
            });
            utils.tocarSom('success');
            utils.vibrar([50, 50, 100]);

            // Atualizar UI
            this.atualizarListaPresencas();

        } catch (e) {
            console.error("Erro no scan:", e);
            this.mostrarFeedback('Erro ao processar', 'error');
        } finally {
            // GARANTIR unlock mesmo se houver erro
            this.scanLock = false;
        }
    },

    // Mostrar feedback visual
    mostrarFeedback(mensagem, tipo, options = {}) {
        const feedback = document.getElementById('feedback');
        const aluno = options.aluno || null;
        const nomeBase = aluno?.nome || options.nome || 'Desconhecido';
        const estadoAvatar = options.estadoAvatar || (tipo === 'error' ? 'error' : tipo === 'warning' ? 'warning' : 'success');
        const duracao = Number.isFinite(options.duracao) ? options.duracao : 3000;

        const avatarHtml = aluno?.foto
            ? `<div class="feedback-avatar ${estadoAvatar}"><img src="${aluno.foto}" alt="Foto de ${utils.escapeHtml(nomeBase)}"></div>`
            : `<div class="feedback-avatar ${estadoAvatar}" style="background: ${aluno?.nome ? utils.getCorFromString(aluno.nome) : '#9ca3af'}">${utils.escapeHtml(utils.getIniciais(nomeBase))}</div>`;

        feedback.innerHTML = `
            <div class="feedback-content">
                ${avatarHtml}
                <div class="feedback-text">${utils.escapeHtml(mensagem)}</div>
            </div>
        `;
        feedback.className = `feedback ${tipo}`;

        // Feedback visual na tela inteira (Pulse)
        const scannerEl = document.querySelector('.qr-reader');
        if (scannerEl) {
            scannerEl.classList.remove('pulse-success', 'pulse-error');
            void scannerEl.offsetWidth; // Trigger reflow
            scannerEl.classList.add(tipo === 'success' ? 'pulse-success' : 'pulse-error');
        }

        if (this.feedbackTimeoutId) {
            clearTimeout(this.feedbackTimeoutId);
            this.feedbackTimeoutId = null;
        }

        this.feedbackTimeoutId = setTimeout(() => {
            feedback.textContent = '';
            feedback.className = 'feedback';
            if (scannerEl) scannerEl.classList.remove('pulse-success', 'pulse-error');
            this.feedbackTimeoutId = null;
        }, duracao);
    },

    // Atualizar lista de presenças em tempo real
    atualizarListaPresencas() {
        const container = document.getElementById('lista-presencas-live');
        const contador = document.getElementById('contador-presencas');

        // Converter registros em array
        const registros = Object.entries(this.chamadaAtual.registros || {})
            .map(([id, reg]) => {
                // Enriquecer com dados do aluno (do cache)
                const aluno = this.alunosCache[id];
                return {
                    id: id,
                    nome: aluno ? aluno.nome : 'Desconhecido',
                    foto: aluno ? aluno.foto : null,
                    ts: reg.ts,
                    horaFormatada: utils.formatarHora(new Date(reg.ts)),
                    status: reg.status
                };
            })
            .filter(r => r.status === 'P')
            .sort((a, b) => b.ts - a.ts); // Ordem Cronológica Inversa (Mais recentes topo)

        contador.textContent = registros.length;

        // Mostrar últimas 5 presenças
        const ultimas = registros.slice(0, 5);

        container.innerHTML = ultimas.map(p => {
            const iniciais = utils.getIniciais(p.nome);
            const cor = utils.getCorFromString(p.nome);
            const avatarHtml = p.foto
                ? `<div class="presenca-item-icon presenca-item-icon-photo"><img src="${p.foto}" alt="Foto de ${utils.escapeHtml(p.nome)}" class="presenca-item-photo"></div>`
                : `<div class="presenca-item-icon" style="background: ${cor}">${iniciais}</div>`;

            return `
                <div class="presenca-item">
                    ${avatarHtml}
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

    // Ler QR Code para cadastro (não marca presença)
    lerQrParaCadastro(callback) {
        // Mostrar overlay (Fix Android)
        const overlay = document.getElementById('qr-scan-overlay');
        if (overlay) overlay.style.display = 'flex';

        // Criar nova instância temporária
        const readerTemp = new Html5Qrcode('reader-temp');
        let lido = false;

        const onSuccess = (texto) => {
            if (lido) return;
            lido = true;

            // Parse QR
            const dados = this.parseQrAluno(texto);
            const rawText = texto;

            // Parar scanner imediatamente
            readerTemp.stop()
                .then(() => {
                    if (overlay) overlay.style.display = 'none';

                    if (dados) {
                        utils.mostrarToast('QR Code lido com sucesso!', 'success');
                        callback(dados);
                    } else if (rawText) {
                        // Fallback para texto plano (matrícula antiga)
                        // Mas o `scanner.js` espera objeto. Vamos retornar objeto simulado?
                        // "CF1|JSON" é o padrão novo. Se for antigo, retornamos null ou tentamos?
                        // O chamador em `alunos.js` vai tratar.
                        // Se não parseou e não é CF1, assumimos que é matricula direta?
                        // Melhor retornar um objeto { id: null, raw: rawText } se for o caso.
                        // Mas `lerQrParaCadastro` é chamado por alunos.js para PREENCHER O QR.
                        // Se eu li um texto qualquer, posso usar como QR ID? 
                        // O sistema gera QR. O cadastro lê para ASSOCIAR.
                        // Se for um QR gerado pelo sistema, é CF1.

                        utils.mostrarToast('QR Code inválido ou formato antigo', 'warning');
                        callback(null);
                    } else {
                        callback(null);
                    }
                })
                .catch(err => {
                    if (overlay) overlay.style.display = 'none';
                    console.error('Erro ao parar scanner:', err);
                    callback(null); // Callback null em erro
                });
        };

        // Iniciar scanner temporário
        readerTemp.start(
            { facingMode: 'environment' },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            onSuccess,
            () => { } // Ignorar erros contínuos
        ).catch(err => {
            if (overlay) overlay.style.display = 'none';
            console.error('Erro ao iniciar câmera:', err);
            utils.mostrarToast('Erro ao acessar câmera', 'error');
            callback(null);
        });
    },

    // Fechar overlay do scanner manualmente
    fecharOverlay() {
        const el = document.getElementById('qr-scan-overlay');
        if (el) el.style.display = 'none';

        // Tentar parar qualquer scanner ativo no reader-temp (limpeza preventiva)
        try {
            const tempScanner = new Html5Qrcode('reader-temp');
            if (tempScanner.isScanning) {
                tempScanner.stop();
            }
        } catch (e) { }
    },

    // Finalizar chamada
    async finalizarChamada() {
        // Como estamos salvando em tempo real, "finalizar" é apenas sair e mostrar resumo.
        // Verificamos se tem presenças.

        const presencasCount = Object.values(this.chamadaAtual.registros || {}).filter(r => r.status === 'P').length;

        if (presencasCount === 0) {
            if (!utils.confirmar('Nenhuma presença foi registrada. Deseja finalizar mesmo assim?')) {
                return;
            }
        }

        // Parar scanner
        await this.pararScanner();

        utils.mostrarToast('Chamada finalizada!', 'success');

        // Mostrar resumo (precisa dos dados populados)
        // O `verDetalhes` busca do banco. Como já salvamos com `put` no scan, está lá.
        // Usamos chamada.verDetalhes passando o ID.
        chamadas.verDetalhes(this.chamadaAtual.id);
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
