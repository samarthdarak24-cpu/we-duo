import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = os.path.join(ROOT, 'qa', 'crud', 'recon.json')
d = json.load(open(P, encoding='utf-8'))

want = sys.argv[1:] or [
    'seller-add-vehicle', 'seller-documents', 'seller-history', 'seller-listings',
    'seller-inquiries', 'seller-vehicles', 'buyer-saved', 'buyer-inquiries',
    'buyer-compare', 'buyer-search', 'buyer-reports', 'seller-overview',
]

for name in want:
    p = d['pages'].get(name)
    if not p:
        print(f'--- {name}: MISSING')
        continue
    print(f'===== {name}  ({p["url"]})  h1={p["h1"]!r}  consoleErrors={len(p.get("consoleErrors") or [])}')
    if p.get('forms'):
        for f in p['forms']:
            print(f'  FORM method={f["method"]} action={f["action"]!r} id={f["id"]!r} submit={f["buttonText"]!r}')
    if p.get('inputs'):
        for i in p['inputs']:
            extra = f' options={i["options"]}' if i.get('options') else ''
            print(f'  INPUT <{i["tag"]} type={i["type"]!r} name={i["name"]!r} id={i["id"]!r}> label={i["label"]!r} ph={i["placeholder"]!r}{extra}')
    btns = p.get('buttons') or []
    interesting = [b for b in btns if b.get('text') and b['text'].lower() not in
                   ('overview', 'my vehicles', 'documents', 'verification center', 'ai fraud analysis',
                    'vehicle history', 'marketplace listings', 'buyer inquiries', 'reports', 'notifications',
                    'settings', 'explore vehicles', 'saved vehicles', 'compare vehicles', 'profile')]
    print(f'  BUTTONS ({len(btns)} total, showing non-nav):')
    for b in interesting[:40]:
        print(f'    - {b["text"]!r} type={b["type"]!r} disabled={b["disabled"]} title={b["title"]!r}')
    nt = p.get('buttonsNoText') or []
    if nt:
        print(f'  BUTTONS-NO-TEXT ({len(nt)}):')
        for b in nt[:12]:
            print(f'    - {b["title"]!r} testid={b["testid"]!r}')
    print()
