// ===== QR CODE GENERATOR MODULE =====
// Geração de QR Codes em PDF

const qrgen = {

    // Gerar PDF com QR Codes da turma
    async gerarPDFTurma(turma, alunos) {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Configurações
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 20;
            const qrSize = 55;
            const cols = 2;
            const rows = 3;
            // Calcular espaçamento horizontal para centralizar
            const contentWidth = (cols * qrSize);
            const remainingSpaceX = pageWidth - (2 * margin) - contentWidth;
            const spacingX = remainingSpaceX / (cols - 1);

            const spacingY = 18;

            let currentPage = 1;
            let currentRow = 0;
            let currentCol = 0;

            // Ordenar alunos por nome
            alunos.sort((a, b) => a.nome.localeCompare(b.nome));

            // Função helper para adicionar título da página
            const addPageTitle = () => {
                doc.setFontSize(16);
                doc.setFont(undefined, 'bold');
                doc.text(turma.nome, pageWidth / 2, 15, { align: 'center' });
                doc.setFontSize(10);
                doc.setFont(undefined, 'normal');
                if (currentPage === 1) {
                    doc.text('QR Codes para Chamada', pageWidth / 2, 22, { align: 'center' });
                }
            };

            // Adicionar título na primeira página
            addPageTitle();

            // Container temporário para QR Code
            const qrContainer = document.createElement('div');
            qrContainer.style.display = 'none';
            document.body.appendChild(qrContainer);

            // Loop sequencial usando for...of para permitir await
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
                // Se só tem 1 coluna, centraliza. Se mais, usa o spacing calculado
                let x;
                if (cols === 1) {
                    x = (pageWidth - qrSize) / 2;
                } else {
                    x = margin + (currentCol * (qrSize + spacingX));
                }

                const y = 35 + (currentRow * (qrSize + spacingY));

                // Gerar QR Code e aguardar
                await new Promise((resolve) => {
                    // Limpar container anterior
                    qrContainer.innerHTML = '';

                    const nomeCurto = (aluno.nome || '')
                        .replace(/\s+/g, ' ')
                        .trim()
                        .slice(0, 24);

                    const dados = {
                        v: 1,
                        id: aluno.qrId,
                        m: aluno.matricula,
                        n: nomeCurto
                    };

                    const payload = "CF1|" + JSON.stringify(dados);

                    const qrCode = new QRCode(qrContainer, {
                        text: payload,
                        width: 160,
                        height: 160,
                        colorDark: '#000000',
                        colorLight: '#ffffff',
                        correctLevel: QRCode.CorrectLevel.L
                    });

                    // Pequeno delay para garantir que o canvas foi desenhado
                    setTimeout(() => {
                        const canvas = qrContainer.querySelector('canvas');
                        if (canvas) {
                            const qrDataUrl = canvas.toDataURL('image/png');

                            // Adicionar QR Code ao PDF
                            doc.addImage(qrDataUrl, 'PNG', x, y, qrSize, qrSize);

                            // Adicionar nome do aluno
                            doc.setFontSize(9);
                            doc.setFont(undefined, 'bold');
                            const nomeX = x + (qrSize / 2);

                            // Truncar nome se muito longo ou quebrar em linhas
                            const splitName = doc.splitTextToSize(aluno.nome, qrSize + 10);
                            doc.text(splitName, nomeX, y + qrSize + 5, {
                                align: 'center'
                            });

                            // Adicionar matrícula abaixo do nome
                            // Ajustar Y baseado na altura do nome (pode ter múltiplas linhas)
                            const nameHeight = splitName.length * 4; // aprox 4mm por linha

                            doc.setFontSize(7);
                            doc.setFont(undefined, 'normal');
                            doc.text(`Mat: ${aluno.matricula}`, nomeX, y + qrSize + 5 + nameHeight, {
                                align: 'center'
                            });

                            // Adicionar borda leve
                            doc.setDrawColor(220, 220, 220); // Cinza bem claro
                            doc.rect(x - 3, y - 3, qrSize + 6, qrSize + 10 + nameHeight);
                        }
                        resolve();
                    }, 50); // 50ms é suficiente para geração síncrona do QRCode.js
                });

                // Avançar posição
                currentCol++;
                if (currentCol >= cols) {
                    currentCol = 0;
                    currentRow++;
                }
            }

            // Remover container
            document.body.removeChild(qrContainer);

            // Salvar PDF
            const filename = `qrcodes_${turma.nome}.pdf`
                .replace(/[^a-z0-9.-]/gi, '_');
            doc.save(filename);
            utils.mostrarToast('PDF gerado com sucesso!', 'success');

        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            utils.mostrarToast('Erro ao gerar PDF. Tente novamente.', 'error');
        }
    },

    // Gerar QR Code individual
    gerarQRCodeIndividual(matricula, nome) {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px; text-align: center;">
                <div class="modal-header">
                    <h3>QR Code - ${utils.escapeHtml(nome)}</h3>
                    <button class="btn-close" onclick="this.closest('.modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    <div id="qr-individual" style="display: flex; justify-content: center; margin: 20px 0;"></div>
                    <p><strong>Matrícula:</strong> ${utils.escapeHtml(matricula)}</p>
                    <button class="btn btn-primary" onclick="qrgen.downloadQRCodeIndividual('${matricula}', '${nome}')">
                        📥 Baixar Imagem
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Gerar QR Code
        new QRCode(document.getElementById('qr-individual'), {
            text: matricula,
            width: 256,
            height: 256,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
    },

    // Download de QR Code individual
    downloadQRCodeIndividual(matricula, nome) {
        const canvas = document.querySelector('#qr-individual canvas');
        if (!canvas) return;

        canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `qrcode_${matricula}_${nome}.png`.replace(/[^a-z0-9.-]/gi, '_');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            utils.mostrarToast('QR Code baixado!', 'success');
        });
    }
};
