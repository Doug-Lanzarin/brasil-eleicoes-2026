#!/usr/bin/env bash
# Publica os arquivos de zonas (diretório $ZONAS_OUT, padrão "zonas-out") na branch
# "dados-zonas", substituindo o conteúdo anterior por um único commit (sem histórico, para
# o repositório não crescer a cada publicação). Usado pelo workflow .github/workflows/zonas.yml.
set -euo pipefail
OUT="${ZONAS_OUT:-zonas-out}"
BRANCH="${ZONAS_BRANCH:-dados-zonas}"
[ -d "$OUT" ] || { echo "Nada a publicar ($OUT não existe)"; exit 0; }
TMP="$(mktemp -d)"
mkdir -p "$TMP/zonas"
cp -r "$OUT"/. "$TMP/zonas/"
cat > "$TMP/README.md" <<'MD'
# dados-zonas

Gerado automaticamente por `server/zonas/worker.ts` (workflow `zonas.yml`).
Resultados por zona eleitoral calculados a partir dos boletins de urna publicados pelo TSE.
Não edite manualmente: cada publicação substitui todo o conteúdo desta branch.
MD
cd "$TMP"
git init -q -b "$BRANCH"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -q -m "Zonas: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push -q -f "${ZONAS_REMOTE:?defina ZONAS_REMOTE}" "$BRANCH:$BRANCH"
echo "Publicado em $BRANCH ($(find zonas -name '*.json' | wc -l) arquivos)"
rm -rf "$TMP"
