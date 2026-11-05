import type { Bytes, Scenario } from './types.js';

/**
 * The host KV cache capacity is accepted in two places for backwards
 * compatibility with older scenarios. Runtime config wins; the deployment
 * transfer block is the fallback. Validation, simulation and the UI must all
 * use this resolver so a capacity can never be validated but ignored.
 */
export function resolveHostCacheBytes(
  scenario: Pick<Scenario, 'runtime' | 'deployment'>,
): Bytes {
  return scenario.runtime.hostCacheBytes ?? scenario.deployment.kvTransfer?.hostCacheBytes ?? 0;
}
