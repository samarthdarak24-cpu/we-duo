"""Sync the fixed Next.js source into the published single-port copy.

The published app is a copy of frontend/ with a deployment-specific start.sh
and a trimmed public/. Keep those; refresh everything else so the live site has
the same routes and backend wiring as the workspace app.
"""
from __future__ import annotations
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "frontend"
DST = ROOT / "deploy" / "site"

SKIP_PARTS = {"node_modules", ".next", "test-results", "playwright-report",
              ".next_verify", ".next_e2e", ".next_live", ".next_qa",
              ".next_independent", ".next_browser_prod", ".next_browser_verify",
              ".next_qa22", ".next_verify_build", ".next_verify_final",
              ".next_broken_1793958781"}
SKIP_SUFFIX = {".log", ".tsbuildinfo"}


def copy_tree(name: str) -> int:
    count = 0
    for p in (SRC / name).rglob("*"):
        rel = p.relative_to(SRC / name)
        if any(part in SKIP_PARTS or part.startswith(".next") for part in rel.parts):
            continue
        if not p.is_file() or p.suffix in SKIP_SUFFIX:
            continue
        target = DST / name / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, target)
        count += 1
    return count


def main():
    for tree in ("app", "components", "lib", "types"):
        print(f"{tree}: {copy_tree(tree)} files")
    for name in ("next.config.mjs", "tsconfig.json", "tailwind.config.ts",
                 "postcss.config.mjs", "next-env.d.ts", "middleware.ts",
                 "package.json", "package-lock.json"):
        shutil.copy2(SRC / name, DST / name)
        print("config:", name)

    # The published copy is gitignored, so the canonical startup files live in
    # project/infra/deployment/ and are copied in on every sync. They must be
    # present before publishing: boot.mjs is what makes port 3000 answer within
    # the hosting platform's 30-second readiness window.
    template_dir = ROOT / "project" / "infra" / "deployment"
    for name in ("start.sh", "boot.mjs"):
        shutil.copy2(template_dir / name, DST / name)
        print("startup:", name)

    # The published sandbox must keep its own startup script.
    pkg_path = DST / "package.json"
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    pkg["scripts"]["start"] = "sh start.sh"
    pkg_path.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
    print("preserved start script: sh start.sh")

    # Keep the trimmed public/ but refresh the vehicle model manifest.
    manifest = SRC / "public" / "models" / "vehicles" / "model-manifest.json"
    if manifest.is_file():
        target = DST / "public" / "models" / "vehicles" / "model-manifest.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(manifest, target)
        print("refreshed: model-manifest.json")

    print("\nroute count in deploy/site:", len(list((DST / "app" / "api").rglob("route.ts"))))


if __name__ == "__main__":
    main()
