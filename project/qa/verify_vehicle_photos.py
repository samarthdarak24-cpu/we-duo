"""Verify every remote vehicle photo URL used by the UI actually resolves.

Sources in frontend/lib/vehicle-images.ts:
  * Wikimedia Commons `Special:FilePath` (model-accurate lead images)
  * manufacturer product CDNs (Ather 450X, Revolt RV400)
  * Unsplash CDN (class-accurate fallback for synthetic QA rows)

Google Images thumbnail links (encrypted-tbn0.gstatic.com) are deliberately not
used: they expire, are low-resolution and block hotlinking -- exactly what
caused blank vehicle cards. Run this after editing the catalogue, or
`npm run verify:photos`, to catch dead links before they become blanks.

    python project/qa/verify_vehicle_photos.py
"""
from __future__ import annotations

import concurrent.futures
import re
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOGUE = ROOT / "frontend" / "lib" / "vehicle-images.ts"
UNSPLASH = "https://images.unsplash.com/photo-"
URL_RE = re.compile(r'"(https://[^"\s]+)"')
PHOTO_ID_RE = re.compile(r"\b(\d{13}-[0-9a-f]{12})\b")


def collect() -> list[str]:
    text = CATALOGUE.read_text(encoding="utf-8")
    # Skip the bare CDN prefix constant (not an image URL in itself).
    urls = {u for u in URL_RE.findall(text)
            if u.startswith("https://") and not u.rstrip("/").endswith("/photo-")}
    # Unsplash ids are stored bare inside POOLS, not as full URLs.
    urls.update(f"{UNSPLASH}{pid}?auto=format&fit=crop&w=400&q=60"
                for pid in PHOTO_ID_RE.findall(text))
    return sorted(urls)


def main() -> int:
    urls = collect()
    if not urls:
        print("no photo URLs found in the catalogue", file=sys.stderr)
        return 1

    ctx = ssl.create_default_context()
    headers = {"User-Agent": "Mozilla/5.0 (TrustDrive photo verification)"}

    def check(url: str) -> tuple[str, str]:
        # Some CDNs reject HEAD but serve GET (Ather), so fall back to a small
        # ranged GET before declaring a URL dead.
        for method in ("HEAD", "GET"):
            try:
                req = urllib.request.Request(url, headers=headers, method=method)
                with urllib.request.urlopen(req, timeout=20, context=ctx) as res:
                    res.read(32)
                    ctype = res.headers.get("Content-Type", "")
                    if res.status == 200 and ctype.startswith("image/"):
                        return url, "OK"
                    detail = f"HTTP {res.status} {ctype}"
            except urllib.error.HTTPError as exc:
                detail = f"HTTP {exc.code}"
            except Exception as exc:  # pragma: no cover - network dependent
                detail = f"{type(exc).__name__}: {exc}"
        return url, detail

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(check, urls))

    dead = [(url, detail) for url, detail in results if detail != "OK"]
    print(f"checked {len(urls)} unique vehicle photos -> {len(urls) - len(dead)} live, {len(dead)} dead")
    for url, detail in dead:
        print(f"  DEAD {url}: {detail}")
    return 1 if dead else 0


if __name__ == "__main__":
    raise SystemExit(main())
