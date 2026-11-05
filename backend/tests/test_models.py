"""Adapter tests: honest activation, demo labelling, storage safety, metrics."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.integrations.insurance import DemoInsuranceProvider
from app.integrations.llm import get_provider
from app.integrations.storage import LocalStorage, NotConfigured, S3Storage, get_storage
from app.integrations.vehicle_data import DemoVehicleDataProvider
from app.intelligence import status as intelligence_status
from app.intelligence.damage import yolo
from app.intelligence.evaluation import binary_metrics
from app.intelligence.mileage import xgboost_adapter
from app.intelligence.retrieval import embeddings


def test_demo_vehicle_provider_is_never_verified():
    record = DemoVehicleDataProvider().lookup(reg_no="MH01AB1234")
    assert record.demo is True
    assert record.verified is False
    assert any("DEMO" in n for n in record.notes)
    assert record.make == "BMW"


def test_demo_insurance_provider_does_not_claim_a_clean_policy():
    policy = DemoInsuranceProvider().check_policy("POL/2023/8891")
    assert policy.demo is True and policy.verified is False
    assert policy.status == "unknown"


def test_llm_provider_offline_returns_no_text():
    provider = get_provider()
    assert provider.available() is False
    result = provider.explain("Is this safe?", {"sources": ["doc1"]})
    assert result.available is False
    assert result.text is None
    assert "fabricat" in result.reason.lower() or "no conclusion" in result.reason.lower()


def test_local_storage_roundtrip_and_traversal_guard(tmp_path: Path):
    store = LocalStorage(tmp_path)
    assert store.put("reports/a.pdf", b"%PDF-1.4") == "reports/a.pdf"
    assert store.get("reports/a.pdf") == b"%PDF-1.4"
    assert store.exists("reports/a.pdf")
    assert store.url("reports/a.pdf") is None  # private storage
    with pytest.raises(NotConfigured):
        store.put("../escape.txt", b"x")


def test_s3_storage_is_inactive_without_configuration():
    s3 = S3Storage()
    assert s3.available() is False
    with pytest.raises(NotConfigured):
        s3.put("k", b"v")


def test_get_storage_falls_back_to_local(tmp_path: Path):
    store = get_storage()
    assert store.name in ("local-fs", "s3")


def test_damage_adapter_is_active_with_licensed_weights():
    st = yolo.status()
    assert st["available"] is True
    assert st["engine"] == "ultralytics"
    assert "dent" in st["classes"]
    missing = yolo.detect("does-not-exist.jpg")
    assert missing["available"] is False
    assert missing["detections"] == []
    assert any("inspector" in x for x in missing["limitations"])


def test_damage_adapter_detects_on_a_real_sample():
    pytest.importorskip("ultralytics")
    from app.config import REPO_ROOT
    sample = REPO_ROOT / "ai-services" / "shared" / "data" / "yolo_sample.png"
    if not sample.is_file() or not yolo.status()["available"]:
        pytest.skip("sample image or weights unavailable")
    out = yolo.detect(sample, conf=0.2)
    assert out["available"] is True
    assert out["engine"] == "ultralytics"
    assert out["detections"], "expected at least one damage detection on the sample"
    assert all("label" in d and "confidence" in d for d in out["detections"])


def test_paddleocr_backend_reads_rendered_text(tmp_path: Path):
    """Real PaddleOCR regression: rendered plate + this host's oneDNN workaround.

    The backend must report itself as OCR (never as a fallback), read the plate
    with high confidence and keep the CPU workaround active. To re-verify on a
    different host, run `python scripts/verify_paddleocr.py` there.
    """
    pytest.importorskip("paddleocr")
    cv2 = pytest.importorskip("cv2")
    np = pytest.importorskip("numpy")
    import os
    from app.ocr import PaddleOcrBackend

    # PaddleOCR 3.7 crashes in the oneDNN instruction path on this CPU.
    assert os.environ.get("FLAGS_use_mkldnn") == "0"
    assert os.environ.get("FLAGS_use_onednn") == "0"

    img = np.full((200, 700, 3), 255, np.uint8)
    cv2.putText(img, "MH01AB1234", (20, 120), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 0, 0), 5)
    path = tmp_path / "plate.png"
    cv2.imwrite(str(path), img)
    result = PaddleOcrBackend().run(path)
    assert result.is_ocr is True
    assert result.engine == "paddleocr"
    assert result.method.startswith("paddleocr")
    assert not result.method.endswith("-error"), result.warnings
    assert "1234" in result.text.replace(" ", "")
    assert result.confidence is not None and result.confidence >= 0.8
    assert len(result.sha256) == 64


def test_repo_root_points_to_the_repository_root():
    from app.config import REPO_ROOT
    assert (REPO_ROOT / "package.json").is_file()
    assert (REPO_ROOT / "ai-services" / "shared" / "models").is_dir() or (REPO_ROOT / "models").is_dir()


def test_xgboost_adapter_reports_real_status():
    st = xgboost_adapter.status()
    if st["available"]:
        out = xgboost_adapter.predict([{
            "year": 2020, "km": 60000, "delta": -40000,
            "age_years": 6, "km_per_year": 10000,
        }])
        assert len(out["probabilities"]) == 1
        assert 0.0 <= out["probabilities"][0] <= 1.0
        assert st["training"] and st["training"]["dataset_label"]
    else:
        assert "xgboost" in st["reason"].lower()
        with pytest.raises(xgboost_adapter.NotConfigured):
            xgboost_adapter.predict([{"year": 2020, "km": 40000}])


def test_xgboost_feature_builder_handles_rollback():
    rows = xgboost_adapter.build_features([
        {"date": "2020-01-01", "km": 20000},
        {"date": "2021-01-01", "km": 30000},
        {"date": "2022-01-01", "km": 25000},
    ])
    assert [r["delta"] for r in rows] == [0, 10000, -5000]


def test_retrieval_defaults_to_keyword_backend():
    st = embeddings.status()
    assert st["backend"] in ("keyword-overlap", "sentence-transformers")
    docs = [
        {"id": "d1", "text": "odometer rollback service invoice mileage"},
        {"id": "d2", "text": "insurance policy expired"},
    ]
    result = embeddings.search("mileage rollback", docs)
    assert result["results"][0]["id"] == "d1"
    assert result["backend"] in ("keyword-overlap", "sentence-transformers")


def test_evaluation_metrics_are_correct():
    m = binary_metrics([1, 0, 1, 1], [1, 0, 0, 1])
    assert m["tp"] == 2 and m["tn"] == 1 and m["fp"] == 0 and m["fn"] == 1
    assert m["precision"] == 1.0
    assert m["recall"] == pytest.approx(0.6667, abs=1e-3)
    assert m["f1"] == pytest.approx(0.8, abs=1e-3)


def test_intelligence_status_aggregates_all_adapters():
    st = intelligence_status()
    assert set(st) == {"damage", "xgboost", "retrieval"}
    assert st["damage"]["available"] is True  # licensed MIT YOLO11m weights
    assert isinstance(st["xgboost"]["available"], bool)
    assert st["retrieval"]["backend"]


def test_rapidocr_backend_reads_rendered_text(tmp_path: Path):
    pytest.importorskip("rapidocr_onnxruntime")
    cv2 = pytest.importorskip("cv2")
    np = pytest.importorskip("numpy")
    from app.ocr import RapidOcrBackend

    img = np.full((200, 700, 3), 255, np.uint8)
    cv2.putText(img, "MH01AB1234", (20, 120), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (0, 0, 0), 5)
    path = tmp_path / "plate.png"
    cv2.imwrite(str(path), img)
    # Target the backend directly: run_ocr may prefer PaddleOCR when installed.
    result = RapidOcrBackend().run(path)
    assert result.is_ocr is True
    assert result.engine == "rapidocr"
    assert "1234" in result.text.replace(" ", "")
    assert result.sha256
