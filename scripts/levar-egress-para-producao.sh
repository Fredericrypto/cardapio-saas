#!/usr/bin/env bash
# Leva SÓ as mudanças de egress (commits que começam com "egress" ou "fix(cache)") da sua branch
# de trabalho para a branch que o Render publica, numa cópia separada (não mexe no seu trabalho atual).
#
# Uso:   bash scripts/levar-egress-para-producao.sh NOME_DA_BRANCH_DO_RENDER
# Ex.:   bash scripts/levar-egress-para-producao.sh main
#
# No fim, ele envia uma branch nova chamada "egress-para-producao" para o GitHub.
# Você então abre o Pull Request pelo link que ele mostra e clica em "Merge".
set -u
RENDER_BRANCH="${1:-}"
[ -z "$RENDER_BRANCH" ] && { echo "Faltou o nome da branch do Render. Exemplo: bash scripts/levar-egress-para-producao.sh main"; exit 1; }
ORIGEM="$(git rev-parse --abbrev-ref HEAD)"
NOVA="egress-para-producao"
COPIA="$HOME/tmp-egress-producao"
PULAR_BUILD="${PULAR_BUILD:-0}"   # só para testes do próprio script

git fetch origin --quiet || { echo "Falhou o git fetch."; exit 1; }
git rev-parse --verify --quiet "origin/$RENDER_BRANCH" >/dev/null || { echo "Não existe origin/$RENDER_BRANCH no GitHub."; exit 1; }

echo "== Commits de egress encontrados em $ORIGEM (do mais antigo ao mais novo) =="
COMMITS=$(git log "$ORIGEM" --reverse --format='%H' --grep='^egress' --grep='^fix(cache)')
[ -z "$COMMITS" ] && { echo "Nenhum commit de egress encontrado."; exit 1; }
for c in $COMMITS; do git --no-pager log -1 --format='  %h %s' "$c"; done

echo; echo "== Criando cópia separada a partir de origin/$RENDER_BRANCH em $COPIA =="
git worktree remove --force "$COPIA" 2>/dev/null; rm -rf "$COPIA"
git branch -D "$NOVA" 2>/dev/null
git worktree add -b "$NOVA" "$COPIA" "origin/$RENDER_BRANCH" || exit 1
cd "$COPIA" || exit 1

echo; echo "== Aplicando os commits de egress =="
for c in $COMMITS; do
  if ! git -c user.name="$(git config user.name)" -c user.email="$(git config user.email)" cherry-pick "$c" >/dev/null 2>&1; then
    # commit que já está na branch do Render vira "vazio": pula
    if git diff --cached --quiet && git diff --quiet; then git cherry-pick --skip >/dev/null 2>&1 || git cherry-pick --abort >/dev/null 2>&1; echo "  pulado (já estava lá): $(git --no-pager log -1 --format=%h "$c")"; continue; fi
    echo "CONFLITO ao aplicar $(git --no-pager log -1 --format='%h %s' "$c")."
    echo "Arquivos em conflito:"; git diff --name-only --diff-filter=U | sed 's/^/   /'
    git cherry-pick --abort >/dev/null 2>&1
    echo "Nada foi enviado. Me mande esta saída inteira."
    exit 2
  fi
  echo "  ok: $(git --no-pager log -1 --format='%h %s')"
done

if [ "$PULAR_BUILD" != "1" ]; then
  echo; echo "== Instalando dependências e compilando (pode levar alguns minutos) =="
  cd backend || exit 1
  npm ci --no-audit --no-fund || { echo "Falhou o npm ci. Nada foi enviado."; exit 3; }
  npx tsc --noEmit -p tsconfig.json || { echo "Falhou o tsc. Nada foi enviado."; exit 3; }
  npm run build || { echo "Falhou o build. Nada foi enviado."; exit 3; }
  [ -f test/tenant-cache-audit.ts ] && { npx ts-node test/tenant-cache-audit.ts || { echo "Teste do cache falhou. Nada foi enviado."; exit 3; }; }
  [ -f test/image-optimizer-audit.ts ] && { npx ts-node test/image-optimizer-audit.ts || { echo "Teste de imagens falhou. Nada foi enviado."; exit 3; }; }
  cd ..
fi

echo; echo "== Enviando a branch $NOVA para o GitHub =="
git push -u origin "$NOVA" || exit 1
echo
echo "PRONTO. Agora abra este link, confira que a base (base:) é '$RENDER_BRANCH' e clique em 'Create pull request' e depois 'Merge pull request':"
echo "  https://github.com/Fredericrypto/cardapio-saas/compare/$RENDER_BRANCH...$NOVA?expand=1"
cd "$HOME" && git -C "$OLDPWD" worktree list >/dev/null 2>&1
