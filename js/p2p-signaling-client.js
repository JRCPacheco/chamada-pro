// ===== P2P SIGNALING CLIENT =====
// Cliente HTTP para backend leve de sinalizacao WebRTC.

const p2pSignalingClient = {
    schemaVersion: 1,

    _getConfig() {
        const cfg = (typeof PRODUCT_CONFIG !== 'undefined' && PRODUCT_CONFIG?.signaling)
            ? PRODUCT_CONFIG.signaling
            : null;
        return {
            enabled: !!cfg?.enabled,
            baseUrl: String(cfg?.baseUrl || '/api/p2p').trim().replace(/\/+$/, ''),
            requestTimeoutMs: Number(cfg?.requestTimeoutMs || 8000),
            pollIntervalMs: Number(cfg?.pollIntervalMs || 1200),
            sessionTtlSec: Number(cfg?.sessionTtlSec || 45)
        };
    },

    isEnabled() {
        return this._getConfig().enabled;
    },

    async _request(path, { method = 'GET', body = null, headers = {}, timeoutMs } = {}) {
        const cfg = this._getConfig();
        const controller = new AbortController();
        const limitMs = Number(timeoutMs || cfg.requestTimeoutMs || 8000);
        const timer = setTimeout(() => controller.abort(), limitMs);

        try {
            const resp = await fetch(`${cfg.baseUrl}${path}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal
            });

            const payload = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                const msg = String(payload?.error || payload?.message || `HTTP ${resp.status}`);
                throw new Error(`Signaling: ${msg}`);
            }
            return payload;
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error('Signaling: timeout de requisicao');
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    },

    async createSession(offerDescription) {
        if (!offerDescription?.type || !offerDescription?.sdp) {
            throw new Error('Oferta WebRTC invalida para criar sessao');
        }
        const cfg = this._getConfig();
        const data = await this._request('/sessions', {
            method: 'POST',
            body: {
                schemaVersion: this.schemaVersion,
                ttlSec: cfg.sessionTtlSec,
                offer: offerDescription
            }
        });
        this._assertSessionPayload(data, ['sessionId', 'sessionCode', 'senderToken', 'expiresAt']);
        return data;
    },

    async getOfferByCode(sessionCode) {
        const code = String(sessionCode || '').trim();
        if (!code) throw new Error('Codigo de sessao vazio');

        const data = await this._request(`/sessions/by-code/${encodeURIComponent(code)}`, {
            method: 'GET'
        });
        this._assertSessionPayload(data, ['sessionId', 'receiverToken', 'offer', 'expiresAt']);
        return data;
    },

    async submitAnswer(sessionId, receiverToken, answerDescription) {
        if (!answerDescription?.type || !answerDescription?.sdp) {
            throw new Error('Resposta WebRTC invalida');
        }
        const sid = String(sessionId || '').trim();
        const token = String(receiverToken || '').trim();
        if (!sid || !token) throw new Error('Sessao/token invalidos para enviar resposta');

        return this._request(`/sessions/${encodeURIComponent(sid)}/answer`, {
            method: 'PUT',
            headers: {
                'X-Session-Token': token
            },
            body: {
                schemaVersion: this.schemaVersion,
                answer: answerDescription
            }
        });
    },

    async getAnswer(sessionId, senderToken) {
        const sid = String(sessionId || '').trim();
        const token = String(senderToken || '').trim();
        if (!sid || !token) throw new Error('Sessao/token invalidos para consultar resposta');

        const data = await this._request(`/sessions/${encodeURIComponent(sid)}/answer`, {
            method: 'GET',
            headers: {
                'X-Session-Token': token
            }
        });
        if (data?.status === 'ready') {
            if (!data.answer?.type || !data.answer?.sdp) {
                throw new Error('Resposta de sinalizacao invalida');
            }
        }
        return data;
    },

    async waitForAnswer(sessionId, senderToken, timeoutMs = 12000) {
        const cfg = this._getConfig();
        const startedAt = Date.now();
        const interval = Number(cfg.pollIntervalMs || 1200);

        while (Date.now() - startedAt < timeoutMs) {
            const data = await this.getAnswer(sessionId, senderToken);
            if (data?.status === 'ready') return data;
            if (data?.status === 'expired') {
                throw new Error('Sessao de sinalizacao expirada');
            }
            await new Promise((resolve) => setTimeout(resolve, interval));
        }
        throw new Error('Timeout aguardando resposta de sinalizacao');
    },

    _assertSessionPayload(payload, requiredKeys) {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Resposta de sinalizacao invalida');
        }
        for (const key of requiredKeys) {
            if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
                throw new Error(`Resposta de sinalizacao sem campo obrigatorio: ${key}`);
            }
        }
    }
};
