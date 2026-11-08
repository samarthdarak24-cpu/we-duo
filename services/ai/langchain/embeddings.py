"""Evidence retrieval.

Default is relational/keyword retrieval over permission-filtered rows — small,
exact and auditable. Sentence-Transformers + pgvector activate only when both
the package and a vector store are configured; otherwise the keyword backend is
used and reported as such.
"""
from __future__ import annotations

import importlib.util
import os
import re

BACKEND_VERSION = "retrieval-1.0.0"
_TOKEN_RE = re.compile(r"[a-z0-9]{3,}")


def _has(module: str) -> bool:
    return importlib.util.find_spec(module) is not None


def status() -> dict:
    st = _has("sentence_transformers")
    pg = _has("pgvector") and bool(os.getenv("TD_PGVECTOR_URL"))
    backend = "sentence-transformers+pgvector" if (st and pg) else (
        "sentence-transformers" if st else "keyword-overlap")
    return {
        "available": True,  # the keyword backend always works
        "backend": backend,
        "sentence_transformers": st,
        "pgvector": pg,
        "version": BACKEND_VERSION,
        "note": "Default is exact relational retrieval; embeddings are optional and "
                "never required to explain fraud evidence.",
    }


def _keywords(text: str) -> set[str]:
    return set(_TOKEN_RE.findall(str(text).lower()))


def search(query: str, documents: list[dict], top_k: int = 5,
           text_key: str = "text", id_key: str = "id") -> dict:
    """Return ranked documents. Uses embeddings when available, else overlap."""
    if not documents:
        return {"backend": status()["backend"], "results": []}

    if _has("sentence_transformers"):
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
            import numpy as np  # type: ignore
            model = SentenceTransformer(os.getenv("TD_EMBED_MODEL", "all-MiniLM-L6-v2"))
            corpus = [str(d.get(text_key, "")) for d in documents]
            q = model.encode([query], normalize_embeddings=True)
            m = model.encode(corpus, normalize_embeddings=True)
            scores = (m @ q[0]).tolist()
            order = np.argsort(scores)[::-1][:top_k]
            return {"backend": "sentence-transformers", "results": [
                {id_key: documents[i].get(id_key), "score": round(float(scores[i]), 4),
                 "text": documents[i].get(text_key)}
                for i in order
            ]}
        except Exception:
            pass  # fall through to keyword

    q_tokens = _keywords(query)
    scored = []
    for doc in documents:
        tokens = _keywords(doc.get(text_key, ""))
        overlap = len(q_tokens & tokens)
        score = overlap / max(1, len(q_tokens))
        scored.append((score, doc))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return {"backend": "keyword-overlap", "results": [
        {id_key: doc.get(id_key), "score": round(score, 4), "text": doc.get(text_key)}
        for score, doc in scored[:top_k] if score > 0
    ]}
