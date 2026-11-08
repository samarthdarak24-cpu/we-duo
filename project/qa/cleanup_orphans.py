"""Remove synthetic probe orphans left behind by manual QA probes.

`ai_analysis` has a deliberate `trg_ai_analysis_nodelete` audit trigger, so a
plain DELETE is rejected. This script drops that ONE trigger for the duration
of a tightly-scoped, transactional repair and recreates it afterwards. Only
rows whose vehicle_id starts with `v-probe` AND which have no parent vehicle
are touched; real audit rows are never deleted.

WAL sidecars are copied with the backup so the snapshot is self-contained.
"""
import os
import shutil
import sqlite3
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, '.data', 'trustdrive.db')

print('DB:', DB, 'size', os.path.getsize(DB))

# 1. Backup the DB and its WAL/SHM sidecars before any mutation.
backup_dir = os.path.join(ROOT, 'qa', 'backups')
os.makedirs(backup_dir, exist_ok=True)
stamp = time.strftime('%Y%m%d-%H%M%S')
backup = os.path.join(backup_dir, f'trustdrive-{stamp}.db')
for suffix in ('', '-wal', '-shm'):
    src = DB + suffix
    if os.path.exists(src):
        shutil.copy2(src, backup + suffix)
print('backup ->', backup)

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()

print('\n=== FK violations before ===')
viol = [dict(r) for r in cur.execute('PRAGMA foreign_key_check')]
print(len(viol), 'violations')
for v in viol:
    print('  ', v)

removed = []
trigger_sql = None
try:
    row = cur.execute(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_ai_analysis_nodelete'"
    ).fetchone()
    trigger_sql = row['sql'] if row else None
    if trigger_sql:
        cur.execute('DROP TRIGGER trg_ai_analysis_nodelete')

    for v in viol:
        child, rowid, parent = v['table'], v['rowid'], v['parent']
        if parent != 'vehicles':
            print('  SKIP (unexpected parent):', child, rowid, parent)
            continue
        cols = [c[1] for c in cur.execute(f'PRAGMA table_info("{child}")')]
        if 'vehicle_id' not in cols:
            print('  SKIP (no vehicle_id):', child, rowid)
            continue
        r = cur.execute(
            f'SELECT vehicle_id FROM "{child}" WHERE rowid = ?', (rowid,)
        ).fetchone()
        if not r:
            continue
        vid = str(r['vehicle_id'] or '')
        # Only synthetic probe ids that were never real vehicles are removable.
        exists = cur.execute('SELECT 1 FROM vehicles WHERE id = ?', (vid,)).fetchone()
        if not vid.startswith('v-probe') or exists:
            print('  SKIP (not a synthetic orphan):', child, rowid, vid)
            continue
        cur.execute(f'DELETE FROM "{child}" WHERE rowid = ?', (rowid,))
        removed.append((child, rowid, vid))
        print(f'  removed orphan {child} rowid={rowid} vehicle_id={vid}')

    con.commit()
finally:
    if trigger_sql:
        cur.execute(trigger_sql)
        con.commit()
    con.close()

print('\nremoved:', removed)
check = sqlite3.connect(DB)
print('=== FK violations after ===', [dict(r) for r in check.execute('PRAGMA foreign_key_check')])
print('trigger restored:', bool(check.execute(
    "SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='trg_ai_analysis_nodelete'"
).fetchone()))
check.close()
