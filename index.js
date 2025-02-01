import { Client, GatewayIntentBits, SlashCommandBuilder } from "discord.js"
import dotenv from "dotenv"
import { table } from "table"

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

// Registra o comando slash "list"
const cmdList = new SlashCommandBuilder()
  .setName("list")
  .setDescription("Lista os mundos reportados organizados por localidade")

// Registra o comando slash "quadro"
const cmdTable = new SlashCommandBuilder()
  .setName("table")
  .setDescription(
    "Exibe um quadro com as informações dos mundos reportados em formato de tabela"
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
    textoFormatado += "`☠️`"
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

client.once("ready", async () => {
  try {
    console.log(`✅ Bot online como ${client.user.tag}`)
    await client.application.commands.set([cmdList, cmdTable])
    console.log("✅ Comandos /list e /table registrados com sucesso")
  } catch (erro) {
    console.error(`❌ Erro ao registrar comandos slash: ${erro.message}`)
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
          await mensagem.react("❌")
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
          !resultado.alianca
        ) {
          console.log(
            `❌ Mundo ${resultado.mundo} reportado por ${reportador.nickname} foi ignorado: o jogador não enviou nenhuma informações reconhecível`
          )
          await mensagem.react("❓")
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
        } else {
          await mensagem.reply("Não sei a loc! Envia a msg completa com a loc")
          await mensagem.react("❓")
          console.log(
            `❌ ${reportador.nickname} tentou atualizar o mundo ${resultado.mundo} mas não sabemos a loc`
          )
          return
        }
        await mensagem.react("✅")
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
      const mundosPorLoc = {
        dwf: mundos.filter((m) => m.loc === "dwf"),
        elm: mundos.filter((m) => m.loc === "elm"),
        rdi: mundos.filter((m) => m.loc === "rdi"),
      }

      const listasFormatadas = Object.entries(mundosPorLoc).map(
        ([loc, mundosLoc]) => {
          const mundosOrdenados = ordenarMundos(mundosLoc)
          const mundosFormatados = mundosOrdenados.map(formatarMundo).join(", ")
          return `**${loc.toUpperCase()}**: ${mundosFormatados}`
        }
      )

      await interaction.reply(listasFormatadas.join("\n"))
    } catch (erro) {
      console.error(`❌ Erro ao listar mundos: ${erro.message}`)
      await interaction.reply({
        content: "❌ Ocorreu um erro ao listar os mundos!",
        ephemeral: true,
      })
    }
  }

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
})

client.login(process.env.BOT_TOKEN)
