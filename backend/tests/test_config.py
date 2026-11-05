"""Regression tests for the startup configuration that powers the grounded chat.

`npm run intel:serve` starts uvicorn directly, so nothing else loads the repo's
`.env`. If this loader stops working the assistant silently falls back to the
deterministic answer even though a local LLM is configured.
"""
from __future__ import annotations

import os
from pathlib import Path

from app import config


def test_parse_env_handles_comments_quotes_and_export(tmp_path: Path):
    path = tmp_path / ".env"
    path.write_text(
        "# comment\n"
        "\n"
        "TD_TEST_A=plain\n"
        "TD_TEST_B=\"quoted value\"\n"
        "export TD_TEST_C='single'\n"
        "BROKEN LINE WITHOUT EQUALS\n",
        encoding="utf-8",
    )
    assert config._parse_env(path) == {
        "TD_TEST_A": "plain",
        "TD_TEST_B": "quoted value",
        "TD_TEST_C": "single",
    }
    assert config._parse_env(tmp_path / "missing.env") == {}


def test_dotenv_loads_env_local_and_never_overrides_process_env(tmp_path: Path, monkeypatch):
    (tmp_path / ".env").write_text(
        "TD_LLM_PROVIDER=none\nTD_TEST_CFG_BASE=from-env\n", encoding="utf-8")
    (tmp_path / ".env.local").write_text(
        "TD_LLM_PROVIDER=local\nTD_TEST_CFG_LOCAL=from-env-local\n", encoding="utf-8")
    monkeypatch.setattr(config, "REPO_ROOT", tmp_path)
    # A real process env var must win over both files.
    monkeypatch.setenv("TD_LLM_PROVIDER", "http-provider")
    monkeypatch.setenv("TD_TEST_CFG_BASE", "process-wins")
    monkeypatch.delenv("TD_TEST_CFG_LOCAL", raising=False)

    try:
        merged = config._load_dotenv()
        assert merged["TD_LLM_PROVIDER"] == "local"          # .env.local wins over .env
        assert merged["TD_TEST_CFG_BASE"] == "from-env"
        assert merged["TD_TEST_CFG_LOCAL"] == "from-env-local"
        assert os.environ["TD_LLM_PROVIDER"] == "http-provider"
        assert os.environ["TD_TEST_CFG_BASE"] == "process-wins"
        assert os.environ["TD_TEST_CFG_LOCAL"] == "from-env-local"
    finally:
        # _load_dotenv writes to os.environ directly, so clean up explicitly.
        os.environ.pop("TD_TEST_CFG_LOCAL", None)


def test_repo_root_env_files_are_the_ones_the_service_reads():
    assert (config.REPO_ROOT / "package.json").is_file()
    assert (config.REPO_ROOT / ".env.example").is_file()
    # The .env file is gitignored and local-only; its presence is not required
    # for the test suite, but when present it must be the one loaded.
    if (config.REPO_ROOT / ".env").is_file():
        assert "TD_LLM_PROVIDER" in config.LOADED_ENV_KEYS
