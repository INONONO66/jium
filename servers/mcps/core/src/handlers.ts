import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { routeOperation } from './router.js';
import { executeBatch } from './pool.js';
import { searchTools, getToolSchema } from './apifuse-mcp-client.js';
import { getSwingCapabilities, getSwingSchema, isSwingTool } from './swing-client.js';
import type { SearchResult, ToolAction } from './schemas.js';

// API Fuse search only understands English queries — map Korean keywords
const KO_EN_MAP: Array<[RegExp, string]> = [
  [/카페|커피/g, 'cafe'],
  [/맛집|음식점|식당|레스토랑/g, 'restaurant'],
  [/날씨|기온|기상/g, 'weather forecast'],
  [/택시|차량호출/g, 'taxi fare ride'],
  [/킥보드|전동|자전거|이동수단/g, 'vehicle scooter bike'],
  [/배달|주문|시켜/g, 'food delivery order'],
  [/치킨/g, 'chicken'],
  [/피자/g, 'pizza'],
  [/중고|당근|마켓/g, 'secondhand marketplace used'],
  [/쇼핑|구매|사고싶/g, 'shopping buy product'],
  [/지도|장소|검색|근처|주변/g, 'place search nearby location map'],
  [/길찾기|경로|네비/g, 'directions route navigation'],
  [/주차/g, 'parking'],
  [/항공|비행기|항공권/g, 'flight airline'],
  [/법률|법령|법/g, 'law legal'],
  [/택배|배송/g, 'delivery tracking shipping'],
  [/다이소/g, 'daiso store'],
  [/마켓컬리|장보기|식료품/g, 'grocery market kurly'],
  [/인테리어|가구|집꾸미기/g, 'furniture interior ohouse'],
  [/가격비교|최저가/g, 'price comparison danawa'],
  [/공기|미세먼지|대기/g, 'air quality pollution'],
  [/요기요/g, 'yogiyo restaurant delivery'],
];

function translateQueryForSearch(query: string): string {
  let translated = query;
  let hasKorean = false;

  for (const [pattern, replacement] of KO_EN_MAP) {
    if (pattern.test(translated)) {
      hasKorean = true;
      translated = translated.replace(pattern, replacement);
    }
  }

  if (!hasKorean) return query;
  return translated.replace(/\s+/g, ' ').trim();
}

export function registerCoreTools(server: McpServer): void {
  server.registerTool(
    'search',
    {
      title: 'Search',
      description:
        '자연어로 사용 가능한 API 도구를 검색합니다. ' +
        'API Fuse (카카오맵, 날씨, 맛집 등 125개) + Swing (택시, 킥보드) 통합 결과를 반환합니다. ' +
        'execute 또는 batch에서 쓸 toolName을 찾을 때 사용하세요.',
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe('자연어 검색어. 예: "강남역 카페", "날씨", "택시 요금"'),
      },
      outputSchema: {
        query: z.string(),
        results: z.array(
          z.object({
            toolName: z.string(),
            title: z.string(),
            description: z.string(),
            provider: z.enum(['apifuse', 'swing']),
          }),
        ),
      },
    },
    async (input) => {
      const query = String(input.query);
      const merged: SearchResult[] = [];

      const englishQuery = translateQueryForSearch(query);

      try {
        const apifuseResults = await searchTools(englishQuery);
        for (const r of apifuseResults) {
          const item = r as { toolName?: string; title?: string; description?: string };
          if (item.toolName) {
            merged.push({
              toolName: item.toolName,
              title: item.title ?? item.toolName,
              description: item.description ?? '',
              provider: 'apifuse',
            });
          }
        }
      } catch {
        // API Fuse MCP may not be connected — continue with Swing only
      }

      const swingCaps = getSwingCapabilities();
      const queryLower = query.toLowerCase();
      const mobilityKeywords = ['택시', 'taxi', '킥보드', 'kickboard', '자전거', 'bike', 'scooter', '모빌리티', 'mobility', '이동', '차량', 'vehicle', '요금', 'fare', 'eta'];
      const isMobilityQuery = mobilityKeywords.some((kw) => queryLower.includes(kw));

      if (isMobilityQuery || merged.length === 0) {
        merged.push(...swingCaps);
      }

      const output = { query, results: merged };

      return {
        structuredContent: output,
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      };
    },
  );

  server.registerTool(
    'get_schema',
    {
      title: 'Get Schema',
      description:
        'toolName의 정확한 입력 스키마를 반환합니다. ' +
        'execute 전에 어떤 파라미터가 필요한지 확인할 때 사용하세요.',
      inputSchema: {
        toolName: z
          .string()
          .min(1)
          .describe('search에서 반환된 toolName. 예: "kakaomap_api__search", "swing_taxi_eta"'),
      },
      outputSchema: {
        toolName: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        inputSchema: z.record(z.string(), z.unknown()),
      },
    },
    async (input) => {
      const toolName = String(input.toolName);

      if (isSwingTool(toolName)) {
        const schema = getSwingSchema(toolName);
        if (!schema) {
          return {
            structuredContent: { toolName, error: `Unknown Swing tool: ${toolName}` },
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Unknown Swing tool: ${toolName}` }) }],
          };
        }
        const output = { toolName, ...schema };
        return {
          structuredContent: output,
          content: [{ type: 'text' as const, text: JSON.stringify(output) }],
        };
      }

      const schema = await getToolSchema(toolName);
      const output = {
        toolName,
        title: schema.title as string | undefined,
        description: schema.description as string | undefined,
        inputSchema: schema.inputSchema as Record<string, unknown> ?? schema,
      };

      return {
        structuredContent: output,
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      };
    },
  );

  server.registerTool(
    'execute',
    {
      title: 'Execute',
      description:
        '단일 API 도구를 실행합니다. toolName과 input을 전달하세요. ' +
        'API Fuse 도구 (kakaomap_api__search 등) 또는 Swing 도구 (swing_taxi_eta 등) 모두 가능합니다. ' +
        '레거시 형식 (apifuse.provider.op, mobility.*)도 지원합니다.',
      inputSchema: {
        toolName: z
          .string()
          .min(1)
          .describe('실행할 도구. 예: "kakaomap_api__search", "swing_taxi_eta", "apifuse.kma-forecast.short-forecast"'),
        input: z
          .record(z.string(), z.unknown())
          .optional()
          .default({})
          .describe('도구 입력 파라미터.'),
      },
      outputSchema: {
        status: z.enum(['fulfilled', 'rejected']),
        toolName: z.string(),
        data: z.unknown().optional(),
        error: z.string().optional(),
      },
    },
    async (input) => {
      const action: ToolAction = {
        toolName: String(input.toolName),
        input: (input.input as Record<string, unknown>) ?? {},
      };

      const result = await routeOperation(action);

      return {
        structuredContent: result,
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    },
  );

  server.registerTool(
    'batch',
    {
      title: 'Batch',
      description:
        '여러 API 도구를 동시에 실행합니다. API Fuse + Swing을 섞어서 한 번에 호출할 수 있습니다. ' +
        '결과는 입력 순서와 1:1로 반환됩니다. 하나가 실패해도 나머지는 정상 실행됩니다.',
      inputSchema: {
        actions: z
          .array(
            z.object({
              toolName: z.string().min(1).describe('실행할 도구 이름.'),
              input: z
                .record(z.string(), z.unknown())
                .optional()
                .default({})
                .describe('도구 입력 파라미터.'),
            }),
          )
          .min(1, 'actions must contain at least one action')
          .describe('동시에 실행할 도구 목록.'),
        concurrency: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .default(5)
          .describe('최대 동시 실행 수. 기본 5.'),
      },
      outputSchema: {
        results: z.array(
          z.object({
            status: z.enum(['fulfilled', 'rejected']),
            toolName: z.string(),
            data: z.unknown().optional(),
            error: z.string().optional(),
          }),
        ),
      },
    },
    async (input) => {
      const actions = (input.actions as Array<{ toolName: string; input?: Record<string, unknown> }>).map((a) => ({
        toolName: String(a.toolName),
        input: a.input ?? {},
      }));

      const concurrency = typeof input.concurrency === 'number' ? input.concurrency : 5;
      const results = await executeBatch(actions, concurrency, routeOperation);
      const output = { results };

      return {
        structuredContent: output,
        content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      };
    },
  );
}
