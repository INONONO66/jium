/**
 * Generation strategy types — controls how aggressive the generator is
 * about reusing blueprints vs generating fresh code.
 *
 * - strict: Blueprints only, no generation (maxTurns=0)
 * - balanced: Blueprints preferred, generate if needed (maxTurns=45)
 * - creative: Agent always decides, push aesthetics (maxTurns=90)
 */
type StrategyName = 'strict' | 'balanced' | 'creative';
/**
 * Blueprint policy for generation strategies.
 * - only: Use blueprints only, fail if no match
 * - preferred: Prefer blueprints, generate if no match
 * - reference: Use blueprints as reference, agent decides
 */
type BlueprintPolicy = 'only' | 'preferred' | 'reference';
interface StrategyConfig {
    readonly name: StrategyName;
    readonly maxTurns: number;
    readonly blueprintPolicy: BlueprintPolicy;
    readonly bypassAgentOnExactMatch: boolean;
}
declare const STRATEGIES: Record<StrategyName, StrategyConfig>;
/**
 * Match type for generation metrics — describes how the final UI was
 * produced (cache hit, blueprint match variant, or full generation).
 */
type MatchType = 'exact' | 'cached' | 'predefined' | 'partial_reuse' | 'generated';

export { type BlueprintPolicy, type MatchType, STRATEGIES, type StrategyConfig, type StrategyName };
