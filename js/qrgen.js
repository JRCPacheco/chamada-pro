// ===== QR CODE GENERATOR MODULE =====
// Geração de QR Codes em PDF

const qrgen = {

    // Gerar PDF com QR Codes da turma
    gerarPDFTurma(turma, alunos) {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Configurações
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 20;
            const qrSize = 60;
            const cols = 2;
            const rows = 3;
            const spacingX = (pageWidth - (2 * margin) - (cols * qrSize)) / (cols - 1);
            const spacingY = 40;

            let currentPage = 0;
            let currentRow = 0;
            let currentCol = 0;

            // Ordenar alunos por nome
            alunos.sort((a, b) => a.nome.localeCompare(b.nome));

            // Título da primeira página
            doc.setFontSize(16);
            doc.setFont(undefined, 'bold');
            doc.text(turma.nome, pageWidth / 2, 15, { align: 'center' });
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text('QR Codes para Chamada', pageWidth / 2, 22, { align: 'center' });

            alunos.forEach((aluno, index) => {
                // Nova página se necessário
                if (currentRow >= rows) {
                    doc.addPage();
                    currentPage++;
                    currentRow = 0;
                    currentCol = 0;

                    // Título das páginas seguintes
                    doc.setFontSize(12);
                    doc.setFont(undefined, 'bold');
                    doc.text(turma.nome, pageWidth / 2, 15, { align: 'center' });
                    doc.setFont(undefined, 'normal');
                }

                // Calcular posição
                const x = margin + (currentCol * (qrSize + spacingX));
                const y = 35 + (currentRow * (qrSize + spacingY));

                // Gerar QR Code como Data URL
                const qrContainer = document.createElement('div');
                qrContainer.style.display = 'none';
                document.body.appendChild(qrContainer);

                const qrCode = new QRCode(qrContainer, {
                    text: aluno.matricula,
                    width: 256,
                    height: 256,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });

                // Aguardar geração do QR Code
                setTimeout(() => {
                    const canvas = qrContainer.querySelector('canvas');
                    if (canvas) {
                        const qrDataUrl = canvas.toDataURL('image/png');

                        // Adicionar QR Code ao PDF
                        doc.addImage(qrDataUrl, 'PNG', x, y, qrSize, qrSize);

                        // Adicionar nome do aluno
                        doc.setFontSize(10);
                        doc.setFont(undefined, 'bold');
                        const nomeX = x + (qrSize / 2);
                        doc.text(aluno.nome, nomeX, y + qrSize + 5, { 
                            align: 'center',
                            maxWidth: qrSize
                        });

                        // Adicionar matrícula
                        doc.setFontSize(8);
                        doc.setFont(undefined, 'normal');
                        doc.text(`Mat: ${aluno.matricula}`, nomeX, y + qrSize + 10, { 
                            align: 'center' 
                        });

                        // Adicionar borda
                        doc.setDrawColor(200, 200, 200);
                        doc.rect(x - 2, y - 2, qrSize + 4, qrSize + 4);
                    }

                    // Remover container temporário
                    document.body.removeChild(qrContainer);

                    // Se for o último aluno, salvar PDF
                    if (index === alunos.length - 1) {
                        const filename = `qrcodes_${turma.nome}.pdf`
                            .replace(/[^a-z0-9.-]/gi, '_');
                        doc.save(filename);
                        utils.mostrarToast('PDF gerado com sucesso!', 'success');
                    }
                }, 100 * index); // Delay para cada QR Code

                // Avançar posição
                currentCol++;
                if (currentCol >= cols) {
                    currentCol = 0;
                    currentRow++;
                }
            });

        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            utils.mostrarToast('Erro ao gerar PDF. Verifique se todas as bibliotecas foram carregadas.', 'error');
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
