# ============================================================================
# Estágio 1 — AI-GENIE de verdade (AIGENIE::AIGENIE / AIGENIE::GENIE)
#
# A versão anterior deste script NÃO era AI-GENIE. Era uma aproximação escrita
# à mão que:
#   - deduplicava por cosseno > 0.95 (o AI-GENIE usa UVA/wTO iterativo);
#   - passava uma matriz de similaridade cosseno como `data` para EGAnet::EGA
#     (o AI-GENIE passa a matriz de EMBEDDINGS transposta: dimensões nas
#     linhas, itens nas colunas);
#   - não rodava bootEGA, logo não tinha estabilidade de item — que é o
#     critério central de qualidade do método (corte 0.75);
#   - não calculava NMI, logo não havia como dizer se o pool melhorou;
#   - não escolhia entre embeddings full e sparse (passo 4 do artigo).
#
# Ou seja: entregava um pool de itens sem nenhuma das evidências estruturais
# que justificam vender o produto. Este script chama o pacote oficial.
#
# Referência: Russell-Lasalandra, Christensen & Golino (2026),
# Behavior Research Methods 58:217 — os 6 passos do pipeline.
#
# Dois modos:
#   mode = "generate" → AIGENIE(): gera itens novos e reduz o pool.
#   mode = "validate" → GENIE():   só valida/reduz um pool que já existe
#                                  (revalidação de instrumento, curadoria de
#                                  forma A antes de gerar a forma B).
# ============================================================================
source(file.path(getwd(), "r-scripts", "_common.R"))

run_with_error_capture(function() {
  inp <- read_input()
  p <- inp$params
  construct <- inp$construct

  if (!requireNamespace("AIGENIE", quietly = TRUE)) {
    stop("Pacote AIGENIE não instalado. Este estágio não tem fallback: sem ",
         "AIGENIE não há UVA, bootEGA nem NMI, e o resultado não seria ",
         "AI-GENIE. Rebuild da imagem r-engine resolve.")
  }

  # --------------------------------------------------------------------------
  # Chaves de API. O AIGENIE recebe as chaves como argumento, não por env.
  # --------------------------------------------------------------------------
  key <- function(...) {
    for (nm in c(...)) {
      v <- Sys.getenv(nm, unset = "")
      if (nzchar(v)) return(v)
    }
    NULL
  }
  openai_key    <- key("OPENAI_API_KEY", "AI_INTEGRATIONS_OPENAI_API_KEY")
  anthropic_key <- key("ANTHROPIC_API_KEY", "AI_INTEGRATIONS_ANTHROPIC_API_KEY")
  groq_key      <- key("GROQ_API_KEY")
  jina_key      <- key("JINA_API_KEY")

  embedding_model <- p$embeddingModel %||% "text-embedding-3-small"

  # O embedding é obrigatório em ambos os modos — é o passo 1 do pipeline.
  embed_needs_openai <- grepl("^text-embedding", embedding_model)
  if (embed_needs_openai && is.null(openai_key)) {
    stop("embeddingModel '", embedding_model, "' exige OPENAI_API_KEY. ",
         "Para usar Jina, defina JINA_API_KEY e embeddingModel = 'jina-embeddings-v3'.")
  }

  # --------------------------------------------------------------------------
  # Normalização dos parâmetros
  #
  # Aceita tanto o contrato antigo (itemAttributes como vetor plano de
  # strings) quanto o formato que o AI-GENIE realmente exige (lista nomeada
  # por tipo de item). O formato plano é mapeado para um único tipo, com o
  # nome do construto — o app antigo continua funcionando enquanto a UI não
  # migra para o formato multi-dimensão.
  # --------------------------------------------------------------------------
  as_chr <- function(x) as.character(unlist(x, use.names = FALSE))

  normalize_attributes <- function(raw, fallback_type) {
    if (is.null(raw) || length(raw) == 0L) return(NULL)
    nms <- names(raw)
    if (is.null(nms) || any(!nzchar(nms))) {
      # Contrato legado: vetor plano → um único tipo de item.
      out <- list(as_chr(raw))
      names(out) <- fallback_type
      out
    } else {
      lapply(raw, as_chr)
    }
  }

  item_attributes <- normalize_attributes(p$itemAttributes, construct)
  if (is.null(item_attributes)) {
    stop("itemAttributes é obrigatório: o AI-GENIE gera itens por atributo, ",
         "não por construto solto. Ex.: neuroticismo = c('ansioso', ",
         "'inseguro', 'irritável').")
  }
  curtos <- names(item_attributes)[vapply(item_attributes,
                                          function(a) length(unique(a)) < 2L, logical(1))]
  if (length(curtos) > 0L) {
    stop("Cada tipo de item precisa de pelo menos 2 atributos únicos. ",
         "Insuficientes: ", paste(curtos, collapse = ", "), ".")
  }

  # itemExamples: vetor de strings (legado) ou lista de
  # {statement, attribute, type}. É por aqui que entram os itens da forma
  # original quando o objetivo é gerar uma forma paralela.
  normalize_examples <- function(raw, attrs) {
    if (is.null(raw) || length(raw) == 0L) return(NULL)
    first_type <- names(attrs)[1]
    first_attr <- attrs[[1]][1]
    if (is.null(names(raw)) && all(vapply(raw, function(x) is.character(x) || is.list(x), logical(1)))) {
      rows <- lapply(raw, function(x) {
        if (is.list(x) && !is.null(x$statement)) {
          list(statement = as.character(x$statement),
               attribute = as.character(x$attribute %||% first_attr),
               type      = as.character(x$type %||% first_type))
        } else {
          list(statement = as.character(x), attribute = first_attr, type = first_type)
        }
      })
      data.frame(
        statement = vapply(rows, `[[`, character(1), "statement"),
        attribute = vapply(rows, `[[`, character(1), "attribute"),
        type      = vapply(rows, `[[`, character(1), "type"),
        stringsAsFactors = FALSE
      )
    } else NULL
  }
  item_examples <- normalize_examples(p$itemExamples, item_attributes)

  # Depois do round-trip por JSON, "ausente" chega ora como NULL, ora como
  # list() vazia. O AIGENIE valida os argumentos e rejeita list() onde espera
  # NULL, então normalizamos aqui.
  nil_if_empty <- function(x) if (is.null(x) || length(x) == 0L) NULL else x

  type_definitions <- nil_if_empty(p$itemTypeDefinitions)
  if (!is.null(type_definitions)) {
    type_definitions <- lapply(type_definitions, function(d) as.character(d)[1])
    faltando <- setdiff(names(type_definitions), names(item_attributes))
    if (length(faltando) > 0L) {
      stop("itemTypeDefinitions tem tipos que não existem em itemAttributes: ",
           paste(faltando, collapse = ", "), ".")
    }
    # O AIGENIE exige que os nomes batam exatamente com os de item.attributes.
    type_definitions <- type_definitions[names(item_attributes)]
    names(type_definitions) <- names(item_attributes)
    type_definitions[vapply(type_definitions, is.null, logical(1))] <- ""
  }

  response_options <- nil_if_empty(p$responseOptions)
  if (!is.null(response_options)) response_options <- as_chr(response_options)

  # target.N por tipo. O artigo recomenda >= 60 itens por tipo para que a
  # redução tenha o que reduzir; abaixo disso o bootEGA fica instável.
  target_n <- as.integer(p$targetN %||% 60L)
  if (target_n < 60L) {
    log_warn("targetN = ", target_n, " está abaixo dos 60 itens/tipo que o ",
             "artigo do AI-GENIE recomenda; UVA e bootEGA podem ficar instáveis.")
  }

  # EGA.model: TMFG ou glasso. O artigo reporta TMFG levemente melhor para
  # dados de texto — é o default aqui.
  ega_model     <- p$egaModel %||% "TMFG"
  ega_algorithm <- p$egaAlgorithm %||% "walktrap"

  mode <- p$mode %||% "generate"

  # --------------------------------------------------------------------------
  # Ambiente Python (o AIGENIE embeda via reticulate, não por HTTP em R).
  # Na imagem o venv já vem pronto, então isto só valida e aponta o reticulate.
  # --------------------------------------------------------------------------
  # O venv já vem pronto na imagem, então isto só aponta o reticulate e importa
  # os módulos. Os marcos abaixo existem porque a etapa é opaca: sem eles, uma
  # falha aqui aparece como silêncio entre 2% e 10%, sem dizer se travou na
  # inicialização do Python ou em algum import.
  progress(0.02, "Preparando ambiente Python do AIGENIE")
  log_info("Python configurado: ", Sys.getenv("RETICULATE_PYTHON", unset = "(RETICULATE_PYTHON não definido)"))
  t0 <- Sys.time()
  AIGENIE::ensure_aigenie_python()
  log_info(sprintf("Ambiente Python pronto em %.1f s", as.numeric(difftime(Sys.time(), t0, units = "secs"))))
  progress(0.05, "Ambiente Python pronto")

  # Encaminha as mensagens do AIGENIE para o stream de logs do job em vez de
  # deixá-las soltas no stdout, que é o canal do protocolo PSYCHGEN_*.
  with_forwarded_logs <- function(expr) {
    withCallingHandlers(
      expr,
      message = function(m) {
        txt <- trimws(conditionMessage(m))
        if (nzchar(txt)) log_info("[AIGENIE] ", txt)
        invokeRestart("muffleMessage")
      },
      warning = function(w) {
        log_warn("[AIGENIE] ", conditionMessage(w))
        invokeRestart("muffleWarning")
      }
    )
  }

  # --------------------------------------------------------------------------
  # Execução
  # --------------------------------------------------------------------------
  if (identical(mode, "validate")) {
    raw_items <- p$items
    if (is.null(raw_items) || length(raw_items) == 0L) {
      stop("mode = 'validate' exige `items` (o pool a ser validado).")
    }
    first_type <- names(item_attributes)[1]
    first_attr <- item_attributes[[1]][1]
    items_df <- do.call(rbind, lapply(seq_along(raw_items), function(i) {
      x <- raw_items[[i]]
      data.frame(
        ID        = i,
        statement = as.character(if (is.list(x)) x$statement %||% x$text else x),
        attribute = as.character(if (is.list(x)) x$attribute %||% first_attr else first_attr),
        type      = as.character(if (is.list(x)) x$type %||% first_type else first_type),
        stringsAsFactors = FALSE
      )
    }))

    progress(0.10, sprintf("GENIE: validando %d itens existentes", nrow(items_df)))
    res <- with_forwarded_logs(AIGENIE::GENIE(
      items           = items_df,
      openai.API      = openai_key,
      jina.API        = jina_key,
      embedding.model = embedding_model,
      EGA.model       = ega_model,
      EGA.algorithm   = ega_algorithm,
      run.overall     = isTRUE(p$runOverall),
      all.together    = isTRUE(p$allTogether),
      plot            = FALSE,
      silently        = TRUE
    ))
    model_used <- paste0("GENIE/", embedding_model)

  } else {
    model_used <- p$model %||% "gpt-4o"
    progress(0.10, sprintf("AIGENIE: gerando ~%d itens por tipo (%d tipos)",
                           target_n, length(item_attributes)))

    res <- with_forwarded_logs(AIGENIE::AIGENIE(
      item.attributes       = item_attributes,
      openai.API            = openai_key,
      anthropic.API         = anthropic_key,
      groq.API              = groq_key,
      jina.API              = jina_key,
      model                 = model_used,
      temperature           = as.numeric(p$temperature %||% 1),
      top.p                 = as.numeric(p$topP %||% 1),
      embedding.model       = embedding_model,
      target.N              = target_n,
      domain                = p$domain %||% "psicometria",
      scale.title           = p$scaleTitle %||% construct,
      item.examples         = item_examples,
      audience              = p$audience,
      item.type.definitions = type_definitions,
      response.options      = response_options,
      prompt.notes          = p$promptNotes,
      system.role           = p$systemRole,
      EGA.model             = ega_model,
      EGA.algorithm         = ega_algorithm,
      adaptive              = isTRUE(p$adaptive %||% TRUE),
      run.overall           = isTRUE(p$runOverall),
      all.together          = isTRUE(p$allTogether),
      keep.org              = TRUE,
      plot                  = FALSE,
      silently              = TRUE
    ))
  }

  progress(0.90, "Consolidando resultados do pipeline")

  # --------------------------------------------------------------------------
  # Mapeamento do retorno
  #
  # O AIGENIE devolve muito mais do que o app consumia antes. As chaves
  # antigas (items/rounds/rejected/egaSummary/model) são preservadas para não
  # quebrar o jobs.ts; as métricas reais do método entram em `perType` e
  # `aigenie`.
  # --------------------------------------------------------------------------
  final_items <- res$overall$final_items
  if (is.null(final_items) || nrow(final_items) == 0L) {
    stop("O pipeline terminou sem itens sobreviventes. Isso costuma indicar ",
         "targetN baixo demais ou atributos semanticamente sobrepostos.")
  }

  num <- function(x) if (is.null(x) || length(x) == 0L) NULL else as.numeric(x)[1]
  int <- function(x) if (is.null(x) || length(x) == 0L) NULL else as.integer(x)[1]

  per_type <- lapply(names(res$item_type_level), function(tp) {
    t <- res$item_type_level[[tp]]
    stab <- tryCatch(t$bootEGA$final_boot$stability$item.stability$empirical.dimensions,
                     error = function(e) NULL)
    list(
      type            = tp,
      startN          = int(t$start_N),
      finalN          = int(t$final_N),
      initialNMI      = num(t$initial_NMI),
      finalNMI        = num(t$final_NMI),
      egaModel        = as.character(t$EGA.model_selected %||% ega_model),
      uvaRemoved      = int(t$UVA$n_removed),
      uvaSweeps       = int(t$UVA$n_sweeps),
      bootEgaRemoved  = int(t$bootEGA$n_removed),
      meanItemStability = if (!is.null(stab)) mean(as.numeric(stab), na.rm = TRUE) else NULL
    )
  })
  names(per_type) <- NULL

  start_total <- sum(vapply(per_type, function(x) x$startN %||% 0L, numeric(1)))
  nmi_final   <- vapply(per_type, function(x) x$finalNMI   %||% NA_real_, numeric(1))
  nmi_initial <- vapply(per_type, function(x) x$initialNMI %||% NA_real_, numeric(1))

  items_out <- lapply(seq_len(nrow(final_items)), function(i) {
    com <- final_items$EGA_com[i]
    list(
      text      = as.character(final_items$statement[i]),
      community = if (is.null(com) || is.na(com)) NULL else as.integer(com),
      attribute = as.character(final_items$attribute[i] %||% NA),
      type      = as.character(final_items$type[i] %||% construct)
    )
  })

  progress(1, sprintf("Concluído: %d itens finais (de %d gerados)",
                      nrow(final_items), as.integer(start_total)))

  list(
    # ---- chaves consumidas hoje pelo jobs.ts -------------------------------
    items    = items_out,
    rounds   = length(item_attributes),
    rejected = as.integer(max(0, start_total - nrow(final_items))),
    egaSummary = list(
      dimensions = as.integer(length(unique(stats::na.omit(final_items$EGA_com)))),
      method     = sprintf("AIGENIE::%s (EGA %s + UVA + bootEGA)",
                           if (identical(mode, "validate")) "GENIE" else "AIGENIE",
                           ega_model),
      n_items    = nrow(final_items)
    ),
    model = model_used,

    # ---- evidências estruturais reais do AI-GENIE --------------------------
    aigenie = list(
      mode            = mode,
      packageVersion  = as.character(utils::packageVersion("AIGENIE")),
      embeddingModel  = embedding_model,
      egaModel        = ega_model,
      egaAlgorithm    = ega_algorithm,
      targetN         = target_n,
      startN          = as.integer(start_total),
      finalN          = nrow(final_items),
      meanInitialNMI  = if (all(is.na(nmi_initial))) NULL else mean(nmi_initial, na.rm = TRUE),
      meanFinalNMI    = if (all(is.na(nmi_final)))   NULL else mean(nmi_final,   na.rm = TRUE)
    ),
    perType = per_type
  )
})
