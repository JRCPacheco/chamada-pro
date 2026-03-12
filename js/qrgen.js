// ===== QR CODE GENERATOR MODULE =====
// Geração de QR Codes em PDF

const qrgen = {

    // Helper: Normalizar nome para QR (max 60 chars)
    normalizarNomeQR(nome) {
        if (!nome) return '';
        return nome.trim().slice(0, 60);
    },

    // Carregar logo para Data URL
    async carregarLogo(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => {
                console.warn('Erro ao carregar logo');
                resolve(null);
            };
            img.src = url;
        });
    },

    // Gerar PDF com QR Codes da turma
    async gerarPDFTurma(turma, alunos) {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Carregar Logo (escola ou fallback do site)
            const logoData = await utils.carregarLogoParaPDF(turma);

            // Configurações
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const cols = 4;
            const rows = 6;
            const marginX = 12;
            const firstRowY = 34;
            const bottomMargin = 12;
            const spacingX = 4;
            const spacingY = 3;
            // Calcular espaçamento horizontal para centralizar
            const contentWidth = pageWidth - (2 * marginX);
            const contentHeight = pageHeight - firstRowY - bottomMargin;
            const cellWidth = (contentWidth - (spacingX * (cols - 1))) / cols;
            const cellHeight = (contentHeight - (spacingY * (rows - 1))) / rows;
            const qrSize = Math.max(22, Math.min(cellWidth - 8, cellHeight - 12));

            let currentPage = 1;
            let currentRow = 0;
            let currentCol = 0;

            // Ordenar alunos por nome
            alunos.sort((a, b) => a.nome.localeCompare(b.nome));

            // Função helper para adicionar título da página
            const addPageTitle = () => {
                // Logo e Marca (Topo Esquerda)
                if (logoData) {
                    const logoSize = 12;
                    doc.addImage(logoData, 'PNG', 10, 10, logoSize, logoSize);

                    doc.setFontSize(14);
                    doc.setFont(undefined, 'bold');
                    doc.setTextColor(40, 40, 40);
                    doc.text('Chamada Fácil', 10 + logoSize + 2, 18);
                }

                // Título da Turma (Alinhado à Direita)
                doc.setTextColor(0, 0, 0);
                doc.setFontSize(14);
                doc.setFont(undefined, 'bold');
                doc.text(turma.nome, pageWidth - 10, 15, { align: 'right' });

                doc.setFontSize(9);
                doc.setFont(undefined, 'normal');
                // Subtítulo apenas na primeira página
                if (currentPage === 1) {
                    doc.text('QR Codes para Chamada (layout 4x6)', pageWidth - 10, 22, { align: 'right' });
                }
            };

            // Adicionar título na primeira página
            addPageTitle();

            // Container temporário OMITIDO pois nova lib gera DataURL direto

            // Loop sequencial
            for (let i = 0; i < alunos.length; i++) {
                const aluno = alunos[i];

                // Nova página se necessário (exceto para o primeiro aluno)
                if (i > 0 && currentRow >= rows) {
                    doc.addPage();
                    currentPage++;
                    currentRow = 0;
                    currentCol = 0;
                    addPageTitle();
                }

                // Calcular posição
                const cellX = marginX + (currentCol * (cellWidth + spacingX));
                const cellY = firstRowY + (currentRow * (cellHeight + spacingY));
                const x = cellX + ((cellWidth - qrSize) / 2);
                const y = cellY + 1;

                // Gerar Payload Compacto (Array)
                const nomeNormalizado = this.normalizarNomeQR(aluno.nome);
                const dados = [
                    aluno.qrId,
                    aluno.matricula,
                    nomeNormalizado
                ];

                const texto = "CF1|" + JSON.stringify(dados);

                // Proteção Overflow Extremo
                if (texto.length > 180) {
                    console.warn(`Payload muito grande para aluno ${aluno.id}: ${texto.length} chars`);
                    // Tenta truncar o nome ainda mais se necessário, ou lança erro
                    // Vamos truncar violentamente para garantir geração
                    dados[2] = dados[2].slice(0, 30);
                    // Recalcula texto
                }

                try {
                    // Gerar DataURL direto com a nova lib
                    const qrDataUrl = await QRCode.toDataURL(texto, {
                        errorCorrectionLevel: 'M',
                        margin: 1,
                        width: 256,
                        color: {
                            dark: '#000000',
                            light: '#ffffff'
                        }
                    });

                    // Adicionar QR Code ao PDF
                    doc.addImage(qrDataUrl, 'PNG', x, y, qrSize, qrSize);

                    // Adicionar nome do aluno
                    doc.setFontSize(7);
                    doc.setFont(undefined, 'bold');
                    const nomeX = cellX + (cellWidth / 2);

                    // Truncar nome se muito longo ou quebrar em linhas
                    const splitName = doc.splitTextToSize(aluno.nome || '', cellWidth - 4).slice(0, 2);
                    doc.text(splitName, nomeX, y + qrSize + 4, {
                        align: 'center'
                    });

                    // Adicionar matrícula abaixo do nome
                    const nameHeight = splitName.length * 3.2;

                    doc.setFontSize(6.2);
                    doc.setFont(undefined, 'normal');
                    doc.text(`Mat: ${aluno.matricula}`, nomeX, y + qrSize + 4 + nameHeight, {
                        align: 'center'
                    });

                    // Adicionar borda leve
                    doc.setDrawColor(220, 220, 220);
                    doc.rect(cellX, cellY, cellWidth, cellHeight);

                } catch (qrError) {
                    console.error("Erro ao gerar QR individual:", qrError);
                    doc.setFontSize(8);
                    doc.setTextColor(255, 0, 0);
                    doc.text("Erro no QR", cellX + (cellWidth / 2), cellY + (cellHeight / 2), { align: 'center' });
                    doc.setTextColor(0, 0, 0);
                }

                // Avançar posição
                currentCol++;
                if (currentCol >= cols) {
                    currentCol = 0;
                    currentRow++;
                }
            }

            // Salvar PDF
            const filename = `qrcodes_${turma.nome}.pdf`
                .replace(/[^a-z0-9.-]/gi, '_');
            doc.save(filename);
            utils.mostrarToast('PDF (4x6) gerado com sucesso!', 'success');

        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            utils.mostrarToast('Erro ao gerar PDF. Tente novamente.', 'error');
        }
    },

    // Gerar QR Code individual
    gerarQRCodeIndividual(matricula, nome) {
        // Mantem o QR individual compativel com o fluxo atual desta tela.

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <div class="modal-header">
                    <h3>QR Code - ${utils.escapeHtml(nome)}</h3>
                    <button class="btn-close" data-action="close-nearest-modal">×</button>
                </div>
                <div class="modal-body">
                    <div id="qr-individual-container" style="display: flex; justify-content: center; margin: 20px 0;">
                        <canvas id="qr-canvas"></canvas>
                    </div>
                    <p><strong>Matrícula:</strong> ${utils.escapeHtml(matricula)}</p>
                    <button class="btn btn-primary" id="btn-baixar-qr">
                        📥 Baixar Imagem
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Gerar no canvas
        const canvas = document.getElementById('qr-canvas');
        QRCode.toCanvas(canvas, matricula, {
            width: 256,
            margin: 1,
            errorCorrectionLevel: 'H'
        }, function (error) {
            if (error) console.error(error);
        });

        // Configurar botão de download
        document.getElementById('btn-baixar-qr').onclick = () => {
            this.downloadQRCodeIndividual(matricula, nome, canvas.toDataURL());
        };
    },

    // Download de QR Code individual
    downloadQRCodeIndividual(matricula, nome, dataUrl) {
        if (!dataUrl) return;
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `qrcode_${matricula}_${nome}.png`.replace(/[^a-z0-9.-]/gi, '_');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
};

