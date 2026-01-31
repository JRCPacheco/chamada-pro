// ===== STORAGE MODULE =====
// Gerenciamento de dados com localStorage

const STORAGE_VERSION = '1.1';

const storage = {

    // Chaves de armazenamento
    keys: {
        TURMAS: 'chamada_pro_turmas',
        CHAMADAS: 'chamada_pro_chamadas',
        CONFIG: 'chamada_pro_config',
        ONBOARDING: 'chamada_pro_onboarding_done',
        ESCOLAS: 'chamada_pro_escolas' // MULTI ESCOLA
    },

    // Salvar dados
    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Erro ao salvar dados:', error);
            utils.mostrarToast('Erro ao salvar dados', 'error');
            return false;
        }
    },

    // Carregar dados
    load(key, defaultValue = null) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            return defaultValue;
        }
    },

    // Deletar dados
    delete(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Erro ao deletar dados:', error);
            return false;
        }
    },

    // Limpar todos os dados
    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Erro ao limpar dados:', error);
            return false;
        }
    },

    // Inicialização e Migração Silenciosa
    init() {
        console.log('📦 Storage: Inicializando...');

        // 0. Inicializar Configuração (Persistência de Defaults)
        const currentConfig = this.getConfig();
        const configDefaults = {
            som: true,
            vibracao: true,
            wakeLock: true,
            tema: 'light',
            multi_escola: false // MULTI ESCOLA
        };

        // Merge: Defaults < Config Atual (preserva escolhas do usuário)
        const mergedConfig = { ...configDefaults, ...currentConfig };
        this.save(this.keys.CONFIG, mergedConfig);

        // 1. Garantir Escola Padrão
        const escolas = this.getEscolas();
        if (!escolas || escolas.length === 0) {
            console.log('📦 Storage: Criando escola padrão...');
            this.saveEscolas([{
                id: 'default',
                nome: 'Minha Escola',
                criadaEm: new Date().toISOString()
            }]);
        }

        // 2. Migração Silenciosa de Turmas
        const turmas = this.getTurmas();
        let turmasModificadas = false;

        turmas.forEach(turma => {
            if (!turma.escola_id) {
                turma.escola_id = 'default';
                turmasModificadas = true;
            }
        });

        if (turmasModificadas) {
            console.log('📦 Storage: Migrando turmas para escola padrão...');
            this.saveTurmas(turmas);
        }
    },

    // === ESCOLAS (MULTI ESCOLA) ===

    getEscolas() {
        return this.load(this.keys.ESCOLAS, []);
    },

    saveEscolas(escolas) {
        return this.save(this.keys.ESCOLAS, escolas);
    },

    addEscola(escola) {
        const escolas = this.getEscolas();
        if (!escola.id) {
            escola.id = 'escola_' + Date.now();
        }
        escola.criadaEm = escola.criadaEm || new Date().toISOString();
        escolas.push(escola);
        return this.saveEscolas(escolas) ? escola.id : null;
    },

    // === TURMAS ===

    // Obter todas as turmas
    getTurmas() {
        return this.load(this.keys.TURMAS, []);
    },

    // Salvar turmas
    saveTurmas(turmas) {
        return this.save(this.keys.TURMAS, turmas);
    },

    // Obter turma por ID
    getTurmaById(id) {
        const turmas = this.getTurmas();
        return turmas.find(t => t.id === id);
    },

    // Adicionar turma
    addTurma(turma) {
        const turmas = this.getTurmas();
        turma.id = 'turma_' + Date.now();
        turma.criadaEm = new Date().toISOString();
        turma.alunos = turma.alunos || {};

        // MULTI ESCOLA: Garantir vinculação
        if (!turma.escola_id) {
            turma.escola_id = 'default';
        }

        turmas.push(turma);
        return this.saveTurmas(turmas) ? turma.id : null;
    },

    // Atualizar turma
    updateTurma(id, updates) {
        const turmas = this.getTurmas();
        const index = turmas.findIndex(t => t.id === id);
        if (index !== -1) {
            turmas[index] = { ...turmas[index], ...updates };
            return this.saveTurmas(turmas);
        }
        return false;
    },

    // Deletar turma
    deleteTurma(id) {
        const turmas = this.getTurmas();
        const filtered = turmas.filter(t => t.id !== id);
        return this.saveTurmas(filtered);
    },

    // === CHAMADAS ===

    // Obter todas as chamadas
    getChamadas() {
        return this.load(this.keys.CHAMADAS, []);
    },

    // Salvar chamadas
    saveChamadas(chamadas) {
        return this.save(this.keys.CHAMADAS, chamadas);
    },

    // Adicionar chamada
    addChamada(chamada) {
        const chamadas = this.getChamadas();
        chamada.id = 'chamada_' + Date.now();
        chamadas.push(chamada);
        return this.saveChamadas(chamadas) ? chamada.id : null;
    },

    // Deletar chamada
    deleteChamada(id) {
        const chamadas = this.getChamadas();
        const filtered = chamadas.filter(c => c.id !== id);
        return this.saveChamadas(filtered);
    },

    // Obter chamadas por turma
    getChamadasByTurma(turmaId) {
        const chamadas = this.getChamadas();
        return chamadas.filter(c => c.turmaId === turmaId)
            .sort((a, b) => new Date(b.data) - new Date(a.data));
    },

    // === CONFIGURAÇÕES ===

    // Obter configurações
    getConfig() {
        return this.load(this.keys.CONFIG, {});
    },

    // Salvar configurações
    saveConfig(config) {
        // Garantir merge com config existente para não perder campos novos
        const currentConfig = this.getConfig();
        const newConfig = { ...currentConfig, ...config };
        return this.save(this.keys.CONFIG, newConfig);
    },

    // Verificar se é primeira vez
    isFirstTime() {
        return !this.load(this.keys.ONBOARDING);
    },

    // Marcar onboarding como completo
    completeOnboarding() {
        return this.save(this.keys.ONBOARDING, true);
    },

    // Exportar backup completo
    exportBackup() {
        return {
            turmas: this.getTurmas(),
            chamadas: this.getChamadas(),
            config: this.getConfig(),
            escolas: this.getEscolas(), // MULTI ESCOLA
            version: STORAGE_VERSION, // Bump version imply schema change
            exportedAt: new Date().toISOString()
        };
    },

    // Importar backup
    importBackup(backup) {
        try {
            if (backup.turmas) this.saveTurmas(backup.turmas);
            if (backup.chamadas) this.saveChamadas(backup.chamadas);
            if (backup.config) this.saveConfig(backup.config);
            if (backup.escolas) this.saveEscolas(backup.escolas); // MULTI ESCOLA

            // Re-executar init para garantir integridade após importação
            this.init();

            return true;
        } catch (error) {
            console.error('Erro ao importar backup:', error);
            return false;
        }
    },

    // Obter estatísticas gerais
    getStats() {
        const turmas = this.getTurmas();
        const chamadas = this.getChamadas();

        let totalAlunos = 0;
        turmas.forEach(turma => {
            if (turma.alunos) {
                totalAlunos += Object.keys(turma.alunos).length;
            }
        });

        return {
            totalTurmas: turmas.length,
            totalAlunos: totalAlunos,
            totalChamadas: chamadas.length
        };
    }
};

// Auto-inicialização segura
try {
    storage.init();
} catch (e) {
    console.error('Falha crítica na inicialização do Storage:', e);
}
