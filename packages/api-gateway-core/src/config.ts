export interface ApiGatewayCoreConfig {
  readonly apiFuseApiKey: string;
  readonly apiFuseMcpUrl: string;
  readonly swingBaseUrl: string;
  readonly swingApiKey: string;
}

let config: ApiGatewayCoreConfig | null = null;

export function configureApiGatewayCore(nextConfig: ApiGatewayCoreConfig): void {
  config = {
    ...nextConfig,
    swingBaseUrl: nextConfig.swingBaseUrl.replace(/\/+$/, ''),
  };
}

export function getApiGatewayCoreConfig(): ApiGatewayCoreConfig {
  if (!config) {
    throw new Error('API gateway core is not configured. Call configureApiGatewayCore() from the service boundary first.');
  }
  return config;
}
