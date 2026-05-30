import { A as AxisKey, H as HarnessFragment } from '../types-BOvHNG7K.js';
export { a as CacheTier, C as ComposedHarness } from '../types-BOvHNG7K.js';
import '../axes-CzLEMDeB.js';

declare const FRAGMENT_REGISTRY: Record<AxisKey, Record<string, HarnessFragment>>;
declare function lookupFragment(axis: AxisKey, value: string): HarnessFragment | undefined;

export { AxisKey, FRAGMENT_REGISTRY, HarnessFragment, lookupFragment };
