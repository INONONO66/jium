import { DataContract, GadgetDescriptor } from '@ggui-ai/protocol';

/** Shell layout modes supported by the boilerplate templates. */
type ShellType = "chat" | "fullscreen" | "spatial";
/** Target screen size. */
type ScreenSize = "mobile" | "tablet" | "desktop" | "universal";
declare function generateBoilerplate(_userPrompt: string, contract?: DataContract, shellType?: ShellType, screen?: ScreenSize, 
/** Axis-composed boilerplate sections — fragments produced by `compose()`. */
composedSections?: string, 
/**
 * Registered gadget catalog. The boilerplate emits a direct
 * `import { … } from '<package>'` per gadget package from the
 * contract's declarations; this catalog supplies the descriptor
 * metadata (`description` / `usage` / `example`) used to prime each
 * pre-emitted gadget call site so the LLM has a working starting
 * point rather than an empty `useFoo()` it might delete.
 */
appGadgets?: readonly GadgetDescriptor[]): string;

export { type ScreenSize as S, type ShellType as a, generateBoilerplate as g };
