// ===== APP MODULE =====
// Controle principal da aplicação

const app = {

    telaAtual: null,

    // Flag de inicilização
    _initRunning: false,
    _configCache: null, // Cache de configuração

    // Helper interno de config
    async _getAppConfig() {
        if (this._configCache) return this._configCache;
        let cfg = await db.get('config', 'app');

        if (!cfg) {
            // Usar defaults centralizados
            cfg = { ...CONFIG_DEFAULTS.app };
            await db.put('config', cfg);
            this._configCache = cfg;
            console.log("[config] default criado");
        }

        this._configCache = cfg;
        return cfg;
    },

    // Inicializar aplicação
    async init() {
        if (this._initRunning) {
            console.warn("[app] init já em execução");
            return;
        }
        this._initRunning = true;
        console.log("[app] init start");

        try {
            // 1. Inicializar Banco de Dados
            await db.init();
        } catch (e) {
            console.error("[app] falha ao inicializar DB", e);
            alert("Erro ao inicializar banco de dados: " + e.message);
            this._initRunning = false;
            return;
        }

        // Verificar primeira vez
        const cfg = await this._getAppConfig();

        if (!cfg.onboarding_done) {
            this.mostrarOnboarding();
            await this.setupEventListeners();
            await this.aplicarConfiguracoesInterface();
            this._initRunning = false;
            return;
        }

        await this.iniciarApp();
        await this.setupEventListeners();
        await this.aplicarConfiguracoesInterface();
        this.restaurarEstado();

        this._initRunning = false;
        console.log("[app] init ok");
    },

    // Restaurar estado anterior
    restaurarEstado() {
        const ultimaTurmaId = sessionStorage.getItem('chamada_pro_ultima_turma');
        if (ultimaTurmaId && this.telaAtual === 'tela-turmas') {
            console.log('[LAPIDAÇÃO] Restaurando última turma aberta:', ultimaTurmaId);
            setTimeout(() => {
                turmas.abrirDetalhes(ultimaTurmaId);
            }, 100);
        }
    },

    // Mostrar onboarding
    mostrarOnboarding() {
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('onboarding-screen').style.display = 'block';
    },

    // Iniciar app
    async iniciarApp() {
        // Marcar onboarding como completo
        const cfg = await this._getAppConfig();
        cfg.onboarding_done = true;
        await db.put('config', cfg);
        this._configCache = cfg;

        // Esconder loading e onboarding
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('onboarding-screen').style.display = 'none';

        // Mostrar app
        document.getElementById('app').style.display = 'block';

        // Carregar turmas
        this.mostrarTela('tela-turmas');
        turmas.listar();
    },

    // Mostrar tela específica
    mostrarTela(telaId) {
        // Esconder todas as telas
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Mostrar tela solicitada
        const tela = document.getElementById(telaId);
        if (tela) {
            tela.classList.add('active');
            this.telaAtual = telaId;

            // Atualizar header
            this.atualizarHeader(telaId);

            // Scroll para o topo
            window.scrollTo(0, 0);
        }
    },

    // Atualizar header baseado na tela
    atualizarHeader(telaId) {
        const headerTitle = document.getElementById('header-title');
        const btnBack = document.getElementById('btn-back');

        switch (telaId) {
            case 'tela-turmas':
                headerTitle.textContent = 'Minhas Turmas';
                btnBack.style.display = 'none';
                break;
            case 'tela-turma-detalhe':
                // Título já foi definido ao abrir detalhes
                btnBack.style.display = 'block';
                break;
            case 'tela-scanner':
                headerTitle.textContent = 'Scanner';
                btnBack.style.display = 'block';
                break;
            case 'tela-resumo':
                headerTitle.textContent = 'Resumo da Chamada';
                btnBack.style.display = 'block';
                break;
            case 'tela-config':
                headerTitle.textContent = 'Configurações';
                btnBack.style.display = 'block';
                break;
        }
    },

    // Voltar para tela anterior
    voltar() {
        if (this.telaAtual === 'tela-turma-detalhe') {
            sessionStorage.removeItem('chamada_pro_ultima_turma');
            this.mostrarTela('tela-turmas');
            turmas.listar();
        } else if (this.telaAtual === 'tela-scanner') {
            // Parar scanner antes de voltar
            scanner.pararScanner();
            this.mostrarTela('tela-turma-detalhe');
        } else if (this.telaAtual === 'tela-resumo') {
            this.voltarParaTurma();
        } else if (this.telaAtual === 'tela-config') {
            this.mostrarTela('tela-turmas');
            turmas.listar();
        }
    },

    // Voltar para turma após finalizar chamada
    voltarParaTurma() {
        if (turmas.turmaAtual) {
            turmas.abrirDetalhes(turmas.turmaAtual.id);
        } else {
            this.mostrarTela('tela-turmas');
            turmas.listar();
        }
    },

    // Setup de event listeners
    async setupEventListeners() {
        // Botão voltar
        const btnBack = document.getElementById('btn-back');
        if (btnBack) {
            btnBack.onclick = () => this.voltar();
        }

        // Botão menu
        const btnMenu = document.getElementById('btn-menu');
        if (btnMenu) {
            btnMenu.onclick = () => this.mostrarMenu();
        }

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = (e) => {
                const tab = e.target.dataset.tab;
                this.mudarTab(tab);
            };
        });

        // Configurações
        await this.setupConfigListeners();

        // Prevenir zoom em inputs
        this.preventZoomOnInputs();

        // Adicionar classe PWA se instalado
        if (window.matchMedia('(display-mode: standalone)').matches) {
            document.body.classList.add('pwa-mode');
        }
    },

    // Mudar tab
    mudarTab(tabName) {
        // Atualizar botões
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            }
        });

        // Atualizar conteúdo
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        const tabContent = document.getElementById(`tab-${tabName}`);
        if (tabContent) {
            tabContent.classList.add('active');
        }
    },

    // Mostrar menu
    mostrarMenu() {
        const modal = document.getElementById('modal-menu');
        modal.classList.add('active');
    },

    // Fechar modal
    fecharModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
        }
    },

    // Abrir modal
    abrirModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    },

    // Abrir modal Sobre
    abrirSobre() {
        this.fecharModal('modal-menu');
        this.abrirModal('modal-sobre');
    },

    // Setup de listeners de configurações
    async setupConfigListeners() {
        const configSom = document.getElementById('config-som');
        const configVibracao = document.getElementById('config-vibracao');
        const configWakeLock = document.getElementById('config-wake-lock');
        const configTema = document.getElementById('config-tema');
        const configMultiEscola = document.getElementById('config-multi-escola');

        if (configSom) {
            configSom.onchange = () => this.salvarConfig();
        }
        if (configVibracao) {
            configVibracao.onchange = () => this.salvarConfig();
        }
        if (configWakeLock) {
            configWakeLock.onchange = () => this.salvarConfig();
        }
        if (configMultiEscola) {
            configMultiEscola.onchange = async () => {
                await this.salvarConfig();
                await this.aplicarConfiguracoesInterface();
            };
        }

        // Carregar configurações
        await this.carregarConfig();
    },

    // Carregar configurações
    async carregarConfig() {
        const config = await this._getAppConfig();

        const configSom = document.getElementById('config-som');
        const configVibracao = document.getElementById('config-vibracao');
        const configWakeLock = document.getElementById('config-wake-lock');

        const configTema = document.getElementById('config-tema');
        const configMultiEscola = document.getElementById('config-multi-escola'); // MULTI ESCOLA

        if (configSom) configSom.checked = config.som;
        if (configVibracao) configVibracao.checked = config.vibracao;
        if (configWakeLock) configWakeLock.checked = config.wakeLock;
        if (configMultiEscola) configMultiEscola.checked = config.multi_escola; // MULTI ESCOLA
    },

    // Salvar configurações
    async salvarConfig() {
        const cfg = await this._getAppConfig();

        cfg.som = document.getElementById('config-som').checked;
        cfg.vibracao = document.getElementById('config-vibracao').checked;
        cfg.wakeLock = document.getElementById('config-wake-lock').checked;
        cfg.multi_escola = document.getElementById('config-multi-escola').checked;

        await db.put('config', cfg);
        this._configCache = cfg;
        utils.mostrarToast('Configurações salvas', 'success');
    },


    // Aplicar configurações de Interface (Multi Escola)
    async aplicarConfiguracoesInterface() {
        const { multi_escola } = await this._getAppConfig();

        console.log('🔄 UI: Atualizando interface Multi-Escola:', multi_escola);

        // Elementos exclusivos multi-escola
        const multiEscolaElements = document.querySelectorAll('.multi-escola-only');
        const escolaFilter = document.getElementById('filter-escola-container');
        const filterSelect = document.getElementById('filter-escola');

        const updateVisibility = (el) => {
            if (el) {
                // 1. Classe hidden controla visibilidade (com !important no CSS)
                el.classList.toggle('hidden', !multi_escola);

                // 2. Limpar style inline original (display: none) quando ativo
                if (multi_escola) {
                    el.style.display = '';
                }
            }
        };

        // Toggle lista de elementos
        multiEscolaElements.forEach(el => updateVisibility(el));

        // Toggle elemento único
        updateVisibility(escolaFilter);

        // MULTI ESCOLA: Popularizar filtro e setup listener
        if (multi_escola) {
            escolas.renderizarDropdown('filter-escola');

            // Setup listener para filtro
            if (filterSelect) {
                // Remover listener antigo se existir para evitar duplicação ou conflitos
                filterSelect.onchange = null;

                filterSelect.onchange = () => {
                    turmas.filtrarPorEscola(filterSelect.value);
                };
            }
        } else {
            // Resetar filtro se desativado
            if (filterSelect) {
                filterSelect.value = '';
                filterSelect.onchange = null;
            }
            // Atualizar lista de turmas para mostrar tudo (sem o badge que o renderizarTurmas já trata)
            if (this.telaAtual === 'tela-turmas') {
                turmas.listar();
            }
        }
    },

    // Exportar backup
    exportarBackup() {
        exportModule.exportarBackup();
    },

    // Importar backup
    importarBackup() {
        exportModule.importarBackup();
    },

    // Limpar todos os dados
    limparTodosDados() {
        if (!utils.confirmar(
            'ATENÇÃO: Esta ação irá APAGAR TODOS OS DADOS permanentemente. Deseja continuar?'
        )) {
            return;
        }

        if (!utils.confirmar(
            'Tem CERTEZA ABSOLUTA? Esta ação NÃO PODE ser desfeita!'
        )) {
            return;
        }

        indexedDB.deleteDatabase("chamada_facil_db");
        this._configCache = null;
        utils.mostrarToast('Todos os dados foram apagados', 'success');

        setTimeout(() => {
            location.reload();
        }, 1500);
    },

    // Mostrar ajuda
    mostrarAjuda() {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Ajuda - Como Usar</h3>
                    <button class="btn-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <h4>📚 Criar Turma</h4>
                    <p>Clique no botão "+" para criar uma nova turma. Informe o nome e descrição.</p>
                    
                    <h4>👥 Adicionar Alunos</h4>
                    <p>Entre na turma e adicione alunos manualmente ou importe uma lista CSV.</p>
                    <p><strong>Formato CSV:</strong><br>Matrícula;Nome;Email (opcional)</p>
                    
                    <h4>📄 Gerar QR Codes</h4>
                    <p>Na aba "Alunos", clique em "Gerar QR Codes" para criar um PDF com os códigos de todos os alunos.</p>
                    
                    <h4>📷 Fazer Chamada</h4>
                    <p>Clique no botão da câmera para iniciar. Escaneie os QR Codes dos alunos presentes.</p>
                    
                    <h4>📊 Exportar Dados</h4>
                    <p>Após finalizar a chamada, você pode exportar como CSV ou compartilhar via WhatsApp.</p>
                    
                    <h4>💾 Backup</h4>
                    <p>Em Configurações, você pode exportar um backup completo de todos os dados.</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="this.closest('.modal').remove()">Entendi</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Remover modal ao clicar fora
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        };
    },

    // Prevenir zoom em inputs no iOS
    preventZoomOnInputs() {
        const inputs = document.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                const viewport = document.querySelector('meta[name="viewport"]');
                if (viewport) {
                    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
                }
            });

            input.addEventListener('blur', () => {
                const viewport = document.querySelector('meta[name="viewport"]');
                if (viewport) {
                    viewport.content = 'width=device-width, initial-scale=1.0';
                }
            });
        });
    },

    abrirLanding() {
        window.open('https://www.chamadafacil.net.br', '_blank');
    },

};

// Inicializar app quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', async () => {
    // Delay para animação de loading (mantido comportamento visual)
    setTimeout(async () => {
        try {
            await app.init();
        } catch (e) {
            console.error("[bootstrap] erro fatal", e);
            alert("Erro crítico ao iniciar o app: " + e.message);
        }
    }, 1000);
});

// Captura global de erros de Promise
window.addEventListener("unhandledrejection", (event) => {
    console.error("[unhandled promise]", event.reason);
});

// Service Worker para PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Descomentar quando tiver service worker
        // navigator.serviceWorker.register('/sw.js');
    });
}
