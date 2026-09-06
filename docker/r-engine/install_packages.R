# ============================================================================
# PsychGen BR — R package install (run at image build time, as root).
#
# Instala o stack R + o ambiente Python que o AIGENIE exige via reticulate.
#
# Duas decisões estruturais em relação à versão anterior deste arquivo:
#
#   1. `pak` no lugar de `install.packages()`. O pak resolve os *system
#      requirements* de cada pacote CRAN consultando a base de sysreqs do
#      Posit e instala os .deb correspondentes via apt. A versão anterior
#      mantinha a lista de libs do sistema à mão no Dockerfile, o que
#      quebrou o build de verdade: o binário do igraph precisava de
#      `libglpk.so.40`, que não estava na lista, e o build morria em
#      "unable to load shared object". Adivinhar essa lista não escala.
#
#   2. Falha dura. A versão anterior embrulhava o install do AIGENIE em
#      tryCatch e seguia adiante com um aviso, então a imagem subia "com
#      sucesso" sem AIGENIE e o pipeline caía silenciosamente no fallback
#      `igraph::cluster_louvain` — que NÃO é AI-GENIE (não tem UVA, não tem
#      bootEGA, não tem NMI). Um pipeline que se diz AI-GENIE mas não roda
#      AI-GENIE é pior do que um build que falha. Agora o build falha.
#
# Escape hatch para desenvolvimento: PSYCHGEN_ALLOW_MISSING_AIGENIE=1.
# ============================================================================

SNAPSHOT <- Sys.getenv("CRAN_SNAPSHOT", unset = "2026-08-03")

options(
  # Distro do base image (rocker/r-ver → Ubuntu Noble 24.04). Usar
  # binários de outra distro instala mas quebra no load por ABI de libstdc++.
  repos = c(CRAN = sprintf(
    "https://packagemanager.posit.co/cran/__linux__/noble/%s", SNAPSHOT
  )),
  install.packages.check.source = "no",
  # pak instala sysreqs via apt quando roda como root.
  pkg.sysreqs = TRUE,
  pkg.sysreqs_db_update = TRUE
)
Sys.setenv(PKG_SYSREQS = "true")

# ---------------------------------------------------------------------------
# Guarda de versão do R.
#
# O snapshot precisa ser recente (para trazer EGAnet >= 2.4.0), e pacotes
# recentes usam a API C do R 4.5. Com R 4.4.3 o build morria compilando
# `Deriv`, em `R_ClosureFormals' was not declared in this scope` — 100 linhas
# de erro de compilador C++ para dizer "o R é velho demais". Falhar aqui, em
# uma linha, é bem mais barato de diagnosticar.
# ---------------------------------------------------------------------------
R_MINIMO <- "4.5.0"
if (getRversion() < R_MINIMO) {
  stop(sprintf(
    paste0("R %s é antigo demais para o snapshot %s do CRAN (mínimo: %s).\n",
           "  Pacotes desse snapshot usam a API C do R 4.5 e não compilam em versões\n",
           "  anteriores. Ajuste o build arg R_VERSION no docker-compose.yml, ou\n",
           "  recue CRAN_SNAPSHOT para uma data compatível com este R."),
    getRversion(), SNAPSHOT, R_MINIMO
  ))
}

cat(">>> R version:      ", R.version.string, "\n")
cat(">>> CRAN snapshot:  ", SNAPSHOT, "\n")
cat(">>> Library path:   ", .libPaths()[1], "\n")

# ---------------------------------------------------------------------------
# 0. Bootstrap do pak
# ---------------------------------------------------------------------------
if (!requireNamespace("pak", quietly = TRUE)) {
  cat(">>> Instalando pak\n")
  install.packages("pak")
}
if (!requireNamespace("pak", quietly = TRUE)) {
  stop("Falha ao instalar o pak — sem ele não há resolução automática de sysreqs.")
}

# ---------------------------------------------------------------------------
# 1. Pacotes CRAN
#
# qgraph e semPlot foram REMOVIDOS. Nenhum dos dois é usado pelo AI-GENIE
# (o EGAnet plota com ggplot2/patchwork) e ambos arrastam OpenMx, que é a
# dependência pesada que o `replit.md` registrou como bloqueio do ambiente.
# Tirando-os, o bloqueio deixa de existir.
# ---------------------------------------------------------------------------
cran_pkgs <- c(
  # I/O + HTTP
  "jsonlite", "httr2", "curl",
  # Servidor de API
  "plumber",
  # Ponte para o Python (obrigatória: o AIGENIE embeda via reticulate)
  "reticulate",
  # Matemática / ML
  "Matrix", "glmnet", "randomForest",
  # Psicometria
  "psych", "lavaan", "mirt",
  # Redes / EGA — bootEGA e UVA vêm dentro do EGAnet
  "igraph", "EGAnet",
  # Gráficos usados pelo AIGENIE
  "ggplot2", "patchwork",
  # PLN (PT-BR)
  "udpipe", "quanteda",
  # Export Excel
  "openxlsx"
)

cat(">>> Instalando", length(cran_pkgs), "pacotes CRAN (pak resolve sysreqs)\n")
pak::pkg_install(cran_pkgs, ask = FALSE, upgrade = FALSE)

# ---------------------------------------------------------------------------
# 2. AIGENIE
#
# O repositório canônico é laralee/AIGENIE (ver DESCRIPTION: URL/BugReports e
# o README oficial). A versão anterior deste script apontava para
# "hfgolino/AIGENIE" — org errada. Como o install estava dentro de um
# tryCatch que só logava um WARN, esse erro nunca apareceu: a imagem subia
# sem AIGENIE e ninguém percebia.
#
# Caminho padrão: r-universe (é o que o README oficial recomenda).
# Para travar um commit específico, defina AIGENIE_GIT_REF com um SHA.
# ---------------------------------------------------------------------------
AIGENIE_MIN_VERSION <- "2.1.0"
aigenie_ref <- Sys.getenv("AIGENIE_GIT_REF", unset = "")

install_aigenie <- function() {
  if (nzchar(aigenie_ref)) {
    if (aigenie_ref %in% c("HEAD", "main", "master")) {
      stop(sprintf(
        "AIGENIE_GIT_REF deve ser um SHA ou tag imutável (recebido: %s).",
        aigenie_ref
      ))
    }
    cat(">>> Instalando AIGENIE de laralee/AIGENIE@", aigenie_ref, "\n", sep = "")
    pak::pkg_install(paste0("laralee/AIGENIE@", aigenie_ref), ask = FALSE, upgrade = FALSE)
  } else {
    cat(">>> Instalando AIGENIE do r-universe (laralee.r-universe.dev)\n")
    install.packages(
      "AIGENIE",
      repos = c(
        laralee = "https://laralee.r-universe.dev",
        getOption("repos")
      )
    )
  }
}

install_aigenie()

# ---------------------------------------------------------------------------
# 3. Ambiente Python do AIGENIE (pré-construído, offline em runtime)
#
# O AIGENIE não fala com a OpenAI/Jina direto do R: `generate_embeddings()`
# e os providers chamam `reticulate::import("openai")` / `("requests")`.
# Sem Python, AIGENIE() morre no passo 1 (embeddings) — e o Dockerfile
# anterior não instalava Python nenhum.
#
# `ensure_aigenie_python()` cria o venv em
#   tools::R_user_dir("AIGENIE", "data")/aigenie_python_env
# e pula a criação se o diretório já existir com o binário do python. Então
# construímos exatamente esse caminho aqui, no build, e o runtime não
# precisa de rede nem de `uv`.
#
# Os pins vêm de AIGENIE::get_core_packages(): openai==0.28 (API pré-1.0),
# groq, requests, numpy<2.0.
# ---------------------------------------------------------------------------
py_env_path <- file.path(tools::R_user_dir("AIGENIE", which = "data"),
                         "aigenie_python_env")
py_bin <- file.path(py_env_path, "bin", "python")

if (!file.exists(py_bin)) {
  cat(">>> Criando venv do AIGENIE em ", py_env_path, "\n", sep = "")
  dir.create(dirname(py_env_path), recursive = TRUE, showWarnings = FALSE)

  python3 <- Sys.which("python3")
  if (!nzchar(python3)) stop("python3 não encontrado no PATH da imagem.")

  st <- system2(python3, c("-m", "venv", shQuote(py_env_path)))
  if (st != 0L || !file.exists(py_bin)) stop("Falha ao criar o venv do AIGENIE.")

  py_pkgs <- c("openai==0.28", "groq", "requests", "numpy<2.0")
  st <- system2(py_bin, c("-m", "pip", "install", "--no-cache-dir",
                          "--disable-pip-version-check", shQuote(py_pkgs)))
  if (st != 0L) stop("Falha ao instalar os pacotes Python do AIGENIE.")
} else {
  cat("  [skip] venv do AIGENIE já existe\n")
}

# ---------------------------------------------------------------------------
# 4. Modelo udpipe PT-BR (estágio 2 — features linguísticas)
# ---------------------------------------------------------------------------
udpipe_dir <- file.path(Sys.getenv("HOME"), ".cache", "udpipe")
dir.create(udpipe_dir, recursive = TRUE, showWarnings = FALSE)
if (length(list.files(udpipe_dir, pattern = "portuguese.*\\.udpipe$")) == 0L) {
  cat(">>> Baixando modelo udpipe Portuguese-Bosque\n")
  tryCatch(
    udpipe::udpipe_download_model(language = "portuguese-bosque",
                                  model_dir = udpipe_dir),
    error = function(e) {
      cat("WARN: download do udpipe falhou (será retentado no primeiro uso): ",
          conditionMessage(e), "\n", sep = "")
    }
  )
}

# ---------------------------------------------------------------------------
# 5. Verificação — cada peça precisa CARREGAR, não apenas estar instalada.
#
# É a distinção que derrubou o build anterior: o igraph aparecia como
# instalado (`installed.packages()` listava) e mesmo assim não carregava,
# porque faltava a lib do sistema. Só `loadNamespace()` pega isso.
# ---------------------------------------------------------------------------
cat("\n>>> Verificando instalação\n")

must_load <- c(cran_pkgs, "pak")
falhas <- character()
for (p in must_load) {
  err <- tryCatch({ loadNamespace(p); NULL }, error = function(e) conditionMessage(e))
  if (is.null(err)) {
    cat(sprintf("    [ok]   %-14s %s\n", p, as.character(packageVersion(p))))
  } else {
    cat(sprintf("    [FALHA] %-14s %s\n", p, err))
    falhas <- c(falhas, p)
  }
}

allow_missing <- Sys.getenv("PSYCHGEN_ALLOW_MISSING_AIGENIE") == "1"

aigenie_err <- tryCatch({ loadNamespace("AIGENIE"); NULL },
                        error = function(e) conditionMessage(e))
if (is.null(aigenie_err)) {
  v <- packageVersion("AIGENIE")
  cat(sprintf("    [ok]   %-14s %s\n", "AIGENIE", as.character(v)))
  if (v < AIGENIE_MIN_VERSION) {
    msg <- sprintf("AIGENIE %s < %s exigida (GENIE() e anthropic.API só existem a partir da 2.x).",
                   v, AIGENIE_MIN_VERSION)
    if (allow_missing) cat("WARN: ", msg, "\n", sep = "") else falhas <- c(falhas, "AIGENIE(versão)")
  }
} else {
  cat(sprintf("    [FALHA] %-14s %s\n", "AIGENIE", aigenie_err))
  if (!allow_missing) falhas <- c(falhas, "AIGENIE")
}

# O venv precisa responder de verdade, não só existir no disco.
py_err <- tryCatch({
  out <- system2(py_bin, c("-c", shQuote("import openai, groq, requests, numpy")),
                 stdout = TRUE, stderr = TRUE)
  if (!is.null(attr(out, "status")) && attr(out, "status") != 0) {
    paste(out, collapse = "\n")
  } else NULL
}, error = function(e) conditionMessage(e))

if (is.null(py_err)) {
  cat("    [ok]   python venv  openai/groq/requests/numpy\n")
} else {
  cat("    [FALHA] python venv ", py_err, "\n", sep = "")
  if (!allow_missing) falhas <- c(falhas, "python venv")
}

if (length(falhas) > 0L) {
  stop("Build abortado — componentes que não carregam: ",
       paste(falhas, collapse = ", "))
}

cat("\n>>> Instalação completa e verificada.\n")
