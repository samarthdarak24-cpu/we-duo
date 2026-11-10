"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { Icon } from "@/components/ui/Icon";

function extractApiError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const obj = data as { error?: unknown; detail?: unknown };
  if (typeof obj.error === "string" && obj.error) return obj.error;
  if (obj.error && typeof obj.error === "object" && "message" in obj.error) {
    const msg = (obj.error as { message?: unknown }).message;
    if (typeof msg === "string" && msg) return msg;
  }
  if (typeof obj.detail === "string" && obj.detail) return obj.detail;
  return fallback;
}

interface PhotoItem {
  id: string;
  key: string;
  url: string;
}

interface Detection {
  label: string;
  class_id?: number;
  confidence: number;
  box?: number[];
}

interface AiResult {
  available: boolean;
  detections: Detection[];
  candidateDamageIds: string[];
  modelVersion: string | null;
  reason?: string;
}

export function DamageAiAnalyzer({
  vehicleId,
  photos,
}: {
  vehicleId: string;
  photos: PhotoItem[];
}) {
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Record<string, "verified" | "rejected">>({});
  const [result, setResult] = useState<AiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function analyze(photoId: string, _fileKey: string) {
    setAnalyzing(photoId);
    setError(null);
    setInfo(null);
    setResult(null);

    try {
      const res = await fetch(`/api/v1/vehicles/${vehicleId}/photos/${photoId}/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as Partial<AiResult> | null;

      if (res.status === 409 || (data && data.available === false)) {
        const reason = data?.reason ?? "No licensed damage weights configured.";
        setResult({
          available: false,
          detections: [],
          candidateDamageIds: [],
          modelVersion: null,
          reason,
        });
        setInfo(`AI analysis unavailable: ${reason}`);
        return;
      }

      if (!res.ok || !data) {
        setError(extractApiError(data, `AI analysis request failed (HTTP ${res.status}).`));
        return;
      }

      const normalized: AiResult = {
        available: data.available !== false,
        detections: Array.isArray(data.detections) ? data.detections : [],
        candidateDamageIds: Array.isArray(data.candidateDamageIds) ? data.candidateDamageIds : [],
        modelVersion: data.modelVersion ?? null,
        reason: data.reason,
      };
      setResult(normalized);

      if (!normalized.available) {
        setInfo(`AI analysis unavailable: ${normalized.reason ?? "No licensed damage weights configured."}`);
      } else if (normalized.detections.length === 0) {
        setInfo("AI analysis complete. No damage detections above the confidence threshold.");
      } else {
        setInfo(`AI analysis found ${normalized.detections.length} candidate(s). Review each — nothing is confirmed until you verify it.`);
      }
    } catch {
      setError("Network error while running AI analysis.");
    } finally {
      setAnalyzing(null);
    }
  }

  async function submitReview(damageId: string, nextStatus: "verified" | "rejected") {
    setReviewBusy(damageId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/vehicles/${vehicleId}/damage/${damageId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          extractApiError(
            data,
            nextStatus === "verified" ? "Could not confirm damage." : "Could not reject damage."
          )
        );
        return;
      }
      setReviewed((prev) => ({ ...prev, [damageId]: nextStatus }));
      setInfo(
        nextStatus === "verified"
          ? "Damage confirmed by review. It will appear in the Vehicle History Passport for buyers."
          : "Damage candidate rejected."
      );
      router.refresh();
    } catch {
      setError("Network error while saving damage review.");
    } finally {
      setReviewBusy(null);
    }
  }

  const intro = !result || !result.available;
  const hasPhotos = photos.length > 0;
  const hasResult = !!result;
  const detectionsAvailable = hasResult && result.available;
  const noDetections = detectionsAvailable && result!.detections.length === 0;

  return (
    <SectionCard
      title="AI damage analysis (YOLO)"
      description="Uploaded photos are analysed by the configured damage model. Every detection is a candidate — you must review and confirm it before it becomes a verified record."
      action={
        hasPhotos ? (
          <button
            type="button"
            onClick={() => analyze(photos[0].id, photos[0].key)}
            className="td-btn td-btn-secondary td-btn-sm"
            disabled={analyzing !== null}
          >
            <Icon name={analyzing ? "Loader2" : "ScanSearch"} size={13} className={analyzing ? "animate-spin" : ""} />
            {analyzing ? "Analysing…" : "Analyse first photo"}
          </button>
        ) : undefined
      }
    >
      {intro && (
        <p className="text-[12px] leading-relaxed text-muted">
          Select a photo above and run AI analysis. Detections appear as review candidates — none are added to the vehicle record until you confirm them.
        </p>
      )}

      {hasPhotos && (
        <div className="mt-4 space-y-3">
          <p className="td-label">Photos ready for AI analysis</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {photos.map((photo) => {
              const isCurrent = analyzing === photo.id;
              return (
                <div key={photo.id} className="rounded-card border border-border p-3">
                  <img src={photo.url} alt={`Photo ${photo.id}`} className="w-full h-32 object-cover rounded-[8px]" />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted truncate">{photo.key}</span>
                    <button
                      onClick={() => analyze(photo.id, photo.key)}
                      disabled={isCurrent}
                      className="td-btn td-btn-sm td-btn-primary"
                    >
                      <Icon name={isCurrent ? "Loader2" : "Play"} size={12} className={isCurrent ? "animate-spin" : ""} />
                    </button>
                  </div>
                  {isCurrent && <p className="mt-1 text-[10.5px] text-muted">Running YOLO inference…</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {detectionsAvailable && (
        <div className="mt-4 rounded-card border border-border p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="td-label">AI analysis result</span>
            <span className="td-chip bg-success/10 text-success">Detections returned</span>
          </div>
          <p className="text-[11.5px] text-muted">
            Model: <span className="font-mono">{result!.modelVersion ?? "unknown"}</span> ·
            Detections: <span className="font-semibold">{result!.detections.length}</span>
          </p>
          {noDetections ? (
            <p className="text-[11px] text-muted">No damage detected above the confidence threshold.</p>
          ) : (
            <>
              <ul className="space-y-2 mt-2">
                {result!.detections.map((det, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] bg-surface-tint p-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="td-chip">{det.label}</span>
                      <span className="text-[10.5px] font-mono text-muted">{Math.round((det.confidence ?? 0) * 100)}%</span>
                      {det.box && <span className="text-[10.5px] font-mono text-muted">[{det.box.join(", ")}]</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {result!.candidateDamageIds[i] && (
                        reviewed[result!.candidateDamageIds![i]] ? (
                          <span className="td-chip">
                            {reviewed[result!.candidateDamageIds![i]] === "verified" ? "Confirmed" : "Rejected"}
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={reviewBusy === result!.candidateDamageIds![i]}
                              onClick={() => submitReview(result!.candidateDamageIds![i], "verified")}
                              className="td-btn td-btn-success td-btn-sm"
                            >
                              <Icon name="Check" size={12} /> Confirm
                            </button>
                            <button
                              type="button"
                              disabled={reviewBusy === result!.candidateDamageIds![i]}
                              onClick={() => submitReview(result!.candidateDamageIds![i], "rejected")}
                              className="td-btn td-btn-secondary td-btn-sm"
                            >
                              <Icon name="X" size={12} /> Reject
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[10.5px] text-muted">
                Confirming saves the detection as a verified damage record with position_source = "detected_visible_damage". Rejecting discards it.
              </p>
            </>
          )}
        </div>
      )}

      {hasResult && !result.available && (
        <p className="mt-4 text-[11px] text-muted">
          {result.reason ?? "No licensed damage weights configured. Install car_damage.onnx/.pt and restart the intelligence service."}
        </p>
      )}

      {(error || info) && (
        <div className="mt-3 space-y-2" aria-live="polite">
          {error && <InlineAlert tone="danger" title="AI analysis failed" detail={error} />}
          {info && <InlineAlert tone="success" title="AI analysis" detail={info} />}
        </div>
      )}
    </SectionCard>
  );
}
