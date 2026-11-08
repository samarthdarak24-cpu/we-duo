"""Audited, reversible reorganization for the TrustDrive repository.

Run from anywhere:
    python project/reorganize.py            # dry run, prints the plan
    python project/reorganize.py --apply    # perform the moves
    python project/reorganize.py --rollback # undo, using the manifest

Every move is recorded in project/MIGRATION_MANIFEST.json as {src, dst, kind}
so the operation is fully reversible. Nothing is deleted: duplicates and stale
builds are *staged* under project/archive/.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "project"
MANIFEST = PROJECT / "MIGRATION_MANIFEST.json"

# Never touch these top-level entries, even if a rule would match.
PROTECTED = {
    ".git", ".github", ".workbuddy-ai", ".data", "node_modules",
    "frontend", "backend", "services", "project",
}
# Restores and generated-build staging are the only rules allowed to write into
# a protected top-level directory (they target frontend/ and backend/).
ALLOWED_INTO_PROTECTED = {"restore-frontend-test", "restore-e2e", "restore-backend-test", "stale-build"}

SKIP_DIR_NAMES = {"__pycache__", ".pytest_cache"}


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def children(path: Path):
    if not path.is_dir():
        return []
    return [c for c in sorted(path.iterdir()) if c.name not in SKIP_DIR_NAMES]


def merge_move(src: Path, dst: Path, records: list[dict], kind: str) -> None:
    """Move src to dst, merging directories instead of failing on collision."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        if dst.exists() and dst.is_dir():
            for child in children(src):
                merge_move(child, dst / child.name, records, kind)
            try:
                src.rmdir()
            except OSError:
                pass
        else:
            shutil.move(str(src), str(dst))
            records.append({"src": rel(src), "dst": rel(dst), "kind": kind})
    else:
        if dst.exists():
            # Never overwrite silently: stage the existing file.
            stash = PROJECT / "archive" / "collisions" / rel(dst)
            stash.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(dst), str(stash))
            records.append({"src": rel(dst), "dst": rel(stash), "kind": "collision-stash"})
        shutil.move(str(src), str(dst))
        records.append({"src": rel(src), "dst": rel(dst), "kind": kind})


def build_plan() -> list[tuple[Path, Path, str]]:
    """(src, dst, kind) tuples, ordered so restores happen before bulk moves."""
    plan: list[tuple[Path, Path, str]] = []

    # 1. Restore runnable test suites into their runners' directories.
    for child in children(ROOT / "tests" / "frontend"):
        plan.append((child, ROOT / "frontend" / "tests" / child.name, "restore-frontend-test"))
    for child in children(ROOT / "tests" / "e2e"):
        plan.append((child, ROOT / "frontend" / "e2e" / child.name, "restore-e2e"))
    for child in children(ROOT / "tests" / "backend"):
        plan.append((child, ROOT / "backend" / "tests" / child.name, "restore-backend-test"))

    # 2. Remaining cross-cutting test material -> project/tests.
    #    `frontend`, `e2e` and `backend` were fully restored in step 1, so they
    #    are skipped here (only caches would be left behind).
    restored = {"frontend", "e2e", "backend"}
    for child in children(ROOT / "tests"):
        if child.name in restored:
            continue
        if child.is_dir() and all(p.name in SKIP_DIR_NAMES for p in child.iterdir()):
            continue
        plan.append((child, PROJECT / "tests" / child.name, "test-support"))

    # 3. Bulk supporting directories -> project/.
    plan += [
        (ROOT / "docs", PROJECT / "docs", "docs"),
        (ROOT / "qa", PROJECT / "qa", "qa"),
        (ROOT / "scripts", PROJECT / "scripts", "scripts"),
        (ROOT / "infra" / "docker", PROJECT / "infra" / "docker", "infra-docker"),
        (ROOT / "infra" / "deployment", PROJECT / "infra" / "deployment", "infra-deployment"),
    ]

    # 4. Obsolete / empty legacy directories -> archive.
    plan += [
        (ROOT / "infrastructure", PROJECT / "archive" / "infrastructure", "legacy-empty"),
        (ROOT / "infra", PROJECT / "archive" / "infra-remainder", "legacy-remainder"),
    ]

    # 5. Old static deploy copies -> legacy, but KEEP deploy/site (app card).
    for child in children(ROOT / "deploy"):
        if child.name == "site":
            continue
        plan.append((child, PROJECT / "legacy" / "deploy" / child.name, "legacy-deploy"))

    # 6. Root reports / logs / stray outputs.
    for name in ("IMPLEMENTATION_STATUS.md", "PRODUCTION_READINESS_REPORT.md"):
        plan.append((ROOT / name, PROJECT / "docs" / name, "root-report"))
    for name in ("e2e-run.log", "qa-deep-run.log", "server.log",
                 "verify.txt", "verify2.txt", "verify3.txt", "test_results.txt"):
        plan.append((ROOT / name, PROJECT / "archive" / "logs" / name, "root-output"))

    # 7. Stale Next build directories (generated, gitignored).
    frontend = ROOT / "frontend"
    if frontend.is_dir():
        for child in sorted(frontend.glob(".next_*")):
            if child.is_dir() and child.name != ".next":
                plan.append((child, PROJECT / "archive" / "builds" / child.name, "stale-build"))

    return [(s, d, k) for (s, d, k) in plan if s.exists()]


def post_steps(records: list[dict]) -> None:
    """Steps that only make sense after the bulk moves."""
    agents = PROJECT / "docs" / "project" / "AGENTS.md"
    if agents.is_file() and not (ROOT / "AGENTS.md").exists():
        shutil.copy2(agents, ROOT / "AGENTS.md")
        records.append({"src": rel(agents), "dst": "AGENTS.md", "kind": "copy-agents"})
        print("  copy-agents            project/docs/project/AGENTS.md -> AGENTS.md")


def apply(plan, records: list[dict]) -> None:
    for src, dst, kind in plan:
        first = rel(src).split("/")[0]
        if first in PROTECTED and kind not in ALLOWED_INTO_PROTECTED:
            print(f"  SKIP protected: {rel(src)}")
            continue
        print(f"  {kind:22} {rel(src)}  ->  {rel(dst)}")
        merge_move(src, dst, records, kind)


def rollback() -> None:
    if not MANIFEST.is_file():
        sys.exit("no manifest to roll back")
    records = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for rec in reversed(records):
        if rec["kind"] in {"copy-agents"}:
            continue
        src, dst = ROOT / rec["src"], ROOT / rec["dst"]
        if not dst.exists():
            continue
        src.parent.mkdir(parents=True, exist_ok=True)
        print(f"  restore {rec['dst']} -> {rec['src']}")
        shutil.move(str(dst), str(src))
    print("rollback complete")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback", action="store_true")
    args = ap.parse_args()

    if args.rollback:
        rollback()
        return

    plan = build_plan()
    print(f"planned moves: {len(plan)}\n")
    for src, dst, kind in plan:
        print(f"  {kind:22} {rel(src)}  ->  {rel(dst)}")

    if not args.apply:
        print("\n(dry run — re-run with --apply)")
        return

    records: list[dict] = []
    apply(plan, records)
    post_steps(records)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(f"\napplied {len(records)} moves -> {rel(MANIFEST)}")


if __name__ == "__main__":
    main()
