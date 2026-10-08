# Tela "Segurança e Backups" no navegador real (Chromium): visibilidade por perfil,
# salvar agenda, backup manual, modal de restauração (travas, senha errada, sucesso).
# Rodar:  bash docs/testes-e2e/run.sh docs/testes-e2e/test_backups_ui.py
import json, os, subprocess, sys, urllib.request
from playwright.sync_api import sync_playwright

API = 'http://localhost:3000'
APP = 'http://127.0.0.1:5174'
results = []
def ok(c, label):
    results.append(bool(c)); print(('  OK  ' if c else '  FALHOU ') + label, flush=True)
def psql(q):
    return subprocess.run(['psql', '-h', 'localhost', '-U', 'postgres', '-d', 'cardapio_test', '-tA'], input=q, capture_output=True, text=True, env={'PGPASSWORD': 'pg', 'PATH': '/usr/bin:/bin'}).stdout.strip()
def post(path, body):
    req = urllib.request.Request(API + path, method='POST', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    try: return json.loads(urllib.request.urlopen(req).read() or b'null')
    except urllib.error.HTTPError as e: return None

PW = 'Senha12345'
post('/auth/register', {'tenantName': 'Teste', 'tenantSlug': 'teste', 'email': 'owner@teste.com', 'password': PW, 'name': 'Marina'})
tid = psql("select id from tenants where slug='teste'")
h = subprocess.run(['node', '-e', f"console.log(require('bcrypt').hashSync('{PW}',10))"], cwd=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'backend'), capture_output=True, text=True).stdout.strip()
psql(f"insert into admin_users (tenant_id,email,password_hash,name,role) values ('{tid}','func@teste.com','{h}','Joana','staff'),('{tid}','gerente@teste.com','{h}','Carlos','manager')")
psql(f"insert into categories (tenant_id,name) values ('{tid}','Bebidas'),('{tid}','Lanches')")

errors = []
def login(page, email):
    page.goto(APP + '/login')
    page.fill('input[type=email]', email); page.fill('input[type=password]', PW); page.click('button[type=submit]')
    page.wait_for_url(APP + '/', timeout=15000)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1300, 'height': 900})
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'pageerror: {str(e)[:200]}'))
    page.on('console', lambda m: errors.append(f'console: {m.text[:160]}') if m.type == 'error' and '403' not in m.text and 'ERR_TUNNEL' not in m.text else None)

    print('1) Visibilidade por perfil')
    for email, expect in [('func@teste.com', False), ('gerente@teste.com', False)]:
        c2 = b.new_context(viewport={'width': 1300, 'height': 900}); pg = c2.new_page()
        login(pg, email); pg.goto(APP + '/configuracoes?aba=seguranca'); pg.wait_for_timeout(800)
        ok(pg.get_by_role('tab', name='Segurança e Backups').count() == 0 and pg.get_by_text('Gerar Backup Manual Agora').count() == 0, f'{email}: sem aba de backups (mesmo forçando ?aba=seguranca)')
        c2.close()
    login(page, 'owner@teste.com')
    page.goto(APP + '/configuracoes')
    tab = page.get_by_role('tab', name='Segurança e Backups')
    ok(tab.is_visible(), 'administrador vê a aba "Segurança e Backups"')
    tab.click()
    page.get_by_role('button', name='Gerar Backup Manual Agora').wait_for(timeout=8000)
    ok('aba=seguranca' in page.url, 'aba refletida na URL (voltar/recarregar mantém)')
    page.screenshot(path='/tmp/e2e/shots/backups_vazio.png')

    print('2) Agenda')
    save = page.get_by_role('button', name='Salvar agenda')
    ok(save.is_disabled(), '"Salvar agenda" desabilitado sem alterações')
    opts = page.locator('#bk-freq option').all_inner_texts()
    ok(opts == ['Desativado', 'A cada 3 dias', 'Semanal (7 dias)', 'Quinzenal (15 dias)', 'Mensal (30 dias)'], f'opções de frequência: {opts}')
    ok(page.locator('#bk-time').is_disabled(), 'horário desabilitado quando "Desativado"')
    page.select_option('#bk-freq', '7'); page.fill('#bk-time', '04:00')
    ok(save.is_enabled(), 'alterar habilita o botão')
    save.click(); page.get_by_text('Agenda salva.').wait_for(timeout=5000)
    row = psql(f"select frequency_days||'|'||run_time from tenant_backup_settings where tenant_id='{tid}'")
    ok(row == '7|04:00', f'gravado no banco: {row}')
    ok('Próximo backup:' in page.locator('body').inner_text(), 'mostra a data do próximo backup')
    page.reload(); page.get_by_role('button', name='Gerar Backup Manual Agora').wait_for(timeout=8000)
    ok(page.locator('#bk-freq').input_value() == '7' and page.locator('#bk-time').input_value() == '04:00', 'após recarregar, a agenda continua')

    print('3) Backup manual')
    page.get_by_role('button', name='Gerar Backup Manual Agora').click()
    page.wait_for_selector('[data-testid=backup-row][data-status=concluido]', timeout=20000)
    r = page.locator('[data-testid=backup-row]').first
    txt = r.inner_text()
    ok('Manual' in txt and 'Concluído' in txt and ('KB' in txt or 'MB' in txt), f'linha: {" | ".join(txt.split())}')
    ok(r.get_by_label('Baixar arquivo criptografado').is_enabled(), 'ações habilitadas em backup concluído')
    page.screenshot(path='/tmp/e2e/shots/backups_lista.png')
    with page.expect_download(timeout=10000) as dl:
        r.get_by_label('Baixar arquivo criptografado').click()
    f = dl.value; path = f'/tmp/e2e/{f.suggested_filename}'; f.save_as(path)
    ok(open(path, 'rb').read(4) == b'CSBK', f'download do arquivo criptografado ({f.suggested_filename})')

    print('4) Restauração')
    psql(f"delete from categories where tenant_id='{tid}'")
    r.get_by_label('Restaurar este estado').click()
    dlg = page.get_by_role('dialog')
    dlg.get_by_text('Restaurar este estado').first.wait_for(timeout=5000)
    ok('exatamente' in dlg.inner_text() and 'ação crítica' in dlg.inner_text(), 'aviso crítico visível')
    dlg.get_by_text('Categorias').wait_for(timeout=8000)
    ok('0 → 2' in dlg.inner_text(), 'mostra o que muda: Categorias 0 → 2')
    go = dlg.get_by_role('button', name='Restaurar agora')
    ok(go.is_disabled(), 'botão desabilitado (nada preenchido)')
    dlg.locator('#restore-password').fill(PW)
    ok(go.is_disabled(), 'continua desabilitado só com a senha')
    dlg.locator('#restore-word').fill('restaurar-dados')
    ok(go.is_disabled(), 'continua desabilitado com a palavra em minúsculas')
    dlg.locator('#restore-word').fill('RESTAURAR-DADOS')
    ok(go.is_enabled(), 'habilita com senha + palavra exata')
    dlg.locator('#restore-password').fill('senha-errada')
    go.click()
    dlg.get_by_role('alert').wait_for(timeout=8000)
    ok('Senha incorreta' in dlg.get_by_role('alert').inner_text(), 'senha errada: mensagem dentro do modal')
    ok('/login' not in page.url and page.locator('#restore-password').is_visible(), 'sessão NÃO foi derrubada (403, não 401)')
    ok(psql(f"select count(*) from categories where tenant_id='{tid}'") == '0', 'nada foi restaurado')
    page.screenshot(path='/tmp/e2e/shots/backups_modal_erro.png')
    dlg.locator('#restore-password').fill(PW)
    go.click()
    dlg.get_by_text('Restauração concluída').wait_for(timeout=30000)
    ok(psql(f"select string_agg(name, ',' order by name) from categories where tenant_id='{tid}'") == 'Bebidas,Lanches', 'dados restaurados no banco (Bebidas, Lanches)')
    ok(dlg.get_by_role('button', name='Recarregar painel').is_visible(), 'botão "Recarregar painel" no sucesso')
    page.screenshot(path='/tmp/e2e/shots/backups_modal_sucesso.png')
    dlg.get_by_role('button', name='Recarregar painel').click()
    page.get_by_role('button', name='Gerar Backup Manual Agora').wait_for(timeout=10000)
    page.get_by_role('tab', name='Segurança e Backups').wait_for()
    body = page.locator('body').inner_text()
    ok('Restaurado' in body and 'Segurança (antes de restaurar)' in body, 'histórico: backup "Restaurado" + backup de segurança criado')

    print('5) Auditoria e exclusão')
    page.get_by_role('button', name='Registro de auditoria').click()
    page.get_by_text('Restauração concluída (').count()
    page.get_by_text('Restauração concluída').last.wait_for(timeout=5000)
    aud = page.locator('body').inner_text()
    ok('Restauração negada' in aud and 'Backup baixado' in aud and 'owner@teste.com' in aud, 'auditoria mostra negada, download e quem fez')
    n = page.locator('[data-testid=backup-row]').count()
    last = page.locator('[data-testid=backup-row]').last
    last.get_by_label('Excluir backup').click()
    page.get_by_role('dialog').get_by_text('Excluir backup?').wait_for()
    page.get_by_role('dialog').get_by_role('button', name='Excluir', exact=True).click()
    page.wait_for_function(f"document.querySelectorAll('[data-testid=backup-row]').length === {n - 1}", timeout=8000)
    ok(True, 'exclusão remove a linha')

    print('6) Celular (390 px)')
    page.set_viewport_size({'width': 390, 'height': 800})
    page.reload(); page.get_by_role('button', name='Gerar Backup Manual Agora').wait_for(timeout=8000)
    sw = page.evaluate('document.documentElement.scrollWidth'); cw = page.evaluate('document.documentElement.clientWidth')
    ok(sw <= cw, f'sem rolagem horizontal da página no celular ({sw} ≤ {cw}); tabela rola dentro do cartão')
    page.screenshot(path='/tmp/e2e/shots/backups_mobile.png')
    b.close()

ok(not errors, f'sem erros de console/página: {errors[:3]}')
print(f"\nResultado: {sum(results)} ok, {len(results) - sum(results)} falhas")
sys.exit(0 if all(results) else 1)
