// Configuracao do produto (Free) para este build.
// Neste repo, separamos o código da versão Free da versão Lite/Pro (que terão códigos compartilhados).
const PRODUCT_CONFIG = Object.freeze({
    productKey: 'free',
    productLabel: 'Chamada Facil Free',
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
