import { JsonSchema } from '@ggui-ai/protocol';

/**
 * Convert a JsonSchema to a TypeScript type string — recursive.
 *
 * Handles: string, number, integer, boolean, null, array (+ tuples), object,
 * enum, oneOf/anyOf (unions), nullable, const, additionalProperties.
 */
declare function jsonSchemaTypeToTs(schema: JsonSchema): string;

export { jsonSchemaTypeToTs as j };
