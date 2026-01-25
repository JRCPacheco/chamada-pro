// ===== STORAGE MODULE =====
// Gerenciamento de dados com localStorage

const storage = {
    
    // Chaves de armazenamento
    keys: {
        TURMAS: 'chamada_pro_turmas',
        CHAMADAS: 'chamada_pro_chamadas',
        CONFIG: 'chamada_pro_config',
        ONBOARDING: 'chamada_pro_onboarding_done'
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

    // Obter chamadas por turma
    getChamadasByTurma(turmaId) {
        const chamadas = this.getChamadas();
        return chamadas.filter(c => c.turmaId === turmaId)
            .sort((a, b) => new Date(b.data) - new Date(a.data));
    },

    // Obter configurações
    getConfig() {
        return this.load(this.keys.CONFIG, {
            som: true,
            vibracao: true,
            wakeLock: true,
            tema: 'light'
        });
    },

    // Salvar configurações
    saveConfig(config) {
        return this.save(this.keys.CONFIG, config);
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
            version: '1.0',
            exportedAt: new Date().toISOString()
        };
    },

    // Importar backup
    importBackup(backup) {
        try {
            if (backup.turmas) this.saveTurmas(backup.turmas);
            if (backup.chamadas) this.saveChamadas(backup.chamadas);
            if (backup.config) this.saveConfig(backup.config);
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
