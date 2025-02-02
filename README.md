<h1 align="center"> Warbands FC Discord Bot </h1>

<p align="center">
Bot para Discord desenvolvido em Node.js que auxilia jogadores de RuneScape 3 a participarem do minigame <a href="https://runescape.wiki/w/Wilderness_Warbands" target="_blank">Wilderness Warbands</a>, facilitando a comunicação e coordenação entre membros de FCs (Friendchats) ou Clãs durante o evento.
</p>

## 💡 Sobre o Projeto

Este bot surgiu da necessidade de **otimizar a comunicação** entre jogadores durante o minigame Wilderness Warbands do RuneScape 3. O minigame ocorre a cada 7 horas e requer coordenação rápida entre os jogadores para compartilhar informações sobre localização de acampamentos, status de mundos (servidores do jogo) e presença de jogadores hostis.

Este bot resolve problemas cruciais como:

- Dificuldade em organizar informações sobre múltiplos mundos simultaneamente
- Necessidade de comunicação rápida e precisa durante o evento
- Importância de identificar mundos com PKers (jogadores hostis)
- Organização dos mundos por tipos de suprimentos disponíveis

## 🚀 Tecnologias

Este projeto foi desenvolvido utilizando:

- JavaScript
- Node.js
- Discord.js
- dotenv
- table
- Git e GitHub

## 💻 Técnicas e Boas Práticas

**Segurança:**

- Sanitização de inputs
- Validação de dados
- Variáveis de ambiente
- Tratamento de erros com try/catch

**Código:**

- Programação modular
- Funções reutilizáveis
- Expressões regulares (RegEx) otimizadas
- Comentários explicativos
- Nomenclatura clara e consistente
- Manutenção facilitada com variáveis globais

**Performance:**

- Processamento eficiente de mensagens de forma assíncrona
- Otimização de RegEx
- Estruturas de dados apropriadas

## 🤖 Funcionalidades

**⌨️ Comandos principais:**

**/list**

- Exibe lista organizada dos mundos reportados por localização (DWF, ELM, RDI)
- Mundos "beamed" aparecem em negrito e sublinhado
- Mundos caídos aparecem riscados
- Mundos com PKers são marcados com ☠️

**/table**

- Apresenta quadro organizado dos mundos por localização e tipo de suprimento
- Organiza mundos por categorias de suprimentos (C, F, H, M, S e ?)
- Indica mundos "beamed" com prefixo "B"
- Indica mundos caídos com prefixo "!"
- Marca mundos com PKers com sufixo "PK"

## 📋 Instruções de Uso

**Reportando mundos:**

➡️ Jogadores devem enviar mensagens no canal de texto adequado seguindo o formato:
`[mundo] [localização] [status] [aliança] [pk] [suprimentos]`

**Exemplos válidos:**

- "124 dwf beamed"
- "elm 96 chf"
- "74rdi"
- "116 elm caiu pk shm"
- "dwf99 pk elm aliança"

**Dicionário de parâmetros:**

- [mundo] ➡️ Número do mundo o qual está sendo reportado
- [localização] ➡️ DWF, ELM ou RDI
- [status] ➡️ beamed, broken, empty ou caiu
- [aliança] ➡️ aliança ou allies
- [pk] ➡️ pk, pks, pker ou pkers
- [suprimentos] ➡️ letras iniciais conforme o suprimento c, f, h, m, s

**Observações:**

- A ordem dos parâmetros é indiferente
- O bot é capaz de reconhecer pequenos erros de digitação, como: "dfw", "beamd" e faltas de espaço
- Os termos centrais são o **número do mundo** (indispensável para o bot entender de que mundo se trata) e a **localização** (necessário para registrar o mundo pela primeira vez)

**➡️ Consultando informações:**

- Use o comando `/list` para ver a lista de mundos reportados
- Use o comando `/table` para ver o quadro de mundos reportados organizado por suprimentos

## 💻 Desenvolvimento do projeto

**🟢 Já implementado:**

- **Mecânica central de captura de dados dos mundos:** mecânica primária implementada com detecção do número do mundo, localização, status, suprimentos, hostilidade e presença de aliança
- **Comando /list:** comando inicial para checar mundos informados
- **Comando /table:** exibição de um quadro dos mundos informados organizados por suprimentos
- **Feedback via reações:** o bot reage com emojis às mensagens enviadas pelos jogadores para um feedback visual rápido e organizado
- **Restrição a canais de Warbands:** as funcionalidades do bot funcionam apenas em canais especificados no .env
- **Captura e armazenamento do tempo:** mecânica para detectar, tratar e armazenar o tempo restante para os mundos (servidores)
- **Comando para checar tempos:** exibir aos jogadores o tempo restante em cada um dos mundos que tiveram os tempos informados
- **Uso facilitado de emojis personalizados:** função JavaScript auxiliar para o uso facilitado de emojis customizados do bot através de leitura de arquivo JSON
- **Dropdown de suprimentos para o /list:** menu dropdown (select menu) inserido na resposta do comando /list que permite com que os jogadores selecionem mundos com quais suprimentos desejam

**🟡 Em desenvolvimento:**

- Nenhuma funcionalidade em desenvolvimento no momento

**🔴 Não iniciado:**

- **Node-Cron core:** implementar eventos node-cron para orientar o funcionamento do bot (o minigame se repete a cada 7 horas)
- **Resetar a lista de mundos automaticamente:** a lista de mundos reportados é resetada automaticamente sempre 5 minutos antes de uma nova wave
- **Cair automaticamente com o tempo:** mundos que excederem o tempo restante informado têm o status modificado automaticamente para caído
- **Estruturar a captura, tratamento e armazenamento de dados de jogadores:** preparar o terreno para começar a contabilizar estatísticas dos jogadores
- **Registrar todos os participantes:** registrar todos os jogadores (Discord ID) que estiveram presentes no canal de voz da wb durante o evento
- **Registrar reportes do jogador:** contabilizar estatísticas de dados enviados pelos jogadores

## 🧾 Licença

Esse projeto está sob a licença MIT.

<p align="center">
  <img alt="License" src="https://img.shields.io/static/v1?label=license&message=MIT&color=49AA26&labelColor=000000">
</p>
