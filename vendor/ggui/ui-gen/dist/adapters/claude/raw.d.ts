import { GeneratorAdapter, AdapterConfig, GenerateParams } from '../base.js';
import { ProviderName, AdapterMode, AdapterResult } from '../types.js';
import '@anthropic-ai/claude-agent-sdk';
import '@ggui-ai/protocol';
import 'zod';

declare class ClaudeRawAdapter extends GeneratorAdapter {
    readonly provider: ProviderName;
    readonly mode: AdapterMode;
    readonly displayName = "Claude (Raw API)";
    private client;
    constructor(config?: AdapterConfig);
    isAvailable(): boolean;
    generate(params: GenerateParams): Promise<AdapterResult>;
}

export { ClaudeRawAdapter };
