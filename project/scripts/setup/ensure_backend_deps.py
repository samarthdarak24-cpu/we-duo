"""Make the Windows backend venv importable when a DLL policy blocks SQLAlchemy.

Some Windows Application Control / Smart App Control policies flag an individual
compiled extension (``sqlalchemy/util/_collections_cy.cp313-win_amd64.pyd``)
with "An Application Control policy has blocked this file". That aborts
``import sqlalchemy`` and therefore the whole FastAPI service, even though
every other dependency is fine.

SQLAlchemy ships pure-Python ``*_cy.py`` sources next to every ``*.pyd``. Python
prefers the extension module, so hiding the blocked binaries makes it load the
pure-Python implementations instead -- same API, slightly slower, no native
code. On Linux/macOS (including Render) nothing is changed.

Idempotent and safe to run on every startup:

* imports succeed  -> no-op
* import fails with a DLL/policy error -> rename the SQLAlchemy ``*.pyd`` files
  to ``*.pyd.blocked`` (reversible: rename them back to restore C speed)
* import still fails -> exit 1 with the original error
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

POLICY_HINTS = (
    "Application Control policy",
    "DLL load failed",
    "blocked this file",
    "cannot load",
)


def try_import() -> str | None:
    """Return an error description, or None when the backend stack imports."""
    try:
        importlib.invalidate_caches()
        import sqlalchemy  # noqa: F401
        import fastapi  # noqa: F401
        return None
    except ImportError as exc:
        return f"{type(exc).__name__}: {exc}"
    except Exception as exc:  # pragma: no cover - defensive
        return f"{type(exc).__name__}: {exc}"


def sqlalchemy_dir() -> Path | None:
    try:
        import sysconfig
        target = Path(sysconfig.get_paths()["purelib"]) / "sqlalchemy"
        return target if target.is_dir() else None
    except Exception:
        return None


def disable_cext() -> int:
    target = sqlalchemy_dir()
    if target is None:
        # sqlalchemy itself may be unimportable; find it relative to this file's venv.
        venv = Path(sys.prefix) / "Lib" / "site-packages" / "sqlalchemy"
        target = venv if venv.is_dir() else None
    if target is None:
        print("[deps] could not locate the sqlalchemy package", file=sys.stderr)
        return 0

    count = 0
    for pyd in sorted(target.rglob("*.pyd")):
        blocked = pyd.with_name(pyd.name + ".blocked")
        if not blocked.exists():
            try:
                pyd.rename(blocked)
                count += 1
            except OSError as exc:
                print(f"[deps] could not disable {pyd.name}: {exc}", file=sys.stderr)
    return count


def main() -> int:
    first = try_import()
    if first is None:
        return 0

    if not any(hint.lower() in first.lower() for hint in POLICY_HINTS):
        print(f"[deps] backend import failed for an unrelated reason: {first}", file=sys.stderr)
        print("[deps] reinstall: python -m pip install -r backend/requirements.txt", file=sys.stderr)
        return 1

    print(f"[deps] blocked native extension detected: {first[:160]}")
    count = disable_cext()
    print(f"[deps] disabled {count} SQLAlchemy C extension(s); using pure-Python implementations")

    # Modules cached in sys.modules from the failed attempt must be dropped.
    for name in [m for m in sys.modules if m == "sqlalchemy" or m.startswith("sqlalchemy.")]:
        del sys.modules[name]

    second = try_import()
    if second is not None:
        print(f"[deps] backend still unimportable: {second}", file=sys.stderr)
        return 1
    print("[deps] backend imports OK (pure-Python SQLAlchemy)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
