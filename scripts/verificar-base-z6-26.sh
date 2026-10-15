#!/usr/bin/env bash
# Compara o que existe na sua árvore com as bases deste patch ANTES de aplicar.
# Uso:  bash ~/tmp-aplicar/scripts/verificar-base-z6-26.sh ~/Projetos/cardapio-saas
# Para cada arquivo que o patch sobrescreve, diz se ele está:
#   LIMPO       = igual ao arquivo que você me enviou (imagens-arquivos.zip): pode aplicar
#   JA_Z6-25    = está como o patch anterior (z6-25): pode aplicar
#   JA_Z6-26    = já tem este patch
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
  if   [ "$cur" = "$novo" ]; then st=JA_Z6-26
  elif [ "$cur" = "$z23"  ]; then st=JA_Z6-25
  elif [ "$cur" = "$orig" ]; then st=LIMPO
  else st=DIVERGENTE; divergentes=$((divergentes+1)); fi
  printf '%-62s %s\n' "$f" "$st"
  if [ "$st" = DIVERGENTE ]; then git --no-pager diff --stat HEAD -- "$f" | sed 's/^/      /'; fi
done <<'TABELA'
backend/src/common/services/storage.service.ts|26c1937c78419985e09dfd4b6367632f3d01ff59e5293b1637a4a8ca16fc5d10|-|79027a3e83c86bfa05c62bcd391fbbdfab3e1f36c25d3cb44bde355bb44a3a64
backend/src/common/utils/image-optimizer.ts|-|50c8ffe012c7ac3d3a38ef02f884138239c6f71e01d919ab807d58c81bb8dd09|0c4b3cd748b2005a6079cd73158c2682fd0ffa4ba19ee6161852c6aaf96b84ce
backend/test/image-optimizer-audit.ts|-|04fed4ecc4b29341631f65d29170b614ef00176cc51f6b1ab837079e8e2e5a51|e5f9ca4cf1deb65de7fd8613dc3b3f99b2dd63d122a97be19f3edd3f5e321478
TABELA
echo
if [ "$divergentes" -gt 0 ]; then
  echo "ATENCAO: $divergentes arquivo(s) DIVERGENTE(S). Me mande 'git diff HEAD -- <arquivo>' de cada um antes de aplicar."
  exit 1
else
  echo "Nenhuma divergência: pode aplicar o patch."
  exit 0
fi
