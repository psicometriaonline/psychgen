# Versão do R. Precisa ser >= 4.5: o snapshot do CRAN que usamos (necessário
# para trazer o EGAnet >= 2.4.0 que o AIGENIE 2.1.0 exige) contém pacotes que
# usam a API C do R 4.5. Com 4.4.3 o build morria compilando `Deriv`, em
# `R_ClosureFormals' was not declared in this scope` — função que só existe a
# partir do 4.5. Ao trocar esta versão, ajuste também R_LIBS_USER abaixo e os
# dois pontos correspondentes no docker-compose.yml.
ARG R_VERSION=4.5.3
FROM rocker/r-ver:${R_VERSION}

# LANG/LC_ALL: locale UTF-8 explícito. Sob LC_CTYPE=C o R trata texto acentuado
#   como bytes e comparações de string em português falham silenciosamente —
#   nomes de dimensão como "apreensão avaliativa" deixam de bater com eles
#   mesmos. Verificado: o mesmo round-trip passa em UTF-8 e falha em C.
# R_USER_DATA_DIR: fixa o caminho que tools::R_user_dir("AIGENIE","data")
#   resolve — é onde o AIGENIE procura (e onde pré-construímos) o venv Python.
#   Sem isso o caminho varia com o HOME do processo e o venv do build não
#   seria encontrado em runtime.
ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    HOME=/home/r \
    R_LIBS_USER=/home/r/.R/library-4.5 \
    R_USER_DATA_DIR=/home/r/.local/share/R \
    RETICULATE_PYTHON=/home/r/.local/share/R/AIGENIE/aigenie_python_env/bin/python

# Apenas o mínimo para o pak funcionar e para criar o venv. As libs de
# sistema de cada pacote R (glpk, gmp, fontconfig, gdal, ...) NÃO são
# listadas aqui de propósito: o pak as resolve pela base de sysreqs do
# Posit e instala via apt durante o install_packages.R. Manter essa lista
# à mão foi exatamente o que quebrou o build anterior (faltava libglpk40,
# dependência do binário do igraph).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      python3 \
      python3-venv \
      python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Usuário não-root dono da library persistida.
# /srv/jobs-logs é pré-criado com dono r:r para que o volume nomeado montado
# ali herde essas permissões na primeira inicialização (o Docker copia
# conteúdo+permissões do mountpoint para o volume novo). Sem isso o processo
# R (usuário `r`) toma "Permission denied" ao escrever o NDJSON por job.
RUN useradd -m -u 1000 -s /bin/bash r \
    && mkdir -p /home/r/.R/library-4.5 /home/r/.cache \
                /home/r/.local/share/R /srv/r-scripts /srv/jobs-logs \
    && chown -R r:r /home/r /srv \
    && chmod 0775 /srv/jobs-logs

WORKDIR /srv

COPY --chown=r:r install_packages.R /srv/install_packages.R
COPY --chown=r:r plumber.R /srv/plumber.R
COPY --chown=r:r entrypoint.sh /srv/entrypoint.sh
# Remove CRLF do Windows: se o repo foi clonado com autocrlf=true, o shebang
# termina em \r e o kernel não acha o interpretador
# ("/usr/bin/env: 'bash\r': No such file").
RUN sed -i 's/\r$//' /srv/entrypoint.sh /srv/install_packages.R /srv/plumber.R \
    && chmod +x /srv/entrypoint.sh

# Snapshot do CRAN (Posit PPM) — travado por data para builds reprodutíveis.
# Precisa ser recente o bastante para trazer EGAnet >= 2.4.0, exigido pelo
# AIGENIE 2.1.0. O snapshot anterior (2025-04-15) é anterior a essa versão.
ARG CRAN_SNAPSHOT=2026-08-03
# SHA de commit do laralee/AIGENIE. Vazio = instala do r-universe, que é o
# caminho recomendado pelo README oficial do pacote.
ARG AIGENIE_GIT_REF=""

# Instala como ROOT: os pacotes vão para a lib do sistema
# (/usr/local/lib/R/site-library) e o pak precisa de root para o apt dos
# sysreqs. `apt-get update` roda de novo aqui porque a camada anterior
# limpou /var/lib/apt/lists e o pak precisa dos índices.
RUN apt-get update \
    && CRAN_SNAPSHOT="${CRAN_SNAPSHOT}" AIGENIE_GIT_REF="${AIGENIE_GIT_REF}" \
       Rscript /srv/install_packages.R \
    && rm -rf /var/lib/apt/lists/* \
    && chown -R r:r /home/r/.cache /home/r/.R /home/r/.local

USER r

EXPOSE 8000

ENTRYPOINT ["/srv/entrypoint.sh"]
