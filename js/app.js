// ===== APP MODULE =====
// Controle principal da aplicaÃ§Ã£o

const app = {

    telaAtual: null,

    // Flag de inicializaÃ§Ã£o
    _initRunning: false,
    _configCache: null, // Cache de configuraÃ§Ã£o
    _declarativeEventsBound: false,

    _getAppVersionLabel() {
        try {
            if (typeof APP_META !== 'undefined' && APP_META && typeof APP_META.label === 'string' && APP_META.label.trim()) {
                return APP_META.label.trim();
            }
            if (typeof APP_META !== 'undefined' && APP_META && typeof APP_META.version === 'string') {
                const stage = APP_META.stage ? `-${APP_META.stage}` : '';
                return `v${APP_META.version}${stage}`;
            }
        } catch (_) { }
        return 'v0.0.0-dev';
    },

    aplicarVersaoApp() {
        const versao = this._getAppVersionLabel();
        document.querySelectorAll('[data-app-version]').forEach((el) => {
            el.textContent = versao;
        });
    },

    _handleDeclarativeAction(action, el) {
        switch (action) {
            case 'app-concluir-onboarding': return this.concluirOnboarding(true);
            case 'close-modal': return this.fecharModal(el.dataset.modalId);
            case 'close-nearest-modal': return el.closest('.modal')?.remove();
            case 'app-voltar-para-turma': return this.voltarParaTurma();
            case 'app-salvar-professor': return this.salvarNomeProfessor();
            case 'app-remover-professor': return this.removerNomeProfessor();
            case 'app-exportar-backup': return this.exportarBackup();
            case 'app-importar-backup': return this.importarBackup();
            case 'app-limpar-dados': return this.limparTodosDados();
            case 'app-abrir-sobre': return this.abrirSobre();
            case 'menu-ir-turmas': this.mostrarTela('tela-turmas'); return this.fecharModal('modal-menu');
            case 'menu-ir-config': this.mostrarTela('tela-config'); return this.fecharModal('modal-menu');
            case 'menu-exportar-backup': this.exportarBackup(); return this.fecharModal('modal-menu');
            case 'menu-abrir-ajuda': this.mostrarAjuda(); return this.fecharModal('modal-menu');
            case 'turmas-mostrar-nova': return turmas.mostrarModalNovaTurma();
            case 'turmas-abrir-gerenciar': return turmas.abrirModalGerenciarTurmas();
            case 'turmas-editar-atual': return turmas.editarTurma(turmas.turmaAtual?.id);
            case 'turmas-exportar-backup-atual': return turmas.exportarBackupTurmaAtual();
            case 'turmas-recuperar-backup-atual': return turmas.recuperarBackupTurmaAtual();
            case 'turmas-recuperar-backup-global': return turmas.recuperarBackupTurmaGlobal();
            case 'turmas-toggle-selecao-gerenciar': return turmas.alternarSelecaoGerenciarTurmas();
            case 'turmas-toggle-item-selecao-gerenciar': return turmas.alternarSelecaoItemGerenciarTurmas(el.dataset.turmaId);
            case 'turmas-selecionar-todas-gerenciar': return turmas.alternarSelecionarTodasGerenciarTurmas();
            case 'turmas-excluir-selecionadas-gerenciar': return turmas.excluirSelecionadasGerenciarTurmas();
            case 'turmas-cancelar-selecao-gerenciar': return turmas.cancelarSelecaoGerenciarTurmas();
            case 'turmas-abrir-item-gerenciar': return turmas.abrirItemGerenciarTurmas(el.dataset.turmaId);
            case 'turmas-editar-item-gerenciar': return turmas.editarItemGerenciarTurmas(el.dataset.turmaId);
            case 'turmas-exportar-item-gerenciar': return turmas.exportarItemGerenciarTurmas(el.dataset.turmaId);
            case 'turmas-excluir-item-gerenciar': return turmas.excluirItemGerenciarTurmas(el.dataset.turmaId);
            case 'turmas-excluir-atual': return turmas.excluirTurma(turmas.turmaAtual?.id);
            case 'turmas-salvar-nova': return turmas.salvarNovaTurma();
            case 'turmas-salvar-edicao': return turmas.salvarEdicaoTurma();
            case 'alunos-mostrar-novo': return alunos.mostrarModalNovoAluno();
            case 'alunos-importar-csv': return alunos.importarCSV();
            case 'alunos-gerar-qr-pdf': return alunos.gerarQRCodesPDF();
            case 'alunos-cancelar-modal': alunos.resetarPreviewFoto(); return this.fecharModal('modal-novo-aluno');
            case 'alunos-escolher-fonte-foto': return alunos.escolherFonteFoto();
            case 'alunos-ler-qr-existente': return alunos.lerQrExistente();
            case 'alunos-abrir-evento-ponto': return alunos.abrirModalEventoPonto();
            case 'alunos-toggle-obs': return alunos.toggleObsVisibilidade();
            case 'alunos-salvar': return alunos.salvarNovoAluno();
            case 'alunos-foto-camera': return alunos.escolherFotoPelaCamera();
            case 'alunos-foto-dispositivo': return alunos.escolherFotoDoDispositivo();
            case 'alunos-salvar-evento-ponto': return alunos.salvarEventoPonto();
            case 'alunos-editar-evento-ponto': return alunos.editarEventoPonto(el.dataset.eventoId);
            case 'alunos-excluir-evento-ponto': return alunos.excluirEventoPonto(el.dataset.eventoId);
            case 'escolas-mostrar-gerenciar': return escolas.mostrarModalGerenciar();
            case 'escolas-adicionar': return escolas.adicionarEscola();
            case 'escolas-click-foto-nova': return document.getElementById('input-escola-foto-nova')?.click();
            case 'escolas-remover-foto-nova': return escolas.removerFotoNova();
            case 'escolas-click-foto-editar': return document.getElementById('input-escola-foto-editar')?.click();
            case 'escolas-remover-foto-editar': return escolas.removerFotoEditar();
            case 'escolas-salvar-edicao': return escolas.salvarEdicaoEscola();
            case 'escolas-abrir-editar-item': return escolas.abrirModalEditar(el.dataset.escolaId);
            case 'escolas-excluir-item': return escolas.excluirEscola(el.dataset.escolaId);
            case 'chamadas-exportar-historico': return chamadas.exportarHistorico();
            case 'chamadas-toggle-selecao': return chamadas.alternarModoSelecaoHistorico();
            case 'chamadas-selecionar-todas': return chamadas.alternarSelecionarTodasHistorico();
            case 'chamadas-excluir-selecionadas': return chamadas.excluirChamadasSelecionadas();
            case 'chamadas-cancelar-selecao': return chamadas.cancelarModoSelecaoHistorico();
            case 'chamadas-abrir-relatorios': return chamadas.abrirModalRelatorios();
            case 'chamadas-toggle-tabela': return chamadas.toggleTabelaMensal();
            case 'chamadas-compartilhar': return chamadas.compartilhar();
            case 'chamadas-exportar-csv': return chamadas.exportarCSV();
            case 'chamadas-exportar-relatorio-csv': return chamadas.exportarRelatorioMensalCSV();
            case 'chamadas-exportar-relatorio-pdf': return chamadas.exportarRelatorioMensalPDF();
            case 'chamadas-gerar-pontos-pdf': return chamadas.gerarRelatorioPontosPDF();
            case 'scanner-iniciar': return scanner.iniciarChamada(turmas.turmaAtual?.id);
            case 'scanner-fechar-overlay': return scanner.fecharOverlay();
            default: return;
        }
    },

    _handleDeclarativeChange(action, el) {
        switch (action) {
            case 'turmas-segundo-horario': return turmas.alterarSegundoHorarioDetalhe(el);
            case 'alunos-processar-foto': return alunos.processarFoto(el.files?.[0]);
            case 'escolas-processar-foto-nova': return escolas.processarFotoNova(el.files?.[0]);
            case 'escolas-processar-foto-editar': return escolas.processarFotoEditar(el.files?.[0]);
            default: return;
        }
    },

    setupDeclarativeEvents() {
        if (this._declarativeEventsBound) return;
        this._declarativeEventsBound = true;

        document.addEventListener('click', (event) => {
            const overlay = event.target.closest('[data-overlay-close]');
            if (overlay && event.target === overlay) {
                this.fecharModal(overlay.dataset.overlayClose);
                return;
            }

            const target = event.target.closest('[data-action]');
            if (!target) return;
            this._handleDeclarativeAction(target.dataset.action, target, event);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const target = event.target.closest('[data-action][role="button"]');
            if (!target) return;
            event.preventDefault();
            this._handleDeclarativeAction(target.dataset.action, target, event);
        });

        document.addEventListener('change', (event) => {
            const target = event.target.closest('[data-change]');
            if (!target) return;
            this._handleDeclarativeChange(target.dataset.change, target);
        });
    },

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
        } else {
            // MigraÃ§Ã£o leve para incluir novas chaves sem quebrar configs antigas
            let changed = false;
            Object.keys(CONFIG_DEFAULTS.app).forEach((k) => {
                if (cfg[k] === undefined) {
                    cfg[k] = CONFIG_DEFAULTS.app[k];
                    changed = true;
                }
            });
            if (changed) {
                await db.put('config', cfg);
            }
        }

        this._configCache = cfg;
        return cfg;
    },

    // Inicializar aplicaÃ§Ã£o
    async init() {
        if (this._initRunning) {
            console.warn("[app] init jÃ¡ em execuÃ§Ã£o");
            return;
        }
        this._initRunning = true;
        console.log("[app] init start");
        this.aplicarVersaoApp();

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
            console.log('[LAPIDAÃ‡ÃƒO] Restaurando Ãºltima turma aberta:', ultimaTurmaId);
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
        // Esconder loading e onboarding
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('onboarding-screen').style.display = 'none';

        // Mostrar app
        document.getElementById('app').style.display = 'block';

        // Carregar turmas
        this.mostrarTela('tela-turmas');
        turmas.listar();
    },

    _normalizarNomeProfessor(nome) {
        return String(nome || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    },

    _normalizarNomeEscola(nome) {
        return String(nome || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    },

    async _salvarEscolaInicialObrigatoria() {
        const inputEscola = document.getElementById('onboarding-escola-nome');
        const nomeEscola = this._normalizarNomeEscola(inputEscola ? inputEscola.value : '');

        if (!nomeEscola) {
            utils.mostrarToast('Informe o nome da escola para continuar', 'warning');
            if (inputEscola) inputEscola.focus();
            return false;
        }

        const escolaDefault = await db.get('escolas', 'default');
        const escola = {
            id: 'default',
            nome: nomeEscola,
            criadoEm: escolaDefault?.criadoEm || new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
            foto: escolaDefault?.foto || null
        };

        await db.put('escolas', escola);
        return true;
    },

    async concluirOnboarding(salvarNome = true) {
        const escolaOk = await this._salvarEscolaInicialObrigatoria();
        if (!escolaOk) return;

        const cfg = await this._getAppConfig();
        cfg.onboarding_done = true;

        if (salvarNome) {
            const input = document.getElementById('onboarding-professor-nome');
            cfg.professor_nome = this._normalizarNomeProfessor(input ? input.value : '');
        }

        await db.put('config', cfg);
        this._configCache = cfg;
        await this.iniciarApp();
    },

    // Mostrar tela especÃ­fica
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

            // Garante dados mais recentes ao abrir ConfiguraÃ§Ãµes
            if (telaId === 'tela-config') {
                this.carregarConfig().catch((e) => console.error('Erro ao carregar configuraÃ§Ãµes:', e));
            }

            // Scroll para o topo
            window.scrollTo(0, 0);
        }
    },

    // Atualizar header baseado na tela
    atualizarHeader(telaId) {
        const headerTitle = document.getElementById('header-title');
        const btnBack = document.getElementById('btn-back');
        const header = document.querySelector('.app-header');

        if (telaId === 'tela-turmas') {
            header.classList.add('tela-principal');
        } else {
            header.classList.remove('tela-principal');
        }

        switch (telaId) {
            case 'tela-turmas':
                btnBack.style.display = 'none';
                break;
            case 'tela-turma-detalhe':
                // TÃ­tulo jÃ¡ foi definido ao abrir detalhes
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

    // Voltar para turma apÃ³s finalizar chamada
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
        this.setupDeclarativeEvents();

        // BotÃ£o voltar
        const btnBack = document.getElementById('btn-back');
        if (btnBack) {
            btnBack.onclick = () => this.voltar();
        }

        // BotÃ£o menu
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

        // ConfiguraÃ§Ãµes
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
        // Atualizar botÃµes
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            }
        });

        // Atualizar conteÃºdo
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

    // Setup de listeners de configuraÃ§Ãµes
    async setupConfigListeners() {
        const configSom = document.getElementById('config-som');
        const configVibracao = document.getElementById('config-vibracao');
        const configWakeLock = document.getElementById('config-wake-lock');
        const configTema = document.getElementById('config-tema');
        const configMultiEscola = document.getElementById('config-multi-escola');
        const configProfessorNome = document.getElementById('config-professor-nome');

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
        if (configProfessorNome) {
            configProfessorNome.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.salvarNomeProfessor();
                }
            });
        }

        // Carregar configuraÃ§Ãµes
        await this.carregarConfig();
    },

    // Carregar configuraÃ§Ãµes
    async carregarConfig() {
        const config = await this._getAppConfig();

        const configSom = document.getElementById('config-som');
        const configVibracao = document.getElementById('config-vibracao');
        const configWakeLock = document.getElementById('config-wake-lock');

        const configTema = document.getElementById('config-tema');
        const configMultiEscola = document.getElementById('config-multi-escola'); // MULTI ESCOLA
        const configProfessorNome = document.getElementById('config-professor-nome');

        if (configSom) configSom.checked = config.som;
        if (configVibracao) configVibracao.checked = config.vibracao;
        if (configWakeLock) configWakeLock.checked = config.wakeLock;
        if (configMultiEscola) configMultiEscola.checked = config.multi_escola; // MULTI ESCOLA
        if (configProfessorNome) configProfessorNome.value = config.professor_nome || '';
    },

    // Salvar configuraÃ§Ãµes
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

    async salvarNomeProfessor() {
        const input = document.getElementById('config-professor-nome');
        if (!input) return;

        const cfg = await this._getAppConfig();
        cfg.professor_nome = this._normalizarNomeProfessor(input.value);
        input.value = cfg.professor_nome;

        await db.put('config', cfg);
        this._configCache = cfg;
        utils.mostrarToast('Nome do professor salvo', 'success');
    },

    async removerNomeProfessor() {
        const cfg = await this._getAppConfig();
        if (!cfg.professor_nome) {
            utils.mostrarToast('Nenhum nome salvo', 'warning');
            return;
        }

        cfg.professor_nome = '';
        await db.put('config', cfg);
        this._configCache = cfg;

        const input = document.getElementById('config-professor-nome');
        if (input) input.value = '';
        utils.mostrarToast('Nome do professor removido', 'success');
    },


    // Aplicar configuraÃ§Ãµes de Interface (Multi Escola)
    async aplicarConfiguracoesInterface() {
        const { multi_escola } = await this._getAppConfig();

        console.log('?? UI: Atualizando interface Multi-Escola:', multi_escola);

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

        // Toggle elemento Ãºnico
        updateVisibility(escolaFilter);

        // MULTI ESCOLA: Popularizar filtro e setup listener
        if (multi_escola) {
            await escolas.renderizarDropdown('filter-escola');

            // Setup listener para filtro
            if (filterSelect) {
                const escolaPreferencialId = await escolas.obterEscolaPreferencialId();
                if (!filterSelect.value && escolaPreferencialId) {
                    filterSelect.value = escolaPreferencialId;
                }

                // Remover listener antigo se existir para evitar duplicaÃ§Ã£o ou conflitos
                filterSelect.onchange = null;

                filterSelect.onchange = () => {
                    turmas.filtrarPorEscola(filterSelect.value);
                };

                // Menos cliques: ao ativar multi-escola, inicia filtrando pela escola padrÃ£o.
                await turmas.filtrarPorEscola(filterSelect.value || escolaPreferencialId || '');
            }
        } else {
            // Resetar filtro se desativado
            if (filterSelect) {
                filterSelect.value = '';
                filterSelect.onchange = null;
            }
            // Atualizar lista de turmas para mostrar tudo (sem o badge que o renderizarTurmas jÃ¡ trata)
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
            <div class=\"modal-content\">
                <div class=\"modal-header\">
                    <h3>Ajuda - Como Usar</h3>
                    <button class=\"btn-close\" data-action=\"close-nearest-modal\">&times;</button>
                </div>
                <div class=\"modal-body\">
                    <h4><span class=\"icon-inline\" aria-hidden=\"true\"><svg class=\"icon-svg icon-16\" viewBox=\"0 0 24 24\"><path d=\"M4 19.5A2.5 2.5 0 0 1 6.5 17H20\"/><path d=\"M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z\"/></svg></span>Criar Turma</h4>
                    <p>Clique em \"Adicionar turma\" para criar uma nova turma. Informe nome, descrição e escola (quando multi-escola estiver ativo).</p>

                    <h4><span class=\"icon-inline\" aria-hidden=\"true\"><svg class=\"icon-svg icon-16\" viewBox=\"0 0 24 24\"><path d=\"M3 10.5 12 4l9 6.5\"/><path d=\"M5 10v9h14v-9\"/><path d=\"M9 19v-5h6v5\"/><path d=\"M9 10h.01\"/><path d=\"M15 10h.01\"/></svg></span>Gerenciar Escolas</h4>
                    <p>No Menu, use \"Gerenciar Escolas\" para cadastrar ou editar escolas e definir logo. As turmas podem ser vinculadas a uma escola.</p>

                    <h4><span class=\"icon-inline\" aria-hidden=\"true\"><svg class=\"icon-svg icon-16\" viewBox=\"0 0 24 24\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"3\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><path d=\"M16 3.13a3 3 0 0 1 0 5.75\"/></svg></span>Adicionar Alunos</h4>
                    <p>Entre na turma e adicione alunos manualmente ou importe uma planilha CSV. Use também \"Baixar modelo de planilha\" para evitar erros.</p>
                    <p><strong>Formato CSV:</strong><br>Matrícula;Nome;Email (opcional)</p>

                    <h4><span class=\"icon-inline\" aria-hidden=\"true\"><svg class=\"icon-svg icon-16\" viewBox=\"0 0 24 24\"><path d=\"M8 2h8\"/><path d=\"M9 2v2\"/><path d=\"M15 2v2\"/><rect x=\"4\" y=\"4\" width=\"16\" height=\"18\" rx=\"2\"/><path d=\"M8 11h8\"/><path d=\"M8 15h5\"/></svg></span>Diário de Classe</h4>
                    <p>Na aba \"Diário de Classe\", acompanhe o histórico mensal de chamadas da turma. Você pode abrir detalhes, exportar histórico e gerenciar registros.</p>

                    <h4><span class=\"icon-inline\" aria-hidden=\"true\"><svg class=\"icon-svg icon-16\" viewBox=\"0 0 24 24\"><path d=\"M12 6v6l4 2\"/><circle cx=\"12\" cy=\"12\" r=\"9\"/></svg></span>Segundo Horário</h4>
                    <p>Ative \"Segundo horário\" na turma para permitir até 2 chamadas no mesmo dia.</p>

                    <h4><span class=\"icon-inline\" aria-hidden=\"true\"><svg class=\"icon-svg icon-16\" viewBox=\"0 0 24 24\"><path d=\"M4 4h6v6H4z\"/><path d=\"M14 4h6v6h-6z\"/><path d=\"M4 14h6v6H4z\"/><path d=\"M14 14h2\"/><path d=\"M18 14h2\"/><path d=\"M14 18h2\"/><path d=\"M18 18h2\"/></svg></span>Gerar QR Codes</h4>
                    <p>Na aba \"Alunos\", clique em \"Gerar QR Codes\" para criar um PDF com os códigos dos alunos.</p>

                    <h4><span class=\"icon-inline\" aria-hidden=\"true\"><svg class=\"icon-svg icon-16\" viewBox=\"0 0 24 24\"><path d=\"M4 4h6v6H4z\"/><path d=\"M14 4h6v6h-6z\"/><path d=\"M4 14h6v6H4z\"/><path d=\"M14 14h2\"/><path d=\"M18 14h2\"/><path d=\"M14 18h2\"/><path d=\"M18 18h2\"/></svg></span>Fazer Chamada</h4>
                    <p>Use o botão \"Chamada\" no canto superior direito da turma. Escaneie os QR Codes dos alunos presentes e finalize ao concluir.</p>

                    <h4><span class=\"icon-inline\" aria-hidden=\"true\"><svg class=\"icon-svg icon-16\" viewBox=\"0 0 24 24\"><path d=\"M3 3v18h18\"/><rect x=\"7\" y=\"10\" width=\"3\" height=\"6\"/><rect x=\"12\" y=\"7\" width=\"3\" height=\"9\"/><rect x=\"17\" y=\"5\" width=\"3\" height=\"11\"/></svg></span>Exportações e Relatórios</h4>
                    <p>Após finalizar, você pode compartilhar, exportar CSV e gerar relatórios (CSV/PDF).</p>

                    <h4><span class=\"icon-inline\" aria-hidden=\"true\"><svg class=\"icon-svg icon-16\" viewBox=\"0 0 24 24\"><path d=\"M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z\"/><path d=\"M3 8.5V16l9 4 9-4V8.5\"/><path d=\"M12 13v7\"/></svg></span>Backup e Recuperação</h4>
                    <p>Em Configurações, exporte backup completo da base. Também é possível recuperar backup para restaurar dados.</p>
                </div>
                <div class=\"modal-footer\">
                    <button class=\"btn btn-primary\" data-action=\"close-nearest-modal\">Entendi</button>
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
    // Evitar zoom automÃ¡tico no iOS sem bloquear acessibilidade de zoom global
    preventZoomOnInputs() {
        const inputs = document.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            const tamanhoFonte = Number.parseFloat(window.getComputedStyle(input).fontSize) || 0;
            if (tamanhoFonte < 16) {
                input.style.fontSize = '16px';
            }
        });
    },

    abrirLanding() {
        window.open('https://www.chamadafacil.net.br', '_blank', 'noopener,noreferrer');
    },

};

// Inicializar app quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', async () => {
    // Delay para animaÃ§Ã£o de loading (mantido comportamento visual)
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
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                let refreshTriggered = false;
                const avisarAtualizacao = (worker) => {
                    if (typeof utils !== 'undefined' && typeof utils.mostrarToast === 'function') {
                        utils.mostrarToast('Nova versao disponivel. Recarregue para atualizar.', 'info', 5000);
                    } else {
                        console.log('[sw] nova versao disponivel');
                    }

                    if (!worker) return;

                    const atualizarAgora = confirm('Nova versao disponivel. Atualizar agora?');
                    if (atualizarAgora) {
                        worker.postMessage({ type: 'SKIP_WAITING' });
                    }
                };

                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (refreshTriggered) return;
                    refreshTriggered = true;
                    window.location.reload();
                });

                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (!newWorker) return;

                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            avisarAtualizacao(newWorker);
                        }
                    });
                });

                // Busca atualizaÃ§Ã£o apÃ³s registrar, sem interromper usuÃ¡rio.
                registration.update().catch(() => { });

                setInterval(() => {
                    registration.update().catch(() => { });
                }, 60 * 60 * 1000);

                if (registration.waiting) {
                    avisarAtualizacao(registration.waiting);
                };
            })
            .catch((error) => {
                console.error('[sw] falha ao registrar:', error);
            });
    });
}


