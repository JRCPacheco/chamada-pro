# 📋 Chamada PRO - Sistema de Controle de Presença

## 🎯 Sobre o Projeto

**Chamada PRO** é um sistema inteligente de controle de presença via QR Code, desenvolvido especialmente para professores que desejam otimizar o processo de chamada em sala de aula.

### ✨ Características Principais

- ✅ **100% Offline**: Funciona sem internet após carregamento inicial
- 📱 **PWA (Progressive Web App)**: Instalável como app nativo
- 🎨 **Interface Moderna**: Design intuitivo e responsivo
- 📊 **Relatórios Completos**: Exportação em CSV e compartilhamento direto
- 🔒 **Privacidade Total**: Dados armazenados apenas no dispositivo
- 🌙 **Tema Claro/Escuro**: Adaptável às preferências do usuário

---

## 🚀 Como Usar

### 1️⃣ Criar uma Turma
1. Na tela inicial, clique no botão **"+"** (flutuante)
2. Informe o nome da turma (ex: "3º Ano A - Matemática")
3. Adicione uma descrição (opcional)
4. Clique em **"Criar Turma"**

### 2️⃣ Adicionar Alunos

**Manualmente:**
1. Entre na turma criada
2. Na aba "Alunos", clique em **"+ Adicionar"**
3. Preencha: Nome, Matrícula e Email (opcional)
4. Clique em **"Salvar"**

**Via Importação CSV:**
1. Prepare um arquivo CSV com o formato:
   ```
   Matrícula;Nome;Email
   2024001;Maria da Silva;maria@email.com
   2024002;João Santos;joao@email.com
   ```
2. Na aba "Alunos", clique em **"📥 Importar CSV"**
3. Selecione o arquivo
4. Os alunos serão importados automaticamente

### 3️⃣ Gerar QR Codes

1. Na aba "Alunos", clique em **"📄 Gerar QR Codes"**
2. Um PDF será gerado com os QR Codes de todos os alunos
3. Imprima o PDF e distribua os códigos aos alunos
4. **Dica**: Cole os QR Codes em cartões ou crachás para facilitar o uso

### 4️⃣ Fazer Chamada

1. Clique no botão **📷** (câmera flutuante)
2. Permita o acesso à câmera quando solicitado
3. Aponte a câmera para os QR Codes dos alunos presentes
4. O sistema registra automaticamente cada presença
5. Clique em **"✓ Finalizar"** quando terminar

### 5️⃣ Ver Resumo e Exportar

Após finalizar a chamada:
- **Visualize**: Presentes, ausentes e percentual de frequência
- **Baixe CSV**: Para usar em planilhas (Excel, Google Sheets)
- **Compartilhe**: Envie direto por WhatsApp ou email

### 6️⃣ Histórico

Na aba "Histórico" você pode:
- Ver todas as chamadas anteriores
- Exportar histórico completo
- Gerar relatório de frequência geral

---

## 📱 Instalação como App

### Android (Chrome/Edge):
1. Abra o site no navegador
2. Clique no menu (⋮) → **"Adicionar à tela inicial"**
3. Confirme a instalação
4. Use como app nativo!

### iOS (Safari):
1. Abra o site no Safari
2. Toque no ícone de compartilhamento
3. Role para baixo e toque em **"Adicionar à Tela de Início"**
4. Confirme

---

## 🛠️ Funcionalidades Avançadas

### Backup e Restauração
- **Exportar Backup**: Menu → Exportar Backup (arquivo .json)
- **Importar Backup**: Menu → Importar Backup
- **IMPORTANTE**: Faça backups regulares para não perder dados

### Configurações
- Som de confirmação (liga/desliga)
- Vibração (liga/desliga)
- Manter tela ligada durante escaneamento
- Tema (Claro/Escuro/Automático)

### Atalhos do Scanner
- **🔄 Alternar**: Troca entre câmera frontal/traseira
- **💡 Lanterna**: Liga/desliga flash (se suportado)

---

## 💡 Dicas de Uso

1. **Impressão dos QR Codes**
   - Use papel de boa qualidade
   - Lamine os códigos para maior durabilidade
   - Tamanho mínimo recomendado: 5x5 cm

2. **Iluminação**
   - Escaneie em ambientes bem iluminados
   - Use a lanterna se necessário
   - Evite reflexos diretos nos códigos

3. **Performance**
   - Mantenha a câmera estável
   - Posicione o QR Code no centro da tela
   - Aguarde 1-2 segundos entre escaneamentos

4. **Organização**
   - Nomeie turmas de forma clara
   - Use descrições para diferenciar turnos/horários
   - Exporte backups semanalmente

---

## 🔧 Requisitos Técnicos

### Navegadores Suportados:
- ✅ Chrome 90+
- ✅ Edge 90+
- ✅ Safari 14+
- ✅ Firefox 88+

### Permissões Necessárias:
- 📷 Câmera (para escanear QR Codes)
- 💾 Armazenamento local (para salvar dados)

---

## 📊 Formato de Exportação CSV

Os arquivos CSV exportados seguem este formato:

```csv
Matrícula;Nome;Status;Horário
2024001;"Maria da Silva";"Presente";"08:15"
2024002;"João Santos";"Ausente";"-"
```

**Compatível com:**
- Microsoft Excel
- Google Sheets
- LibreOffice Calc
- Numbers (Mac)

---

## 🔐 Privacidade e Segurança

- ✅ **100% Local**: Todos os dados ficam no seu dispositivo
- ✅ **Sem Servidor**: Não enviamos dados para nuvem
- ✅ **Sem Rastreamento**: Não coletamos informações pessoais
- ✅ **LGPD Compliant**: Totalmente adequado à Lei Geral de Proteção de Dados

---

## ❓ FAQ - Perguntas Frequentes

**P: Os dados ficam salvos se eu fechar o navegador?**
R: Sim! Os dados são salvos no armazenamento local do navegador.

**P: Posso usar em múltiplos dispositivos?**
R: Sim, mas os dados não sincronizam automaticamente. Use a função de backup/restauração.

**P: Funciona sem internet?**
R: Sim! Após o primeiro carregamento, funciona 100% offline.

**P: Quantas turmas posso criar?**
R: Ilimitadas! Só depende do espaço disponível no seu dispositivo.

**P: E se eu limpar os dados do navegador?**
R: Os dados serão perdidos. Sempre faça backups regulares!

**P: Posso editar uma chamada já finalizada?**
R: No momento não. Finalize a chamada apenas quando tiver certeza.

**P: O QR Code pode ser falsificado?**
R: Use matrículas únicas e mantenha os códigos sob sua supervisão.

---

## 🚧 Roadmap - Próximas Versões

### Versão 2.0 (Com Backend):
- ☁️ Sincronização em nuvem
- 👥 Múltiplos professores/dispositivos
- 📈 Dashboard com estatísticas avançadas
- 🔔 Alertas de baixa frequência
- 📧 Envio automático de relatórios
- 🏫 Modo Coordenação Pedagógica

---

## 📞 Suporte

Em caso de dúvidas ou problemas:
1. Clique em **Menu → Ajuda** dentro do app
2. Verifique se seu navegador está atualizado
3. Teste em outro navegador
4. Limpe o cache e recarregue

---

## 📄 Licença

Este projeto foi desenvolvido para uso educacional.

---

## 👨‍💻 Desenvolvimento

**Versão**: 1.0
**Data**: Janeiro 2026
**Tecnologias**: HTML5, CSS3, JavaScript (Vanilla), Html5-QrCode, jsPDF, QRCode.js

---

**Desenvolvido com ❤️ para professores que fazem a diferença!**
