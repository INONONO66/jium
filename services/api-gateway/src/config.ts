import type { ApiGatewayCoreConfig } from '@jium/api-gateway-core';

function requireEnv(name: string, help?: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(help ? `${name} environment variable is required. ${help}` : `${name} environment variable is required.`);
  }
  return value;
}

export function readApiGatewayCoreConfig(): ApiGatewayCoreConfig {
  return {
    apiFuseApiKey: requireEnv('APIFUSE_API_KEY', 'Get one at https://platform.apifuse.com/login'),
    apiFuseMcpUrl: process.env.APIFUSE_MCP_URL ?? 'https://api.apifuse.com/mcp',
    swingBaseUrl: requireEnv('SWING_BASE_URL', 'Example: https://stage.playground.endpoint.swingmobility.dev'),
    swingApiKey: requireEnv('SWING_API_KEY'),
  };
}
