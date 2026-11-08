import sqlite3, os, json
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, '.data', 'trustdrive.db')
con = sqlite3.connect(DB); con.row_factory = sqlite3.Row; cur = con.cursor()

def q(sql, *a):
    try:
        return [dict(r) for r in cur.execute(sql, a)]
    except Exception as e:
        return [{'error': str(e)}]

print('=== seller vehicles ===')
for r in q("SELECT id,make,model,year,reg_no,status,km_claimed,asking_price FROM vehicles WHERE owner_id='u-seller' LIMIT 6"):
    print(r)
print()
print('=== listings (u-seller vehicles) ===')
for r in q("""SELECT l.id,l.vehicle_id,l.status,l.headline,v.asking_price FROM listings l
              JOIN vehicles v ON v.id=l.vehicle_id WHERE v.owner_id='u-seller' LIMIT 8"""):
    print(r)
print()
print('=== inquiries ===')
for r in q("SELECT id,listing_id,buyer_id,seller_id,status,type,substr(message,1,40) msg FROM inquiries ORDER BY created_at DESC LIMIT 6"):
    print(r)
print()
print('=== inquiry_messages ===')
for r in q("SELECT id,inquiry_id,sender_id,substr(body,1,50) body FROM inquiry_messages ORDER BY created_at DESC LIMIT 5"):
    print(r)
print()
print('=== documents (u-seller) ===')
for r in q("""SELECT d.id,d.vehicle_id,d.type,d.status,d.file_name,d.version,d.consent FROM documents d
              JOIN vehicles v ON v.id=d.vehicle_id WHERE v.owner_id='u-seller' LIMIT 6"""):
    print(r)
print()
print('=== damage_records ===')
for r in q("SELECT id,vehicle_id,zone_id,severity,status FROM damage_records ORDER BY created_at DESC LIMIT 5"):
    print(r)
print()
print('=== saved_vehicles ===')
for r in q("SELECT * FROM saved_vehicles LIMIT 5"):
    print(r)
print()
print('=== columns saved_vehicles ===', [c[1] for c in cur.execute('PRAGMA table_info(saved_vehicles)')])
print('=== columns saved_comparisons ===', [c[1] for c in cur.execute('PRAGMA table_info(saved_comparisons)')])
print('=== columns vehicle_images ===', [c[1] for c in cur.execute('PRAGMA table_info(vehicle_images)')])
print('=== columns background_jobs ===', [c[1] for c in cur.execute('PRAGMA table_info(background_jobs)')])
print('=== columns document_extractions ===', [c[1] for c in cur.execute('PRAGMA table_info(document_extractions)')])
print('=== columns verification_results ===', [c[1] for c in cur.execute('PRAGMA table_info(verification_results)')])
print('=== columns saved_searches ===', [c[1] for c in cur.execute('PRAGMA table_info(saved_searches)')])
