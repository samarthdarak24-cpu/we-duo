"""Compare every API URL referenced by frontend source to the real route files."""
from __future__ import annotations
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / "frontend"

# Collect real route patterns from disk.
patterns = []
for p in (FRONT / "app" / "api").rglob("route.ts"):
    rel = p.relative_to(FRONT / "app").as_posix()
    route = "/" + rel.replace("/route.ts", "")
    rx = re.escape(route)
    rx = re.sub(r"\\\[\\\.\\\.\\\.[^\\]+\\\]", r".+", rx)  # [...key]
    rx = re.sub(r"\\\[[^\\\]]+\\\]", r"[^/]+", rx)         # [id]
    patterns.append((route, re.compile("^" + rx + "$")))

# Collect methods actually exported by each route.
methods = {}
for p in (FRONT / "app" / "api").rglob("route.ts"):
    rel = p.relative_to(FRONT / "app").as_posix()
    route = "/" + rel.replace("/route.ts", "")
    src = p.read_text(encoding="utf-8")
    ms = set(re.findall(r"export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b", src))
    ms |= set(re.findall(r"export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\s*=", src))
    methods[route] = ms

# All frontend source files that can call fetch on the client.
sources = [p for p in (FRONT / "app").rglob("*.tsx")]
sources += [p for p in (FRONT / "components").rglob("*.tsx")]
sources += [p for p in (FRONT / "components").rglob("*.ts")]
sources += [p for p in (FRONT / "lib" / "client").rglob("*.ts")]

hits = []
for p in sources:
    text = p.read_text(encoding="utf-8")
    for m in re.finditer(r"(/api/v1/[A-Za-z0-9_/${}?=&.\[\]-]+)", text):
        hits.append((p.relative_to(FRONT).as_posix(), m.group(1), text[:m.start()].count("\n") + 1))

def matches(url: str):
    # strip query + replace interpolation placeholders with a token
    base = url.split("?")[0]
    base = re.sub(r"\$\{[^}]+\}", "PLACEHOLDER", base)
    base = base.replace("PLACEHOLDER", "v-seller")
    base = base.rstrip("/")
    return [r for r, rx in patterns if rx.match(base)]

print(f"routes={len(patterns)}  api-url refs={len(hits)}")
missing = {}
for f, u, line in hits:
    if not matches(u):
        missing.setdefault(u, []).append(f"{f}:{line}")
print(f"\n=== URLS WITH NO MATCHING ROUTE ({len(missing)}) ===")
for u, locs in sorted(missing.items()):
    print(f"  {u}")
    for l in locs[:6]:
        print(f"      {l}")

# Also print routes whose source declares no HTTP method (broken handler).
print("\n=== ROUTES WITH NO EXPORTED METHOD ===")
for r, ms in sorted(methods.items()):
    if not ms:
        print("  ", r)
