// Configuracao do produto (Lite/Pro) para este build.
// Neste repo, o padrao atual e Lite.
const PRODUCT_CONFIG = Object.freeze({
    productKey: 'lite',
    productLabel: 'Chamada Facil Lite',
    dbName: 'chamada_facil_lite_db',
    signaling: Object.freeze({
        enabled: false,
        baseUrl: '/api/p2p',
        requestTimeoutMs: 8000,
        pollIntervalMs: 1200,
        sessionTtlSec: 45
    }),
    features: Object.freeze({
        p2p_manual: true,
        p2p_signaling: false,
        cloud_sync: false,
        advanced_reports: false
    })
});
