import sqlite3, sys, os

DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.data', 'trustdrive.db')
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()

print('DB:', DB)
print('=== foreign_key_check ===')
violations = [dict(r) for r in cur.execute('PRAGMA foreign_key_check')]
for r in violations:
    print(r)
print('violation count:', len(violations))

print()
print('=== child table -> parent table FK map ===')
for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
    t = r[0]
    fks = list(cur.execute(f'PRAGMA foreign_key_list("{t}")'))
    if fks:
        for fk in fks:
            print(f'{t}.{fk["from"]} -> {fk["table"]}.{fk["to"]}')

print()
print('=== row counts ===')
for t in ['users','vehicles','listings','documents','mileage_readings','findings','history_events',
          'damage_records','verification_evidence','trust_scores','saved_vehicles','chain_records',
          'inquiries','notifications','audit_logs','vehicle_photos','components','ai_investigations']:
    try:
        n = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        print(f'{t:24} {n}')
    except Exception as e:
        print(f'{t:24} ERROR {e}')

print()
print('=== detail for each violation ===')
for v in violations:
    child, rowid, parent, fkid = v['table'], v['rowid'], v['parent'], v['fkid']
    print(f'--- {child} rowid={rowid} expected parent {parent} (fkid={fkid})')
    cols = [c[1] for c in cur.execute(f'PRAGMA table_info("{child}")')]
    print('    cols:', cols)
    where = ' OR '.join(f'"{c}" IS NULL' for c in cols)
    sel = ', '.join(f'"{c}"' for c in cols)
    try:
        rows = list(cur.execute(f'SELECT {sel} FROM "{child}" WHERE rowid = ?', (rowid,)))
        for row in rows:
            print('    child row:', dict(row))
    except Exception as e:
        print('    child read err', e)
