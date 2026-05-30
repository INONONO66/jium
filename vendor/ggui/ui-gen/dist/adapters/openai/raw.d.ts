import { GeneratorAdapter, AdapterConfig, GenerateParams } from '../base.js';
import { ProviderName, AdapterMode, AdapterResult } from '../types.js';
import '@anthropic-ai/claude-agent-sdk';
import '@ggui-ai/protocol';
import 'zod';

declare class OpenAiRawAdapter extends GeneratorAdapter {
    readonly provider: ProviderName;
    readonly mode: AdapterMode;
    readonly displayName = "OpenAI (Raw API)";
    private client;
    constructor(config?: AdapterConfig);
    isAvailable(): boolean;
    generate(params: GenerateParams): Promise<AdapterResult>;
}

export { OpenAiRawAdapter };
