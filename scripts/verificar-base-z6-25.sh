#!/usr/bin/env bash
# Compara o que existe na sua árvore com as bases deste patch ANTES de aplicar.
# Uso:  bash ~/tmp-aplicar/scripts/verificar-base-z6-25.sh ~/Projetos/cardapio-saas
# Para cada arquivo que o patch sobrescreve, diz se ele está:
#   JA_Z6-24    = está como o patch anterior (z6-24): pode aplicar
#   JA_Z6-25    = já tem este patch
#   DIVERGENTE  = OUTRA SESSÃO mexeu nele: NÃO sobrescreva sem mesclar (mostra o git diff)
#   NOVO        = arquivo novo, não existe na árvore
REPO="${1:-$HOME/Projetos/cardapio-saas}"
cd "$REPO" || exit 1
echo "== git status (alterações pendentes, de qualquer sessão) =="
git status --short | head -40
echo
echo "== arquivos do patch =="
divergentes=0
while IFS='|' read -r f orig z23 novo; do
  [ -z "$f" ] && continue
  if [ ! -f "$f" ]; then printf '%-62s NOVO\n' "$f"; continue; fi
  cur=$(sha256sum "$f" | cut -d' ' -f1)
  if   [ "$cur" = "$novo" ]; then st=JA_Z6-25
  elif [ "$cur" = "$z23"  ]; then st=JA_Z6-24
  elif [ "$cur" = "$orig" ]; then st=LIMPO
  else st=DIVERGENTE; divergentes=$((divergentes+1)); fi
  printf '%-62s %s\n' "$f" "$st"
  if [ "$st" = DIVERGENTE ]; then git --no-pager diff --stat HEAD -- "$f" | sed 's/^/      /'; fi
done <<'TABELA'
backend/src/modules/tenant-cache/tenant-cache.ts|-|f15a8c7524565794ad16af9ff5ace077e5c6d8034eade9d5745d15e1e873a4f7|59d383bd188fc13d40fbf656f00e4812b379e111799a293d6146c800a2d0c812
backend/src/common/utils/image-optimizer.ts|-|e170d12c3e1c809f44847109fdf7535893c65ab7df9cb286afdbc1a25cd8d8c4|50c8ffe012c7ac3d3a38ef02f884138239c6f71e01d919ab807d58c81bb8dd09
TABELA
echo
if [ "$divergentes" -gt 0 ]; then
  echo "ATENCAO: $divergentes arquivo(s) DIVERGENTE(S). Me mande 'git diff HEAD -- <arquivo>' de cada um antes de aplicar."
else
  echo "Nenhuma divergência: pode aplicar o patch."
fi
