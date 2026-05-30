import { S as StreamEventKind, C as Classification, A as AxisVector, R as RiskTier, F as FetchShape, a as AxisSource, L as LayoutShape, b as RealtimeShape, c as RenderShape, d as StateShape, T as ToolingShape, W as WriteTrigger, e as WriteShape } from '../axes-CzLEMDeB.js';
export { f as AxisProvenance } from '../axes-CzLEMDeB.js';
import { ClientCapabilitiesSpec } from '@ggui-ai/protocol';

type ClassifierInput = {
    propsSpec?: unknown;
    /**
     * Flat `Record<actionName, ActionEntry>`. Mirrors
     * {@link DataContract.actionSpec} exactly — the classifier accepts
     * the same shape callers pass through the render path.
     */
    actionSpec?: unknown;
    /**
     * Flat `Record<channelName, StreamChannelEntry>`. Mirrors
     * {@link DataContract.streamSpec}.
     */
    streamSpec?: unknown;
    agentCapabilities?: unknown;
    /**
     * Mirrors {@link DataContract.clientCapabilities}. Typed (not
     * `unknown`) so the gadget-name walk reads `gadgets` without a cast.
     */
    clientCapabilities?: ClientCapabilitiesSpec;
} | undefined;
interface SchemaShape {
    type?: string;
    enum?: unknown[];
    items?: SchemaShape & {
        properties?: Record<string, unknown>;
    };
    properties?: Record<string, unknown>;
    schema?: SchemaShape;
}
interface EntityList {
    /** Prop name, plural (e.g., "tasks") */
    name: string;
    /** Singular stem for Id-suffix matching (e.g., "task") */
    singular: string;
    /** Identity field on each item */
    idField: string;
    /** Keys present on each item */
    itemKeys: string[];
}
interface SingletonEntity {
    /** Prop name (e.g., "ride", "flight", "product") */
    name: string;
    /** Keys present on the singleton */
    keys: string[];
}
interface ActionEntryInfo {
    name: string;
    tool?: string;
    example?: Record<string, unknown>;
    /** Top-level keys in example whose value is scalar (string/number/boolean). */
    scalarKeys: string[];
    /** All top-level keys in the example. */
    allKeys: string[];
    /** Entity lists referenced by id-key match (taskId ↔ tasks). */
    referencedEntities: string[];
}
declare function inferStreamKindFromSchema(eventSchema: SchemaShape | undefined, entityLists: EntityList[], singletons: SingletonEntity[]): StreamEventKind;
/**
 * Per-tool projection of the contract's `agentCapabilities.tools`
 * catalog. Also reused for `clientCapabilities.libraries` entries
 * (always with empty `requestKeys`) — libraries are pure declaration.
 */
interface AgentToolInfo {
    name: string;
    requestKeys: string[];
}
interface ContractSignals {
    actions: ActionEntryInfo[];
    streams: Array<{
        name: string;
        schema?: SchemaShape;
    }>;
    /** Projection of `contract.agentCapabilities.tools`. The agent
     *  invokes these — they are NOT component hooks; recorded here for
     *  fetch-axis classification. */
    agentTools: AgentToolInfo[];
    /**
     * Binding names declared in `clientCapabilities.libraries`. The
     * `requestKeys` field is always empty — libraries are
     * declaration-only.
     */
    clientCapabilities: AgentToolInfo[];
    /** Top-level arr<obj> props with inferred idField. */
    entityLists: EntityList[];
    /** Top-level object props with an id field (singleton entities). */
    singletons: SingletonEntity[];
    hasArrObjAnywhere: boolean;
    hasGeoCoords: boolean;
    /**
     * Any action payload references an entity-id matching an arr<obj> prop.
     * NOTE: singleton id-refs are excluded — they don't count as per-item.
     */
    entityListIdInPayload: boolean;
    /** Any action payload references an id-suffix key matching a singleton prop. */
    singletonIdInPayload: boolean;
    /** Any single action payload references keys matching ≥ 2 different entity lists. */
    crossEntityAction: boolean;
    /** Any action payload has ≥ 3 scalar keys at top level. */
    multiFieldSubmit: boolean;
    /** Count of top-level scalar-typed props (string/number/boolean). */
    topLevelScalarCount: number;
    /** Any entity list's items carry 2D grid coordinates (row+col or x+y). */
    entitiesHaveGridPositions: boolean;
}
declare function inspect(contract: ClassifierInput): ContractSignals;

interface ClassifyInput {
    contract: ClassifierInput;
    prompt?: string;
    blueprint?: {
        mechanic?: string;
        layoutHint?: string;
    };
}
declare function classifyAxes(input: ClassifyInput): Classification;

/**
 * Derive risk tier from an AxisVector. Policy, not description — drives the
 * eval loop's depth and repair budget. Kept coarse and easy to revise.
 *
 * See AXIS_VECTOR_SKETCH.md §riskTier.
 */
declare function deriveRiskTier(v: AxisVector): RiskTier;

declare function inferFetch(s: ContractSignals): {
    value: FetchShape;
    source: AxisSource;
};

interface BlueprintHint$2 {
    mechanic?: string;
    layoutHint?: string;
}
declare function inferLayout(s: ContractSignals, prompt: string, blueprint: BlueprintHint$2 | undefined): {
    value: LayoutShape;
    source: AxisSource;
};

declare function inferRealtime(s: ContractSignals): {
    value: RealtimeShape;
    streamKinds?: Record<string, StreamEventKind>;
    source: AxisSource;
};

interface BlueprintHint$1 {
    mechanic?: string;
    layoutHint?: string;
}
declare function inferRender(s: ContractSignals, prompt: string, blueprint: BlueprintHint$1 | undefined): {
    value: RenderShape;
    source: AxisSource;
};

declare function inferState(s: ContractSignals, prompt: string): {
    value: StateShape;
    source: AxisSource;
};

declare function inferTooling(s: ContractSignals): {
    value: ToolingShape;
    source: AxisSource;
};

interface BlueprintHint {
    mechanic?: string;
    layoutHint?: string;
}
declare function inferWriteTrigger(s: ContractSignals, prompt: string, blueprint: BlueprintHint | undefined): {
    value: WriteTrigger;
    source: AxisSource;
};

declare function inferWrites(s: ContractSignals): {
    value: WriteShape;
    source: AxisSource;
};

export { type ActionEntryInfo, type AgentToolInfo, AxisSource, AxisVector, Classification, type ClassifierInput, type ClassifyInput, type ContractSignals, type EntityList, FetchShape, LayoutShape, RealtimeShape, RenderShape, RiskTier, type SingletonEntity, StateShape, StreamEventKind, ToolingShape, WriteShape, WriteTrigger, classifyAxes, deriveRiskTier, inferFetch, inferLayout, inferRealtime, inferRender, inferState, inferStreamKindFromSchema, inferTooling, inferWriteTrigger, inferWrites, inspect };
