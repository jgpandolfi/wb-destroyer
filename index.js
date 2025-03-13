import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js"
import dotenv from "dotenv"
import cron from "node-cron"
import Database from "better-sqlite3"
import { table } from "table"
import { memoryUsage, cpuUsage } from "process"
import os from "os"
import { createRequire } from "module"
const require = createRequire(import.meta.url)
const horariosWarbands = require("./horarios.json")
const emojis = require("./emojis.json")

dotenv.config()

// Validação das variáveis de ambiente
if (!process.env.CANAIS_WARBANDS) {
  console.error("❌ Erro: CANAIS_WARBANDS não está configurado no arquivo .env")
  process.exit(1)
}

// Confere se existe pelo menos um canal de Warband configurado
const canaisWarbands = process.env.CANAIS_WARBANDS.split(",").map((canal) =>
  canal.trim()
)

if (canaisWarbands.length === 0) {
  console.error("❌ Erro: Nenhum canal de Warbands configurado no arquivo .env")
  process.exit(1)
}

// Atribui as intents necessárias
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

// Função auxiliar para calcular os horários de Warbands com adiantamento de 15 minutos (para node-cron)
function calcularHorariosComAdiantamento() {
  const horariosComAdiantamento = {}

  for (const [dia, horarios] of Object.entries(horariosWarbands)) {
    horariosComAdiantamento[dia] = horarios.map((horario) => {
      const [hora, minuto] = horario.split(":").map(Number)

      // Subtrair 15 minutos
      let novoMinuto = minuto - 15
      let novaHora = hora

      if (novoMinuto < 0) {
        novoMinuto += 60
        novaHora -= 1
      }

      // Ajustar se a nova hora for negativa (caso seja antes da meia-noite)
      if (novaHora < 0) {
        novaHora = 23
      }

      return `${String(novaHora).padStart(2, "0")}:${String(
        novoMinuto
      ).padStart(2, "0")}`
    })
  }

  return horariosComAdiantamento
}

// Função auxiliar para substituir o nome dos dias da semana por números (node-cron)
function diaToCron(dia) {
  const mapaDias = {
    domingo: 0,
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
  }

  return mapaDias[dia]
}

// Inicializa o banco de dados SQLite (para armazenar dados dos jogadores)
const db = new Database("bancoDeDados.db", { verbose: console.log })

// Criação da tabela 'jogadores' com todas as colunas solicitadas
db.exec(`
  CREATE TABLE IF NOT EXISTS jogadores (
    discord_id TEXT PRIMARY KEY,
    discord_username TEXT,
    rsn_atual TEXT,
    historico_rsns TEXT DEFAULT '[]',
    clan_atual TEXT,
    historico_clans TEXT DEFAULT '[]',
    alts TEXT DEFAULT '[]',
    total_warbands INTEGER DEFAULT 0,
    datas_warbands TEXT DEFAULT '[]',
    tempo_warbands INTEGER DEFAULT 0,
    mundos_reportados INTEGER DEFAULT 0,
    suprimentos_reportados TEXT DEFAULT '{}',
    advertencias INTEGER DEFAULT 0,
    datas_advertencias TEXT DEFAULT '[]',
    suspensoes INTEGER DEFAULT 0,
    datas_suspensoes TEXT DEFAULT '[]',
    observacoes TEXT DEFAULT ''
  );
`)

// Função auxiliar para obter string de emoji personalizado do bot (emojis.json)
function obterEmoji(nomeEmoji) {
  try {
    // Verifica se o emoji existe na categoria estático
    if (emojis.estatico && emojis.estatico[nomeEmoji]) {
      return `<:${nomeEmoji}:${emojis.estatico[nomeEmoji]}>`
    }

    // Verifica se o emoji existe na categoria animado
    if (emojis.animado && emojis.animado[nomeEmoji]) {
      return `<a:${nomeEmoji}:${emojis.animado[nomeEmoji]}>`
    }

    // Retorna vazio se não encontrar o emoji
    console.error(`❌ O emoji personalizado de nome ${nomeEmoji} não existe`)
    return ""
  } catch (erro) {
    console.error(`❌ Erro ao obter emoji ${nomeEmoji}: ${erro.message}`)
    return ""
  }
}

// Registra o comando slash /list
const cmdList = new SlashCommandBuilder()
  .setName("list")
  .setDescription("🧾 Lista os mundos reportados organizados por localidade")

// Registra o comando slash /timelist
const cmdTable = new SlashCommandBuilder()
  .setName("table")
  .setDescription(
    "🖼️ Exibe um quadro com as informações dos mundos reportados em formato de tabela"
  )

// Registra o comando slash /timelist (quadro de tempos restantes)
const cmdTimelist = new SlashCommandBuilder()
  .setName("timelist")
  .setDescription("⏰ Exibe uma lista dos mundos com tempo restante conhecido")

// Registra o comando slash /horarios (conferir horários das Warbands)
const cmdHorarios = new SlashCommandBuilder()
  .setName("horarios")
  .setDescription("📅 Exibe os horários semanais de Warbands")

// Definindo o comando /ping
const cmdPing = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("🏓 Exibe a latência (ping) do bot")

// Registra o comando slash /botstatus
const cmdBotstatus = new SlashCommandBuilder()
  .setName("botstatus")
  .setDescription("🤖 Exibe informações detalhadas sobre o status do bot")

// Registra o comando slash /SetRSN (administradores - salvar o RSN dos jogadores)
const cmdSetRSN = new SlashCommandBuilder()
  .setName("setrsn")
  .setDescription("Define o RSN (RuneScape Name) de um jogador")
  .addUserOption((option) =>
    option
      .setName("jogador")
      .setDescription("O jogador para definir o RSN")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("rsn")
      .setDescription("O RSN (RuneScape Name) do jogador")
      .setRequired(true)
  )

// Registra o comando slash /SetClan (administradores - salvar o clã de um jogador)
const cmdSetClan = new SlashCommandBuilder()
  .setName("setclan")
  .setDescription("Define o clã de um jogador")
  .addUserOption((option) =>
    option
      .setName("jogador")
      .setDescription("O jogador para definir o clã")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("clan").setDescription("O clã do jogador").setRequired(true)
  )

// Lista de mundos (servidores) válidos do RuneScape
const mundosValidos = [
  1, 2, 4, 5, 6, 9, 10, 12, 14, 15, 16, 18, 21, 22, 23, 24, 25, 26, 27, 28, 30,
  31, 32, 35, 36, 37, 39, 40, 42, 44, 45, 46, 48, 49, 50, 51, 52, 53, 54, 56,
  58, 59, 60, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 76, 77, 78,
  79, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 96, 98, 99, 100, 103, 104, 105,
  106, 114, 115, 116, 117, 119, 123, 124, 134, 137, 138, 139, 140, 252, 257,
  258, 259,
]

// Definição de todas as localização válidas com mapeamento de todas as variações para as siglas corretas
const LOCALIZACOES = {
  // Dark Warriors' Fortress
  dwf: "dwf",
  dfw: "dwf",
  wdf: "dwf",
  wfd: "dwf",
  fdw: "dwf",
  fwd: "dwf",
  // East Lava Maze
  elm: "elm",
  eml: "elm",
  lem: "elm",
  lme: "elm",
  mel: "elm",
  mle: "elm",
  // Red Dragon Isle
  rdi: "rdi",
  rid: "rdi",
  dir: "rdi",
  dri: "rdi",
  ird: "rdi",
  idr: "rdi",
}

// Cria uma única string que é um regex com todos os termos de loc possíveis
const todasLocsValidas = Object.keys(LOCALIZACOES).join("|")

// Define os termos que disparam eventos-chave
const STATUS_TERMS = {
  BEAM_ATIVA: [
    "beam ativa",
    "beam de pé",
    "beam on",
    "fazer a beam",
    "fazer beam",
  ],
  BEAMED: [
    "beamed",
    "beamd",
    "beam feita",
    "fizemos a beam",
    "fizemos beam",
    "fiz a beam",
    "fiz beam",
  ],
  QUEBRADO: [
    "quebrado",
    "quebrad",
    "broken",
    "broke",
    "break",
    "breaked",
    "breakd",
    "quebrou",
    "quebrada",
    "quebrei",
    "quebramos",
  ],
  EMPTY: ["empty", "empt", "emp"],
  CAIDO: ["caiu", "cai", "acabou", "acabo", "over", "down"],
}

// Cria uma única string que é um regex com todos os termos de status
const todosStatus = Object.values(STATUS_TERMS)
  .flat()
  .map((term) => term.replace(/\s+/g, "\\s*"))
  .join("|")

// Define termos para suprimentos
const SUPRIMENTOS = {
  CONSTRUCAO: [
    "c",
    "cons",
    "construct",
    "construction",
    "construção",
    "construcao",
  ],
  AGRICULTURA: ["f", "farm", "farming", "agricultura"],
  HERBOLOGIA: ["h", "herb", "herblore", "herbologia"],
  METALURGIA: ["s", "smith", "smithing", "metalurgia"],
  MINERACAO: ["m", "mine", "mining", "mineração", "mineracao"],
}

// Define termos para verificação de hostililidade
const TERMOS_PK = ["pk", "pks", "pker", "pkers", "sapk", "pkfc"]

// Define termos para verificação de aliança
const TERMOS_ALIANCA = [
  "aliança",
  "alianca",
  "ally",
  "aly",
  "allied",
  "aliado",
  "aliada",
  "wbu",
  "kpk",
]

// Uma única string para o padrão de texto de tempo restante
const padraoTempo =
  // Padrão XX:XX
  "(?:(\\d{1,2})\\s*:\\s*(\\d{2}))|" +
  // Padrão XX min(s) XX s(eg/egs)
  "(?:(\\d{1,2})\\s*(?:min|mins)?\\s*(?::|\\s+)(\\d{2})\\s*(?:s|seg|segs)?)"

// Inicializa a array para armazenar os mundos capturados
const mundos = []

function construirRegexMundoInfo() {
  const grupoMundo = "(\\d{1,4})"
  const grupoLoc = `(${todasLocsValidas})`
  const grupoStatus = `(${todosStatus})`
  const grupoHostil = `(${TERMOS_PK.join("|")})`
  const grupoAlianca = `(${TERMOS_ALIANCA.join("|")})`
  const grupoSuprimentos = "([cfhsm]+)"
  const grupoTempo = `(${padraoTempo})`

  return new RegExp(
    "^\\s*" +
      `(?:${grupoMundo}\\s*|${grupoLoc}\\s*|${grupoStatus}\\s*|${grupoHostil}\\s*|${grupoAlianca}\\s*|${grupoSuprimentos}\\s*|${grupoTempo}\\s*)+` +
      "\\s*$",
    "i"
  )
}

// Função para sanitização de texto recebido nas mensagens
function sanitizarMensagem(mensagem) {
  try {
    return mensagem.content
      .trim()
      .toLowerCase()
      .replace(/[^\w\s:]/gi, "")
      .slice(0, 100)
  } catch (erro) {
    console.error(`❌ Erro ao sanitizar mensagem: ${erro.message}`)
    return ""
  }
}

// Adicione este objeto validadores após as constantes e antes das outras funções
const validadores = {
  verificarLoc: (texto) => {
    const match = texto.match(new RegExp(`(${todasLocsValidas})`, "i"))
    return match ? LOCALIZACOES[match[1].toLowerCase()] : null
  },

  verificarStatus: (texto) => {
    for (const [tipoStatus, termos] of Object.entries(STATUS_TERMS)) {
      if (termos.some((termo) => texto.includes(termo))) {
        return tipoStatus
      }
    }
    return "DESCONHECIDO"
  },

  verificarHostil: (texto) => {
    return TERMOS_PK.some((termo) => texto.includes(termo))
  },

  verificarAlianca: (texto) => {
    return TERMOS_ALIANCA.some((termo) => texto.includes(termo))
  },

  verificarSuprimentos: (texto) => {
    const suprimentosEncontrados = new Set()

    // Remove outros termos conhecidos da msg para evitar detectar letras das palavras
    let textoSemOutrosTermos = texto
      .replace(new RegExp(todasLocsValidas, "gi"), "")
      .replace(new RegExp(todosStatus, "gi"), "")
      .replace(new RegExp(TERMOS_PK.join("|"), "gi"), "")
      .replace(new RegExp(TERMOS_ALIANCA.join("|"), "gi"), "")
      .trim()
      .slice(0, 40)

    for (const [tipo, termos] of Object.entries(SUPRIMENTOS)) {
      if (termos.some((termo) => textoSemOutrosTermos.includes(termo))) {
        suprimentosEncontrados.add(tipo)
      }
    }

    return suprimentosEncontrados.size > 0
      ? Array.from(suprimentosEncontrados)
      : null
  },

  verificarTempoRestante: (texto) => {
    const match = texto.match(new RegExp(padraoTempo))
    if (!match) return null

    // Pega o primeiro par de números encontrado (minutos e segundos)
    const minutos = parseInt(match[1] || match[3])
    const segundos = parseInt(match[2] || match[4])

    // Valida os valores
    if (
      isNaN(minutos) ||
      isNaN(segundos) ||
      minutos < 0 ||
      minutos > 99 ||
      segundos < 0 ||
      segundos > 59
    ) {
      return null
    }
    return {
      minutos,
      segundos,
    }
  },
}

// Função auxiliar para ordenar mundos por status e número
function ordenarMundos(mundosPorLoc) {
  return mundosPorLoc.sort((a, b) => {
    // 1) Mundos com status "BEAMED" vêm primeiro (em ordem crescente)
    if (a.status === "BEAMED" && b.status !== "BEAMED") return -1
    if (a.status !== "BEAMED" && b.status === "BEAMED") return 1

    // 2) Mundos com qualquer status que não seja "BEAMED", "CAIDO" ou "EMPTY" vêm em seguida (em ordem crescente)
    const aNaoEspecial =
      a.status !== "BEAMED" && a.status !== "CAIDO" && a.status !== "EMPTY"
    const bNaoEspecial =
      b.status !== "BEAMED" && b.status !== "CAIDO" && b.status !== "EMPTY"
    if (aNaoEspecial && !bNaoEspecial) return -1
    if (!aNaoEspecial && bNaoEspecial) return 1

    // 3) Mundos com status "CAIDO" ou "EMPTY" vêm por último (em ordem crescente)
    // (chega aqui quando ambos já não são "BEAMED" ou quando ambos são "CAIDO"/"EMPTY"/não-especial)
    return a.mundo - b.mundo
  })
}

// Função auxiliar do cmd list para formatar o mundo baseado no status e se é hostil
function formatarMundo(mundo) {
  let textoFormatado

  if (mundo.status === "BEAMED") {
    textoFormatado = `**__${mundo.mundo}__**`
  } else if (mundo.status === "CAIDO" || mundo.status === "EMPTY") {
    textoFormatado = `~~${mundo.mundo}~~`
  } else {
    textoFormatado = mundo.mundo.toString()
  }

  if (mundo.hostil) {
    textoFormatado += obterEmoji("skull")
  }

  return textoFormatado
}

// Mapeia as categorias de suprimento com a letra da linha (usado para o cmd /table)
const MAPA_CATEGORIAS = {
  C: "CONSTRUCAO",
  F: "AGRICULTURA",
  H: "HERBOLOGIA",
  M: "MINERACAO",
  S: "METALURGIA",
  "?": "SEM_SUPRIMENTOS",
}

// Função auxiliar do cmd table para formatar o mundo baseado no status e se é hostil
function formatarMundoTable(mundo) {
  // 1) Mundos "BEAMED" mostram "B" antes do número
  if (mundo.status === "BEAMED") {
    // Se for also hostil => ex: "B24 PK"
    return mundo.hostil ? `B${mundo.mundo} PK` : `B${mundo.mundo}`
  }

  // 2) Mundos "CAIDO" ou "EMPTY" mostram "!" antes do número
  if (mundo.status === "CAIDO" || mundo.status === "EMPTY") {
    return mundo.hostil ? `!${mundo.mundo} PK` : `!${mundo.mundo}`
  }

  // 3) Caso contrário, mostra só o número
  return mundo.hostil ? `${mundo.mundo} PK` : `${mundo.mundo}`
}

// Gera a lista de mundos adequada para cada célula
function obterMundosPorCategoriaELoc(categoria, local) {
  // Filtra os mundos que estejam naquela loc
  const mundosFiltrados = mundos.filter((m) => m.loc === local)

  // Se a categoria for "?" (SEM_SUPRIMENTOS), pegamos os que não têm suprimentos
  // ou cujo array de suprimentos está vazio/null
  if (categoria === "?") {
    const lista = mundosFiltrados.filter(
      (m) => !Array.isArray(m.suprimentos) || m.suprimentos.length === 0
    )
    return ordenarMundos(lista)
  }

  // Caso contrário pegamos os que possuam suprimentos e possuam essa categoria
  // ex: "CONSTRUCAO", "AGRICULTURA" etc
  const tipoSuprimento = MAPA_CATEGORIAS[categoria]
  const lista = mundosFiltrados.filter(
    (m) =>
      Array.isArray(m.suprimentos) && m.suprimentos.includes(tipoSuprimento)
  )
  return ordenarMundos(lista)
}

// Gera a tabela final do cmd /table em formato de string
function gerarTabela() {
  const linhas = ["C", "F", "H", "M", "S", "?"]
  const colunas = ["DWF", "ELM", "RDI"]

  // Cria o cabeçalho da tabela
  const dados = [["", ...colunas]]

  // Adiciona as linhas de dados
  for (const linha of linhas) {
    const linhaDados = [linha]
    for (const col of colunas.map((c) => c.toLowerCase())) {
      const listaMundos = obterMundosPorCategoriaELoc(linha, col)
      linhaDados.push(
        listaMundos.length === 0
          ? "---"
          : listaMundos.map(formatarMundoTable).join(" - ")
      )
    }
    dados.push(linhaDados)
  }

  // Configuração da tabela
  const config = {
    border: {
      topBody: `─`,
      topJoin: `┬`,
      topLeft: `┌`,
      topRight: `┐`,
      bottomBody: `─`,
      bottomJoin: `┴`,
      bottomLeft: `└`,
      bottomRight: `┘`,
      bodyLeft: `│`,
      bodyRight: `│`,
      bodyJoin: `│`,
      joinBody: `─`,
      joinLeft: `├`,
      joinRight: `┤`,
      joinJoin: `┼`,
    },
    columns: {
      0: {
        alignment: "center",
        width: 3,
        wrapWord: false,
        verticalAlignment: "middle",
      },
      1: {
        alignment: "center",
        width: 16,
        wrapWord: false,
        verticalAlignment: "middle",
      },
      2: {
        alignment: "center",
        width: 16,
        wrapWord: false,
        verticalAlignment: "middle",
      },
      3: {
        alignment: "center",
        width: 16,
        wrapWord: false,
        verticalAlignment: "middle",
      },
    },
    drawHorizontalLine: () => true,
  }

  return table(dados, config)
}

// Função auxiliar do Ciclo de Ações de Warbands (vinculada ao node-cron)
async function executarCicloWarbands(horarioWarbands) {
  try {
    // AÇÃO 1 (15 minutos antes) - Enviar alerta em canais configurados
    const canaisAlerta = process.env.CANAIS_ALERTA_WARBANDS.split(",").map(
      (id) => id.trim()
    )
    for (const canalId of canaisAlerta) {
      const canalTexto = await client.channels.fetch(canalId)
      await canalTexto.send("**WB EM 15 MINUTOS!**")
      console.log("🔔 Mensagem de alerta de Warbands em 15 minutos enviada")
    }

    // Força uma espera até faltarem exatamente 5 minutos
    await new Promise((resolve) => setTimeout(resolve, 10 * 60 * 1000))

    // AÇÃO 2 - Limpar lista de mundos
    mundos.length = []
    console.log("✅ Lista de mundos resetada")

    // AÇÃO 3 - Mover usuários entre canais de voz
    const canalOrigemId = process.env.CANAL_VOZ_PRE_WARBANDS.trim()
    const canalDestinoId = process.env.CANAL_VOZ_WARBANDS.trim()

    const canalOrigem = await client.channels.fetch(canalOrigemId)
    if (canalOrigem.members.size > 0) {
      canalOrigem.members.forEach(async (membro) => {
        await membro.voice.setChannel(canalDestinoId).catch(console.error)
      })
      console.log(
        "✅ Usuários movidos do Canal de Voz da Pré-WB para o Canal de Voz da Warbands"
      )
    }

    // Registra a participação dos jogadores que estão no canal de voz
    const canalVozWarbands = await client.channels.fetch(canalDestinoId)
    if (canalVozWarbands.members && canalVozWarbands.members.size > 0) {
      canalVozWarbands.members.forEach((membro) => {
        // Registra o jogador no banco (se ainda não estiver registrado)
        registrarJogador(membro.user.id, membro.user.username)

        // Atualiza a participação em Warbands
        atualizarParticipacaoWarband(membro.user.id)

        console.log(
          `📊 Participação em Warbands registrada para ${membro.user.username}`
        )
      })
    }

    // Força uma espera até faltarem exatamente 4 minutos
    await new Promise((resolve) => setTimeout(resolve, 1 * 60 * 1000))

    // AÇÃO 4 - Enviar mensagem detalhada no canal de Warbands
    const canalWarbandsId = process.env.CANAIS_WARBANDS.trim()
    const canalWarbands = await client.channels.fetch(canalWarbandsId)

    const horarioFormatadoUTC = horarioWarbands
    const dataFormatadaUTC = new Date().toISOString().split("T")[0]

    await canalWarbands.send(
      `\`\`\`
══════════ WARBANDS ${horarioFormatadoUTC} ${dataFormatadaUTC} ══════════\`\`\`
**Últimos lembretes:**\n` +
        `:small_orange_diamond: Desative seu privado\n` +
        `:small_orange_diamond: Saia dos canais de bate-papo do clã e do clã visitante\n` +
        `:small_orange_diamond: Saia de grupo de boss/recife\n` +
        `:small_orange_diamond: Certifique-se de estar no FC indicado\n` +
        `:small_orange_diamond: Vista o set adequado completo\n` +
        `:small_orange_diamond: Esteja com um familiar de cargas adequado\n` +
        `:small_orange_diamond: Desative seu autorretaliar\n` +
        `:small_orange_diamond: Confira se seus pontos de oração estão carregados\n` +
        `:small_orange_diamond: Sempre que trocar de mundo confira se sua oração Protect Item está ativa\n\n` +
        `Dicas extras:\n` +
        `:small_orange_diamond: As piscinas de Oo'glog dão ótimos benefícios...\n` +
        `:small_orange_diamond:A aura Aegis ajuda muito...\n\n` +
        `ENVIE A LOC DO SEU MUNDO AQUI NESTA SALA!\`\`\``
    )

    console.log(
      "✅ Mensagem com os últimos lembretes enviada no canal ded texto da Warbands"
    )
  } catch (erro) {
    console.error(
      `❌ Erro ao executar ciclo automático da Warbands! ${erro.message}`
    )
  }
}

// Função auxiliar para calcular o tempo restante (comando /Timelist)
function calcularTempoRestante(tempoRestante) {
  if (
    !tempoRestante ||
    !tempoRestante.quantoFaltava ||
    !tempoRestante.queHorasEram
  ) {
    return null
  }

  const agora = new Date()
  const queHorasEram = new Date(tempoRestante.queHorasEram)

  // Calcula a diferença em milissegundos e converte para segundos
  const diferencaSegundos = Math.floor((agora - queHorasEram) / 1000)

  // Converte minutos e segundos reportados em total de segundos
  const tempoInicialSegundos =
    tempoRestante.quantoFaltava.minutos * 60 +
    tempoRestante.quantoFaltava.segundos

  // Subtrai o tempo decorrido
  const tempoRestanteSegundos = tempoInicialSegundos - diferencaSegundos

  // Retorna em minutos e segundos ou null se já expirou
  return tempoRestanteSegundos > 0
    ? {
        minutos: Math.floor(tempoRestanteSegundos / 60),
        segundos: tempoRestanteSegundos % 60,
      }
    : null
}

// Função auxiliar para alterar o status do mundo automaticamente caso ele "caia"
function verificarMundosQueCairam() {
  const agora = new Date()

  mundos.forEach((mundo) => {
    if (
      mundo.tempoRestante &&
      mundo.tempoRestante.quantoFaltava &&
      mundo.status !== "CAIDO"
    ) {
      const tempoCalculado = calcularTempoRestante(mundo.tempoRestante)

      if (!tempoCalculado) {
        mundo.status = "CAIDO"
        mundo.tempoRestante = null
        mundo.ultimaAtualizacao = agora

        console.log(
          `⏰ Status do mundo ${mundo.mundo} alterado automaticamente para CAÍDO (tempo expirado)`
        )
      }
    }
  })
}

// Função para gerar a tabela
function gerarTabelaTimelist(mundos) {
  // Padrão de formatação
  const config = {
    border: {
      topBody: `─`,
      topJoin: `┬`,
      topLeft: `┌`,
      topRight: `┐`,
      bottomBody: `─`,
      bottomJoin: `┴`,
      bottomLeft: `└`,
      bottomRight: `┘`,
      bodyLeft: `│`,
      bodyRight: `│`,
      bodyJoin: `│`,
      joinBody: `─`,
      joinLeft: `├`,
      joinRight: `┤`,
      joinJoin: `┼`,
    },
    columns: {
      0: {
        alignment: "center",
        wrapWord: false,
        verticalAlignment: "middle",
      },
      1: {
        alignment: "center",
        wrapWord: false,
        verticalAlignment: "middle",
      },
      2: {
        alignment: "center",
        wrapWord: false,
        verticalAlignment: "middle",
      },
      3: {
        alignment: "center",
        wrapWord: false,
        verticalAlignment: "middle",
      },
      4: {
        alignment: "center",
        wrapWord: false,
        verticalAlignment: "middle",
      },
      5: {
        alignment: "center",
        wrapWord: false,
        verticalAlignment: "middle",
      },
      6: {
        alignment: "center",
        wrapWord: false,
        verticalAlignment: "middle",
      },
    },
    drawHorizontalLine: () => true,
  }

  // Filtra mundos que têm tempo restante conhecido
  const mundosComTempo = mundos
    .map((mundo) => {
      const tempoCalculado = calcularTempoRestante(mundo.tempoRestante)
      return {
        ...mundo,
        tempoCalculado,
      }
    })
    .filter((mundo) => mundo.tempoCalculado !== null)

  // Ordena os mundos pelo maior tempo restante
  mundosComTempo.sort((a, b) => {
    const aTempoTotal =
      a.tempoCalculado.minutos * 60 + a.tempoCalculado.segundos
    const bTempoTotal =
      b.tempoCalculado.minutos * 60 + b.tempoCalculado.segundos
    return bTempoTotal - aTempoTotal
  })

  // Limita a lista a no máximo 10 mundos
  const mundosLimitados = mundosComTempo.slice(0, 10)

  // Cria as linhas da tabela
  const linhasTabela = [
    [
      "Tempo Restante",
      "Mundo",
      "Loc",
      "Status",
      "Suprimentos",
      "PK?",
      "Aliança?",
    ],
    ...mundosLimitados.map((mundo) => [
      `${mundo.tempoCalculado.minutos}:${String(
        mundo.tempoCalculado.segundos
      ).padStart(2, "0")}`,
      mundo.mundo,
      mundo.loc.toUpperCase(),
      mundo.status,
      Array.isArray(mundo.suprimentos)
        ? mundo.suprimentos
            .map((s) => {
              switch (s) {
                case "CONSTRUCAO":
                  return "C"
                case "AGRICULTURA":
                  return "F"
                case "HERBOLOGIA":
                  return "H"
                case "MINERACAO":
                  return "M"
                case "METALURGIA":
                  return "S"
                default:
                  return "?"
              }
            })
            .sort()
            .join(", ")
        : "-",
      mundo.hostil ? "Sim" : "Não",
      mundo.alianca ? "Sim" : "Não",
    ]),
  ]

  return table(linhasTabela, config)
}

// Função auxiliar para filtrar mundos por suprimento
function filtrarMundosPorSuprimento(mundos, suprimento) {
  if (!suprimento || suprimento === "TODOS") return mundos
  return mundos.filter(
    (m) => Array.isArray(m.suprimentos) && m.suprimentos.includes(suprimento)
  )
}

// Função para processar a mensagem e extrair informações
function processarMensagem(textoMensagem) {
  const regex = construirRegexMundoInfo()
  const matches = textoMensagem.match(regex)

  if (!matches) return null

  // Processa os grupos capturados
  const resultado = {
    mundo: null,
    loc: null,
    status: "DESCONHECIDO",
    hostil: false,
    alianca: false,
    suprimentos: null,
  }

  // Extrai informações usando os validadores
  resultado.loc = validadores.verificarLoc(textoMensagem)
  resultado.status = validadores.verificarStatus(textoMensagem)
  resultado.hostil = validadores.verificarHostil(textoMensagem)
  resultado.alianca = validadores.verificarAlianca(textoMensagem)
  resultado.suprimentos = validadores.verificarSuprimentos(textoMensagem)

  // Extrai informação de tempo restante utilizando validador
  const tempoRestante = validadores.verificarTempoRestante(textoMensagem)
  if (tempoRestante) {
    resultado.tempoRestante = {
      queHorasEram: new Date(),
      quantoFaltava: {
        minutos: tempoRestante.minutos,
        segundos: tempoRestante.segundos,
      },
    }
  }

  // Extrai o número do mundo
  const mundoMatch = textoMensagem.match(/\d{1,3}/)
  if (mundoMatch) {
    resultado.mundo = parseInt(mundoMatch[0])
  }

  return resultado
}

// Função auxiliar para registrar dados do jogador no banco de dados
function registrarJogador(discordId, discordUsername) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO jogadores (discord_id, discord_username)
    VALUES (?, ?)
  `)
  stmt.run(discordId, discordUsername)
}

// Função auxiliar para atualizar dados do jogador quando ele participa (conectado canal de voz)
function atualizarParticipacaoWarband(discordId) {
  const agora = new Date().toISOString()

  const stmt = db.prepare(`
    UPDATE jogadores
    SET total_warbands = total_warbands + 1,
        datas_warbands = json_insert(datas_warbands, '$[0]', ?)
    WHERE discord_id = ?
  `)

  stmt.run(agora, discordId)
}

// Função auxiliar para atualizar o tempo total de participação em Warbands
function adicionarTempoWarband(discordId, segundos) {
  const stmt = db.prepare(`
    UPDATE jogadores
    SET tempo_warbands = tempo_warbands + ?
    WHERE discord_id = ?
  `)

  stmt.run(segundos, discordId)
}

// Função auxiliar para atualizar a quantidade de mundos reportados pelo jogador no canal de texto
function atualizarMundosReportados(discordId) {
  const stmt = db.prepare(`
    UPDATE jogadores SET mundos_reportados = mundos_reportados + 1 WHERE discord_id = ?
  `)

  stmt.run(discordId)
}

// Função auxiliar para atualizar a quantidade total de suprimentos informados pelo jogador
function atualizarSuprimentosReportados(discordId, suprimento) {
  const jogador = db
    .prepare(
      `SELECT suprimentos_reportados FROM jogadores WHERE discord_id = ?`
    )
    .get(discordId)

  let suprimentos = JSON.parse(jogador.suprimentos_reportados || "{}")
  suprimentos[suprimento] = (suprimentos[suprimento] || 0) + 1

  const stmt = db.prepare(`
    UPDATE jogadores SET suprimentos_reportados = ? WHERE discord_id = ?
  `)

  stmt.run(JSON.stringify(suprimentos), discordId)
}

// Função auxiliar para configurar o RSN do jogador no banco de dados
function atualizarRSN(discordId, novoRSN) {
  const jogador = db
    .prepare("SELECT historico_rsns FROM jogadores WHERE discord_id=?")
    .get(discordId)

  let historicoRsns = JSON.parse(jogador.historico_rsns || "[]")

  if (!historicoRsns.includes(novoRSN)) historicoRsns.unshift(novoRSN)

  const stmt = db.prepare(`
      UPDATE jogadores SET rsn_atual=?, historico_rsns=? WHERE discord_id=?
   `)

  stmt.run(novoRSN, JSON.stringify(historicoRsns), discordId)
}

// Função auxiliar para configurar o clã do jogador no banco de dados
function atualizarClanJogador(discordId, novoClan) {
  const jogador = db
    .prepare(`SELECT historico_clans FROM jogadores WHERE discord_id=?`)
    .get(discordId)

  let historicoClans = JSON.parse(jogador.historico_clans || "[]")

  if (!historicoClans.includes(novoClan)) historicoClans.unshift(novoClan)

  const stmt = db.prepare(`
       UPDATE jogadores SET clan_atual=?,historico_clans=? WHERE discord_id=?
   `)

  stmt.run(novoClan, JSON.stringify(historicoClans), discordId)
}

// Função auxiliar para registrar advertências do jogador no banco de dados
function aplicarAdvertencia(discordId) {
  const agora = new Date().toISOString()

  const stmt = db.prepare(`
       UPDATE jogadores SET advertencias=advertencias+1,
       datas_advertencias=json_insert(datas_advertencias,'$[0]',?)
       WHERE discord_id=?
   `)

  stmt.run(agora, discordId)
}

// Função auxiliar para registrar suspensões do jogador no banco de dados
function aplicarSuspensao(discordId) {
  const agora = new Date().toISOString()

  const stmt = db.prepare(`
       UPDATE jogadores SET suspensoes=suspensoes+1,
       datas_suspensoes=json_insert(datas_suspensoes,'$[0]',?)
       WHERE discord_id=?
   `)

  stmt.run(agora, discordId)
}

// Função auxiliar para gerar quadro de horários (/horarios)
function gerarQuadroHorarios(fusoHorario = "BR") {
  // Mapear dias da semana para exibição
  const diasSemana = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ]

  // Inicializar objeto para armazenar horários por dia da semana
  const horariosFuso = {
    0: [], // Domingo
    1: [], // Segunda
    2: [], // Terça
    3: [], // Quarta
    4: [], // Quinta
    5: [], // Sexta
    6: [], // Sábado
  }

  // Ajuste do fuso horário (-3 para Brasil, 0 para UTC)
  const ajusteFuso = fusoHorario === "BR" ? -3 : 0

  // Mapear dias da semana para índices
  const mapaDias = {
    domingo: 0,
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
  }

  // Processar cada dia e seus horários
  for (const [dia, horarios] of Object.entries(horariosWarbands)) {
    const indiceDia = mapaDias[dia]

    // Converter cada horário para o fuso escolhido
    horarios.forEach((horario) => {
      const [hora, minuto] = horario.split(":").map(Number)

      // Ajustar hora conforme o fuso
      let horaAjustada = hora + ajusteFuso
      let indiceDiaAjustado = indiceDia

      // Ajustar dia se o horário for anterior à meia-noite
      if (horaAjustada < 0) {
        horaAjustada += 24
        indiceDiaAjustado = (indiceDiaAjustado - 1 + 7) % 7
      }

      // Ajustar dia se o horário for após às 23:59
      if (horaAjustada >= 24) {
        horaAjustada -= 24
        indiceDiaAjustado = (indiceDiaAjustado + 1) % 7
      }

      // Formatar o horário ajustado
      const horarioFormatado = `${String(horaAjustada).padStart(
        2,
        "0"
      )}:${String(minuto).padStart(2, "0")}`

      // Adicionar ao dia correto
      horariosFuso[indiceDiaAjustado].push(horarioFormatado)
    })
  }

  // Ordenar os horários de cada dia
  for (let i = 0; i < 7; i++) {
    horariosFuso[i].sort((a, b) => {
      const [horaA, minutoA] = a.split(":").map(Number)
      const [horaB, minutoB] = b.split(":").map(Number)
      return horaA * 60 + minutoA - (horaB * 60 + minutoB)
    })
  }

  // Preparar dados para a tabela
  const dados = [diasSemana]

  // Encontrar o máximo de horários em um dia
  const maxHorarios = Math.max(
    ...Object.values(horariosFuso).map((h) => h.length)
  )

  // Preencher linhas de horários
  for (let i = 0; i < maxHorarios; i++) {
    const linha = []

    for (let dia = 0; dia < 7; dia++) {
      linha.push(
        horariosFuso[dia] && i < horariosFuso[dia].length
          ? horariosFuso[dia][i]
          : ""
      )
    }

    dados.push(linha)
  }

  // Configuração da tabela
  const config = {
    border: {
      topBody: `─`,
      topJoin: `┬`,
      topLeft: `┌`,
      topRight: `┐`,
      bottomBody: `─`,
      bottomJoin: `┴`,
      bottomLeft: `└`,
      bottomRight: `┘`,
      bodyLeft: `│`,
      bodyRight: `│`,
      bodyJoin: `│`,
      joinBody: `─`,
      joinLeft: `├`,
      joinRight: `┤`,
      joinJoin: `┼`,
    },
    header: {
      alignment: "center",
      content:
        fusoHorario === "BR"
          ? "Horários de Warbands (Brasil GMT -03h00)"
          : "Horários de Warbands (Horário Oficial do Jogo GMT 00h00)",
    },
  }

  return table(dados, config)
}

// Função auxiliar para calcular tempo próxima Warbands (/horarios)
function calcularTempoProximaWarbands() {
  const agora = new Date()

  // Obter o dia da semana atual
  const diaSemanaCompleto = agora
    .toLocaleString("pt-BR", {
      weekday: "long",
      timeZone: "UTC",
    })
    .toLowerCase()

  // Mapear para os dias sem acento
  const mapaDiasSemana = {
    domingo: "domingo",
    "segunda-feira": "segunda",
    "terça-feira": "terca",
    "quarta-feira": "quarta",
    "quinta-feira": "quinta",
    "sexta-feira": "sexta",
    sábado: "sabado",
  }

  const diaSemanaAtual = mapaDiasSemana[diaSemanaCompleto]

  // Obter todos os horários da semana
  const todosHorarios = []

  // Dias da semana em ordem
  const diasSemana = [
    "domingo",
    "segunda",
    "terca",
    "quarta",
    "quinta",
    "sexta",
    "sabado",
  ]

  // Índice do dia atual
  const indiceDiaAtual = diasSemana.indexOf(diaSemanaAtual)

  // Adicionar horários dos próximos 7 dias
  for (let i = 0; i < 7; i++) {
    const indice = (indiceDiaAtual + i) % 7
    const dia = diasSemana[indice]
    const horariosDia = horariosWarbands[dia] || []

    horariosDia.forEach((horario) => {
      const [hora, minuto] = horario.split(":").map(Number)

      // Criar data para este horário
      const dataHorario = new Date(agora)
      dataHorario.setUTCDate(dataHorario.getUTCDate() + i)
      dataHorario.setUTCHours(hora, minuto, 0, 0)

      // Só adicionar se for no futuro
      if (dataHorario > agora) {
        todosHorarios.push(dataHorario)
      }
    })
  }

  // Ordenar horários
  todosHorarios.sort((a, b) => a - b)

  // Pegar o próximo horário
  const proximoHorario = todosHorarios[0]

  if (!proximoHorario) {
    return "Não foi possível calcular o tempo para a próxima Warbands"
  }

  // Calcular diferença em milissegundos
  const diferencaMs = proximoHorario - agora

  // Converter para horas e minutos
  const horas = Math.floor(diferencaMs / (1000 * 60 * 60))
  const minutos = Math.floor((diferencaMs % (1000 * 60 * 60)) / (1000 * 60))

  return `${obterEmoji("notify")} Faltam atualmente \`${horas}h${minutos
    .toString()
    .padStart(2, "0")}\` para a próxima **Warbands**`
}

// Função auxiliar para calcular tempo até o reset
function calcularTempoAteReset() {
  const agora = new Date()

  // Criar data do próximo reset (próxima meia-noite UTC)
  const proximoReset = new Date(agora)
  proximoReset.setUTCHours(24, 0, 0, 0)

  // Calcular diferença em milissegundos
  const diferencaMs = proximoReset - agora

  // Converter para horas e minutos
  const horas = Math.floor(diferencaMs / (1000 * 60 * 60))
  const minutos = Math.floor((diferencaMs % (1000 * 60 * 60)) / (1000 * 60))

  return `${obterEmoji("loop2")} Faltam atualmente \`${horas}h${minutos
    .toString()
    .padStart(2, "0")}\` para o horário de **reset**`
}

// Funções auxiliares para o comando /botstatus
function formatarBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`
}

function formatarUptime(segundos) {
  const dias = Math.floor(segundos / 86400)
  const horas = Math.floor((segundos % 86400) / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)
  const segs = Math.floor(segundos % 60)

  return `${dias}d ${horas}h ${minutos}m ${segs}s`
}

client.once("ready", async () => {
  try {
    console.log(`✅ Bot online como ${client.user.tag}`)
    await client.application.commands.set([
      cmdList,
      cmdTable,
      cmdTimelist,
      cmdHorarios,
      cmdSetRSN,
      cmdSetClan,
      cmdPing,
      cmdBotstatus,
    ])
    console.log("✅ Comandos slash registrados com sucesso")

    // Criar eventos node-cron com os horários de Warbands (adiantados em 15 minutos)
    const horariosComAdiantamento = calcularHorariosComAdiantamento()

    for (const [dia, horarios] of Object.entries(horariosComAdiantamento)) {
      horarios.forEach((horario) => {
        const [hora, minuto] = horario.split(":")
        const cronExpression = `${minuto} ${hora} * * ${diaToCron(dia)}`

        cron.schedule(cronExpression, async () => {
          console.log(
            `🔔 Ciclo automático iniciado para Warbands às ${hora}:${minuto} UTC`
          )

          await executarCicloWarbands(horario)
        })
      })
    }

    console.log("✅ Jobs cron configurados com sucesso")

    setInterval(async () => {
      try {
        // Obter a data e hora atuais
        const agora = new Date()

        // Obter o dia da semana atual em formato compatível com as chaves do arquivo horarios.json
        const diaSemanaCompleto = agora
          .toLocaleString("pt-BR", {
            weekday: "long",
            timeZone: "UTC",
          })
          .toLowerCase()

        // Mapear para os dias sem acento conforme o arquivo horarios.json
        const mapaDiasSemana = {
          domingo: "domingo",
          "segunda-feira": "segunda",
          "terça-feira": "terca",
          "quarta-feira": "quarta",
          "quinta-feira": "quinta",
          "sexta-feira": "sexta",
          sábado: "sabado",
        }

        const diaSemanaAtual = mapaDiasSemana[diaSemanaCompleto] || null

        if (!diaSemanaAtual) {
          console.error(
            `❌ Dia da semana "${diaSemanaCompleto}" não encontrado no mapa.`
          )
          return
        }

        const horariosHoje = horariosWarbands[diaSemanaAtual]

        if (!horariosHoje) {
          console.log(
            `Nenhum horário encontrado para hoje (${diaSemanaAtual}).`
          )
          return
        }

        // Verifica se estamos dentro do período de 30 minutos após uma Warbands
        const emWarbands = horariosHoje.some((horario) => {
          const [hora, minuto] = horario.split(":").map(Number)

          // Criar uma data em UTC para comparação correta
          const dataWB = new Date()
          dataWB.setUTCHours(hora, minuto, 0, 0)

          // Diferença em minutos
          const diferencaMinutos = (agora - dataWB) / (1000 * 60)
          return diferencaMinutos >= 0 && diferencaMinutos <= 30
        })

        if (!emWarbands) {
          return
        }

        console.log(
          "✅ Warbands em andamento detectada! Registrando tempo de participação..."
        )

        // Se estamos em período de Warbands, registra tempo para jogadores no canal de voz
        const canalVozWarbands = await client.channels.fetch(
          process.env.CANAL_VOZ_WARBANDS
        )

        if (canalVozWarbands.members && canalVozWarbands.members.size > 0) {
          canalVozWarbands.members.forEach((membro) => {
            registrarJogador(membro.user.id, membro.user.username)
            adicionarTempoWarband(membro.user.id, 60) // Adiciona 1 minuto ao tempo total do jogador
          })

          console.log(
            `⏱️ Tempo de participação em Warbands atualizado para ${canalVozWarbands.members.size} jogadores`
          )
        }
      } catch (erro) {
        console.error(
          `❌ Erro ao registrar tempo de participação: ${erro.message}`
        )
      }
    }, 1 * 60 * 1000) // Executa a cada 1 minuto

    // Intervalo para chamar automaticamente função de verificar mundos que caíram
    setInterval(verificarMundosQueCairam, 15 * 1000)
    console.log(
      "✅ Intervalo setado para checagem automática de mundos que caíram por tempo"
    )
  } catch (erro) {
    console.error(`❌ Erro na inicialização do bot: ${erro.message}`)
  }
})

client.on("messageCreate", async (mensagem) => {
  try {
    if (mensagem.author.bot) return

    if (canaisWarbands.includes(mensagem.channelId)) {
      const textoMensagem = sanitizarMensagem(mensagem)
      const resultado = processarMensagem(textoMensagem)

      if (resultado && resultado.mundo) {
        if (!mundosValidos.includes(resultado.mundo)) {
          const nickname = mensagem.member
            ? mensagem.member.displayName
            : mensagem.author.username
          console.log(
            `❌ Mundo ${resultado.mundo} reportado por ${nickname} foi recusado: não existe no RuneScape`
          )
          await mensagem.react(obterEmoji("errado"))
          return
        }

        const reportador = {
          nickname: mensagem.member
            ? mensagem.member.displayName
            : mensagem.author.username,
          discordId: mensagem.author.id,
          discordTag: mensagem.author.tag,
        }

        const servidor = {
          nome: mensagem.guild.name,
          id: mensagem.guild.id,
        }

        const agora = new Date()
        const indiceExistente = mundos.findIndex(
          (m) => m.mundo === resultado.mundo
        )

        if (
          !resultado.loc &&
          resultado.status === "DESCONHECIDO" &&
          !resultado.suprimentos &&
          !resultado.hostil &&
          !resultado.alianca &&
          !resultado.tempoRestante
        ) {
          console.log(
            `❌ Mundo ${resultado.mundo} reportado por ${reportador.nickname} foi ignorado: o jogador não enviou nenhuma informações reconhecível`
          )
          await mensagem.react(obterEmoji("ajuda"))
          return
        }

        if (indiceExistente !== -1) {
          const mundoExistente = mundos[indiceExistente]
          mundos[indiceExistente] = {
            ...mundoExistente,
            loc: resultado.loc || mundoExistente.loc,
            status:
              resultado.status === "DESCONHECIDO"
                ? mundoExistente.status
                : resultado.status,
            suprimentos: resultado.suprimentos || mundoExistente.suprimentos,
            hostil: resultado.hostil || mundoExistente.hostil,
            alianca: resultado.alianca || mundoExistente.alianca,
            reportadoPor: [...(mundoExistente.reportadoPor || []), reportador],
            reportadoEm: [...(mundoExistente.reportadoEm || []), servidor],
            tempoRestante:
              resultado.tempoRestante || mundoExistente.tempoRestante,
            ultimaAtualizacao: agora,
          }
          console.log(
            `✅ Mundo ${resultado.mundo} atualizado por ${reportador.nickname} com novas informações`
          )
          // Atualizar dados do jogador no banco de dados
          registrarJogador(mensagem.author.id, mensagem.author.username)
          if (resultado.suprimentos) {
            resultado.suprimentos.forEach((suprimento) => {
              atualizarSuprimentosReportados(mensagem.author.id, suprimento)
            })
          }
          console.log(
            `📊 Dados do jogador ${mensagem.author.username} atualizados no banco de dados`
          )
        } else if (resultado.loc) {
          const novoMundo = {
            mundo: resultado.mundo,
            loc: resultado.loc,
            status: resultado.status,
            suprimentos: resultado.suprimentos,
            tempoRestante: resultado.tempoRestante || {
              queHorasEram: null,
              quantoFaltava: null,
            },
            hostil: resultado.hostil,
            alianca: resultado.alianca,
            reportadoPor: [reportador],
            reportadoEm: [servidor],
            primeiroReporte: {
              nickname: reportador.nickname,
              discordId: reportador.discordId,
              discordTag: reportador.discordTag,
              svName: servidor.nome,
              svId: servidor.id,
              horario: agora,
              loc: resultado.loc,
            },
            ultimaAtualizacao: agora,
          }
          mundos.push(novoMundo)
          console.log(
            `✅ Novo mundo ${resultado.mundo} adicionado por ${reportador.nickname} com todas as informações disponíveis`
          )
          // Atualizar dados do jogador no banco de dados
          registrarJogador(mensagem.author.id, mensagem.author.username)
          atualizarMundosReportados(mensagem.author.id)
          if (resultado.suprimentos) {
            resultado.suprimentos.forEach((suprimento) => {
              atualizarSuprimentosReportados(mensagem.author.id, suprimento)
            })
          }
          console.log(
            `📊 Dados do jogador ${mensagem.author.username} atualizados no banco de dados`
          )
        } else {
          await mensagem.reply(
            `Não sei a loc! Envia a msg completa com a loc! ${obterEmoji(
              "ajuda"
            )}`
          )
          await mensagem.react(obterEmoji("ajuda"))
          console.log(
            `❌ ${reportador.nickname} tentou atualizar o mundo ${resultado.mundo} mas não sabemos a loc`
          )
          return
        }
        await mensagem.react(obterEmoji("certo"))

        // Verifica se foi informado tempo restante na mensagem (reação emoji de relógio)
        if (resultado.tempoRestante) {
          await mensagem.react(obterEmoji("relogio2"))
        }
      }
    }
  } catch (erro) {
    console.error(`❌ Erro ao processar mensagem: ${erro.message}`)
  }
})

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return
  if (interaction.commandName === "list") {
    if (!canaisWarbands.includes(interaction.channelId)) {
      await interaction.reply({
        content: "❌ Este comando só pode ser usado nos canais de Warbands!",
        ephemeral: true,
      })
      return
    }

    try {
      // Cria o select menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("filtroSuprimentos")
        .setPlaceholder("Filtrar mundos por suprimentos")
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Todos os mundos (qualquer suprimento)")
            .setDescription(
              "Mostrar todos os mundos reportados independentemente do suprimento"
            )
            .setValue("TODOS")
            .setDefault(true),
          new StringSelectMenuOptionBuilder()
            .setLabel("Apenas Construção")
            .setDescription(
              "Mostrar apenas mundos com suprimentos de Construção"
            )
            .setValue("CONSTRUCAO"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Apenas Agricultura")
            .setDescription(
              "Mostrar apenas mundos com suprimentos de Agricultura"
            )
            .setValue("AGRICULTURA"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Apenas Herbologia")
            .setDescription(
              "Mostrar apenas mundos com suprimentos de Herbologia"
            )
            .setValue("HERBOLOGIA"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Apenas Mineração")
            .setDescription(
              "Mostrar apenas mundos com suprimentos de Mineração"
            )
            .setValue("MINERACAO"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Apenas Metalurgia")
            .setDescription(
              "Mostrar apenas mundos com suprimentos de Metalurgia"
            )
            .setValue("METALURGIA")
        )

      const row = new ActionRowBuilder().addComponents(selectMenu)

      // Função para gerar a lista formatada
      function gerarListaFormatada(filtroSuprimento = "TODOS") {
        // Mapeamento dos tipos de suprimentos para nomes amigáveis
        const nomeSuprimentos = {
          CONSTRUCAO: "Construção",
          AGRICULTURA: "Agricultura",
          HERBOLOGIA: "Herbologia",
          MINERACAO: "Mineração",
          METALURGIA: "Metalurgia",
        }

        const mundosFiltrados = {
          dwf: filtrarMundosPorSuprimento(
            mundos.filter((m) => m.loc === "dwf"),
            filtroSuprimento
          ),
          elm: filtrarMundosPorSuprimento(
            mundos.filter((m) => m.loc === "elm"),
            filtroSuprimento
          ),
          rdi: filtrarMundosPorSuprimento(
            mundos.filter((m) => m.loc === "rdi"),
            filtroSuprimento
          ),
        }

        const listaFormatada = Object.entries(mundosFiltrados)
          .map(([loc, mundosLoc]) => {
            const mundosOrdenados = ordenarMundos(mundosLoc)
            const mundosFormatados =
              mundosOrdenados.length > 0
                ? mundosOrdenados.map(formatarMundo).join(", ")
                : "Nenhum mundo informado..."
            return `**${loc.toUpperCase()}**: ${mundosFormatados}`
          })
          .join("\n")

        // Selecionar qual emoji cpersonalizado deve ser usado
        let nomeEmoji

        switch (filtroSuprimento) {
          case "CONSTRUCAO":
            nomeEmoji = "construction"
            break
          case "AGRICULTURA":
            nomeEmoji = "farming"
            break
          case "HERBOLOGIA":
            nomeEmoji = "herblore"
            break
          case "MINERACAO":
            nomeEmoji = "mining"
            break
          case "METALURGIA":
            nomeEmoji = "smithing"
            break
          default:
            nomeEmoji = null
            break
        }

        // Adiciona o texto informativo apenas se houver um filtro específico
        return filtroSuprimento !== "TODOS"
          ? `${obterEmoji(
              nomeEmoji
            )} Exibindo apenas mundos com suprimentos de **${
              nomeSuprimentos[filtroSuprimento]
            }**:\n${listaFormatada}`
          : listaFormatada
      }

      // Enviar mensagem inicial
      await interaction.reply({
        content: gerarListaFormatada(),
        components: [row],
      })

      // Obtém a mensagem de resposta para criar o coletor de componentes
      const mensagemInicial = await interaction.fetchReply()

      // Cria coletor para o select menu com tempo de 2 minutos
      const collector = mensagemInicial.createMessageComponentCollector({
        time: 120000,
      })

      // Quando o usuário interagir com o select menu...
      collector.on("collect", async (i) => {
        if (i.customId === "filtroSuprimentos") {
          // Atualiza a mensagem com a lista filtrada conforme o valor escolhido.
          await i.update({
            content: gerarListaFormatada(i.values[0]),
            components: [row],
          })
        }
      })

      // Ao encerrar o coletor, desabilite o menu para evitar interações futuras
      collector.on("end", async () => {
        selectMenu.setDisabled(true)
        await mensagemInicial.edit({
          components: [new ActionRowBuilder().addComponents(selectMenu)],
        })
      })
    } catch (erro) {
      console.error(`❌ Erro ao listar mundos: ${erro.message}`)
      await interaction.reply({
        content: "❌ Ocorreu um erro ao listar os mundos!",
        ephemeral: true,
      })
    }
  }
  if (interaction.commandName === "table") {
    if (!canaisWarbands.includes(interaction.channelId)) {
      await interaction.reply({
        content: "❌ Este comando só pode ser usado nos canais de Warbands!",
        ephemeral: true,
      })
      return
    } else {
      try {
        const tabela = gerarTabela()

        // Envia um bloco de código com a tabela
        const resposta = "```" + tabela + "```"
        await interaction.reply(resposta)
      } catch (erro) {
        console.error(`❌ Erro ao gerar a tabela: ${erro.message}`)
        await interaction.reply({
          content: "❌ Ocorreu um erro ao gerar a tabela!",
          ephemeral: true,
        })
      }
    }
  }
  if (interaction.commandName === "timelist") {
    if (!canaisWarbands.includes(interaction.channelId)) {
      await interaction.reply({
        content: "❌ Este comando só pode ser usado nos canais de Warbands!",
        ephemeral: true,
      })
      return
    }

    try {
      // Gera a tabela com os mundos reportados
      const tabelaTimelist = gerarTabelaTimelist(mundos)

      // Envia a tabela no canal onde o comando foi utilizado
      await interaction.reply(`\`\`\`${tabelaTimelist}\`\`\``)
    } catch (erro) {
      console.error(`❌ Erro ao executar /Timelist: ${erro.message}`)
      await interaction.reply({
        content: "❌ Ocorreu um erro ao gerar a lista de tempos!",
        ephemeral: true,
      })
    }
  }
  if (interaction.commandName === "horarios") {
    try {
      // Criar o select menu para escolher o fuso horário
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("fusoHorario")
        .setPlaceholder("Escolha o fuso horário")
        .addOptions([
          new StringSelectMenuOptionBuilder()
            .setLabel("Horários do Brasil (GMT -03h00)")
            .setDescription("Exibir horários no fuso de Brasília")
            .setValue("BR")
            .setDefault(true),
          new StringSelectMenuOptionBuilder()
            .setLabel("Horários Oficiais do Jogo (GMT 00h00)")
            .setDescription("Exibir horários em UTC (horário do jogo)")
            .setValue("UTC"),
        ])

      const row = new ActionRowBuilder().addComponents(selectMenu)

      // Gerar tabela de horários (padrão: Brasil)
      const tabelaHorarios = gerarQuadroHorarios("BR")

      // Calcular tempo até a próxima Warbands
      const tempoProximaWarbands = calcularTempoProximaWarbands()

      // Calcular tempo até o reset
      const tempoAteReset = calcularTempoAteReset()

      // Enviar resposta
      await interaction.reply({
        content: `${obterEmoji(
          "relogio"
        )} **Horários Semanais de Warbands**\n\n\`\`\`\n${tabelaHorarios}\n\`\`\`\n${tempoProximaWarbands}\n${tempoAteReset}`,
        components: [row],
      })

      // Obter a mensagem de resposta usando fetchReply
      const mensagemInicial = await interaction.fetchReply()

      // Criar coletor para o select menu
      const collector = mensagemInicial.createMessageComponentCollector({
        time: 60000, // Menu ativo por 1 minuto
      })

      collector.on("collect", async (i) => {
        if (i.customId === "fusoHorario") {
          const fusoSelecionado = i.values[0]
          const novaTabela = gerarQuadroHorarios(fusoSelecionado)

          // Criar um novo menu com as opções atualizadas
          const novoSelectMenu = new StringSelectMenuBuilder()
            .setCustomId("fusoHorario")
            .setPlaceholder("Escolha o fuso horário")
            .addOptions([
              new StringSelectMenuOptionBuilder()
                .setLabel("Horários do Brasil (GMT -03h00)")
                .setDescription("Exibir horários no fuso de Brasília")
                .setValue("BR")
                .setDefault(fusoSelecionado === "BR"),
              new StringSelectMenuOptionBuilder()
                .setLabel("Horários Oficiais do Jogo (GMT 00h00)")
                .setDescription("Exibir horários em UTC (horário do jogo)")
                .setValue("UTC")
                .setDefault(fusoSelecionado === "UTC"),
            ])

          const novaRow = new ActionRowBuilder().addComponents(novoSelectMenu)

          await i.update({
            content: `**Horários Semanais de Warbands**\n\`\`\`\n${novaTabela}\n\`\`\`\n${tempoProximaWarbands}\n${tempoAteReset}`,
            components: [novaRow],
          })
        }
      })

      collector.on("end", async () => {
        // Desabilita o menu após 1 minuto
        selectMenu.setDisabled(true)
        await mensagemInicial.edit({
          components: [new ActionRowBuilder().addComponents(selectMenu)],
        })
      })
    } catch (erro) {
      console.error(`❌ Erro ao executar /horarios: ${erro.message}`)
      await interaction.reply({
        content: "❌ Ocorreu um erro ao gerar os horários!",
        ephemeral: true,
      })
    }
  }
  if (interaction.commandName === "setrsn") {
    // Verifica se o usuário tem permissão de administrador
    if (!interaction.member.permissions.has("ADMINISTRATOR")) {
      await interaction.reply({
        content: "❌ Você não tem permissão para usar este comando!",
        ephemeral: true,
      })
      return
    }

    const jogador = interaction.options.getUser("jogador")
    const rsn = interaction.options.getString("rsn")

    try {
      registrarJogador(jogador.id, jogador.username)
      atualizarRSN(jogador.id, rsn)

      await interaction.reply({
        content: `✅ RSN de ${jogador.username} definido como \`${rsn}\``,
        ephemeral: true,
      })
    } catch (erro) {
      console.error(`❌ Erro ao definir RSN: ${erro.message}`)
      await interaction.reply({
        content: "❌ Ocorreu um erro ao definir o RSN!",
        ephemeral: true,
      })
    }
  }
  if (interaction.commandName === "setclan") {
    // Verifica se o usuário tem permissão de administrador
    if (!interaction.member.permissions.has("ADMINISTRATOR")) {
      await interaction.reply({
        content: "❌ Você não tem permissão para usar este comando!",
        ephemeral: true,
      })
      return
    }

    const jogador = interaction.options.getUser("jogador")
    const clan = interaction.options.getString("clan")

    try {
      registrarJogador(jogador.id, jogador.username)
      atualizarClanJogador(jogador.id, clan)

      await interaction.reply({
        content: `✅ Clã de ${jogador.username} definido como \`${clan}\``,
        ephemeral: true,
      })
    } catch (erro) {
      console.error(`❌ Erro ao definir clã: ${erro.message}`)
      await interaction.reply({
        content: "❌ Ocorreu um erro ao definir o clã!",
        ephemeral: true,
      })
    }
  }
  if (interaction.commandName === "ping") {
    try {
      // Obtém a latência do WebSocket
      const ping = Math.round(client.ws.ping)

      // Responde ao usuário com o ping
      await interaction.reply(
        obterEmoji("pingpong") + " Pong! `" + ping + " ms`"
      )
    } catch (erro) {
      console.error(`❌ Erro ao executar /ping: ${erro.message}`)
      await interaction.reply({
        content: "❌ Ocorreu um erro ao obter o ping!",
        ephemeral: true,
      })
    }
  }
  if (interaction.commandName === "botstatus") {
    try {
      // Coleta informações do sistema
      const memoria = process.memoryUsage()
      const cpu = process.cpuUsage()
      const uptime = process.uptime()

      // Calcula uso de memória
      const memoriaTotal = os.totalmem()
      const memoriaLivre = os.freemem()
      const memoriaUsada = memoriaTotal - memoriaLivre
      const porcentagemMemoria = ((memoriaUsada / memoriaTotal) * 100).toFixed(
        2
      )

      // Calcula uso de CPU
      const cpuCount = os.cpus().length
      const cargaCPU = os.loadavg()[0]
      const porcentagemCPU = ((cargaCPU / cpuCount) * 100).toFixed(2)

      // Cria o embed
      const embed = {
        color: 0x0099ff,
        title: "📊 Status do Bot",
        fields: [
          {
            name: `${obterEmoji("servidores")} WB Destroyer by Jota`,
            value: [
              "Discord Tag: `" + client.user.tag + "`",
              "Discord ID: `" + client.user.id + "`",
              "Ping: `" + Math.round(client.ws.ping) + "`",
              "Uptime: `" + formatarUptime(uptime) + "`",
              "Versão Node.js: `" + process.version + "`",
              "Plataforma: `" + process.platform + "`",
              "Diretório: `" + process.cwd() + "`",
              "Process ID: `" + process.pid + "`",
            ].join("\n"),
            inline: false,
          },
          {
            name: `${obterEmoji("memoria")} Uso de Memória`,
            value: [
              "RAM Total: `" + formatarBytes(memoriaTotal) + "`",
              "RAM Usada: `" +
                formatarBytes(memoriaUsada) +
                porcentagemMemoria +
                "%`",
              "RAM Livre: `" +
                formatarBytes(memoriaLivre) +
                (100 - porcentagemMemoria).toFixed(2) +
                "%`",
              "Heap Usado: `" + formatarBytes(memoria.heapUsed) + "`",
              "Heap Total: `" + formatarBytes(memoria.heapTotal) + "`",
              "Heap Disponível: `" +
                formatarBytes(memoria.heapTotal - memoria.heapUsed) +
                "`",
              "RSS (Resident Set Size): `" + formatarBytes(memoria.rss) + "`",
              "Memória Externa: `" + formatarBytes(memoria.external) + "`",
              "Array Buffers: `" +
                formatarBytes(memoria.arrayBuffers || 0) +
                "`",
              "Buffer Cache: `" +
                formatarBytes(
                  os.totalmem() - os.freemem() - memoria.heapTotal
                ) +
                "`",
            ].join("\n"),
            inline: false,
          },
          {
            name: `${obterEmoji("cpu")} Processamento`,
            value: [
              "Modelo CPU: `" + os.cpus()[0].model + "`",
              "Número de núcleos: `" + cpuCount + "`",
              "Arquitetura: `" + os.arch() + "`",
              "Uso atual de CPU: `" + porcentagemCPU + "%`",
              "Sistema: `" + os.platform() + " " + os.release() + "`",
            ].join("\n"),
            inline: false,
          },
          {
            name: `${obterEmoji("connection")} Estatísticas Discord`,
            value: [
              "Servidores: `" + client.guilds.cache.size + "`",
              "Canais: `" + client.channels.cache.size + "`",
              "Canais de Texto: `" +
                client.channels.cache.filter((c) => c.type === 0).size +
                "`",
              "Canais de Voz: `" +
                client.channels.cache.filter((c) => c.type === 2).size +
                "`",
              "Categorias: `" +
                client.channels.cache.filter((c) => c.type === 4).size +
                "`",
              "Usuários Totais: `" + client.users.cache.size + "`",
              "Emojis: `" + client.emojis.cache.size + "`",
            ].join("\n"),
            inline: false,
          },
          {
            name: `${obterEmoji("resume")} Status Warbands`,
            value: [
              "Mundos Armazenados: `" + mundos.length + "`",
              "Mundos por Localização:",
              "• DWF: `" + mundos.filter((m) => m.loc === "dwf").length + "`",
              "• ELM: `" + mundos.filter((m) => m.loc === "elm").length + "`",
              "• RDI: `" + mundos.filter((m) => m.loc === "rdi").length + "`",
              "Mundos Beamed: `" +
                mundos.filter((m) => m.status === "BEAMED").length +
                "`",
              "Mundos com PKs: `" + mundos.filter((m) => m.hostil).length + "`",
              "Mundos com Tempo: `" +
                mundos.filter(
                  (m) => m.tempoRestante && m.tempoRestante.quantoFaltava
                ).length +
                "`",
            ].join("\n"),
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: "👨‍💻 Coded by Jota",
        },
      }

      await interaction.reply({ embeds: [embed] })
    } catch (erro) {
      console.error(`❌ Erro ao executar /botstatus: ${erro.message}`)
      await interaction.reply({
        content: "❌ Ocorreu um erro ao obter o status do bot!",
        ephemeral: true,
      })
    }
  }
})

client.login(process.env.BOT_TOKEN)
