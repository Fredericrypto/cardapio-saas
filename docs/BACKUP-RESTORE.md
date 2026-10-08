# Backup & Restauração (Segurança e Backups)

Painel: aba própria **Segurança e Backups** no menu lateral, rota `/seguranca` (somente administrador/"owner" — o item some do menu para os demais cargos e a URL digitada à mão mostra "Acesso negado").

## Variáveis de ambiente (Render e local)
| Variável | Obrigatória | O que é |
|---|---|---|
| `BACKUP_ENCRYPTION_KEY` | sim | Chave que criptografa os backups (AES-256-GCM). ≥ 32 caracteres, sem espaços nas pontas. `openssl rand -base64 48`. **Guarde uma cópia fora do Render**: sem ela os backups não abrem. Diferente da `CREDENTIALS_ENCRYPTION_KEY`. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | sim (produção) | Já existem (upload de imagens). Os backups vão para um bucket **privado** próprio. |
| `BACKUP_BUCKET` | não | Nome do bucket (padrão `tenant-backups`; criado privado sozinho; se existir e for público, o sistema recusa gravar). |
| `BACKUP_STORAGE_DRIVER=local` + `BACKUP_LOCAL_DIR` | só dev/teste | Disco local. Em produção o disco do Render é efêmero — não use. |
| `BACKUP_MAX_FILE_BYTES` | não | Padrão 45 MB (limite do Supabase grátis é 50 MB). |

## O que entra no backup
Todas as tabelas do restaurante, descobertas automaticamente pelo catálogo do banco (hoje 32: pedidos, itens, clientes, mesas/sessões, cashback, caixa, cardápio, promoções, fidelidade, avaliações, anotações…). Uma tabela nova com `tenant_id` entra sozinha; uma tabela nova que o sistema não sabe isolar por restaurante **faz o backup falhar de propósito** (nunca ignora dado em silêncio).
**Fora** (de propósito): `tenants` (guarda as credenciais criptografadas do Mercado Pago), `admin_users`, cargos e permissões (`roles`, `role_permissions`, `permissions`), inscrições push da equipe, notificações internas, e o próprio histórico/auditoria de backups.

## Garantias
- Foto consistente (transação REPEATABLE READ): nenhum pedido "pela metade".
- Restauração atômica numa única transação; qualquer falha = ROLLBACK, nada muda.
- Depois de restaurar, o sistema relê cada tabela e exige contagem e SHA-256 idênticos ao backup; divergiu = ROLLBACK.
- Antes de restaurar é criado um backup de segurança do estado atual (restaurá-lo desfaz a restauração).
- Senha do admin + palavra `RESTAURAR-DADOS` conferidas no servidor; 5 tentativas/min.
- Toda ação (agenda, backup, download, exclusão, tentativa negada, restauração) vai para a auditoria com usuário e IP; o log é só-inserção (gatilho no banco bloqueia UPDATE).

## Abrir um backup fora do sistema (emergência)
```
cd backend
BACKUP_ENCRYPTION_KEY='sua-chave' npx ts-node src/modules/backups/cli/decrypt-backup.ts arquivo.json.gz.enc saida.json
```
Confere a integridade e grava um JSON legível (apague depois: fica em texto aberto).

## Limitações conhecidas
- Restaurar também volta as **mesas abertas** (e seus QR codes de entrada) ao que eram naquele momento.
- Durante a restauração (segundos), escritas nas tabelas incluídas esperam (vale para todos os restaurantes); se não liberar em 15 s a operação aborta sem alterar nada.
- O agendador roda dentro do servidor: no plano grátis do Render, se o servidor estiver dormindo no horário, o backup sai quando ele acordar (recuperação automática, sem rajada de backups).
- Dados de `tenants`/`admin_users` (logo, cores, Pix, Mercado Pago, usuários, cargos e permissões) **não** são restaurados.
- O IP da auditoria depende de o Render acrescentar o `X-Forwarded-For` (usa a última entrada, a do proxy).

## Testes
`cd backend && DATABASE_URL=postgres://.../cardapio_test npm run test:backup` (agenda, criptografia, plano, restauração real nas 32 tabelas, atomicidade, deriva de schema, retenção, agendador, Supabase simulado) e, em `docs/testes-e2e/`: `test_backups_api.py` (HTTP, permissões, throttle — leva ~3 min por causa da janela do limitador) e `test_backups_ui.py` (navegador).
