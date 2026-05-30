import { PropsSpec, JsonObject } from '@ggui-ai/protocol';

/**
 * Generate sample props from a PropsSpec contract.
 * Uses `example` values from each PropEntry when available,
 * otherwise synthesizes plausible defaults from the JSON Schema.
 */
declare function generateSampleProps(spec: PropsSpec): JsonObject;
declare function tryRender(compiledCode: string, sourceCode: string, sampleProps?: JsonObject): Promise<string | null>;

export { generateSampleProps, tryRender };
