# Testes de navegador e de API (Playwright + Chromium + Postgres real)

Estes scripts foram escritos e executados no sandbox do Claude nas sessões Z2–Z5 (03–06/10/2026).
Eles sobem o backend NestJS de verdade, o painel admin (Vite) e dirigem um Chromium headless.

| Script | O que prova |
|---|---|
| `test_notes.py` | Anotações: criar/editar/arrastar/redimensionar/persistir, checklist, fixar, minimizar, organizar em grade, filtro, cards no celular + gaveta do menu, sino com badge, histórico lido/não lido, preferências, permissão do funcionário (32 verificações) |
| `test_analytics.py` | Aba Análise: cards = SQL independente, cancelado fora do bruto e do líquido, tickets, posição pixel a pixel das bolinhas da matriz, quadrantes por frações exatas, rankings, tooltip vermelho/verde, rodapé exato, DRE exportado (44 verificações) |
| `test_api_leaks.py` | API HTTP: pedido real grava `unit_cost`; custo e parâmetros financeiros NÃO saem em rota pública; rotas internas exigem login (19 verificações) |
| `smoke_todas_as_rotas.py` | As 15 telas do painel abrem com a barra superior e sem erro de JavaScript |

## Como rodar (no sandbox do Claude)
```bash
service postgresql start
su postgres -c "psql -c \"CREATE DATABASE cardapio_test;\""   # uma vez; usuário postgres / senha pg
cd backend && npm install && DATABASE_URL=postgres://postgres:pg@localhost:5432/cardapio_test npm run migration:run
cd ../frontend-admin && npm install
cd .. && bash docs/testes-e2e/run.sh docs/testes-e2e/test_notes.py
NEED_VITE=0 bash docs/testes-e2e/run.sh docs/testes-e2e/test_api_leaks.py
```
Capturas de tela ficam em `/tmp/e2e/shots/`.

## Armadilhas que já custaram tempo
- **Processos em segundo plano morrem entre chamadas de ferramenta** — suba backend + painel + teste na MESMA chamada (o `run.sh` faz isso). O Postgres também pode cair: `service postgresql start`.
- No `psql` via `su postgres -c "..."`, um hash bcrypt (`$2b$10$...`) é mutilado pelo shell — passe o SQL por **stdin**.
- `import * as webpush from 'web-push'` é somente-leitura no TypeScript: para mockar `sendNotification`, use `const webpush = require('web-push')`.
- O Chromium headless **nunca concede** permissão de notificação nem alcança o FCM — o aceite real do push só se testa num navegador de verdade; o envio do servidor se testa com `npm run test:push`.
- Semeie dados ancorados em **meio-dia de cada dia** (não "N horas atrás"): senão o resultado depende da hora em que o teste roda (fronteira do período).
- Fontes do Google ficam bloqueadas no sandbox (403 no console) — não é erro da aplicação.

## Testes só de backend (sem navegador) — `backend/test/`
`cd backend && DATABASE_URL=postgres://.../cardapio_test npm run test:all`
(`test:schedule`, `test:cashback`, `test:notes`, `test:push`, `test:analytics` — 141 verificações; **apagam o banco** e se recusam a rodar se o nome do banco não tiver "test").
