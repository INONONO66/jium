import { UiClass } from '@ggui-ai/protocol';
import { UiManifest } from '@ggui-ai/project-config';
import '@ggui-ai/protocol/content-hash';

/**
 * Validation error types for classification
 */
type ValidationErrorType = 'import' | 'primitive' | 'security' | 'syntax' | 'size' | 'structure';
/**
 * Validation warning types
 */
type ValidationWarningType = 'accessibility' | 'best-practice' | 'performance';
/**
 * Detailed validation error with actionable suggestions
 */
interface ValidationError {
    type: ValidationErrorType;
    message: string;
    line?: number;
    column?: number;
    suggestion: string;
    code?: string;
}
/**
 * Validation warning (non-blocking)
 */
interface ValidationWarning {
    type: ValidationWarningType;
    message: string;
    line?: number;
    suggestion: string;
}
/**
 * Comprehensive validation result
 */
interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    suggestions: string[];
    stats: {
        lineCount: number;
        charCount: number;
        importCount: number;
        primitiveCount: number;
    };
}
interface ValidationOptions {
    /**
     * Skip import allowlist validation.
     * Used when bundle mode is enabled — external imports will be resolved
     * by esbuild at build time, not by the runtime.
     * Security patterns (eval, fetch, etc.) are still enforced.
     */
    skipImportValidation?: boolean;
    /**
     * Skip size limits (line count, file size).
     * Used for user-registered UIs where the developer controls the size.
     * LLM-generated UIs keep the limits to constrain generation.
     */
    skipSizeLimits?: boolean;
    /**
     * Skip dangerous-pattern security scan (eval, fetch, location, etc.).
     * Used for user-registered UIs where the developer controls the code.
     * LLM-generated UIs always get the security scan.
     */
    skipSecurityPatterns?: boolean;
}
/**
 * Validate component code with rich feedback.
 * Returns detailed errors, warnings, and suggestions.
 */
declare function validateComponentDetailed(code: string, options?: ValidationOptions): ValidationResult;
/**
 * Simple validation that throws on error (backward compatible).
 * Use validateComponentDetailed for rich feedback.
 */
declare function validateComponent(code: string): void;
/**
 * Format validation result as a string for Claude feedback.
 * Provides context-rich error messages for the AI to understand and fix issues.
 */
declare function formatValidationResultForClaude(result: ValidationResult): string;

interface UiCompileResult {
    /** Minified ESM output (may include bundled dependencies). */
    compiledCode: string;
    /** Content hash of compiled ESM — canonical identity. */
    contentHash: string;
    /** Validation result (errors, warnings, stats). */
    validation: ValidationResult;
    /** Classified UI type based on imports. */
    uiClass: UiClass;
    /** esbuild warnings. */
    compileWarnings: string[];
    /** Whether external dependencies were bundled. */
    bundled: boolean;
}
interface CompileOptions {
    /**
     * Enable bundling mode. When true, esbuild resolves and inlines all
     * imports from `resolveDir` (except SANDBOX_EXTERNALS).
     *
     * Use this when the component imports external npm packages
     * (e.g., leaflet, recharts, framer-motion).
     *
     * Default: false (transform-only, no import resolution).
     */
    bundle?: boolean;
    /**
     * Directory to resolve imports from (path to node_modules parent).
     * Required when bundle=true. Typically the directory containing the
     * source file, or the project root.
     */
    resolveDir?: string;
}
declare class UiValidationError extends Error {
    readonly validation: ValidationResult;
    constructor(validation: ValidationResult);
}
declare class UiBundleSizeError extends Error {
    readonly size: number;
    readonly limit: number;
    constructor(size: number, limit: number);
}
/**
 * Validate and compile a UI component from source code.
 *
 * This is the standalone entry point used by:
 * - `ggui ui build` CLI command (bundle=true for external deps)
 * - UI register endpoint (bundle=false, transform only)
 * - Studio app
 *
 * The generator pipeline uses its own compile path (S3-based, with
 * @predefined/ resolution), but shares the same validation rules
 * via @ggui-ai/protocol.
 */
declare function compileUi(source: string, _manifest: Pick<UiManifest, 'name' | 'contract'>, options?: CompileOptions): Promise<UiCompileResult>;
/**
 * Validate only (no compilation). Useful for quick checks in the UI.
 */
declare function validateUi(source: string, options?: {
    skipImportValidation?: boolean;
    skipSizeLimits?: boolean;
    skipSecurityPatterns?: boolean;
}): ValidationResult & {
    uiClass: UiClass;
};

export { type CompileOptions as C, UiBundleSizeError as U, type ValidationError as V, type UiCompileResult as a, UiValidationError as b, type ValidationErrorType as c, type ValidationOptions as d, type ValidationResult as e, type ValidationWarning as f, type ValidationWarningType as g, compileUi as h, formatValidationResultForClaude as i, validateComponentDetailed as j, validateUi as k, validateComponent as v };
