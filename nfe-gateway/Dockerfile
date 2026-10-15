FROM python:3.12-slim-bookworm
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git libxml2 libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir . \
    && apt-get purge -y --auto-remove git \
    && rm -rf /var/lib/apt/lists/*
# Falha o build se o .gitignore/contexto de upload tiver deixado as tabelas
# de fora. Sem isso a imagem sobe e a NFS-e quebra só na emissão (FileNotFoundError).
RUN python -c "import pathlib, nfe_gateway; root=pathlib.Path(nfe_gateway.__file__).parent; missing=[str(p) for p in (root/'nfse/providers/data/ibge_tom.json', root/'nfse/data/cindop_rules.json', root/'sefaz/data/cst_ibscbs.json') if not p.is_file()]; assert not missing, missing"
ENV PYTHONUNBUFFERED=1
CMD ["python", "-m", "nfe_gateway.workers.outbound_consumer"]
