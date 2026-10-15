#!/usr/bin/env python3
"""Resolve os 3 conflitos do merge da promocao (Etapas 3/4).
Uso (dentro de frontend-cardapio): python3 resolver-conflitos.py
- package.json: mantem a linha test:logic do usuario e acrescenta promotionPanel.
- ProductCard.tsx / MenuPage.tsx: une os imports (nomes dos dois lados)."""
import re, sys, pathlib

CONFLICT = re.compile(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', re.S)
IMPORT = re.compile(r"import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)';?[ \t]*\n?", re.S)

def merge_imports(seu, meu):
    mods = {}
    order = []
    rest = []
    for side in (seu, meu):
        for m in IMPORT.finditer(side):
            is_type = bool(m.group(1))
            names = [n.strip() for n in m.group(2).split(',') if n.strip()]
            key = (m.group(3), is_type)
            if key not in mods:
                mods[key] = []
                order.append(key)
            for n in names:
                if n not in mods[key]:
                    mods[key].append(n)
        for line in IMPORT.sub('', side).splitlines():
            if line.strip() and line not in rest:
                rest.append(line)
    out = []
    for (mod, is_type) in order:
        names = ', '.join(mods[(mod, is_type)])
        out.append(f"import {'type ' if is_type else ''}{{ {names} }} from '{mod}';")
    return '\n'.join(out + rest) + '\n'

def resolve_pkg(seu, meu):
    line = seu.rstrip('\n')
    if 'promotionPanel' in line:
        return seu
    m = re.match(r'^(.*?)("\s*,?)$', line)
    return m.group(1) + ' && npx --yes tsx test/promotionPanel.test.ts' + m.group(2) + '\n'

def run(path, fn):
    p = pathlib.Path(path)
    text = p.read_text(encoding='utf-8')
    hits = CONFLICT.findall(text)
    if not hits:
        print(f'{path}: sem conflito (ok)')
        return
    new = CONFLICT.sub(lambda m: fn(m.group(1), m.group(2)), text)
    p.write_text(new, encoding='utf-8')
    print(f'{path}: {len(hits)} conflito(s) resolvido(s)')

run('package.json', resolve_pkg)
run('src/components/ProductCard.tsx', merge_imports)
run('src/pages/MenuPage.tsx', merge_imports)

left = [f for f in ('package.json', 'src/components/ProductCard.tsx', 'src/pages/MenuPage.tsx')
        if '<<<<<<<' in pathlib.Path(f).read_text(encoding='utf-8')]
if left:
    print('AINDA COM MARCADORES:', left); sys.exit(1)
