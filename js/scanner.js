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

    // Lock de concorrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âªncia para processamento de scan
    scanLock: false,
    feedbackTimeoutId: null,

    getActiveVideoTrack() {
        const videoEl = document.querySelector('#reader video');
        const stream = videoEl?.srcObject;
        if (!stream || typeof stream.getVideoTracks !== 'function') return null;
        const tracks = stream.getVideoTracks();
        return tracks && tracks.length ? tracks[0] : null;
    },

    cameraSuportaLanterna() {
        const track = this.getActiveVideoTrack();
        if (!track || typeof track.getCapabilities !== 'function') return false;
        const caps = track.getCapabilities() || {};
        return !!caps.torch;
    },

    atualizarDisponibilidadeLanterna() {
        const btnTorch = document.getElementById('btn-torch');
        if (!btnTorch) return;

        const suportado = this.scanning && this.cameraSuportaLanterna();
        btnTorch.style.display = suportado ? '' : 'none';
        btnTorch.disabled = !suportado;

        if (!suportado) this.torchEnabled = false;
    },

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
            // Mapeando para formato padrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o do app
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

    // Iniciar nova chamada (DECOUPLED: recebe turmaId como parÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢metro)
    async iniciarChamada(turmaId) {
        if (!turmaId) {
            utils.mostrarToast('Nenhuma turma selecionada', 'error');
            return;
        }

        try {
            const turma = await db.get('turmas', turmaId);

            if (!turma) {
                utils.mostrarToast('Turma n\u00E3o encontrada', 'error');
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
                if (a.matricula) this.alunosCache['MAT_' + a.matricula] = a; // Index secundÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡rio
            });

            // Definir Data ISO e validar limite diÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡rio por turma
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
                utils.mostrarToast('N\u00FAmero de chamadas por dia esgotado para esta turma', 'warning');
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
                utils.mostrarToast('N\u00FAmero de chamadas por dia esgotado para esta turma', 'warning');
                return;
            }

            const startedAt = new Date().toISOString();
            const chamadaId = `chamada_${turmaId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

            // Criar nova sessÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o de chamada
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
            // Salvar imediatamente para garantir existÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âªncia
            await db.put('chamadas', chamada);

            this.chamadaAtual = chamada;
            // Atualizar UI
            const scannerTurmaNomeEl = document.getElementById('scanner-turma-nome');
            const scannerDataHoraEl = document.getElementById('scanner-data-hora');
            const contadorPresencasEl = document.getElementById('contador-presencas');
            const listaPresencasEl = document.getElementById('lista-presencas-live');
            const feedbackEl = document.getElementById('feedback');

            if (scannerTurmaNomeEl) scannerTurmaNomeEl.textContent = turma.nome;
            const rotuloHorario = slot === 2 ? '2\u00BA hor\u00E1rio' : '1\u00BA hor\u00E1rio';
            if (scannerDataHoraEl) scannerDataHoraEl.textContent = `${utils.formatarData(dataISO)} • ${rotuloHorario}`;

            // Contar presenÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§as iniciais
            const totalPresentes = Object.values(this.chamadaAtual.registros || {}).filter(r => r.status === 'P').length;
            if (contadorPresencasEl) contadorPresencasEl.textContent = totalPresentes;

            if (listaPresencasEl) listaPresencasEl.innerHTML = '';
            if (feedbackEl) {
                feedbackEl.textContent = '';
                feedbackEl.className = 'feedback';
            }

            // Se jÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ tiver presenÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§as, mostrar ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºltimas 5 (opcional, mas bom UX)
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
            const constraints = { facingMode: this.currentFacingMode };

            await this.html5QrCode.start(
                constraints,
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0
                },
                (decodedText) => this.onScanSuccess(decodedText),
                (errorMessage) => {
                    // Ignorar erros de scan contÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­nuos
                }
            );

            this.scanning = true;
            this.atualizarStatusCamera();
            this.atualizarDisponibilidadeLanterna();

            // Wake Lock
            if (config.wakeLock) {
                this.requestWakeLock();
            }

            utils.mostrarToast('C\u00E2mera ativada! Escaneie os QR Codes', 'success');

        } catch (error) {
            console.error('Erro ao iniciar c\u00E2mera:', error);
            utils.mostrarToast('Erro ao iniciar c\u00E2mera. Verifique as permiss\u00F5es.', 'error');
            this.atualizarDisponibilidadeLanterna();
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
            this.torchEnabled = false;
            this.atualizarStatusCamera();
            this.atualizarDisponibilidadeLanterna();
            this.releaseWakeLock();
        }
    },

    // Callback de sucesso no scan
    async onScanSuccess(decodedText) {
        // Debounce
        const agora = Date.now();
        if (agora - this.ultimaLeitura < 1500) return;
        this.ultimaLeitura = agora;

        // LOCK de concorrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âªncia: evitar processamento simultÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢neo
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
                // O app antigo salvava matrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­cula no QR.
                // Tenta achar aluno na turma atual pela matrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­cula.
                // (Isso ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© arriscado se matrÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­cula repetir em turmas diferentes, mas o scanner valida turmaId abaixo)
                // Na verdade o fallback do cÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³digo antigo buscava `turma.alunos[matricula]`.
                // Aqui podemos buscar no cache da turma.
                const matricula = decodedText;
                aluno = this.alunosCache['MAT_' + matricula];
            }

            // VALIDAR ALUNO
            if (!aluno) {
                this.mostrarFeedback('Aluno n\u00E3o encontrado no banco', 'error', {
                    nome: 'Desconhecido',
                    estadoAvatar: 'error'
                });
                utils.tocarSom('error');
                return;
            }

            // VALIDAR TURMA (CRÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂTICO)
            if (aluno.turmaId !== this.chamadaAtual.turmaId) {
                this.mostrarFeedback('Aluno de outra turma!', 'error', {
                    aluno,
                    estadoAvatar: 'error'
                });
                utils.tocarSom('error');
                return;
            }

            // Verificar duplicidade DESTE SCAN (evitar spam de 'jÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ registrado')
            // Se jÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ marcado como P recentemente (nos ultimos 5 segundos?), avisa.
            // Mas o requisito diz "se alunoId jÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ existe em chamada.registros ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ atualizar".
            // EntÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o vamos atualizar o timestamp e dar feedback de sucesso (ou 'jÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ lido').
            // UX: Se jÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ leu, avisa que jÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ foi lido para usuÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡rio nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o ficar tentando.

            const registroExistente = this.chamadaAtual.registros[aluno.id];

            if (registroExistente && registroExistente.status === 'P') {
                // Opcional: Permitir atualizar timestamp?
                // Vamos sÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ avisar.
                this.mostrarFeedback(`Já registrado: ${aluno.nome}`, 'warning', {
                    aluno,
                    duracao: 5000,
                    estadoAvatar: 'success'
                });
                utils.tocarSom('error'); // ou um som neutro
                return;
            }

            // REGISTRAR PRESENÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¡A (PUT)
            this.chamadaAtual.registros[aluno.id] = {
                status: 'P',
                ts: Date.now()
            };

            // PERSISTIR IMEDIATAMENTE
            await db.put('chamadas', this.chamadaAtual);

            // FEEDBACK
            this.mostrarFeedback(`Presença registrada: ${aluno.nome}`, 'success', {
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
        if (!feedback) return;
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

    // Atualizar lista de presenÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§as em tempo real
    atualizarListaPresencas() {
        const container = document.getElementById('lista-presencas-live');
        const contador = document.getElementById('contador-presencas');
        if (!container || !contador) return;

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
            .sort((a, b) => b.ts - a.ts); // Ordem CronolÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³gica Inversa (Mais recentes topo)

        contador.textContent = registros.length;

        // Mostrar ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºltimas 5 presenÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§as
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

    // Atualizar status da cÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢mera
    atualizarStatusCamera() {
        const status = document.getElementById('camera-status');
        if (!status) return;
        const modo = this.currentFacingMode === 'environment' ? 'Traseira' : 'Frontal';
        const estado = this.scanning ? 'Ativa' : 'Inativa';
        const lanterna = this.torchEnabled ? 'On' : 'Off';

        status.textContent = `Câmera: ${estado} | Modo: ${modo} | Lanterna: ${lanterna}`;
    },

    // Alternar cÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢mera
    async alternarCamera() {
        this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
        this.torchEnabled = false;

        if (this.scanning) {
            await this.pararScanner();
            await this.iniciarScanner();
        } else {
            this.atualizarStatusCamera();
            this.atualizarDisponibilidadeLanterna();
        }
    },

    // Alternar lanterna
    async alternarLanterna() {
        if (!this.scanning) {
            utils.mostrarToast('Abra a c\u00E2mera antes de usar a lanterna', 'warning');
            return;
        }

        const track = this.getActiveVideoTrack();
        if (!track || typeof track.applyConstraints !== 'function') {
            utils.mostrarToast('Lanterna n\u00E3o dispon\u00EDvel nesta c\u00E2mera', 'warning');
            this.atualizarDisponibilidadeLanterna();
            return;
        }

        if (!this.cameraSuportaLanterna()) {
            utils.mostrarToast('Lanterna n\u00E3o suportada nesta c\u00E2mera', 'warning');
            this.atualizarDisponibilidadeLanterna();
            return;
        }

        const novoEstado = !this.torchEnabled;
        try {
            await track.applyConstraints({ advanced: [{ torch: novoEstado }] });
            this.torchEnabled = novoEstado;
            this.atualizarStatusCamera();
        } catch (error) {
            console.error('Erro ao alternar lanterna:', error);
            this.torchEnabled = false;
            this.atualizarStatusCamera();
            utils.mostrarToast('N\u00E3o foi poss\u00EDvel ativar a lanterna nesta c\u00E2mera', 'warning');
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
            console.error('Wake Lock nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o suportado:', err);
        }
    },

    releaseWakeLock() {
        if (this.wakeLock) {
            this.wakeLock.release();
            this.wakeLock = null;
        }
    },

    // Ler QR Code para cadastro (nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o marca presenÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§a)
    lerQrParaCadastro(callback) {
        // Mostrar overlay (Fix Android)
        const overlay = document.getElementById('qr-scan-overlay');
        if (overlay) overlay.style.display = 'flex';

        // Criar nova instÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ncia temporÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ria
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
                        // Fallback para texto plano (matrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­cula antiga)
                        // Mas o `scanner.js` espera objeto. Vamos retornar objeto simulado?
                        // "CF1|JSON" ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© o padrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o novo. Se for antigo, retornamos null ou tentamos?
                        // O chamador em `alunos.js` vai tratar.
                        // Se nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o parseou e nÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â£o ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© CF1, assumimos que ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© matricula direta?
                        // Melhor retornar um objeto { id: null, raw: rawText } se for o caso.
                        // Mas `lerQrParaCadastro` ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© chamado por alunos.js para PREENCHER O QR.
                        // Se eu li um texto qualquer, posso usar como QR ID? 
                        // O sistema gera QR. O cadastro lÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âª para ASSOCIAR.
                        // Se for um QR gerado pelo sistema, ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© CF1.

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

        // Iniciar scanner temporÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡rio
        readerTemp.start(
            { facingMode: 'environment' },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            onSuccess,
            () => { } // Ignorar erros contÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­nuos
        ).catch(err => {
            if (overlay) overlay.style.display = 'none';
            console.error('Erro ao iniciar c\u00E2mera:', err);
            utils.mostrarToast('Erro ao acessar c\u00E2mera', 'error');
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
        // Como estamos salvando em tempo real, "finalizar" ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© apenas sair e mostrar resumo.
        // Verificamos se tem presenÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â§as.

        const presencasCount = Object.values(this.chamadaAtual.registros || {}).filter(r => r.status === 'P').length;

        if (presencasCount === 0) {
            const confirmarFinalizacao = await app.confirmarAcao({
                title: 'Finalizar chamada',
                message: 'Nenhuma presen\u00E7a foi registrada. Deseja finalizar mesmo assim?',
                confirmText: 'Finalizar assim mesmo',
                cancelText: 'Continuar lendo'
            });
            if (!confirmarFinalizacao) {
                return;
            }
        }

        // Parar scanner
        await this.pararScanner();

        utils.mostrarToast('Chamada finalizada!', 'success');

        // Mostrar resumo (precisa dos dados populados)
        // O `verDetalhes` busca do banco. Como jÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ salvamos com `put` no scan, estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ lÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡.
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

    scanner.atualizarDisponibilidadeLanterna();

    // Parar scanner ao sair da tela
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && scanner.scanning) {
            scanner.pararScanner();
        }
    });
});





