// ===== APP MODULE =====
// Controle principal da aplicação

const app = {

    telaAtual: null,

    // Inicializar aplicação
    init() {
        // Verificar primeira vez
        if (storage.isFirstTime()) {
            this.mostrarOnboarding();
        } else {
            this.iniciarApp();
        }

        // Setup de event listeners
        this.setupEventListeners();

        // Aplicar tema
        this.aplicarTema();

        // Aplicar configurações de Interface (Multi Escola)
        this.aplicarConfiguracoesInterface();

        // Restaurar estado anterior (Turma Aberta)
        this.restaurarEstado();
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
    iniciarApp() {
        // Marcar onboarding como completo
        storage.completeOnboarding();

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
    setupEventListeners() {
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
        this.setupConfigListeners();

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

    // Setup de listeners de configurações
    setupConfigListeners() {
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
        if (configTema) {
            configTema.onchange = () => {
                this.salvarConfig();
                this.aplicarTema();
            };
        }
        if (configMultiEscola) {
            configMultiEscola.onchange = () => {
                this.salvarConfig();
                this.aplicarConfiguracoesInterface();
            };
        }

        // Carregar configurações
        this.carregarConfig();
    },

    // Carregar configurações
    carregarConfig() {
        const config = storage.getConfig();

        const configSom = document.getElementById('config-som');
        const configVibracao = document.getElementById('config-vibracao');
        const configWakeLock = document.getElementById('config-wake-lock');

        const configTema = document.getElementById('config-tema');
        const configMultiEscola = document.getElementById('config-multi-escola'); // MULTI ESCOLA

        if (configSom) configSom.checked = config.som;
        if (configVibracao) configVibracao.checked = config.vibracao;
        if (configWakeLock) configWakeLock.checked = config.wakeLock;
        if (configTema) configTema.value = config.tema;
        if (configMultiEscola) configMultiEscola.checked = config.multi_escola; // MULTI ESCOLA
    },

    // Salvar configurações
    salvarConfig() {
        const config = {
            som: document.getElementById('config-som').checked,
            vibracao: document.getElementById('config-vibracao').checked,
            wakeLock: document.getElementById('config-wake-lock').checked,
            tema: document.getElementById('config-tema').value,
            multi_escola: document.getElementById('config-multi-escola').checked // MULTI ESCOLA
        };

        storage.saveConfig(config);
        utils.mostrarToast('Configurações salvas', 'success');
    },

    // Aplicar tema
    aplicarTema() {
        const config = storage.getConfig();
        let tema = config.tema;

        if (tema === 'auto') {
            tema = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add(`theme-${tema}`);
    },

    // Aplicar configurações de Interface (Multi Escola)
    aplicarConfiguracoesInterface() {
        const { multi_escola } = storage.getConfig();

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

        storage.clear();
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
                    <button class="btn-close" onclick="this.remove()">×</button>
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
    }
};

// Inicializar app quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    // Delay para animação de loading
    setTimeout(() => {
        app.init();
    }, 1000);
});

// Service Worker para PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Descomentar quando tiver service worker
        // navigator.serviceWorker.register('/sw.js');
    });
}
