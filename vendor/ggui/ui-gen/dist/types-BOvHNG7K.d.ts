import { A as AxisVector } from './axes-CzLEMDeB.js';

type CacheTier = "stable" | "axisDelta" | "volatile";
type AxisKey = keyof Pick<AxisVector, "render" | "state" | "writes" | "writeTrigger" | "realtime" | "fetch" | "layout" | "tooling">;
interface HarnessFragment {
    /** Which axis this fragment belongs to. */
    axis: AxisKey;
    /** Which axis value this fragment handles (e.g., "merge" for state). */
    value: string;
    /** Cache tier — stable prefix first, axisDelta middle, volatile last. */
    cacheTier: CacheTier;
    /** System-prompt guidance for this axis value. Empty = no prompt change. */
    promptText?: string;
    /** Boilerplate comment block inserted between wire hooks and return. */
    boilerplateMarker?: string;
    /** Explicit ordering within (cacheTier, axis). Lower first. */
    order?: number;
}
interface ComposedHarness {
    /** Concatenated promptText from matched fragments, cache-ordered. */
    promptText: string;
    /** Concatenated boilerplateMarker blocks from matched fragments. */
    boilerplateSections: string;
    /** Matched fragments, for debugging/telemetry. */
    fragments: HarnessFragment[];
}

export type { AxisKey as A, ComposedHarness as C, HarnessFragment as H, CacheTier as a };
