import json, subprocess, sys, urllib.request
API = 'http://localhost:3000'
results = []
def ok(cond, label):
    results.append(bool(cond)); print(('  OK  ' if cond else '  FALHOU ') + label, flush=True)
def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode(); return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]
def psql(q):
    return subprocess.run(['su', 'postgres', '-c', 'psql -d cardapio_test -tA'], input=q, capture_output=True, text=True).stdout.strip()

s, reg = call('POST', '/auth/register', body={'tenantName': 'Teste', 'tenantSlug': 'teste', 'email': 'owner@teste.com', 'password': 'Senha12345', 'name': 'Marina'})
s, login = call('POST', '/auth/login', body={'email': 'owner@teste.com', 'password': 'Senha12345'}); tok = login['accessToken']
s, me = call('GET', '/tenants/me', tok); tid = me['id']
call('PATCH', '/tenants/me', tok, {'defaultCmvPercent': 33, 'cardFeePercent': 2.5, 'pixFeePercent': 1, 'taxPercent': 6})
s, cat = call('POST', '/categories/custom', tok, {'name': 'Pratos Teste'}); ok(s in (200, 201), f'categoria criada ({s})')
s, prod = call('POST', '/products', tok, {'categoryId': cat['id'], 'name': 'Burger Teste', 'price': 20, 'costPrice': 7.5}); ok(s in (200, 201) and prod.get('costPrice') == 7.5, f"produto com custo criado pelo admin ({s}) costPrice={prod.get('costPrice') if isinstance(prod, dict) else prod}")
s, locs = call('GET', '/locations/me', tok)
if not (isinstance(locs, list) and locs): call('POST', '/locations/me', tok, {'name': 'Loja 1'}); s, locs = call('GET', '/locations/me', tok)
loc = locs[0]['id']; ok(bool(loc), f'loja criada ({loc[:8]}…)')

print('1) Pedido real pela API pública grava o custo no item')
body = {'orderType': 'balcao', 'customerName': 'Joao Teste', 'customerPhone': '48999990000', 'paymentMethod': 'dinheiro', 'items': [{'productId': prod['id'], 'quantity': 2}]}
if loc: body['locationId'] = loc
s, order = call('POST', f'/orders/public/{tid}', None, body)
print('     resposta:', s, (json.dumps(order)[:200] if not isinstance(order, str) else order[:200]))
ok(s in (200, 201) and isinstance(order, dict) and 'id' in order, f'pedido criado pelo endpoint público ({s})')
if not (isinstance(order, dict) and 'id' in order): print('ABORT'); sys.exit(1)
row = psql(f"select unit_price, unit_cost, quantity, subtotal from order_items where order_id='{order['id']}'")
print('     banco (unit_price|unit_cost|qtd|subtotal):', row)
ok(row.startswith('20.00|7.50|2|40.00'), 'order_items.unit_cost = 7.50 gravado no momento do pedido (snapshot)')
# editar o custo depois NÃO muda o histórico
call('PATCH', f"/products/{prod['id']}", tok, {'costPrice': 12})
ok(psql(f"select unit_cost from order_items where order_id='{order['id']}'") == '7.50', 'mudar o custo do produto depois não altera o custo do pedido já feito')

print('2) Nada de custo/parâmetros financeiros em respostas públicas')
s, pub = call('GET', f'/products/public/{tid}'); text = json.dumps(pub)
ok(s == 200 and pub and all(p.get('costPrice') is None for p in pub), 'GET /products/public: costPrice sempre null')
ok('7.5' not in text and '"unitCost"' not in text, 'GET /products/public: o valor 7.5 não aparece em lugar nenhum')
s, tpub = call('GET', '/tenants/public/teste')
leak = [k for k in ('defaultCmvPercent', 'cardFeePercent', 'pixFeePercent', 'taxPercent', 'internalNotificationTarget') if k in tpub] if isinstance(tpub, dict) else ['?']
ok(s == 200 and not leak, f'GET /tenants/public/:slug sem parâmetros financeiros (vazou: {leak})')
ok(not any(k in tpub for k in ('mercadoPagoAccessTokenEncrypted', 'mercadoPagoWebhookSecretEncrypted')), 'GET /tenants/public/:slug sem segredos do Mercado Pago')
s, tme = call('GET', '/tenants/me', tok)
ok(tme.get('defaultCmvPercent') == 33 and tme.get('taxPercent') == 6, 'GET /tenants/me (admin) devolve os parâmetros salvos')
s, ordpub = call('GET', f"/orders/{order['id']}", tok)
s2, hist = call('GET', f"/orders/public/{tid}/me/history", None)
ok(s2 in (401, 403), f'histórico de pedidos do cliente exige login ({s2})')
ok('"unitCost"' not in json.dumps(ordpub) and '"unit_cost"' not in json.dumps(ordpub), 'pedido devolvido pela API (admin) não carrega unitCost (select:false)')
print('3) Rotas internas exigem login')
for m, path in [('GET', '/analytics'), ('GET', '/notes'), ('GET', '/internal-notifications'), ('GET', '/cash-transactions'), ('POST', '/notes'), ('PATCH', '/internal-notifications/read-all')]:
    st, _ = call(m, path, None, {} if m != 'GET' else None); ok(st == 401, f'{m} {path} sem token -> {st}')
print(f'\nResultado: {sum(results)}/{len(results)} verificações OK'); sys.exit(0 if all(results) else 1)
