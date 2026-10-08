import json, urllib.request, sys
from playwright.sync_api import sync_playwright
API='http://localhost:3000'; APP='http://127.0.0.1:5174'
def post(path, body):
    req=urllib.request.Request(API+path, method='POST', data=json.dumps(body).encode(), headers={'Content-Type':'application/json'})
    try: urllib.request.urlopen(req).read()
    except Exception: pass
post('/auth/register', {'tenantName':'Teste','tenantSlug':'teste','email':'owner@teste.com','password':'Senha12345','name':'Marina'})
routes=['/','/cardapio','/mesas','/lojas','/promocoes','/fidelidade','/cashback','/avaliacoes','/verificacoes','/analise','/anotacoes','/notificacoes','/historico','/verificar-cupom','/configuracoes']
bad=[]
with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox']); page=b.new_page(viewport={'width':1400,'height':900})
    errs=[]; page.on('pageerror', lambda e: errs.append(str(e)[:160]))
    page.goto(APP+'/login'); page.fill('input[type=email]','owner@teste.com'); page.fill('input[type=password]','Senha12345'); page.click('button[type=submit]'); page.wait_for_url(APP+'/')
    for r in routes:
        errs.clear(); page.goto(APP+r); page.wait_for_timeout(900)
        has_header = page.locator('header button[aria-label^="Notificações"]').count()==1
        txt=len(page.inner_text('body').strip())
        status='OK ' if (has_header and txt>80 and not errs) else 'PROBLEMA'
        if status!='OK ': bad.append(r)
        print(f'  {status} {r:18} header={has_header} texto={txt} erros={errs[:1]}')
    page.goto(APP+'/'); page.wait_for_timeout(700); page.screenshot(path='/tmp/e2e/shots/10-painel.png')
    b.close()
print('\nTelas com problema:', bad or 'nenhuma'); sys.exit(1 if bad else 0)
