# API de backup via HTTP real: permissões (owner x manager x staff x sem token),
# fluxo completo, throttle, 403 (não 401) para senha errada, auditoria com IP.
# Rodar:  NEED_VITE=0 bash docs/testes-e2e/run.sh docs/testes-e2e/test_backups_api.py
import json, subprocess, sys, time, urllib.request, urllib.error
API = 'http://localhost:3000'
results = []
def ok(c, label):
    results.append(bool(c)); print(('  OK  ' if c else '  FALHOU ') + label, flush=True)
def psql(q):
    return subprocess.run(['psql', '-h', 'localhost', '-U', 'postgres', '-d', 'cardapio_test', '-tA'], input=q, capture_output=True, text=True, env={'PGPASSWORD': 'pg', 'PATH': '/usr/bin:/bin'}).stdout.strip()
def http(method, path, token=None, body=None, headers=None, raw=False):
    h = {'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {}), **(headers or {})}
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req) as r:
            data = r.read()
            return r.status, (data if raw else (json.loads(data) if data else None)), dict(r.headers)
    except urllib.error.HTTPError as e:
        d = e.read().decode()
        try: d = json.loads(d)
        except Exception: pass
        return e.code, d, dict(e.headers)

PW = 'Senha12345'
http('POST', '/auth/register', body={'tenantName': 'Teste', 'tenantSlug': 'teste', 'email': 'owner@teste.com', 'password': PW, 'name': 'Marina'})
tid = psql("select id from tenants where slug='teste'")
h = subprocess.run(['node', '-e', f"console.log(require('bcrypt').hashSync('{PW}',10))"], cwd='/home/claude/proj/backend', capture_output=True, text=True).stdout.strip()
psql(f"insert into admin_users (tenant_id,email,password_hash,name,role) values ('{tid}','gerente@teste.com','{h}','Carlos','manager'),('{tid}','func@teste.com','{h}','Joana','staff')")
# dados para o backup
psql(f"insert into categories (tenant_id,name) values ('{tid}','Bebidas'),('{tid}','Lanches')")
login = lambda e: http('POST', '/auth/login', body={'email': e, 'password': PW})[1]['accessToken']
owner, mgr, staff = login('owner@teste.com'), login('gerente@teste.com'), login('func@teste.com')

print('1) Permissões')
for name, tk, expect in [('owner', owner, 200), ('gerente', mgr, 403), ('funcionário', staff, 403), ('sem token', None, 401)]:
    s, _, _ = http('GET', '/backups', tk)
    ok(s == expect, f'GET /backups como {name}: {s} (esperado {expect})')
for name, tk in [('gerente', mgr), ('funcionário', staff)]:
    ok(http('POST', '/backups', tk)[0] == 403, f'criar backup como {name}: 403')
    ok(http('PUT', '/backups/settings', tk, {'frequencyDays': 3, 'runTime': '04:00', 'retentionDays': 90})[0] == 403, f'salvar agenda como {name}: 403')
    ok(http('GET', '/backups/audit-log', tk)[0] == 403, f'ver auditoria como {name}: 403')
fake = '00000000-0000-4000-8000-000000000000'
for name, tk in [('gerente', mgr), ('funcionário', staff), (None, None)]:
    exp = 401 if tk is None else 403
    ok(http('GET', f'/backups/{fake}/download', tk)[0] == exp, f'download como {name or "sem token"}: {exp}')
    _s = http('POST', f'/backups/{fake}/restore', tk, {'password': PW, 'confirmationWord': 'RESTAURAR-DADOS'})
    ok(_s[0] == exp, f'restaurar como {name or "sem token"}: {exp} (veio {_s[0]})')
    ok(http('DELETE', f'/backups/{fake}', tk)[0] == exp, f'excluir como {name or "sem token"}: {exp}')
ok(psql(f"select count(*) from backup_audit_logs where action='forbidden_access' and tenant_id='{tid}'") != '0', 'acessos negados (gerente/funcionário) ficam na auditoria')

print('2) Visão geral e agenda')
s, ov, _ = http('GET', '/backups', owner)
ok(s == 200 and ov['settings']['frequencyDays'] == 0 and ov['backups'] == [] and ov['config']['encryptionConfigured'] is True and ov['config']['storageConfigured'] is True, 'visão geral inicial: desativado, vazio, criptografia configurada')
print('   chaves:', sorted(ov.keys()))
for bad in [{'frequencyDays': 5, 'runTime': '04:00', 'retentionDays': 90}, {'frequencyDays': 3, 'runTime': '25:00', 'retentionDays': 90}, {'frequencyDays': 3, 'runTime': '04:00', 'retentionDays': 3}, {'frequencyDays': 3, 'runTime': '04:00', 'retentionDays': 9999}, {}]:
    ok(http('PUT', '/backups/settings', owner, bad)[0] == 400, f'agenda inválida recusada: {json.dumps(bad)[:70]}')
for f in (3, 7, 15, 30, 0):
    s, r, _ = http('PUT', '/backups/settings', owner, {'frequencyDays': f, 'runTime': '04:00', 'retentionDays': 90})
    ok(s == 200 and r['frequencyDays'] == f and ((r['nextRunAt'] is None) == (f == 0)), f'frequência {f} salva (nextRunAt {"nulo" if f == 0 else "definido"})')

print('3) Backup manual → polling → concluído')
s, r, _ = http('POST', '/backups', owner, headers={'X-Forwarded-For': '9.9.9.9, 198.51.100.7'})
ok(s == 202 and r['status'] == 'processando', 'POST /backups → 202 "processando" (assíncrono)')
bid = r['id']
for _ in range(40):
    time.sleep(0.5)
    it = [i for i in http('GET', '/backups', owner)[1]['backups'] if i['id'] == bid][0]
    if it['status'] != 'processando': break
ok(it['status'] == 'concluido' and it['fileSize'] > 100 and it['backupType'] == 'manual', f"concluído ({it['fileSize']} bytes)")
ok('storagePath' not in it and 'checksumSha256' not in it, 'API não expõe caminho do storage nem checksum')
ip = psql(f"select ip from backup_audit_logs where action='backup_started' and tenant_id='{tid}' order by created_at desc limit 1")
ok(ip == '198.51.100.7', f'auditoria grava o IP do proxy confiável (última entrada do X-Forwarded-For): {ip}')

print('4) Download')
s, body, hd = http('GET', f'/backups/{bid}/download', owner, raw=True)
ok(s == 200 and body[:4] == b'CSBK' and b'Bebidas' not in body, 'arquivo baixado é criptografado (magic CSBK, sem texto legível)')
ok(hd.get('Cache-Control') == 'no-store' and 'attachment' in hd.get('Content-Disposition', ''), 'cabeçalhos: attachment + no-store')
ok(psql(f"select count(*) from backup_audit_logs where action='backup_downloaded' and tenant_id='{tid}'") == '1', 'download auditado')
open('/tmp/e2e/baixado.csbk', 'wb').write(body)

print('5) Restauração — validações e fluxo (aguarda a janela de 60 s do limitador)')
time.sleep(61)
psql(f"delete from categories where tenant_id='{tid}'")
R = f'/backups/{bid}/restore'
s, r, _ = http('POST', R, owner, {'password': PW, 'confirmationWord': 'restaurar'})
ok(s == 400, f'palavra errada: {s}')
s, r, _ = http('POST', R, owner, {'password': 'errada', 'confirmationWord': 'RESTAURAR-DADOS'})
ok(s == 403, f'senha errada: {s} (403, não 401 — não desloga o painel)')
ok(http('GET', '/backups', owner)[0] == 200, 'sessão continua válida após senha errada')
# (404 backup inexistente e 400s ficam no bloco após a próxima janela)
ok(psql(f"select count(*) from categories where tenant_id='{tid}'") == '0', 'nada restaurado até aqui')
s, pv, _ = http('GET', f'/backups/{bid}/restore-preview', owner)
cat = [r for r in pv['rows'] if r['table'] == 'categories'][0]
ok(s == 200 and cat['current'] == 0 and cat['inBackup'] == 2, f'pré-visualização: categories atual 0 → backup 2')
s, r, _ = http('POST', R, owner, {'password': PW, 'confirmationWord': 'RESTAURAR-DADOS'})
ok(s == 200 and r['totalRows'] >= 2 and r['safetyBackupId'], f'restauração OK: {s} {str(r)[:90]}')
ok(psql(f"select string_agg(name, ',' order by name) from categories where tenant_id='{tid}'") == 'Bebidas,Lanches', 'dados voltaram (Bebidas, Lanches)')
it = [i for i in http('GET', '/backups', owner)[1]['backups'] if i['id'] == bid][0]
ok(it['status'] == 'restaurado' and it['restoreCount'] == 1, 'status "restaurado"')
s, au, _ = http('GET', '/backups/audit-log', owner)
acts = [a['action'] for a in au]
ok(s == 200 and 'restore_completed' in acts and 'restore_denied' in acts and 'backup_downloaded' in acts and 'settings_updated' in acts, f'auditoria completa visível ao dono ({len(au)} eventos)')
ok(all('ip' in a and 'userEmail' in a for a in au), 'cada evento traz IP e usuário')

print('6) Throttle da senha (5/min) — nova janela')
time.sleep(61)
codes = [http('POST', R, owner, {'password': 'x', 'confirmationWord': 'RESTAURAR-DADOS'})[0] for _ in range(6)]
ok(codes[:5] == [403] * 5 and codes[5] == 429, f'5 tentativas erradas passam (403) e a 6ª é bloqueada (429): {codes}')
print('   Validações 400/404 — nova janela')
time.sleep(61)
http('POST', '/auth/register', body={'tenantName': 'Outro', 'tenantSlug': 'outro', 'email': 'o2@outro.com', 'password': PW, 'name': 'Zé'})
o2 = login('o2@outro.com')
ok(http('POST', R, owner, {'confirmationWord': 'RESTAURAR-DADOS'})[0] == 400 and http('POST', R, owner, {'password': PW})[0] == 400, 'campos ausentes: 400')
ok(http('POST', '/backups/nao-e-uuid/restore', owner, {'password': PW, 'confirmationWord': 'RESTAURAR-DADOS'})[0] == 400, 'id inválido: 400')
ok(http('POST', f'/backups/{fake}/restore', owner, {'password': PW, 'confirmationWord': 'RESTAURAR-DADOS'})[0] == 404, 'backup inexistente: 404')
ok(http('POST', R, o2, {'password': PW, 'confirmationWord': 'RESTAURAR-DADOS'})[0] == 404, 'restaurar backup de OUTRO restaurante: 404')

print('7) Exclusão')
s, r, _ = http('POST', '/backups', owner)  # pode dar 429 se o limite de criação estourar; aqui são poucos
time.sleep(0.2)
for _ in range(40):
    time.sleep(0.5)
    items = http('GET', '/backups', owner)[1]['backups']
    if all(i['status'] not in ('processando', 'restaurando') for i in items): break
deletable = [i for i in items if i['backupType'] == 'manual' and i['id'] != bid][0]['id']
ok(http('DELETE', f'/backups/{deletable}', owner)[0] == 204, 'exclusão: 204')
ok(http('DELETE', f'/backups/{deletable}', owner)[0] == 404, 'excluir de novo: 404')
ok(http('GET', f'/backups/{deletable}/download', owner)[0] == 404, 'download do excluído: 404')

print('8) Isolamento entre restaurantes (HTTP)')
ok(http('GET', '/backups', o2)[1]['backups'] == [], 'outro restaurante não vê backups do primeiro')
ok(http('GET', f'/backups/{bid}/download', o2)[0] == 404 and http('DELETE', f'/backups/{bid}', o2)[0] == 404, 'baixar/excluir backup alheio: 404')
ok(http('GET', f'/backups/{bid}/restore-preview', o2)[0] == 404, 'preview de backup alheio: 404')

print(f"\nResultado: {sum(results)} ok, {len(results) - sum(results)} falhas")
sys.exit(0 if all(results) else 1)
