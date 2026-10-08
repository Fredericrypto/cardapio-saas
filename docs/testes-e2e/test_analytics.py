import json, re, subprocess, sys, urllib.request, math
from fractions import Fraction
from playwright.sync_api import sync_playwright

API = 'http://localhost:3000'; APP = 'http://127.0.0.1:5174'
results = []
def ok(cond, label):
    results.append(bool(cond)); print(('  OK  ' if cond else '  FALHOU ') + label, flush=True)

def psql(q):
    return subprocess.run(['su', 'postgres', '-c', 'psql -d cardapio_test -tA'], input=q, capture_output=True, text=True).stdout.strip()
def http(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
    with urllib.request.urlopen(req) as r:
        raw = r.read().decode(); return json.loads(raw) if raw else None
def brl(text):
    t = text.replace('\xa0', ' ').replace('−', '-')
    m = re.search(r'-?\s*R\$\s*-?\s*[\d.]*\d(?:,\d+)?|R\$\s*-?[\d.]*\d(?:,\d+)?', t)
    s = m.group(0) if m else t
    neg = '-' in s
    n = re.sub(r'[^0-9,]', '', s).replace(',', '.')
    return -float(n) if neg else float(n)

# ------------------------------------------------------------------ seed
http('POST', '/auth/register', body={'tenantName': 'Teste', 'tenantSlug': 'teste', 'email': 'owner@teste.com', 'password': 'Senha12345', 'name': 'Marina'})
tid = psql("select id from tenants where slug='teste'")
psql(f"update tenants set card_fee_percent=2, pix_fee_percent=1, tax_percent=5, default_cmv_percent=30 where id='{tid}'")
cat = psql(f"insert into categories (tenant_id,name) values ('{tid}','C') returning id").split('\n')[0]
catalog = [  # nome, preço, custo (None = estimado 30%), unidades vendidas
    ('Burger', 30, 12, 40), ('Refrigerante', 6, 4.5, 50), ('Sorvete', 10, 4.01, 8), ('Picanha', 80, 30, 5), ('Água', 4, 3.5, 4),
    ('Pizza', 40, None, 22), ('Suco', 9, 4, 16), ('Salada', 22, 9, 6), ('Batata', 18, 6, 31), ('Cerveja', 12, 7.5, 27), ('Café', 5, 1.2, 12),
    ('Sem venda A', 15, None, 0), ('Sem venda B', 25, 10, 0),
]
pid = {}
for name, price, cost, _ in catalog:
    c = 'NULL' if cost is None else cost
    pid[name] = psql(f"insert into products (tenant_id,category_id,name,price,cost_price) values ('{tid}','{cat}','{name}',{price},{c}) returning id").split('\n')[0]
pid['Prejuízo'] = psql(f"insert into products (tenant_id,category_id,name,price,cost_price) values ('{tid}','{cat}','Prejuízo',30,50) returning id").split('\n')[0]
cust = [psql(f"insert into customers (tenant_id,email,password_hash,name) values ('{tid}','c{i}@x.com','x','C{i}') returning id").split('\n')[0] for i in range(6)]
weights = {6: 5, 5: 4, 4: 3, 2: 2, 1: 1}  # dias atrás (3 fica só para o item com prejuízo; hoje sem vendas)
def alloc(total):
    wsum = sum(weights.values()); out = {d: total * w // wsum for d, w in weights.items()}
    rem = total - sum(out.values())
    for d in sorted(weights, key=lambda d: (-(total * weights[d] % wsum), d))[:rem]: out[d] += 1
    return out
orders = {d: [] for d in weights}; orders[3] = [('Prejuízo', 3)]
for name, price, cost, units in catalog:
    for d, q in alloc(units).items():
        if q: orders[d].append((name, q))
price_of = {n: p for n, p, _, _ in catalog}; price_of['Prejuízo'] = 30
k = 0
for d, lines in orders.items():
    # um pedido por linha de item (valores pequenos), clientes alternados; 1 cupom e 1 cancelado para testar exclusão
    for name, qty in lines:
        k += 1
        cu = f"'{cust[k % 6]}'" if k % 3 else 'NULL'
        pay = ['cartao', 'pix', 'dinheiro'][k % 3]
        disc = 5 if k == 7 else 0
        oid = psql(f"insert into orders (tenant_id,order_type,status,total,discount_amount,payment_method,payment_status,customer_id,created_at) values ('{tid}','{['mesa','balcao','entrega'][k%3]}','entregue',{qty*price_of[name]},{disc},'{pay}','pago',{cu}, (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '{d} days' + interval '12 hours') AT TIME ZONE 'America/Sao_Paulo') returning id").split('\n')[0]
        psql(f"insert into order_items (order_id,product_id,product_name,quantity,unit_price,subtotal) values ('{oid}','{pid[name]}','{name}',{qty},{price_of[name]},{qty*price_of[name]})")
# cancelados (NÃO podem entrar no bruto): R$ 300 de Picanha cancelada
for i in range(3):
    oid = psql(f"insert into orders (tenant_id,order_type,status,total,payment_method,payment_status,cancel_reason,created_at) values ('{tid}','balcao','cancelado',100,'dinheiro','pendente','Cliente desistiu', (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 days' + interval '15 hours') AT TIME ZONE 'America/Sao_Paulo') returning id").split('\n')[0]
    psql(f"insert into order_items (order_id,product_id,product_name,quantity,unit_price,subtotal) values ('{oid}','{pid['Picanha']}','Picanha',1,100,100)")

errors = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox']); ctx = b.new_context(viewport={'width': 1400, 'height': 1000}, accept_downloads=True); page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)[:200]))
    page.goto(APP + '/login'); page.fill('input[type=email]', 'owner@teste.com'); page.fill('input[type=password]', 'Senha12345'); page.click('button[type=submit]'); page.wait_for_url(APP + '/')
    token = page.evaluate("localStorage.getItem('admin_token')")
    api = http('GET', '/analytics?period=semana', token)
    R0, R1 = api['range']['from'], api['range']['to']
    inr = f"o.created_at >= '{R0}'::timestamptz and o.created_at < '{R1}'::timestamptz"
    exp_gross = float(psql(f"select coalesce(sum(oi.subtotal),0) from orders o join order_items oi on oi.order_id=o.id where o.tenant_id='{tid}' and o.status not in ('cancelado','aguardando_pagamento') and {inr}"))
    exp_orders = int(psql(f"select count(*) from orders o where o.tenant_id='{tid}' and o.status not in ('cancelado','aguardando_pagamento') and {inr}"))
    exp_canc = float(psql(f"select coalesce(sum(oi.subtotal),0) from orders o join order_items oi on oi.order_id=o.id where o.tenant_id='{tid}' and o.status='cancelado' and {inr}"))
    exp_disc = float(psql(f"select coalesce(sum(o.discount_amount),0) from orders o where o.tenant_id='{tid}' and o.status not in ('cancelado','aguardando_pagamento') and {inr}"))
    page.goto(APP + '/analise'); page.wait_for_selector('[data-testid=matrix-dot]', timeout=20000); page.wait_for_timeout(800)

    def card(title):
        el = page.locator(f'p:text-is("{title}")').first.locator('xpath=..')
        return [l.strip() for l in el.inner_text().split('\n') if l.strip()]

    print('1) Cards do topo')
    k_ = api['kpis']
    ok(abs(k_['grossRevenue'] - exp_gross) < 0.005 and abs(exp_gross - 0) > 0, f"bruto da API = SQL independente: {k_['grossRevenue']} = {exp_gross:.2f}")
    ok(k_['grossRevenue'] + exp_canc > k_['grossRevenue'] and abs(api['losses']['cancelledValue'] - exp_canc) < 0.005, f"cancelados (R$ {exp_canc:.2f}) ficam só em Perdas e NÃO estão no bruto")
    g = card('Faturamento bruto'); n = card('Faturamento líquido')
    ok(abs(brl(g[1]) - exp_gross) < 0.005, f'card Faturamento bruto mostra {g[1]}')
    exp_net = k_['grossRevenue'] - k_['discounts'] - k_['paymentFees'] - k_['taxes']
    ok(abs(brl(n[1]) - exp_net) < 0.005 and abs(exp_net - k_['netRevenue']) < 0.005, f'líquido = bruto − cupons − taxas − impostos: {n[1]}')
    sub = n[2]
    ok('cancel' not in sub.lower() and sub.count('–') == 3 and 'cupons' in sub and 'taxas' in sub and 'impostos' in sub, f'subtexto do líquido sem cancelamento: "{sub}"')
    ok(abs(brl(sub.split('cupons')[1]) - exp_disc) < 0.005 and abs(exp_disc - k_['discounts']) < 0.005, f'subtexto: cupons = {exp_disc:.2f}')
    t1 = card('Ticket médio / pedido'); t2 = card('Ticket médio / cliente')
    ok(abs(brl(t1[1]) - exp_gross / exp_orders) < 0.006, f'ticket/pedido = bruto ÷ {exp_orders} pedidos = {exp_gross/exp_orders:.2f} (mostra {t1[1]})')
    cl = api['crm']['customersServed']
    ok(abs(brl(t2[1]) - exp_gross / cl) < 0.006, f'ticket/cliente = bruto ÷ {cl} clientes = {exp_gross/cl:.2f} (mostra {t2[1]})')
    ok(abs(brl(card('Pedidos cancelados')[1]) - exp_canc) < 0.005, 'card Perdas mostra o valor cancelado')
    ok(not any('cancel' in l.lower() for l in card('Faturamento bruto')), 'card do bruto sem menção a cancelamento')

    print('2) Matriz 2x2: bolinha na posição exata do valor')
    dots = page.eval_on_selector_all('[data-testid=matrix-dot]', "els => els.map(e => ({name: e.dataset.name, units: +e.dataset.units, margin: +e.dataset.margin, cls: e.dataset.class, cx: +e.getAttribute('cx'), cy: +e.getAttribute('cy')}))")
    items = {i['name']: i for i in api['matrix']['items']}
    ok(len(dots) == len(items) and all(d['name'] in items and d['margin'] == items[d['name']]['unitMargin'] and d['units'] == items[d['name']]['units'] for d in dots), f'{len(dots)} pontos = {len(items)} itens da API (volume e margem idênticos)')
    sv = items['Sorvete']
    ok(sv['unitMargin'] == 5.99, f"Sorvete: margem calculada = R$ {sv['unitMargin']} (esperado 5,99 = 10,00 − 4,01)")
    def ticks(axis):
        orient = 'left' if axis == 'y' else 'bottom'; attr = 'y' if axis == 'y' else 'x'
        return page.eval_on_selector_all(f'[data-testid=matrix-chart] text.recharts-cartesian-axis-tick-value[orientation="{orient}"]',
                                         f"els => els.map(e => ({{pos: parseFloat(e.getAttribute('{attr}')), text: e.textContent}}))")
    yt = [(t['pos'], brl(t['text'])) for t in ticks('y') if re.search(r'\d', t['text'])]; xt = [(t['pos'], float(re.sub(r'[^0-9.,]', '', t['text']).replace('.', '').replace(',', '.'))) for t in ticks('x') if re.search(r'\d', t['text'])]
    if len(xt) < 2:
        print('DEBUG xAxis:', page.eval_on_selector('[data-testid=matrix-chart] .recharts-xAxis', 'e => e.outerHTML.slice(0, 1500)')); print('DEBUG ticks x:', ticks('x')); sys.exit(2)
    (py0, v0), (py1, v1) = yt[0], yt[-1]; (px0, u0), (px1, u1) = xt[0], xt[-1]
    worst_y = worst_x = 0
    for d in dots:
        val_y = v0 + (d['cy'] - py0) * (v1 - v0) / (py1 - py0); val_x = u0 + (d['cx'] - px0) * (u1 - u0) / (px1 - px0)
        worst_y = max(worst_y, abs(val_y - d['margin'])); worst_x = max(worst_x, abs(val_x - d['units']))
    clipped = page.evaluate("() => { const box = document.querySelector('[data-testid=matrix-chart]').getBoundingClientRect(); return [...document.querySelectorAll('[data-testid=matrix-chart] text.recharts-cartesian-axis-tick-value[orientation=left]')].filter(t => t.getBoundingClientRect().left < box.left - 0.5).map(t => t.textContent); }")
    ok(not clipped and any(v < 0 for _, v in yt) and all('-' in t['text'] or '−' in t['text'] for t in ticks('y') if brl(t['text']) < 0), f'rótulos do eixo Y inteiros (nenhum cortado; negativos com sinal): {[t["text"] for t in ticks("y")]}')
    per_px_y = abs((v1 - v0) / (py1 - py0)); per_px_x = abs((u1 - u0) / (px1 - px0))
    ok(worst_y <= 0.75 * per_px_y, f'posição vertical de TODAS as bolinhas = margem calculada (maior desvio R$ {worst_y:.3f} = {worst_y/per_px_y:.2f} px; 1 px = R$ {per_px_y:.2f}; eixo {yt[0][1]}..{yt[-1][1]})')
    ok(worst_x <= 0.75 * per_px_x, f'posição horizontal = unidades (maior desvio {worst_x:.3f} un = {worst_x/per_px_x:.2f} px)')
    sd = [d for d in dots if d['name'] == 'Sorvete'][0]; yv = v0 + (sd['cy'] - py0) * (v1 - v0) / (py1 - py0)
    ok(abs(yv - 5.99) <= 0.75 * per_px_y and abs(yv - 4.00) > 1.5, f'Sorvete plotado em Y = R$ {yv:.2f} (margem 5,99; nunca 4,00)')
    page.locator('[data-testid=matrix-dot][data-name="Sorvete"]').hover(force=True); page.wait_for_timeout(400)
    tt = page.locator('[data-testid=matrix-tooltip]'); ok(tt.count() == 1 and 'Sorvete' in tt.inner_text() and '5,99' in tt.inner_text(), f'tooltip do Sorvete: {tt.inner_text().replace(chr(10), " | ") if tt.count() else "(nenhum)"}')
    page.screenshot(path='/tmp/e2e/shots/20-matriz.png', full_page=False)

    print('3) Quadrantes: classificação independente (frações exatas) = pontos = cards')
    its = api['matrix']['items']; n_ = len(its); U = sum(i['units'] for i in its)
    Vbar = Fraction(U, n_); Msum = sum(Fraction(round(i['unitMargin'] * 100), 100) * i['units'] for i in its); Mbar = Msum / U
    def klass(i):
        hv = i['units'] >= Vbar; hm = Fraction(round(i['unitMargin'] * 100), 100) >= Mbar
        return 'estrela' if hv and hm else 'burro_de_carga' if hv else 'puzzle' if hm else 'cao'
    ok(all(klass(i) == i['classification'] for i in its), f"classificação da API = frações exatas (V̄={float(Vbar):.2f}, M̄={float(Mbar):.2f})")
    ok(all(d['cls'] == klass(items[d['name']]) for d in dots), 'cor/classe de cada bolinha = classificação independente')
    for c in ['estrela', 'burro_de_carga', 'puzzle', 'cao']:
        txt = page.locator(f'[data-testid=quadrant-{c}]').inner_text(); cnt = int(re.search(r'·\s*(\d+)', txt).group(1))
        ok(cnt == sum(1 for d in dots if d['cls'] == c) == sum(1 for i in its if klass(i) == c), f'card "{txt.splitlines()[0].strip()}" = {cnt} (bolinhas = cálculo)')
    th = page.locator('[data-testid=matrix-thresholds]').inner_text()
    ok(f"{api['matrix']['averageVolume']:g}".replace('.', ',') in th and f"{api['matrix']['averageMargin']:.2f}".replace('.', ',') in th, f'médias exibidas: {th[:150]}')
    burro = page.locator('[data-testid=quadrant-burro_de_carga]').inner_text()
    ok('Alto volume e baixa margem — reajuste o preço ou reduza o custo.' in burro and 'alta margem' not in burro, 'card "Burros de carga": "Alto volume e baixa margem — reajuste o preço ou reduza o custo."')
    ok('Baixo volume e alta margem' in page.locator('[data-testid=quadrant-puzzle]').inner_text() and 'Baixo volume e baixa margem' in page.locator('[data-testid=quadrant-cao]').inner_text(), 'definições de Puzzles e Cães')

    print('4) Rankings')
    def rank(tid_):
        return page.eval_on_selector_all(f'[data-testid={tid_}] li', "els => els.map(li => ({name: li.querySelector('span span').nextSibling ? li.innerText.split('\\n')[0].replace(/^\\d+\\.\\s*/, '') : '', text: li.innerText, w: parseFloat(li.querySelector('[data-testid=rank-bar]').style.width), u: +li.querySelector('[data-testid=rank-bar]').dataset.units}))")
    top = rank('rank-top'); bot = rank('rank-bottom')
    ok([t['u'] for t in top] == sorted([t['u'] for t in top], reverse=True), f"Top 10 decrescente: {[t['u'] for t in top]}")
    ok([t['u'] for t in bot] == sorted(t['u'] for t in bot), f"Menos vendidos CRESCENTE: {[t['u'] for t in bot]}")
    names_top = {t['text'].split('\n')[0].split('.', 1)[1].strip() for t in top}; names_bot = {t['text'].split('\n')[0].split('.', 1)[1].strip() for t in bot}
    ok(not names_top & names_bot and len(bot) == 14 - 10 + 0 or not names_top & names_bot, f'nenhum campeão de vendas nos menos vendidos (top={len(top)}, menos={len(bot)}, interseção={names_top & names_bot})')
    ok(bot and bot[0]['u'] == 0 and all(t['u'] >= max(x['u'] for x in bot) for t in top), 'itens sem venda vêm primeiro; todo item do Top 10 vendeu >= qualquer item dos menos vendidos')
    mb = max(x['u'] for x in bot); mt = max(x['u'] for x in top)
    ok(all(abs(x['w'] - (x['u'] / mb * 100 if mb else 0)) < 0.01 for x in bot), f'barras dos menos vendidos proporcionais ao MAIOR do grupo (máx {mb} un = 100%): {[round(x["w"]) for x in bot]}')
    ok(all(abs(x['w'] - x['u'] / mt * 100) < 0.01 for x in top), 'barras do Top 10 na escala do Top 10')
    ok(max(x['w'] for x in bot) == 100.0 and mt != mb, f'escala dos menos vendidos independente da do Top (máx {mb} vs {mt})')
    page.screenshot(path='/tmp/e2e/shots/21-rankings.png')

    print('5) Gráfico de tendência: soma = card e tooltip vermelho/verde')
    real = [pt for pt in api['series'] if not pt.get('forecast')]; proj = [pt for pt in api['series'] if pt.get('forecast')]
    ok(sum(round(pt['revenue'] * 100) for pt in real) == round(k_['netRevenue'] * 100), f"Σ pontos reais (receita) = card líquido ({k_['netRevenue']})")
    ok(sum(round(pt['profit'] * 100) for pt in real) == round(k_['grossProfit'] * 100), f"Σ pontos reais (lucro) = card lucro bruto ({k_['grossProfit']})")
    ok(any(pt['profit'] < 0 for pt in real), f"há um dia com lucro real negativo (prejuízo semeado): {[pt['profit'] for pt in real if pt['profit'] < 0]}")
    ok(all(pt['revenue'] >= 0 and pt['profit'] >= 0 and pt['profit'] <= pt['revenue'] and (pt['revenue'] > 0 or pt['profit'] == 0) for pt in proj), f"projeção travada: receita {[pt['revenue'] for pt in proj]} lucro {[pt['profit'] for pt in proj]}")
    wr = page.locator('.recharts-wrapper').first; wr.scroll_into_view_if_needed(); page.wait_for_timeout(300); box = wr.bounding_box(); seen = []
    for x in range(int(box['x']) + 70, int(box['x'] + box['width']) - 10, 14):
        page.mouse.move(x, box['y'] + 120); page.wait_for_timeout(60)
        tt = page.locator('[data-testid=tooltip-profit]')
        if tt.count():
            cls = tt.first.get_attribute('class'); val = brl(tt.first.inner_text()); lab = page.locator('[data-testid=chart-tooltip] p').first.inner_text().strip()
            seen.append((lab, val, 'text-red-500' in cls, 'text-emerald-600' in cls))
    uniq = {s[0]: s for s in seen}
    ok(len(uniq) >= 5, f'tooltip lido em {len(uniq)} pontos do gráfico')
    ok(all((v < 0) == red and (v >= 0) == green and (red != green) for _, v, red, green in uniq.values()), 'cor do lucro no tooltip: vermelho se < 0, verde se >= 0 (em todos os pontos)')
    ok(any(red for _, _, red, _ in uniq.values()) and any(green for _, _, _, green in uniq.values()), f"viu vermelho e verde: {[(l, v) for l, v, r, g in uniq.values() if r]}")
    page.screenshot(path='/tmp/e2e/shots/22-tendencia.png')

    print('6) Rodapé e exportação')
    page.get_by_text('Como os números são calculados').click(); foot = page.locator('details').inner_text()
    ok('Faturamento bruto = soma dos valores dos pedidos concluídos/válidos. Líquido = bruto – cupons – taxas de pagamento – impostos (gorjeta e taxa de entrega não entram).' in foot, 'rodapé com o texto novo EXATO')
    ok('inclui os cancelados' not in foot and 'cupons – cancelamentos' not in foot, 'texto antigo removido')
    page.get_by_role('button', name='Exportar Relatório Analítico').click()
    with page.expect_download() as dl: page.get_by_text('Resumo executivo / DRE (CSV)').click()
    csv = open(dl.value.path(), encoding='utf-8-sig').read()
    ok('Cancelamentos' not in csv and 'Receita bruta' in csv and 'Receita líquida' in csv, 'DRE exportado sem linha de cancelamentos')
    line = [l for l in csv.splitlines() if l.startswith('(+) Receita bruta')][0]
    ok(abs(float(line.split(';')[1].replace(',', '.')) - exp_gross) < 0.005, f'DRE: {line}')
    b.close()

print(f'\nErros de página: {len(errors)}', errors[:3])
print(f'\nResultado: {sum(results)}/{len(results)} verificações OK')
sys.exit(0 if all(results) and not errors else 1)
