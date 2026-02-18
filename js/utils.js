// ===== UTILS MODULE =====
// Funções utilitárias e helpers

const utils = {


    // Gerar UUID seguro (RFC4122 v4)
    uuid() {
        // Preferir crypto.randomUUID nativo (mais seguro)
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }

        // Fallback: UUID v4 manual (RFC4122 compliant)
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    // DEPRECATED: Usar uuid() para novos IDs
    // Mantido apenas para compatibilidade com código legacy
    gerarId() {
        return this.uuid();
    },


    // Formatar data
    formatarData(data) {
        const d = new Date(data);
        return d.toLocaleDateString('pt-BR');
    },

    // Formatar data e hora
    formatarDataHora(data) {
        const d = new Date(data);
        return d.toLocaleString('pt-BR');
    },

    // Formatar hora
    formatarHora(data) {
        const d = new Date(data);
        return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    },

    // Obter iniciais do nome
    getIniciais(nome) {
        if (!nome) return '??';
        const partes = nome.trim().split(' ');
        if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
        return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
    },

    // Gerar cor aleatória baseada em string
    getCorFromString(str) {
        if (!str) return '#4A90E2';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const cores = [
            '#4A90E2', '#E74C3C', '#2ECC71', '#F39C12',
            '#9B59B6', '#1ABC9C', '#E67E22', '#3498DB',
            '#16A085', '#27AE60', '#8E44AD', '#C0392B'
        ];
        return cores[Math.abs(hash) % cores.length];
    },

    // Ajustar brilho da cor (HEX)
    adjustColor(color, amount) {
        return '#' + color.replace(/^#/, '').replace(/../g, color => ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
    },

    // Mostrar toast notification
    mostrarToast(mensagem, tipo = 'info', duracao = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        toast.textContent = mensagem;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastIn 0.3s ease-out reverse';
            setTimeout(() => {
                container.removeChild(toast);
            }, 300);
        }, duracao);
    },

    // Vibrar dispositivo
    vibrar(padrao = [100]) {
        // Acessar cache de config do app (se carregado)
        // Se app não estiver pronto, assume defaults (true)
        const config = (typeof app !== 'undefined' && app._configCache) ? app._configCache : { vibracao: true };

        if (config.vibracao && navigator.vibrate) {
            navigator.vibrate(padrao);
        }
    },

    // Tocar som de confirmação
    tocarSom(tipo = 'success') {
        const config = (typeof app !== 'undefined' && app._configCache) ? app._configCache : { som: true };

        if (!config.som) return;

        // Criar som usando Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        if (tipo === 'success') {
            oscillator.frequency.value = 800;
            gainNode.gain.value = 0.3;
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } else if (tipo === 'error') {
            oscillator.frequency.value = 200;
            gainNode.gain.value = 0.3;
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
        }
    },

    // Confirmar ação
    confirmar(mensagem) {
        return confirm(mensagem);
    },

    // Sanitizar string para usar como ID
    sanitizeId(str) {
        return str.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    },

    // Copiar para clipboard
    copiarParaClipboard(texto) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(texto)
                .then(() => this.mostrarToast('Copiado para área de transferência', 'success'))
                .catch(() => this.mostrarToast('Erro ao copiar', 'error'));
        } else {
            // Fallback para navegadores antigos
            const textarea = document.createElement('textarea');
            textarea.value = texto;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                this.mostrarToast('Copiado para área de transferência', 'success');
            } catch (err) {
                this.mostrarToast('Erro ao copiar', 'error');
            }
            document.body.removeChild(textarea);
        }
    },

    // Debounce
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Validar email
    validarEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    // Escapar HTML
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    },

    // Calcular percentual
    calcularPercentual(parte, total) {
        if (total === 0) return 0;
        return Math.round((parte / total) * 100);
    },

    // Filtrar array por busca
    filtrarPorBusca(array, busca, campos) {
        if (!busca || busca.trim() === '') return array;

        const termo = busca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        return array.filter(item => {
            return campos.some(campo => {
                const valor = item[campo];
                if (!valor) return false;
                return valor.toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .includes(termo);
            });
        });
    },

    // Download de arquivo
    downloadFile(filename, content, type = 'text/plain') {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // Compartilhar (Web Share API)
    async compartilhar(dados) {
        if (navigator.share) {
            try {
                await navigator.share(dados);
                return true;
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Erro ao compartilhar:', error);
                }
                return false;
            }
        } else {
            this.mostrarToast('Compartilhamento não suportado neste navegador', 'warning');
            return false;
        }
    },

    // Ordenar array por campo
    ordenar(array, campo, ordem = 'asc') {
        return array.sort((a, b) => {
            const valorA = a[campo];
            const valorB = b[campo];

            if (valorA < valorB) return ordem === 'asc' ? -1 : 1;
            if (valorA > valorB) return ordem === 'asc' ? 1 : -1;
            return 0;
        });
    },

    // Formatar número de telefone
    formatarTelefone(tel) {
        const cleaned = tel.replace(/\D/g, '');
        if (cleaned.length === 11) {
            return `(${cleaned.substr(0, 2)}) ${cleaned.substr(2, 5)}-${cleaned.substr(7)}`;
        } else if (cleaned.length === 10) {
            return `(${cleaned.substr(0, 2)}) ${cleaned.substr(2, 4)}-${cleaned.substr(6)}`;
        }
        return tel;
    },

    // Parsear CSV
    parseCSV(csvText) {
        const lines = csvText.split('\n').filter(line => line.trim());
        const result = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(/[;,\t]/).map(v => v.trim());
            if (values.length >= 2) {
                result.push({
                    matricula: values[0],
                    nome: values[1],
                    email: values[2] || ''
                });
            }
        }

        return result;
    },

    // Gerar CSV
    gerarCSV(dados, colunas) {
        let csv = '\uFEFF'; // BOM para UTF-8

        // Cabeçalho
        csv += colunas.map(c => c.label).join(';') + '\n';

        // Dados
        dados.forEach(item => {
            const linha = colunas.map(c => {
                const valor = item[c.field] || '';
                return `"${valor.toString().replace(/"/g, '""')}"`;
            });
            csv += linha.join(';') + '\n';
        });

        return csv;
    },

    // Calcular faltas mensais do aluno
    calcularFaltasMensais(chamadas, matricula, mes = null, ano = null) {
        const agora = new Date();
        const mesAtual = mes !== null ? mes : agora.getMonth();
        const anoAtual = ano !== null ? ano : agora.getFullYear();

        let faltasCount = 0;

        chamadas.forEach(chamada => {
            // Proteção contra estrutura inesperada
            if (!Array.isArray(chamada.presencas)) return;

            const dataChamada = new Date(chamada.data);

            // Verificar se é do mês/ano solicitado
            if (dataChamada.getMonth() === mesAtual && dataChamada.getFullYear() === anoAtual) {
                // Procurar presença do aluno nesta chamada
                const presencaAluno = chamada.presencas.find(p => p.matricula === matricula);

                // Compatibilidade com registros antigos
                const status = presencaAluno?.status || 'P';

                // Contar apenas se status === 'F' (falta)
                if (status === 'F') {
                    faltasCount++;
                }
            }
        });

        return faltasCount;
    },

    // Gerar ID único para QR Code
    gerarQrId() {
        return "qr_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },

    // Carregar logo para PDF: usa foto da escola (se tiver) ou fallback do site
    async carregarLogoParaPDF(turma) {
        try {
            // turma pode ser um objeto turma ou ter escolaId
            if (turma && turma.escolaId) {
                const escola = await db.get('escolas', turma.escolaId);
                if (escola && escola.foto) {
                    return escola.foto; // já é base64
                }
            }
        } catch (e) {
            console.warn('Erro ao buscar logo da escola, usando padrão:', e);
        }
        // Fallback: logo do site
        return qrgen.carregarLogo('assets/logo1024.svg');
    }
};
