"""Backend routers covering every feature category in the checklist.

These endpoints are the internal backend surface over the shared database.
They authenticate with the SAME scrypt + HS256 credentials as the Next.js app.
The Next.js `/api/v1/*` routes remain the public, cookie-session surface for
the portals; nothing here replaces or bypasses them.
"""
from . import (audit, auth, inquiries, marketplace, notifications, registry, reports,
               system, users, v1, vehicles)

ROUTERS = [
    auth.router,
    users.router,
    vehicles.router,
    marketplace.router,
    inquiries.router,
    reports.router,
    notifications.router,
    audit.router,
    # Versioned surface matching the final backend-first checklist.
    v1.router,
    # System / AI capability status endpoints.
    system.router,
    # External registry consent + lookup (consent-gated, provider-honest).
    registry.router,
]

CATEGORIES = {
    "authentication": ["register", "login", "refresh", "logout", "me", "sessions",
                       "change-password", "forgot-password", "reset-password"],
    "users": ["me", "me/activity", "list", "get", "kyc"],
    "vehicles": ["list", "create", "get", "update", "archive"],
    "documents": ["list", "register", "completeness"],
    "history": ["list", "add", "correction"],
    "mileage": ["list", "add"],
    "verification": ["list", "run", "trust", "lookup", "qr-verify"],
    "ai_analysis": ["list", "investigate (intelligence)"],
    "damage_inspection": ["damage list/add", "inspections list/add", "accidents list/add", "photos"],
    "listings": ["browse", "detail", "seller list/create/update", "transitions", "stats", "share"],
    "search": ["filters", "sort", "pagination"],
    "saved": ["list", "save", "unsave", "saved-searches"],
    "comparisons": ["compare 2-4"],
    "inquiries": ["list", "create", "get", "messages", "status"],
    "reports": ["list", "create (real PDF)", "get", "download"],
    "qr_verification": ["share token", "verify token"],
    "notifications": ["list", "read", "read-all"],
    "audit_logs": ["list", "jobs", "retry", "review queue", "disputes", "suspend"],
}
