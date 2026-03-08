// ===== P2P TRANSFER MODULE =====
// Transferencia direta entre dois aparelhos via WebRTC (pareamento manual por codigo)

const p2pTransfer = {
    modo: null, // 'enviar' | 'receber'
    turmaIdEnvio: null,
    pc: null,
    dataChannel: null,
    _senderPayload: null,
    _signalingSession: null,
    _qrReader: null,
    _qrLendo: false,
    _waitingSignalingAnswer: false,
    _flowId: null,
    _flowFinished: false,
    _recebendoChunks: [],
    _recebendoMeta: null,
    _connTimeoutId: null,

    _setStatus(msg) {
        const el = document.getElementById('p2p-status');
        if (el) el.textContent = msg;
    },

    _setResumo(msg) {
        const el = document.getElementById('p2p-resumo');
        if (el) el.textContent = msg;
    },

    _setCodigoLocal(txt) {
        const el = document.getElementById('p2p-codigo-local');
        if (el) el.value = txt || '';
        this._renderQrLocal(txt || '');
    },

    _getCodigoRemoto() {
        return (document.getElementById('p2p-codigo-remoto')?.value || '').trim();
    },

    _limparCodigoRemoto() {
        const el = document.getElementById('p2p-codigo-remoto');
        if (el) el.value = '';
    },

    _setFallbackCta({ visible = false, label = 'Usar fallback', disabled = false } = {}) {
        const btn = document.getElementById('btn-p2p-fallback');
        if (!btn) return;
        btn.style.display = visible ? '' : 'none';
        btn.textContent = label;
        btn.disabled = !!disabled;
    },

    _registrarFalha(reason) {
        try {
            const key = 'chamada_pro_p2p_failures';
            const atual = JSON.parse(localStorage.getItem(key) || '[]');
            atual.push({
                ts: new Date().toISOString(),
                modo: this.modo || 'desconhecido',
                reason: String(reason || 'unknown')
            });
            localStorage.setItem(key, JSON.stringify(atual.slice(-50)));
        } catch (_) { }
    },

    _clearConnectionTimeout() {
        if (this._connTimeoutId) {
            clearTimeout(this._connTimeoutId);
            this._connTimeoutId = null;
        }
    },

    _startConnectionTimeout(context) {
        this._clearConnectionTimeout();
        this._connTimeoutId = setTimeout(() => {
            this._connTimeoutId = null;
            this._registrarFalha(`timeout_${context}`);
            this._recordPilotEvent('p2p_timeout', { context });
            this._setStatus('Conexao P2P nao abriu em 12s.');
            if (this.modo === 'enviar') {
                this._setFallbackCta({ visible: true, label: 'Enviar por WhatsApp/Arquivo', disabled: false });
            } else {
                this._setFallbackCta({ visible: true, label: 'Receber por arquivo', disabled: false });
            }
            utils.mostrarToast('P2P demorou para conectar. Use o fallback.', 'warning');
        }, 12000);
    },

    _safeClose() {
        this._clearConnectionTimeout();
        try { this.dataChannel?.close(); } catch (_) { }
        try { this.pc?.close(); } catch (_) { }
        this.dataChannel = null;
        this.pc = null;
        this._waitingSignalingAnswer = false;
        this._signalingSession = null;
        this._recebendoChunks = [];
        this._recebendoMeta = null;
    },

    async _pararLeituraQr() {
        if (!this._qrReader || !this._qrLendo) return;
        try {
            await this._qrReader.stop();
        } catch (_) { }
        this._qrLendo = false;
        const wrap = document.getElementById('p2p-reader-wrap');
        if (wrap) wrap.style.display = 'none';
    },

    _renderQrLocal(codeText) {
        const wrap = document.getElementById('p2p-qr-local-wrap');
        const canvas = document.getElementById('p2p-qr-local-canvas');
        if (!wrap || !canvas || typeof QRCode === 'undefined') return;
        const text = String(codeText || '').trim();
        const isShortPairingCode = /^[A-Z0-9]{4,16}$/.test(text);
        if (!text || !isShortPairingCode) {
            wrap.style.display = 'none';
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        QRCode.toCanvas(canvas, text, {
            width: 220,
            margin: 1,
            errorCorrectionLevel: 'M'
        }, (err) => {
            if (err) {
                console.error(err);
                wrap.style.display = 'none';
                return;
            }
            wrap.style.display = '';
        });
    },

    _startPilotFlow() {
        this._flowFinished = false;
        if (typeof pilotMetrics?.startFlow !== 'function') {
            this._flowId = null;
            return;
        }
        const mode = this._isSignalingEnabled() ? 'signaling' : 'manual';
        const role = this.modo === 'enviar' ? 'sender' : 'receiver';
        this._flowId = pilotMetrics.startFlow({
            role,
            mode,
            channel: 'p2p',
            turmaId: this.turmaIdEnvio || null
        });
    },

    _recordPilotEvent(type, data = {}) {
        if (typeof pilotMetrics?.recordEvent !== 'function') return;
        pilotMetrics.recordEvent(type, {
            flowId: this._flowId,
            modo: this.modo || 'desconhecido',
            ...data
        });
    },

    _finishPilotFlow(outcome, extra = {}) {
        if (this._flowFinished) return;
        this._flowFinished = true;
        if (typeof pilotMetrics?.finishFlow !== 'function') return;
        pilotMetrics.finishFlow(this._flowId, outcome, {
            modo: this.modo || 'desconhecido',
            ...extra
        });
    },

    _isSignalingEnabled() {
        try {
            return !!PRODUCT_CONFIG?.features?.p2p_signaling
                && typeof p2pSignalingClient !== 'undefined'
                && typeof p2pSignalingClient.isEnabled === 'function'
                && p2pSignalingClient.isEnabled();
        } catch (_) {
            return false;
        }
    },

    _getPairingCodeInputHint() {
        if (this._isSignalingEnabled()) {
            return 'Cole aqui o codigo curto da sessao';
        }
        return 'Cole aqui o codigo recebido';
    },

    _applyPairingInputHint() {
        const remote = document.getElementById('p2p-codigo-remoto');
        if (!remote) return;
        remote.placeholder = this._getPairingCodeInputHint();
    },

    _encodeSignal(obj) {
        return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
    },

    _decodeSignal(str) {
        try {
            return JSON.parse(decodeURIComponent(escape(atob(str))));
        } catch (_) {
            throw new Error('Codigo invalido para pareamento');
        }
    },

    async _waitIceGatheringComplete(pc) {
        if (pc.iceGatheringState === 'complete') return;
        await new Promise((resolve) => {
            const check = () => {
                if (pc.iceGatheringState === 'complete') {
                    pc.removeEventListener('icegatheringstatechange', check);
                    resolve();
                }
            };
            pc.addEventListener('icegatheringstatechange', check);
            setTimeout(resolve, 2500);
        });
    },

    _newPeerConnection() {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
        });
        pc.onconnectionstatechange = () => {
            this._setStatus(`Conexao: ${pc.connectionState}`);
        };
        return pc;
    },

    async _montarPayloadTurmaProfessor(turmaId) {
        const turma = await db.get('turmas', turmaId);
        if (!turma) throw new Error('Turma nao encontrada');

        const alunosOriginais = await db.getByIndex('alunos', 'turmaId', turmaId);
        const escola = turma.escolaId ? await db.get('escolas', turma.escolaId) : null;

        const alunosSemFoto = alunosOriginais.map((aluno) => {
            const clone = { ...aluno };
            delete clone.foto;
            return clone;
        });

        return {
            schemaVersion: 1,
            appVersion: (typeof exportModule?._getAppVersionLabel === 'function')
                ? exportModule._getAppVersionLabel()
                : 'v0.0.0-dev',
            exportedAt: new Date().toISOString(),
            turmaId: String(turma.id || '').trim(),
            turmaNome: String(turma.nome || 'Turma').trim(),
            alunos: alunosSemFoto,
            turma,
            escola
        };
    },

    abrirEnviar(turmaId) {
        this._safeClose();
        this._pararLeituraQr().catch(() => { });
        this.modo = 'enviar';
        this.turmaIdEnvio = turmaId;
        this._senderPayload = null;
        this._setCodigoLocal('');
        this._limparCodigoRemoto();
        this._applyPairingInputHint();
        this._setResumo(this._isSignalingEnabled()
            ? 'Modo enviar (sinalizacao): gere um codigo curto, compartilhe com o outro aparelho e depois aplique a resposta.'
            : 'Modo enviar: gere o codigo, compartilhe com o outro aparelho e depois aplique a resposta.');
        this._setStatus('Pronto para gerar oferta');
        this._setFallbackCta({ visible: false });
        this._startPilotFlow();
        app.abrirModal('modal-p2p-turma');
    },

    abrirReceber() {
        this._safeClose();
        this._pararLeituraQr().catch(() => { });
        this.modo = 'receber';
        this.turmaIdEnvio = null;
        this._senderPayload = null;
        this._setCodigoLocal('');
        this._limparCodigoRemoto();
        this._applyPairingInputHint();
        this._setResumo(this._isSignalingEnabled()
            ? 'Modo receber (sinalizacao): cole o codigo curto, aplique a oferta e gere sua resposta.'
            : 'Modo receber: cole a oferta do outro aparelho e gere sua resposta.');
        this._setStatus('Aguardando oferta');
        this._setFallbackCta({ visible: false });
        this._startPilotFlow();
        app.abrirModal('modal-p2p-turma');
    },

    async gerarCodigoLocal() {
        if (this.modo === 'enviar') {
            return this._gerarOferta();
        }
        if (this.modo === 'receber') {
            return this._gerarResposta();
        }
        utils.mostrarToast('Selecione enviar ou receber primeiro', 'warning');
    },

    async aplicarCodigoRemoto() {
        if (this.modo === 'enviar') {
            return this._aplicarResposta();
        }
        if (this.modo === 'receber') {
            return this._aplicarOferta();
        }
        utils.mostrarToast('Selecione enviar ou receber primeiro', 'warning');
    },

    copiarCodigoLocal() {
        const txt = document.getElementById('p2p-codigo-local')?.value || '';
        if (!txt.trim()) {
            utils.mostrarToast('Nenhum codigo para copiar', 'warning');
            return;
        }
        utils.copiarParaClipboard(txt);
    },

    async lerQrRemoto() {
        const wrap = document.getElementById('p2p-reader-wrap');
        if (!wrap) {
            utils.mostrarToast('Leitor QR indisponivel', 'error');
            return;
        }
        if (typeof Html5Qrcode === 'undefined') {
            utils.mostrarToast('Biblioteca de QR indisponivel', 'error');
            return;
        }

        if (!this._qrReader) {
            this._qrReader = new Html5Qrcode('p2p-reader');
        }

        if (this._qrLendo) {
            await this._pararLeituraQr();
            this._setStatus('Leitura de QR interrompida.');
            return;
        }

        wrap.style.display = '';
        this._setStatus('Abrindo camera para ler QR...');
        let concluido = false;

        const onSuccess = async (decodedText) => {
            if (concluido) return;
            concluido = true;
            const remoto = document.getElementById('p2p-codigo-remoto');
            if (remoto) remoto.value = String(decodedText || '').trim();
            await this._pararLeituraQr();
            this._setStatus('QR lido. Aplicando codigo automaticamente...');
            await this.aplicarCodigoRemoto();
        };

        try {
            await this._qrReader.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 240, height: 240 } },
                onSuccess,
                () => { }
            );
            this._qrLendo = true;
            this._setStatus('Aponte para o QR do outro aparelho.');
        } catch (error) {
            wrap.style.display = 'none';
            this._qrLendo = false;
            console.error(error);
            utils.mostrarToast('Erro ao iniciar leitor QR', 'error');
            this._setStatus('Falha ao abrir camera para leitura de QR.');
        }
    },

    onModalClose() {
        this._pararLeituraQr().catch(() => { });
        this._safeClose();
    },

    usarFallback() {
        if (this.modo === 'enviar') {
            if (!this.turmaIdEnvio) {
                utils.mostrarToast('Turma de envio nao definida', 'warning');
                return;
            }
            this._registrarFalha('fallback_manual_sender');
            this._recordPilotEvent('p2p_fallback', { side: 'sender' });
            this._finishPilotFlow('fallback', { reason: 'manual_sender' });
            this._setStatus('Usando fallback de envio por arquivo...');
            exportModule.exportarTurmaProfessorJSON(this.turmaIdEnvio);
            return;
        }

        if (this.modo === 'receber') {
            this._registrarFalha('fallback_manual_receiver');
            this._recordPilotEvent('p2p_fallback', { side: 'receiver' });
            this._finishPilotFlow('fallback', { reason: 'manual_receiver' });
            this._setStatus('Usando fallback de recebimento por arquivo...');
            app.fecharModal('modal-p2p-turma');
            turmas.importarMigracaoTurmaGlobal();
        }
    },

    async _gerarOferta() {
        if (!this.turmaIdEnvio) {
            utils.mostrarToast('Selecione uma turma para enviar', 'warning');
            return;
        }

        this._safeClose();
        this.pc = this._newPeerConnection();
        this.dataChannel = this.pc.createDataChannel('turma-cmf');

        this.dataChannel.onopen = () => {
            this._clearConnectionTimeout();
            this._setStatus('Canal aberto. Enviando dados...');
            this._enviarPayload().catch((e) => {
                console.error(e);
                this._setStatus('Falha ao enviar payload');
            });
        };

        this.dataChannel.onclose = () => this._setStatus('Canal fechado');
        this.dataChannel.onerror = () => this._setStatus('Erro no canal P2P');

        this._senderPayload = await this._montarPayloadTurmaProfessor(this.turmaIdEnvio);

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        await this._waitIceGatheringComplete(this.pc);

        if (this._isSignalingEnabled()) {
            try {
                const sessao = await p2pSignalingClient.createSession(this.pc.localDescription);
                this._signalingSession = {
                    sessionId: sessao.sessionId,
                    senderToken: sessao.senderToken,
                    receiverToken: null,
                    sessionCode: sessao.sessionCode,
                    expiresAt: sessao.expiresAt
                };
                this._setCodigoLocal(sessao.sessionCode);
                this._setStatus('Sessao pronta. Compartilhe o QR/codigo curto e aguarde o pareamento.');
                this._setFallbackCta({ visible: true, label: 'Aguardar P2P (12s)...', disabled: true });
                this._aguardarRespostaSignalingAuto().catch((e) => {
                    console.error(e);
                });
                return;
            } catch (error) {
                console.error(error);
                this._registrarFalha('signaling_create_session_failed');
                this._recordPilotEvent('signaling_error', { step: 'create_session' });
                this._setResumo('Sinalizacao indisponivel. Use compartilhamento por WhatsApp/copia de codigo como fallback.');
                utils.mostrarToast('Falha na sinalizacao. QR simplificado indisponivel neste momento.', 'warning');
            }
        }

        const code = this._encodeSignal(this.pc.localDescription);
        this._setCodigoLocal(code);
        this._setStatus('Oferta pronta. Envie este codigo para o outro aparelho.');
        this._setResumo('Modo manual ativo: codigo longo. Recomenda-se usar WhatsApp/copia e colar no outro aparelho.');
    },

    async _aguardarRespostaSignalingAuto() {
        if (this._waitingSignalingAnswer) return;
        if (!this._isSignalingEnabled() || !this._signalingSession?.sessionId || !this._signalingSession?.senderToken || !this.pc) {
            return;
        }
        this._waitingSignalingAnswer = true;
        try {
            const resposta = await p2pSignalingClient.waitForAnswer(
                this._signalingSession.sessionId,
                this._signalingSession.senderToken,
                12000
            );
            await this.pc.setRemoteDescription(resposta.answer);
            this._setStatus('Pareamento concluido. Aguardando conexao P2P...');
            this._startConnectionTimeout('sender_wait_open');
        } catch (error) {
            this._registrarFalha('signaling_wait_answer_failed');
            this._recordPilotEvent('signaling_error', { step: 'wait_answer_auto' });
            this._setFallbackCta({ visible: true, label: 'Enviar por WhatsApp/Arquivo', disabled: false });
            this._setStatus('Nao foi possivel concluir pareamento automatico.');
            utils.mostrarToast('Pareamento automatico falhou. Use fallback.', 'warning');
            throw error;
        } finally {
            this._waitingSignalingAnswer = false;
        }
    },

    async _aplicarResposta() {
        if (!this.pc) {
            utils.mostrarToast('Gere uma oferta antes', 'warning');
            return;
        }
        if (this._isSignalingEnabled() && this._signalingSession?.sessionId && this._signalingSession?.senderToken) {
            this._setStatus('Aguardando resposta da sessao de sinalizacao...');
            this._setFallbackCta({ visible: true, label: 'Aguardar P2P (12s)...', disabled: true });
            await this._aguardarRespostaSignalingAuto();
            return;
        }

        const raw = this._getCodigoRemoto();
        if (!raw) {
            utils.mostrarToast('Cole a resposta recebida', 'warning');
            return;
        }
        const answer = this._decodeSignal(raw);
        if (answer?.type !== 'answer') {
            utils.mostrarToast('Codigo remoto nao e uma resposta valida', 'error');
            return;
        }

        await this.pc.setRemoteDescription(answer);
        this._setStatus('Resposta aplicada. Aguardando conexao...');
        this._setFallbackCta({ visible: true, label: 'Aguardar P2P (12s)...', disabled: true });
        this._startConnectionTimeout('sender_wait_open');
    },

    async _aplicarOferta() {
        const raw = this._getCodigoRemoto();
        if (!raw) {
            utils.mostrarToast(this._isSignalingEnabled() ? 'Cole o codigo curto da sessao' : 'Cole a oferta recebida', 'warning');
            return;
        }

        let offer = null;
        let sessionReceiver = null;
        if (this._isSignalingEnabled()) {
            try {
                const sessao = await p2pSignalingClient.getOfferByCode(raw);
                sessionReceiver = {
                    sessionId: sessao.sessionId,
                    receiverToken: sessao.receiverToken,
                    sessionCode: raw,
                    expiresAt: sessao.expiresAt
                };
                offer = sessao.offer;
            } catch (error) {
                console.error(error);
                this._registrarFalha('signaling_get_offer_failed');
                this._recordPilotEvent('signaling_error', { step: 'get_offer' });
                utils.mostrarToast('Falha ao obter oferta por sinalizacao. Verifique o codigo.', 'error');
                return;
            }
        } else {
            offer = this._decodeSignal(raw);
            if (offer?.type !== 'offer') {
                utils.mostrarToast('Codigo remoto nao e uma oferta valida', 'error');
                return;
            }
        }

        this._safeClose();
        this.pc = this._newPeerConnection();
        this.pc.ondatachannel = (ev) => {
            this.dataChannel = ev.channel;
            this.dataChannel.onmessage = (msgEv) => this._onMensagemRecebida(msgEv.data);
            this.dataChannel.onopen = () => {
                this._clearConnectionTimeout();
                this._setStatus('Canal aberto. Aguardando dados...');
            };
            this.dataChannel.onclose = () => this._setStatus('Canal fechado');
            this.dataChannel.onerror = () => this._setStatus('Erro no canal P2P');
        };

        await this.pc.setRemoteDescription(offer);
        if (sessionReceiver) {
            this._signalingSession = {
                sessionId: sessionReceiver.sessionId,
                senderToken: null,
                receiverToken: sessionReceiver.receiverToken,
                sessionCode: sessionReceiver.sessionCode,
                expiresAt: sessionReceiver.expiresAt
            };
        }
        this._setStatus('Oferta aplicada.');
        if (this._isSignalingEnabled() && this._signalingSession?.receiverToken) {
            await this._gerarResposta();
            return;
        }
        this._setStatus('Oferta aplicada. Agora gere sua resposta.');
    },

    async _gerarResposta() {
        if (!this.pc || !this.pc.remoteDescription || this.pc.remoteDescription.type !== 'offer') {
            utils.mostrarToast('Aplique uma oferta antes de gerar resposta', 'warning');
            return;
        }

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await this._waitIceGatheringComplete(this.pc);

        if (this._isSignalingEnabled() && this._signalingSession?.sessionId && this._signalingSession?.receiverToken) {
            try {
                await p2pSignalingClient.submitAnswer(
                    this._signalingSession.sessionId,
                    this._signalingSession.receiverToken,
                    this.pc.localDescription
                );
                this._setCodigoLocal(this._signalingSession.sessionCode || '');
                this._setStatus('Resposta enviada ao servidor de sinalizacao. Aguardando conexao...');
                this._setFallbackCta({ visible: true, label: 'Aguardar P2P (12s)...', disabled: true });
                this._startConnectionTimeout('receiver_wait_open');
                return;
            } catch (error) {
                console.error(error);
                this._registrarFalha('signaling_submit_answer_failed');
                this._recordPilotEvent('signaling_error', { step: 'submit_answer' });
                utils.mostrarToast('Falha ao enviar resposta por sinalizacao. Voltando ao codigo manual.', 'warning');
            }
        }

        const code = this._encodeSignal(this.pc.localDescription);
        this._setCodigoLocal(code);
        this._setStatus('Resposta pronta. Envie este codigo para o outro aparelho.');
        this._setFallbackCta({ visible: true, label: 'Aguardar P2P (12s)...', disabled: true });
        this._startConnectionTimeout('receiver_wait_open');
    },

    async _enviarPayload() {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            throw new Error('DataChannel nao esta aberto');
        }
        if (!this._senderPayload) {
            throw new Error('Payload nao preparado');
        }

        const text = JSON.stringify(this._senderPayload);
        const chunkSize = 14000;
        const total = Math.ceil(text.length / chunkSize);

        this.dataChannel.send(JSON.stringify({ t: 'meta', total, chunkSize }));
        for (let i = 0; i < total; i++) {
            const start = i * chunkSize;
            const part = text.slice(start, start + chunkSize);
            this.dataChannel.send(JSON.stringify({ t: 'chunk', i, d: part }));
            if (this.dataChannel.bufferedAmount > 2_000_000) {
                await new Promise((r) => setTimeout(r, 40));
            }
        }
        this.dataChannel.send(JSON.stringify({ t: 'end' }));
        this._clearConnectionTimeout();
        this._setFallbackCta({ visible: false });
        this._setStatus('Payload enviado. No outro aparelho, a importacao sera iniciada.');
        utils.mostrarToast('Transferencia enviada via P2P', 'success');
        this._finishPilotFlow('success_p2p', { side: 'sender' });
    },

    _onMensagemRecebida(raw) {
        let msg = null;
        try {
            msg = JSON.parse(raw);
        } catch (_) {
            return;
        }
        if (!msg || typeof msg !== 'object') return;

        if (msg.t === 'meta') {
            this._recebendoMeta = { total: Number(msg.total || 0), chunkSize: Number(msg.chunkSize || 0) };
            this._recebendoChunks = [];
            this._setStatus(`Recebendo dados... 0/${this._recebendoMeta.total}`);
            return;
        }

        if (msg.t === 'chunk') {
            this._recebendoChunks[msg.i] = String(msg.d || '');
            const recebidos = this._recebendoChunks.filter((x) => typeof x === 'string').length;
            const total = this._recebendoMeta?.total || 0;
            this._setStatus(`Recebendo dados... ${recebidos}/${total}`);
            return;
        }

        if (msg.t === 'end') {
            this._finalizarRecebimento().catch((e) => {
                console.error(e);
                this._recordPilotEvent('p2p_processing_error', { message: String(e?.message || 'unknown') });
                this._finishPilotFlow('failed', { reason: 'payload_processing_error' });
                utils.mostrarToast('Falha ao processar dados recebidos', 'error');
                this._setStatus('Falha no processamento do payload recebido');
            });
        }
    },

    async _finalizarRecebimento() {
        const text = this._recebendoChunks.join('');
        if (!text) throw new Error('Payload vazio');

        const payload = JSON.parse(text);
        if (!payload || typeof payload !== 'object') throw new Error('Payload invalido');

        this._clearConnectionTimeout();
        this._setFallbackCta({ visible: false });
        this._setStatus('Payload recebido. Importando dados...');

        if (typeof exportModule?.importarTurmaProfessorRaw !== 'function') {
            throw new Error('Importacao direta indisponivel neste app');
        }

        const resultado = await exportModule.importarTurmaProfessorRaw(payload);
        if (!resultado?.novaTurmaId) {
            this._setStatus('Importacao cancelada.');
            this._finishPilotFlow('failed', { reason: 'import_cancelled' });
            return;
        }

        if (typeof escolas?.renderizarDropdown === 'function') {
            await escolas.renderizarDropdown('filter-escola');
            await escolas.renderizarDropdown('input-turma-escola');
            await escolas.renderizarDropdown('input-editar-turma-escola');
        }
        await turmas.sincronizarFiltroComTurmaImportada(resultado.novaTurmaId);
        await turmas.listar();
        await turmas.renderizarModalGerenciarTurmas();

        utils.mostrarToast('Dados recebidos e importados via P2P', 'success');
        this._setStatus('Recebimento e importacao concluidos.');
        this._finishPilotFlow('success_p2p', { side: 'receiver', importedTurmaId: resultado.novaTurmaId });

        this._recebendoChunks = [];
        this._recebendoMeta = null;

        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try { this.dataChannel.close(); } catch (_) { }
        }
    }
};
