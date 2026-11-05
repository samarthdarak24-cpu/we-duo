import { Icon } from "@/components/ui/Icon";
import { SectionCard } from "@/components/shared/SectionCard";

export interface GraphNode {
  id: string;
  type: string;
  entityId: string;
  label: string;
  source: string;
  reliability: string;
  disclosed: boolean;
  payload: Record<string, unknown>;
  createdAt: string | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  relation: string;
  target: string;
}

export interface GraphConflict {
  id: string;
  code: string;
  severity: string;
  title: string;
  status: string;
  evidenceRefs: string[];
}

export interface EvidenceGraphData {
  vehicleId: string;
  generatedAt: string;
  method: string;
  rulesetVersion: string;
  modelVersion: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  conflicts: GraphConflict[];
  hiddenDocuments: number;
  counts: Record<string, number>;
}

const COLUMN_ORDER = [
  { type: "vehicle", label: "Vehicle" },
  { type: "verification_run", label: "Verification" },
  { type: "finding", label: "Findings" },
  { type: "document", label: "Documents" },
  { type: "history_event", label: "History" },
  { type: "mileage_reading", label: "Odometer" },
  { type: "damage_record", label: "Damage" },
  { type: "provider_check", label: "Provider" },
  { type: "report", label: "Reports" },
  { type: "hash_chain", label: "Hash chain" },
];

const NODE_WIDTH = 208;
const NODE_HEIGHT = 64;
const COLUMN_GAP = 56;
const ROW_GAP = 20;
const PADDING = 24;

const reliabilityColor: Record<string, string> = {
  high: "var(--success)",
  medium: "var(--warning)",
  low: "var(--danger)",
  self_reported: "var(--muted)",
  unknown: "var(--muted)",
};

/**
 * Deterministic evidence graph. Positions are computed from the payload, so the
 * same records always produce the same picture. Edges are only drawn for
 * relations the server derived; nothing here is decorative.
 */
export function EvidenceGraph({ graph }: { graph: EvidenceGraphData | null }) {
  if (!graph || graph.nodes.length === 0) {
    return (
      <SectionCard title="Evidence graph" description="Node-and-edge view of every record that supports this report.">
        <p className="py-8 text-center text-[12.5px] text-muted">No evidence records are stored for this vehicle yet.</p>
      </SectionCard>
    );
  }

  const columns = COLUMN_ORDER.map((column) => ({
    ...column,
    nodes: graph.nodes.filter((n) => n.type === column.type),
  })).filter((column) => column.nodes.length > 0);

  const positions = new Map<string, { x: number; y: number }>();
  columns.forEach((column, columnIndex) => {
    column.nodes.forEach((node, rowIndex) => {
      positions.set(node.id, {
        x: PADDING + columnIndex * (NODE_WIDTH + COLUMN_GAP),
        y: PADDING + rowIndex * (NODE_HEIGHT + ROW_GAP),
      });
    });
  });

  const rows = Math.max(...columns.map((c) => c.nodes.length));
  const width = PADDING * 2 + columns.length * NODE_WIDTH + (columns.length - 1) * COLUMN_GAP;
  const height = PADDING * 2 + rows * NODE_HEIGHT + (rows - 1) * ROW_GAP;
  const openFindings = graph.conflicts.length;

  return (
    <SectionCard
      title="Evidence graph"
      description="Every node is a stored record. Edges show why it is part of this report — no inferred relationships."
      action={<span className="td-chip">{graph.nodes.length} nodes · {graph.edges.length} edges</span>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span className="td-chip">{graph.method}</span>
        <span className="td-chip">rules {graph.rulesetVersion}</span>
        <span className="td-chip">{graph.modelVersion}</span>
        {graph.hiddenDocuments > 0 && (
          <span className="td-chip">
            <Icon name="EyeOff" size={11} /> {graph.hiddenDocuments} private document(s) hidden
          </span>
        )}
        {openFindings > 0 && (
          <span className="pill" style={{ color: "var(--danger)", background: "var(--danger-bg)" }}>
            <Icon name="AlertTriangle" size={12} /> {openFindings} open conflict{openFindings === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="td-scroll overflow-x-auto rounded-[12px] border border-border bg-bg">
        <div className="relative" style={{ width, height, minWidth: width }}>
          <svg
            className="absolute inset-0"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden="true"
          >
            {graph.edges.map((edge) => {
              const from = positions.get(edge.source);
              const to = positions.get(edge.target);
              if (!from || !to) return null;
              const x1 = from.x + NODE_WIDTH;
              const y1 = from.y + NODE_HEIGHT / 2;
              const x2 = to.x;
              const y2 = to.y + NODE_HEIGHT / 2;
              const mid = (x1 + x2) / 2;
              const conflictEdge = edge.source.startsWith("finding:") || edge.relation === "references";
              return (
                <path
                  key={edge.id}
                  d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={conflictEdge ? "var(--danger)" : "var(--border-strong, var(--border))"}
                  strokeWidth={1.25}
                  strokeDasharray={conflictEdge ? "4 3" : undefined}
                  opacity={0.75}
                />
              );
            })}
          </svg>

          {columns.map((column, columnIndex) => (
            <div
              key={column.type}
              className="absolute text-[10px] font-semibold uppercase tracking-[0.12em] text-muted"
              style={{ left: PADDING + columnIndex * (NODE_WIDTH + COLUMN_GAP), top: 4, width: NODE_WIDTH }}
            >
              {column.label}
            </div>
          ))}

          {columns.map((column) =>
            column.nodes.map((node, rowIndex) => {
              const position = positions.get(node.id)!;
              return (
                <div
                  key={node.id}
                  className="absolute overflow-hidden rounded-[9px] border border-border bg-surface px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                  style={{
                    left: position.x,
                    top: position.y + 10,
                    width: NODE_WIDTH,
                    height: NODE_HEIGHT,
                  }}
                  title={`${node.label} · ${node.source} · ${node.reliability}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: reliabilityColor[node.reliability] ?? "var(--muted)" }}
                    />
                    <span className="truncate text-[11.5px] font-semibold text-ink">{node.label}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-muted">
                    <span className="truncate">{node.source.replace(/_/g, " ")}</span>
                    <span className="shrink-0">{node.reliability.replace(/_/g, " ")}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[9.5px] text-muted">{node.entityId}</div>
                  {rowIndex === column.nodes.length - 1 ? null : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10.5px] text-muted">
        {Object.entries(reliabilityColor).map(([key, color]) => (
          <span key={key} className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} /> {key.replace(/_/g, " ")}
          </span>
        ))}
        <span className="ml-auto">Generated {new Date(graph.generatedAt).toLocaleString("en-IN")}</span>
      </div>

      {graph.conflicts.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Open conflicts</p>
          {graph.conflicts.slice(0, 6).map((conflict) => (
            <div key={conflict.id} className="rounded-[9px] border border-danger/20 bg-danger-bg px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-ink">{conflict.title}</span>
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-danger">
                  {conflict.severity} · {conflict.status}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">
                {conflict.code}
                {conflict.evidenceRefs.length > 0 ? ` · evidence ${conflict.evidenceRefs.join(", ")}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
