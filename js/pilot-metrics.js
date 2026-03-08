// ===== PILOT METRICS MODULE =====
// Coleta local de metricas para piloto de transferencia entre professores.

const pilotMetrics = {
    _storageKey: 'chamada_pro_pilot_metrics_v1',
    _maxEvents: 500,

    _nowIso() {
        return new Date().toISOString();
    },

    _load() {
        try {
            const raw = localStorage.getItem(this._storageKey);
            if (!raw) return { version: 1, events: [] };
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.events)) {
                return { version: 1, events: [] };
            }
            return parsed;
        } catch (_) {
            return { version: 1, events: [] };
        }
    },

    _save(payload) {
        const safePayload = {
            version: 1,
            events: Array.isArray(payload?.events) ? payload.events.slice(-this._maxEvents) : []
        };
        localStorage.setItem(this._storageKey, JSON.stringify(safePayload));
    },

    _push(type, data = {}) {
        const state = this._load();
        state.events.push({
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            ts: this._nowIso(),
            type: String(type || 'unknown'),
            data: data && typeof data === 'object' ? data : {}
        });
        this._save(state);
    },

    startFlow({ role, mode, channel, turmaId }) {
        const flowId = `flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        this._push('flow_start', {
            flowId,
            role: String(role || 'unknown'),
            mode: String(mode || 'manual'),
            channel: String(channel || 'p2p'),
            turmaId: turmaId ? String(turmaId) : null
        });
        return flowId;
    },

    finishFlow(flowId, outcome, extra = {}) {
        if (!flowId) return;
        const state = this._load();
        const start = [...state.events].reverse().find((e) => e?.type === 'flow_start' && e?.data?.flowId === flowId);
        const startedAt = start?.ts ? new Date(start.ts).getTime() : null;
        const endedAt = Date.now();
        const durationMs = Number.isFinite(startedAt) ? Math.max(0, endedAt - startedAt) : null;

        this._push('flow_finish', {
            flowId: String(flowId),
            outcome: String(outcome || 'unknown'),
            durationMs,
            ...extra
        });
    },

    recordEvent(type, data = {}) {
        this._push(type, data);
    },

    getSummary() {
        const events = this._load().events;
        const finishes = events.filter((e) => e.type === 'flow_finish');
        const p2pSuccess = finishes.filter((e) => e.data?.outcome === 'success_p2p').length;
        const fallback = finishes.filter((e) => e.data?.outcome === 'fallback').length;
        const failed = finishes.filter((e) => e.data?.outcome === 'failed').length;
        const total = finishes.length;
        const durations = finishes
            .map((e) => Number(e?.data?.durationMs))
            .filter((n) => Number.isFinite(n) && n >= 0);
        const avgDurationMs = durations.length
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
            : null;

        return {
            totalFlows: total,
            successP2P: p2pSuccess,
            fallbackUsado: fallback,
            failedFlows: failed,
            taxaSucessoP2P: total > 0 ? Number(((p2pSuccess / total) * 100).toFixed(1)) : 0,
            tempoMedioMs: avgDurationMs,
            eventos: events.length
        };
    },

    exportJson() {
        const payload = this._load();
        const resumo = this.getSummary();
        const final = {
            exportedAt: this._nowIso(),
            summary: resumo,
            ...payload
        };
        const filename = `pilot_metrics_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        utils.downloadFile(filename, JSON.stringify(final, null, 2), 'application/json');
    },

    clearAll() {
        localStorage.removeItem(this._storageKey);
    }
};

