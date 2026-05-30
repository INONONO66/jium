import { GeneratorAdapter, AdapterConfig, GenerateParams } from '../base.js';
import { ProviderName, AdapterMode, AdapterResult } from '../types.js';
import '@anthropic-ai/claude-agent-sdk';
import '@ggui-ai/protocol';
import 'zod';

declare class GoogleRawAdapter extends GeneratorAdapter {
    readonly provider: ProviderName;
    readonly mode: AdapterMode;
    readonly displayName = "Google Gemini (Interactions API)";
    private client;
    constructor(config?: AdapterConfig);
    isAvailable(): boolean;
    generate(params: GenerateParams): Promise<AdapterResult>;
}

export { GoogleRawAdapter };
