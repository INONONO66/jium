/**
 * Bounded-concurrency batch executor — runs multiple actions in
 * parallel with a configurable concurrency limit.
 *
 * Pattern borrowed from OpenAI Agents JS toolExecution.ts:
 * worker-pool with order-preserving results and allSettled semantics
 * (one failure does not abort others).
 */
import type { ToolAction, ActionResult } from './schemas.js';

export async function executeBatch(
  actions: readonly ToolAction[],
  concurrency: number,
  executor: (action: ToolAction) => Promise<ActionResult>,
): Promise<ActionResult[]> {
  if (actions.length === 0) {
    return [];
  }

  const effectiveConcurrency = Math.max(1, Math.min(concurrency, actions.length));
  const results: ActionResult[] = new Array(actions.length);
  let nextIndex = 0;

  // If concurrency >= action count, just run them all at once
  if (effectiveConcurrency >= actions.length) {
    const promises = actions.map(async (action, i) => {
      try {
        results[i] = await executor(action);
      } catch (err) {
        results[i] = {
          status: 'rejected',
          toolName: action.toolName,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });
    await Promise.allSettled(promises);
    return results;
  }

  const worker = async (): Promise<void> => {
    while (nextIndex < actions.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const action = actions[currentIndex]!;
      try {
        results[currentIndex] = await executor(action);
      } catch (err) {
        results[currentIndex] = {
          status: 'rejected',
          toolName: action.toolName,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  };

  await Promise.allSettled(
    Array.from({ length: effectiveConcurrency }, () => worker()),
  );

  return results;
}
