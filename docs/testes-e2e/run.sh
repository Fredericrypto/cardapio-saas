#!/bin/bash
# Executor dos testes de navegador/API (Playwright + Chromium + Postgres real).
#
#   bash docs/testes-e2e/run.sh docs/testes-e2e/test_notes.py
#   NEED_VITE=0 bash docs/testes-e2e/run.sh docs/testes-e2e/test_api_leaks.py   (só API, sem painel)
#
# Tudo roda NUMA chamada só: no sandbox do Claude os processos em segundo plano morrem
# entre uma chamada de ferramenta e outra (e o Postgres também pode cair — rode
# `service postgresql start` antes). APAGA os dados do banco `cardapio_test`.
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$(realpath "$1")"
NEED_VITE="${NEED_VITE:-1}"
mkdir -p /tmp/e2e/shots
# derruba servidor esquecido de uma execução anterior (senão a porta 3000 fica com o código/estado velho)
kill $(pgrep -f "ts-node --transpile-only src/main.ts") $(pgrep -f "vite --port 5174") 2>/dev/null; sleep 1

# Chaves VAPID geradas na hora (nada de chave fixa) + variáveis falsas das integrações externas.
read -r VAPID_PUB VAPID_PRIV < <(cd "$ROOT/backend" && node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)")
export DATABASE_URL=postgres://postgres:pg@localhost:5432/cardapio_test
export JWT_SECRET=testsecret CUSTOMER_JWT_SECRET=testsecret2 PORT=3000 NODE_ENV=test
export VAPID_PUBLIC_KEY="$VAPID_PUB" VAPID_PRIVATE_KEY="$VAPID_PRIV" VAPID_SUBJECT=mailto:test@example.com
export CREDENTIALS_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000001
export SUPABASE_URL=https://fake.supabase.co SUPABASE_SERVICE_KEY=fake SUPABASE_BUCKET=fake LOCATIONIQ_ACCESS_TOKEN=fake
export BACKUP_ENCRYPTION_KEY=teste-chave-de-backup-com-mais-de-32-caracteres-ok BACKUP_STORAGE_DRIVER=local BACKUP_LOCAL_DIR=/tmp/e2e/backups
export API_PUBLIC_URL=http://localhost:3000 CUSTOMER_APP_URL=http://localhost:5173

PGPASSWORD=pg psql -h localhost -U postgres -d cardapio_test -c 'TRUNCATE tenants CASCADE' >/dev/null 2>&1
rm -rf /tmp/e2e/backups
(cd "$ROOT/backend" && npx ts-node --transpile-only src/main.ts > /tmp/backend.log 2>&1 & echo $! > /tmp/e2e/backend.pid)
if [ "$NEED_VITE" = "1" ]; then
  (cd "$ROOT/frontend-admin" && VITE_API_URL=http://localhost:3000 npx vite --port 5174 --host 127.0.0.1 > /tmp/vite.log 2>&1 & echo $! > /tmp/e2e/vite.pid)
fi
for i in $(seq 1 45); do
  curl -s localhost:3000/push/vapid-public-key >/dev/null && { [ "$NEED_VITE" = "0" ] || curl -s -o /dev/null localhost:5174/; } && break
  sleep 2
done
timeout "${E2E_TIMEOUT:-220}" python3 "$SCRIPT"
RC=$?
# (kill por PID: `pkill` trava o shell do sandbox)
stop_all() { kill $(pgrep -f "ts-node --transpile-only src/main.ts") $(pgrep -f "vite --port 5174") 2>/dev/null; sleep 1; kill -9 $(pgrep -f "ts-node --transpile-only src/main.ts") $(pgrep -f "vite --port 5174") 2>/dev/null; }
stop_all
exit $RC
