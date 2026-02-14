// ===== CONFIG DEFAULTS =====
// Configurações padrão da aplicação (única fonte da verdade)

const CONFIG_DEFAULTS = {
    // Configuração principal do app
    app: {
        key: 'app',
        onboarding_done: false,
        professor_nome: '',
        som: true,
        vibracao: true,
        wakeLock: false,
        multi_escola: false
    }
};

// Exportar para uso em outros módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG_DEFAULTS;
}
