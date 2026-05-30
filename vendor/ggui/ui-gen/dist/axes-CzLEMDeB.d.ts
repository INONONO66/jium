type RenderShape = "static" | "list" | "grid" | "spatial" | "timeline" | "chart" | "master-detail";
type StateShape = "none" | "ui-affordance" | "merge" | "payload" | "draft";
type WriteShape = "none" | "commit" | "multi-commit" | "per-item" | "submit" | "compose";
type WriteTrigger = "click" | "drag" | "swipe" | "keystroke" | "auto";
type RealtimeShape = "none" | "merge" | "append" | "status" | "presence" | "mixed";
type StreamEventKind = "merge" | "append" | "status" | "presence" | "other";
type FetchShape = "none" | "pagination" | "search" | "drill-down" | "refresh";
type LayoutShape = "single" | "multi-step" | "master-detail" | "overlay" | "modal";
type ToolingShape = "none" | "wired" | "client" | "both";
interface AxisVector {
    render: RenderShape;
    state: StateShape;
    writes: WriteShape;
    writeTrigger: WriteTrigger;
    realtime: RealtimeShape;
    /** When realtime === 'mixed', per-event kind breakdown. */
    streamKinds?: Record<string, StreamEventKind>;
    fetch: FetchShape;
    layout: LayoutShape;
    tooling: ToolingShape;
}
type AxisSource = "contract" | "blueprint" | "prompt" | "heuristic" | "default";
interface AxisProvenance {
    render: AxisSource;
    state: AxisSource;
    writes: AxisSource;
    writeTrigger: AxisSource;
    realtime: AxisSource;
    fetch: AxisSource;
    layout: AxisSource;
    tooling: AxisSource;
}
type RiskTier = "low" | "medium" | "high";
interface Classification {
    vector: AxisVector;
    provenance: AxisProvenance;
    riskTier: RiskTier;
}

export type { AxisVector as A, Classification as C, FetchShape as F, LayoutShape as L, RiskTier as R, StreamEventKind as S, ToolingShape as T, WriteTrigger as W, AxisSource as a, RealtimeShape as b, RenderShape as c, StateShape as d, WriteShape as e, AxisProvenance as f };
