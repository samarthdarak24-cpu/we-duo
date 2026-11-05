"""YOLO damage adapter (ONNX Runtime preferred, Ultralytics optional).

The adapter is REAL but inactive until licensed weights are supplied. It never
claims damage detection when no model is present. A detection is a candidate
for human inspector validation, never a severity verdict.
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path

from ...config import REPO_ROOT

_raw_model_dir = os.getenv("TD_MODEL_DIR", "ai-services/shared/models")
MODEL_DIR = Path(_raw_model_dir) if Path(_raw_model_dir).is_absolute() else (REPO_ROOT / _raw_model_dir)
MODEL_VERSION = "yolo-damage-adapter-1.0.0"
DEFAULT_CLASSES = ["damage"]

LIMITATIONS = [
    "A single photograph cannot establish accident severity or hidden structural damage.",
    "Detections require human inspector validation before any claim is shown.",
    "No licensed damage weights are bundled; the adapter activates only when provided.",
]


def _has(module: str) -> bool:
    return importlib.util.find_spec(module) is not None


def _weights(ext: str) -> Path | None:
    if not MODEL_DIR.is_dir():
        return None
    preferred = [MODEL_DIR / f"car_damage{ext}", MODEL_DIR / f"damage{ext}"]
    for path in preferred:
        if path.is_file():
            return path
    matches = sorted(MODEL_DIR.glob(f"*damage*{ext}"))
    return matches[0] if matches else None


def _classes() -> list[str]:
    path = MODEL_DIR / "car_damage_classes.json"
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list) and data:
                return [str(x) for x in data]
        except Exception:
            pass
    return DEFAULT_CLASSES


def status() -> dict:
    onnx = _weights(".onnx")
    pt = _weights(".pt")
    if onnx and _has("onnxruntime") and _has("cv2"):
        return {"available": True, "engine": "onnxruntime", "weights": onnx.name,
                "classes": _classes(), "version": MODEL_VERSION, "reason": "Ready."}
    if pt and _has("ultralytics"):
        return {"available": True, "engine": "ultralytics", "weights": pt.name,
                "classes": _classes(), "version": MODEL_VERSION, "reason": "Ready."}
    reason = (
        "Inactive: no licensed damage weights in models/ "
        "(expected car_damage.onnx with onnxruntime, or car_damage.pt with ultralytics). "
        "Fetch/register weights with scripts/fetch_models.py. OpenCV signals remain active."
    )
    return {"available": False, "engine": "none", "weights": None,
            "classes": _classes(), "version": MODEL_VERSION, "reason": reason}


# ---- preprocessing / postprocessing --------------------------------------
def _letterbox(image, size: tuple[int, int] = (640, 640)):
    import cv2  # type: ignore
    import numpy as np  # type: ignore
    h, w = image.shape[:2]
    r = min(size[0] / w, size[1] / h)
    nw, nh = int(round(w * r)), int(round(h * r))
    resized = cv2.resize(image, (nw, nh))
    canvas = np.full((size[1], size[0], 3), 114, dtype=np.uint8)
    dx, dy = (size[0] - nw) // 2, (size[1] - nh) // 2
    canvas[dy:dy + nh, dx:dx + nw] = resized
    return canvas, r, dx, dy


def _softmax(values):
    import numpy as np  # type: ignore
    arr = np.asarray(values, dtype="float32")
    arr = arr - arr.max()
    exp = np.exp(arr)
    return exp / exp.sum()


def _detect_onnx(path: Path, weights: Path, conf: float, iou: float) -> dict:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
    import onnxruntime as ort  # type: ignore

    image = cv2.imread(str(path))
    if image is None:
        return {"available": True, "engine": "onnxruntime", "detections": [],
                "error": "Could not decode the image.", "limitations": LIMITATIONS}
    session = ort.InferenceSession(str(weights), providers=["CPUExecutionProvider"])
    meta = session.get_inputs()[0]
    shape = meta.shape
    size = (int(shape[3]) if isinstance(shape[3], int) else 640,
            int(shape[2]) if isinstance(shape[2], int) else 640)
    canvas, r, dx, dy = _letterbox(image, size)
    blob = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype("float32") / 255.0
    blob = np.transpose(blob, (2, 0, 1))[None, ...]
    out = session.run(None, {meta.name: blob})[0]
    classes = _classes()

    # Classification head: (1, N) with small N.
    if out.ndim == 2 and out.shape[1] <= max(20, len(classes) + 2):
        probs = _softmax(out[0])
        idx = int(np.argmax(probs))
        return {"available": True, "engine": "onnxruntime", "kind": "classification",
                "model": weights.name, "detections": [{
                    "label": classes[idx] if idx < len(classes) else f"class_{idx}",
                    "confidence": round(float(probs[idx]), 4),
                }], "limitations": LIMITATIONS, "version": MODEL_VERSION}

    # YOLOv8 detection head: (1, 4+nc, N) or (1, N, 4+nc).
    pred = out[0]
    if pred.shape[0] < pred.shape[1]:
        pred = pred.T
    boxes = pred[:, :4]
    scores = pred[:, 4:]
    if scores.size == 0:
        return {"available": True, "engine": "onnxruntime", "detections": [],
                "limitations": LIMITATIONS, "version": MODEL_VERSION}
    class_ids = scores.argmax(axis=1)
    confidences = scores.max(axis=1)
    keep = confidences >= conf
    boxes, class_ids, confidences = boxes[keep], class_ids[keep], confidences[keep]
    detections: list[dict] = []
    if len(boxes):
        xywh = boxes.tolist()
        nms = cv2.dnn.NMSBoxes(xywh, confidences.tolist(), conf, iou)
        for i in np.array(nms).flatten().tolist():
            cx, cy, bw, bh = boxes[i]
            x1 = float((cx - bw / 2 - dx) / r)
            y1 = float((cy - bh / 2 - dy) / r)
            cid = int(class_ids[i])
            detections.append({
                "label": classes[cid] if cid < len(classes) else f"class_{cid}",
                "class_id": cid,
                "confidence": round(float(confidences[i]), 4),
                "box": [round(x1, 1), round(y1, 1), round(float(bw / r), 1), round(float(bh / r), 1)],
            })
    return {"available": True, "engine": "onnxruntime", "kind": "detection",
            "model": weights.name, "detections": detections,
            "limitations": LIMITATIONS, "version": MODEL_VERSION}


def _detect_ultralytics(path: Path, weights: Path, conf: float) -> dict:
    from ultralytics import YOLO  # type: ignore
    model = YOLO(str(weights))
    results = model.predict(str(path), conf=conf, verbose=False)
    detections: list[dict] = []
    for result in results:
        names = getattr(result, "names", {}) or {}
        for box in getattr(result, "boxes", []) or []:
            cid = int(box.cls[0])
            xyxy = [round(float(v), 1) for v in box.xyxy[0].tolist()]
            detections.append({
                "label": names.get(cid, f"class_{cid}"), "class_id": cid,
                "confidence": round(float(box.conf[0]), 4), "box": xyxy,
            })
    return {"available": True, "engine": "ultralytics", "kind": "detection",
            "model": weights.name, "detections": detections,
            "limitations": LIMITATIONS, "version": MODEL_VERSION}


def detect(image_path: str | Path, conf: float = 0.35, iou: float = 0.45) -> dict:
    path = Path(image_path)
    if not path.is_file():
        return {"available": False, "engine": "none", "detections": [],
                "reason": "Image not found.", "limitations": LIMITATIONS}
    onnx, pt = _weights(".onnx"), _weights(".pt")
    if onnx and _has("onnxruntime") and _has("cv2"):
        return _detect_onnx(path, onnx, conf, iou)
    if pt and _has("ultralytics"):
        return _detect_ultralytics(path, pt, conf)
    return {"available": False, "engine": "none", "detections": [],
            "reason": status()["reason"], "limitations": LIMITATIONS,
            "version": MODEL_VERSION}
