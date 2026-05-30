import { QualityConfig } from '../evaluation/types-public.js';
import { DataContract, JsonObject, GadgetDescriptor } from '@ggui-ai/protocol';
export { g as generateBoilerplate } from '../generate-BTfvELgl.js';
import '../axes-CzLEMDeB.js';
import '../types-BOvHNG7K.js';

type Provider = "anthropic" | "openai" | "google" | "openrouter";
/** Agent config — provider + model pair. */
interface AgentSpec {
    provider: Provider;
    model: string;
}
interface SingleComponentParams {
    userPrompt: string;
    contract?: DataContract;
    /** Shell type for layout-adaptive boilerplate */
    shellType?: "chat" | "fullscreen" | "spatial";
    /** Target screen size for responsive layout */
    screen?: "mobile" | "tablet" | "desktop" | "universal";
    evaluation?: {
        enabled: boolean;
        passThreshold: number;
        maxRounds?: number;
        maxBudgetPerEval?: number;
        maxBudgetPerFix?: number;
    };
    visualEvaluation?: {
        enabled: boolean;
        passThreshold?: number;
        sampleProps?: JsonObject;
        viewport?: {
            width: number;
            height: number;
        };
    };
    onProgress?: (event: unknown) => void;
    onInitialResult?: (result: {
        componentCode: string;
        sourceCode?: string;
    }) => void | Promise<void>;
    qualityConfig?: QualityConfig;
    /**
     * Optional fixture props (e.g., a benchmark commit's `props` field).
     * Forwarded to runCheck → runtimeRender for schema-first mockup synthesis.
     * Production callers omit this; benchmark runners pass commit.props.
     */
    fixtureProps?: JsonObject;
}
/**
 * Build the coding-agent system prompt using the full content stack:
 * env-gated pitfalls from `pitfalls.ts`, design-token reference from
 * `sdk/design-system-docs.ts`, primitives + wire auto-gen docs.
 *
 * Positional signature preserved for existing callers (create-harness.ts).
 * The underlying skeleton + criteria defaults live in
 * `@ggui-ai/ui-gen/boilerplate`. External OSS implementers calling
 * `buildSystemPrompt` from ui-gen directly get a clean default-empty prompt
 * with only the criteria block filled in.
 *
 * The optional `appGadgets` arg carries the operator-registered gadget
 * catalog. When provided, the prompt renders the registered catalog
 * (Leaflet, Mapbox, …) in the `clientCapabilities — registered catalog`
 * table; when omitted, it defaults to `STDLIB_GADGETS`. Production
 * callers (push, ops-generate) thread the resolved catalog from the
 * bound `AppMetadataStore`; benchmark / direct callers may omit it.
 */
declare function buildSystemPrompt(userRequest: string, shellType?: string, screen?: string, axisDelta?: string, appGadgets?: readonly GadgetDescriptor[], 
/**
 * A `package -> .d.ts content` map for third-party gadget wrappers.
 * Forwarded to the skeleton builder so the gadget catalog renders a
 * `Type:` line per third-party gadget (its signature is extracted
 * from the `.d.ts`). When omitted, no `Type:` line is rendered —
 * stdlib gadgets do not need one.
 */
gadgetTypes?: Readonly<Record<string, string>>): string;

export { type AgentSpec, type SingleComponentParams, buildSystemPrompt };
