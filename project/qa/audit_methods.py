"""Find frontend fetch/API calls whose HTTP method the target route does not export."""
from __future__ import annotations
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FRONT = ROOT / "frontend"

routes = {}
for p in (FRONT / "app" / "api").rglob("route.ts"):
    route = "/" + p.relative_to(FRONT / "app").as_posix().replace("/route.ts", "")
    src = p.read_text(encoding="utf-8")
    ms = set(re.findall(r"export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b", src))
    ms |= set(re.findall(r"export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\s*=", src))
    rx = re.escape(route)
    rx = re.sub(r"\\\[\\\.\\\.\\\.[^\\]+\\\]", r".+", rx)
    rx = re.sub(r"\\\[[^\\\]]+\\\]", r"[^/]+", rx)
    routes[route] = (ms, re.compile("^" + rx + "$"))


def find_route(url: str):
    base = re.sub(r"\$\{[^}]+\}", "v-seller", url.split("?")[0]).rstrip("/")
    for name, (ms, rx) in routes.items():
        if rx.match(base):
            return name, ms
    return None, set()


# Scan every fetch(...) / apiCall(...) invocation with surrounding context.
srcs = [p for p in (FRONT / "app").rglob("*.tsx")]
srcs += [p for p in (FRONT / "components").rglob("*.tsx")]
srcs += [p for p in (FRONT / "components").rglob("*.ts")]
srcs += [p for p in (FRONT / "lib" / "client").rglob("*.ts")]

problems = []
found = 0
for p in srcs:
    text = p.read_text(encoding="utf-8")
    for m in re.finditer(r"(?:fetch|apiCall)\s*\(", text):
        # grab a window large enough for url + init
        window = text[m.start(): m.start() + 700]
        urlm = re.search(r"['\"`](/api/v1/[^'\"`\s]*)", window)
        if not urlm:
            continue
        url = urlm.group(1)
        methodm = re.search(r"method\s*:\s*['\"]([A-Z]+)['\"]", window[:600])
        method = methodm.group(1) if methodm else "GET"
        found += 1
        name, ms = find_route(url)
        if name is None:
            problems.append(("NO_ROUTE", method, url, p, text[:m.start()].count("\n") + 1))
        elif ms and method not in ms:
            problems.append(("METHOD", method, url, p, text[:m.start()].count("\n") + 1))

print(f"scanned api calls with url+window: {found}")
print(f"problems: {len(problems)}\n")
for kind, method, url, p, line in problems:
    print(f"  {kind:8} {method:6} {url}  <- {p.relative_to(FRONT).as_posix()}:{line}")
