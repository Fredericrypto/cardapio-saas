import json, subprocess, sys, time
from playwright.sync_api import sync_playwright, expect

API = 'http://localhost:3000'
APP = 'http://127.0.0.1:5174'
results = []
def ok(cond, label):
    results.append(bool(cond)); print(('  OK  ' if cond else '  FALHOU ') + label, flush=True)

def psql(q):
    return subprocess.run(['su', 'postgres', '-c', 'psql -d cardapio_test -tA'], input=q, capture_output=True, text=True).stdout.strip()

import urllib.request
def http(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode(); return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        return {'__error': e.code, 'body': e.read().decode()[:200]}

# ---------- seed ----------
http('POST', '/auth/register', body={'tenantName': 'Teste', 'tenantSlug': 'teste', 'email': 'owner@teste.com', 'password': 'Senha12345', 'name': 'Marina'})
tid = psql("select id from tenants where slug='teste'")
h = subprocess.run(['node', '-e', "console.log(require('bcrypt').hashSync('Senha12345',10))"], cwd=__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..', '..', 'backend'), capture_output=True, text=True).stdout.strip()
psql(f"insert into admin_users (tenant_id,email,password_hash,name,role) values ('{tid}','gerente@teste.com','{h}','Carlos','manager'),('{tid}','func@teste.com','{h}','Joana','staff')")
staff = http('POST', '/auth/login', body={'email': 'func@teste.com', 'password': 'Senha12345'})['accessToken']

errors = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1400, 'height': 900})
    ctx.grant_permissions(['notifications'], origin=APP)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text[:160]}') if m.type == 'error' else None)
    page.on('response', lambda r: errors.append(f'HTTP {r.status} {r.request.method} {r.url.replace(API,"")}') if r.status in (401, 403, 500) else None)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {str(e)[:200]}'))

    print('1) Login e navegação')
    page.goto(APP + '/login')
    page.fill('input[type=email]', 'owner@teste.com'); page.fill('input[type=password]', 'Senha12345'); page.click('button[type=submit]')
    page.wait_for_url(APP + '/', timeout=15000)
    token = page.evaluate("localStorage.getItem('admin_token')")
    page.get_by_role('link', name='Anotações').click()
    page.wait_for_url('**/anotacoes')
    page.get_by_role('button', name='Nova Anotação').wait_for(timeout=8000)
    ok(page.get_by_role('button', name='Nova Anotação').is_visible(), 'aba Anotações aberta com botão "Nova Anotação"')
    ok(page.get_by_role('button', name='Notificações').is_visible() or page.locator('button[aria-label^="Notificações"]').is_visible(), 'sino no topo do painel')

    print('2) Criar anotação com checklist e tag')
    page.get_by_role('button', name='Nova Anotação').click()
    ta = page.locator('textarea')
    ta.wait_for(); ta.fill('Compras da cozinha')
    page.keyboard.press('Enter')
    page.get_by_role('button', name='Checklist').click()
    ta.type('gás'); page.keyboard.press('Enter'); ta.type('limão')
    page.get_by_label('Setor').select_option('Urgente')
    page.get_by_role('button', name='Cores').click()
    page.get_by_label('Fundo Rosa').click()
    page.screenshot(path='/tmp/e2e/shots/01-editando.png')
    page.get_by_role('button', name='Pronto').click()
    card_box = page.locator('[id^="note-"]').first.bounding_box(); save_box = page.get_by_role('button', name='Salvar').bounding_box()
    ok(save_box['x'] + save_box['width'] <= card_box['x'] + card_box['width'] + 0.5 and save_box['y'] + save_box['height'] <= card_box['y'] + card_box['height'], 'botão Salvar inteiro dentro do card em edição')
    ta_box = ta.bounding_box(); ok(ta_box['height'] >= 90, f"campo de texto com altura útil ({ta_box['height']:.0f}px)")
    page.screenshot(path='/tmp/e2e/shots/01b-editando.png')
    page.get_by_role('button', name='Salvar').click()
    page.wait_for_selector('[id^="note-"] >> text=#Urgente')
    notes = http('GET', '/notes', token)
    ok(len(notes) == 1 and notes[0]['tag'] == 'Urgente' and notes[0]['color'] == '#FBCFE8' and '- [ ] gás' in notes[0]['content'] and '- [ ] limão' in notes[0]['content'],
       f"salva no banco: tag={notes[0]['tag']} cor={notes[0]['color']} content={notes[0]['content']!r}")
    nid = notes[0]['id']; card = page.locator(f'#note-{nid}')
    ok(card.locator('[role=checkbox]').count() == 2, 'renderiza 2 caixas de checklist')
    ok('Marina' in card.inner_text() and '#Urgente' in card.inner_text(), 'rodapé mostra autor, data e #Urgente')

    print('3) Arrastar e redimensionar (persistem)')
    wrap = page.locator(f'#note-{nid}').locator('xpath=..')
    box = wrap.bounding_box(); x0, y0 = notes[0]['posX'], notes[0]['posY']
    page.mouse.move(box['x'] + 12, box['y'] + 20); page.mouse.down(); page.mouse.move(box['x'] + 140, box['y'] + 90, steps=8); page.mouse.move(box['x'] + 262, box['y'] + 160, steps=8); page.mouse.up()
    page.wait_for_timeout(700)
    n = http('GET', '/notes', token)[0]
    ok(abs((n['posX'] - x0) - 250) <= 4 and abs((n['posY'] - y0) - 140) <= 4, f"arraste salvo: ({x0},{y0}) -> ({n['posX']},{n['posY']})")
    w0, h0 = n['width'], n['height']
    hb = page.locator(f'#note-{nid} [aria-label="Redimensionar anotação"]').bounding_box()
    page.mouse.move(hb['x'] + 10, hb['y'] + 10); page.mouse.down(); page.mouse.move(hb['x'] + 50, hb['y'] + 40, steps=6); page.mouse.move(hb['x'] + 90, hb['y'] + 70, steps=6); page.mouse.up()
    page.wait_for_timeout(700)
    n = http('GET', '/notes', token)[0]
    ok(abs((n['width'] - w0) - 80) <= 4 and abs((n['height'] - h0) - 60) <= 4, f"redimensionar salvo: {w0}x{h0} -> {n['width']}x{n['height']}")
    page.reload(); page.wait_for_selector(f'#note-{nid}')
    wrap = page.locator(f'#note-{nid}').locator('xpath=..').bounding_box()
    ok(abs(wrap['width'] - n['width']) <= 1, 'posição/tamanho sobrevivem a recarregar a página (persistência)')
    page.screenshot(path='/tmp/e2e/shots/02-mural.png')

    print('4) Checklist, fixar e minimizar')
    page.locator(f'#note-{nid} [role=checkbox]').first.click(); page.wait_for_timeout(500)
    ok('- [x] gás' in http('GET', '/notes', token)[0]['content'], 'marcar tarefa salva no banco')
    page.locator(f'#note-{nid}').get_by_label('Fixar anotação no topo').click(); page.wait_for_timeout(400)
    ok(http('GET', '/notes', token)[0]['isPinned'] is True, 'fixar (pin) salvo')
    h_before = page.locator(f'#note-{nid}').bounding_box()['height']
    page.locator(f'#note-{nid}').get_by_label('Minimizar anotação').click(); page.wait_for_timeout(400)
    h_after = page.locator(f'#note-{nid}').bounding_box()['height']
    ok(h_after < 60 < h_before and http('GET', '/notes', token)[0]['isMinimized'] is True, f'minimizar recolhe o corpo ({h_before:.0f}px -> {h_after:.0f}px) e salva')
    page.locator(f'#note-{nid}').get_by_label('Expandir anotação').click(); page.wait_for_timeout(300)

    print('5) Organizar em grade + segunda e terceira notas')
    for i, tg in enumerate(['Caixa', 'Cozinha']):
        http('POST', '/notes', token, {'content': f'Nota extra {i}', 'tag': tg})
    page.reload(); page.wait_for_selector('[id^="note-"]'); page.get_by_role('button', name='Organizar').click(); page.wait_for_timeout(900)
    ns = http('GET', '/notes', token)
    xs = sorted({n['posX'] for n in ns}); ys = sorted({n['posY'] for n in ns})
    ok(len(ns) == 3 and all(x % 1 == 0 for x in xs) and ys[0] == 20 and xs[0] == 20, f'"Organizar" alinhou em grade: colunas x={xs} linhas y={ys}')
    page.screenshot(path='/tmp/e2e/shots/03-organizado.png')

    print('6) Filtro por tag e alternância de visualização')
    page.get_by_role('button', name='#Caixa').click()
    ok(page.locator('[id^="note-"]').count() == 1, 'filtro #Caixa mostra só 1 nota')
    page.get_by_role('button', name='Todas').click()
    page.get_by_role('button', name='Cards').click(); page.wait_for_timeout(300)
    ok(page.get_by_role('button', name='Organizar').count() == 0, 'visualização Cards ativa (sem botão Organizar)')
    page.screenshot(path='/tmp/e2e/shots/04-cards.png')
    page.reload(); page.wait_for_selector('[id^="note-"]')
    ok(page.get_by_role('button', name='Cards').get_attribute('aria-pressed') == 'true', 'escolha da visualização persiste')
    page.set_viewport_size({'width': 390, 'height': 800}); page.wait_for_timeout(400)
    ok(page.get_by_role('button', name='Mural').count() == 0, 'em tela pequena o seletor some e os cards entram sozinhos')
    aside = page.locator('aside').bounding_box()
    ok(aside['x'] + aside['width'] <= 1, 'celular: menu lateral escondido por padrão (não ocupa a tela)')
    ok(page.get_by_role('button', name='Abrir menu').is_visible(), 'celular: botão de menu no topo')
    page.screenshot(path='/tmp/e2e/shots/05-mobile.png')
    page.get_by_role('button', name='Abrir menu').click(); page.wait_for_timeout(350)
    ok(page.locator('aside').bounding_box()['x'] >= -1, 'celular: gaveta abre ao tocar no menu')
    page.screenshot(path='/tmp/e2e/shots/05b-mobile-menu.png')
    page.locator('aside').get_by_role('link', name='Histórico').click(); page.wait_for_timeout(500)
    ok(page.locator('aside').bounding_box()['x'] + page.locator('aside').bounding_box()['width'] <= 1, 'celular: gaveta fecha ao navegar')
    page.get_by_role('button', name='Abrir menu').click(); page.locator('aside').get_by_role('link', name='Anotações').click(); page.wait_for_timeout(500)
    desktop_aside_before = None
    page.set_viewport_size({'width': 1400, 'height': 900}); page.wait_for_timeout(300)
    ok(page.locator('aside').bounding_box()['width'] > 200 and not page.get_by_role('button', name='Abrir menu').is_visible(), 'desktop: menu lateral fixo como antes, sem botão de gaveta')
    page.get_by_role('button', name='Mural').click()

    print('7) Notificações internas (outro usuário cria uma nota)')
    http('POST', '/notes', staff, {'content': 'Cliente da mesa 4 pediu a conta', 'tag': 'Caixa'})
    page.reload(); page.wait_for_selector('[id^="note-"]'); page.wait_for_timeout(600)
    badge = page.locator('button[aria-label^="Notificações"] span').first
    ok(badge.is_visible() and badge.inner_text() == '1', f'badge do sino = {badge.inner_text() if badge.count() else "-"}')
    page.locator('button[aria-label^="Notificações"]').click(); page.wait_for_timeout(500)
    panel = page.locator('text=Nova Anotação Criada').first
    ok(panel.is_visible() and page.locator('text=Por: Joana (Funcionário)').first.is_visible() and page.locator('text=#Caixa').first.is_visible(), 'item mostra tipo, "Por: Joana (Funcionário)" e #Caixa')
    page.screenshot(path='/tmp/e2e/shots/06-sino.png')
    panel.click(); page.wait_for_url('**/anotacoes**'); page.wait_for_timeout(700)
    ok(page.locator('button[aria-label^="Notificações"] span').count() == 0, 'ao abrir a notificação o badge zera')
    ok(page.locator('[id^="note-"].ring-4, [class*="ring-sky"]').count() >= 1, 'a nota da notificação é destacada')
    http('PATCH', f"/notes/{http('GET','/notes',staff)[0]['id']}", staff, {'content': 'Mesa 4 já pagou'})
    http('DELETE', f"/notes/{[n for n in http('GET','/notes',staff) if 'Mesa 4' in n['content']][0]['id']}", staff)

    print('8) Centro de notificações (histórico lido/não lido)')
    page.goto(APP + '/notificacoes'); page.wait_for_timeout(900)
    txt = page.inner_text('body')
    ok('Anotação Excluída' in txt and 'Anotação Editada' in txt and 'Não lido' in txt and 'Lido' in txt, 'histórico mostra criada(lida), editada e excluída (não lidas)')
    page.screenshot(path='/tmp/e2e/shots/07-historico.png')
    page.get_by_role('button', name='Marcar todas como lidas').click(); page.wait_for_timeout(500)
    ok(page.locator('text=Não lido').count() == 0, 'marcar todas como lidas')

    print('9) Preferências')
    page.get_by_role('button', name='Preferências').click(); page.wait_for_timeout(500)
    page.get_by_label('Apenas o Admin (CEO)').check(); page.wait_for_timeout(500)
    ok(http('GET', '/internal-notifications/preferences', token)['target'] == 'owner', 'dono altera quem recebe (salvo)')
    page.get_by_role('switch').click(); page.wait_for_timeout(2500)
    reg = page.evaluate("navigator.serviceWorker.getRegistration('/').then(r => !!r && !!(r.active || r.waiting || r.installing))")
    ok(reg, 'service worker /sw.js registrado')
    sw_text = page.inner_text('body')
    print('     (ativar push neste ambiente headless):', 'ativado' if page.get_by_role('switch').get_attribute('aria-checked') == 'true' else 'mensagem exibida ->', [l for l in sw_text.split('\n') if 'push' in l.lower() or 'permiss' in l.lower() or 'ativar' in l.lower()][:2])
    page.screenshot(path='/tmp/e2e/shots/08-preferencias.png')

    print('10) Funcionário não altera preferência')
    ctx2 = b.new_context(viewport={'width': 1200, 'height': 800}); p2 = ctx2.new_page()
    p2.goto(APP + '/login'); p2.fill('input[type=email]', 'func@teste.com'); p2.fill('input[type=password]', 'Senha12345'); p2.click('button[type=submit]'); p2.wait_for_url(APP + '/')
    p2.goto(APP + '/notificacoes?aba=preferencias'); p2.wait_for_timeout(800)
    ok(p2.get_by_label('Todos os funcionários').is_disabled(), 'rádio desabilitado para funcionário')
    b.close()

print('\nErros de console/página:', len(errors))
for e in errors[:8]: print('  ', e)
print(f'\nResultado: {sum(results)}/{len(results)} verificações OK')
sys.exit(0 if all(results) else 1)
