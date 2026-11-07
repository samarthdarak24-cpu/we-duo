import sqlite3, os
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, '.data', 'trustdrive.db')
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()
print('=== demo users ===')
for r in cur.execute("SELECT id,name,role,email,email_verified,twofa_enabled,deleted_at,kyc_status,substr(password_hash,1,24) AS ph FROM users ORDER BY role,name"):
    print(dict(r))
print()
print('=== sessions (last 8) ===')
for r in cur.execute("SELECT id,user_id,created_at,expires_at,revoked_at FROM sessions ORDER BY created_at DESC LIMIT 8"):
    print(dict(r))
