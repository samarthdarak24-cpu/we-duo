"""Intelligence sub-packages: rules, mileage, damage, scoring, evaluation, retrieval.

Kept import-light on purpose: importing this package must not import the
detectors (the detectors import the damage adapter), so each capability is
imported from its own module.
"""


def status() -> dict:
    """Aggregate activation status of every intelligence capability."""
    from .damage import yolo
    from .mileage import xgboost_adapter
    from .retrieval import embeddings

    return {
        "damage": yolo.status(),
        "xgboost": xgboost_adapter.status(),
        "retrieval": embeddings.status(),
    }
