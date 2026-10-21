#!/usr/bin/env python3
# Registra test:promotions no package.json do backend e no test:all.
# Uso: ROOT=~/Projetos/cardapio-saas python3 add_promotions_test.py
import os, sys
root = os.path.expanduser(os.environ.get("ROOT", "~/Projetos/cardapio-saas"))
p = os.path.join(root, "backend", "package.json")
s = open(p, encoding="utf-8").read()
if "test:promotions" in s:
    sys.exit("já aplicado: test:promotions existe")
a1 = '    "test:siod-insights": "ts-node --transpile-only test/siod-insights-audit.ts",\n'
n1 = a1 + '    "test:promotions": "ts-node --transpile-only test/promotions-audit.ts",\n'
a2 = 'npm run test:product-images && npm run test:badges"'
n2 = 'npm run test:product-images && npm run test:badges && npm run test:promotions"'
for a in (a1, a2):
    assert s.count(a) == 1, f"âncora não única/ausente: {a!r} ({s.count(a)})"
s = s.replace(a1, n1).replace(a2, n2)
open(p, "w", encoding="utf-8").write(s)
print("ok: test:promotions registrado e adicionado ao test:all")
