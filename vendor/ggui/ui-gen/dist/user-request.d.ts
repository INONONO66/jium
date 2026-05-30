import { JsonSchema, InterfaceContext } from '@ggui-ai/protocol';
import { BlueprintHintMatch } from './blueprint-hint.js';
import { StrategyName } from './strategy.js';

interface UserRequestOptions {
    readonly prompt: string;
    readonly strategy?: StrategyName;
    readonly schema?: JsonSchema;
    readonly adapters?: ReadonlyArray<string>;
    /** Best matching blueprint from the negotiator */
    readonly matchedBlueprint?: BlueprintHintMatch | null;
    /** Top 0-3 relevant blueprints ranked by confidence */
    readonly relevantBlueprints?: ReadonlyArray<BlueprintHintMatch>;
    /** Device/viewport context for responsive UI generation */
    readonly interfaceContext?: InterfaceContext;
    /** Declarative interactive actions to wire into the generated UI */
    readonly actions?: ReadonlyArray<{
        readonly id: string;
        readonly label: string;
        readonly description?: string;
        readonly icon?: string;
    }>;
}
/**
 * Build strategy-specific blueprint context for MCP framing.
 *
 * Different strategies frame available blueprints differently:
 * - strict: Blueprints only, no generation allowed
 * - balanced: Blueprints preferred, generation if needed
 * - creative: Blueprints as reference, push for maximum customization
 */
declare function buildBlueprintContextForStrategy(strategy: StrategyName, relevantBlueprints: ReadonlyArray<BlueprintHintMatch>): string;
/**
 * Build the user-turn request for the LLM.
 *
 * Contains: the natural-language prompt, blueprint context (strategy-aware),
 * data schema, adapters, declarative actions, and device/shell hints.
 */
declare function buildUserRequest(options: UserRequestOptions): string;

export { type UserRequestOptions, buildBlueprintContextForStrategy, buildUserRequest };
