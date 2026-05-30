# Jium — Ambient Proactive UI Agent

> 대화를 듣고, 맥락을 이해하고, 필요한 서비스를 먼저 띄워주는 AI.

## What is this?

Jium은 사용자의 **음성 대화를 지속적으로 인식**하여 현재 상황과 대화 흐름에서 **"이 사람이 지금 필요한 것"**을 추론하고, 그에 맞는 **웹 UI를 동적으로 생성**해주는 Ambient Proactive Agent입니다.

### 핵심 아이디어

```
"밥 먹으러 가자" → 맛집 추천 UI가 자동으로 뜬다
"집에 가야겠다"  → 택시 호출 UI가 자동으로 뜬다
"비 온다"       → 날씨 위젯이 자동으로 뜬다
```

사용자가 **명시적으로 요청하지 않아도**, 대화 맥락에서 의도를 읽어 적절한 서비스 UI를 **선제적으로** 제안합니다.

## Architecture

```
┌─ Browser ──────────────────────────────────────────┐
│                                                     │
│  Mic → Web Speech API (STT) → WebSocket ──────────┐│
│                                                    ││
│  ┌─ Dynamic UI Canvas ────────────────────────┐   ││
│  │  GGUI-style JSON UI renderer               │   ││
│  │  (맛집 카드, 택시 호출, 날씨 위젯, ...)     │   ││
│  └────────────────────────────────────────────┘   ││
└────────────────────────────────────────────────────┘│
                                                      │
┌─ Backend (Node.js) ──────────────────────────────────┘
│                                                      │
│  Context Manager ──→ LLM (OpenAI) ──→ Intent JSON    │
│  (rolling window)    의도 추론 엔진       ↓           │
│                                     OpenAPI Action   │
│                                     Router           │
│                                     (API Fuse / 직접) │
│                                         ↓            │
│                                   JSON UI Spec       │
│                                   Generator          │
└──────────────────────────────────────────────────────┘
```

### Flow

1. 브라우저 마이크 → STT로 실시간 텍스트 변환
2. 텍스트를 백엔드에 전송
3. Context Manager가 최근 대화 맥락을 rolling window로 유지
4. LLM이 맥락을 분석하여 의도 추론
5. 추론 결과에 따라 외부 API 호출 (API Fuse 패스스루 또는 직접 연동)
6. GGUI-style contract를 바탕으로 JSON UI spec 생성
7. 브라우저의 in-app React renderer가 안전하게 렌더링

## Intelligence Level: Proactive

| Level | 설명 | Jium |
|---|---|---|
| Reactive | 명시적 요청에 대응 | - |
| **Proactive** | **대화 맥락에서 암시적 필요를 추론** | **이것** |
| Ambient | 환경 전체에서 선제적 행동 | - |

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| LLM | OpenAI GPT (proxy) | Intent 추론 + UI spec 생성 |
| Backend | Node.js (pnpm monorepo) | OpenAI Agents SDK 기반 |
| Frontend | React (Vite) + GGUI-style JSON renderer | iframe 없이 안정적인 동적 UI 렌더링 |
| UI Generation | GGUI-derived Contract → JSON UI Spec | 맥락 → 제한된 UI 문법 |
| External APIs | API Fuse (패스스루) + 직접 연동 (모빌리티) | 125개 operation 즉시 사용 |

## External APIs (후원사 리소스)

대화에서 추론된 의도에 따라 연결되는 실제 서비스:

| 추론 의도 | API | UI |
|---|---|---|
| 이동/교통 | Swing (택시/PM) | 지도 + 호출 버튼 |
| 식사/맛집 | 마이리얼트립, 요기요 (API Fuse) | 맛집 카드 리스트 |
| 미용/시술 | 강남언니 | 시술 정보 카드 |
| 채용/커리어 | 로켓펀치 | 채용공고 리스트 |
| 날씨 | 기상청 (API Fuse) | 날씨 위젯 |
| 크립토/투자 | CryptoQuant | 차트 + 온체인 데이터 |
| 일정 관리 | 기본 내장 | 캘린더/일정 카드 |

## Architecture Docs

현재 제품 방향은 GGUI를 그대로 쓰는 것이 아니라, GGUI의 contract/action/design primitive 철학을 유지하면서 iframe/code-generation runtime을 JSON UI renderer로 대체하는 것입니다.

- [Architecture Notes](./docs/architecture/README.md)
- [GGUI-derived JSON UI Engine](./docs/architecture/ggui-json-ui-engine.md)
- [UI Spec and Component Vocabulary](./docs/architecture/ui-spec.md)
- [OpenAPI Action Router](./docs/architecture/openapi-action-router.md)
- [Migration Plan from GGUI Sample](./docs/architecture/migration-plan.md)

## Project Structure

```
jium-app/
├── apps/web/              # Vite SPA — DynamicSurfaceRenderer 예정
├── servers/
│   ├── agent/             # OpenAI Agents SDK — LLM 백엔드
│   ├── ggui/              # GGUI 샘플/참고 경로 (교체 예정)
│   └── mcps/              # 도메인 MCP 서버들 (도구)
│       └── todo/          # 예제 MCP 서버
├── .env.local             # API 키 (git-ignored)
├── docs/architecture/     # Jium-native UI engine 설계 문서
└── package.json           # pnpm workspace root
```

## Quick Start

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경 변수 설정
cp .env.example .env.local
# .env.local에 OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL 입력

# 현재 해커톤 proxy 기준:
# OPENAI_BASE_URL=https://proxy.inonono.com/v1
# OPENAI_MODEL=gpt-5.5

# 3. 개발 서버 시작 (4개 서버 동시 기동)
pnpm dev

# http://localhost:6890 에서 확인
```

### OpenAI Proxy

이 프로젝트는 direct `api.openai.com`이 아니라 OpenAI-compatible proxy를 사용합니다.

```env
OPENAI_BASE_URL=https://proxy.inonono.com/v1
OPENAI_MODEL=gpt-5.5
OPENAI_API_KEY=<proxy-issued-key>
```

`OPENAI_BASE_URL`은 두 군데에 동시에 적용됩니다.

- `servers/agent` — OpenAI Agents SDK가 `/v1/responses` 호출
- `servers/ggui` — GGUI UI generation이 같은 proxy/model 사용

`servers/ggui/ggui.json`의 `generation.model`도 `openai:gpt-5.5`로 맞춰져 있어야 합니다.

### 개별 서버 실행

```bash
pnpm dev:ggui    # GGUI MCP Server  → http://localhost:6781/mcp
pnpm dev:mcps    # Domain MCP 서버  → http://localhost:6782/mcp
pnpm dev:agent   # Agent 백엔드     → http://localhost:6791
pnpm dev:web     # Frontend SPA     → http://localhost:6890
```

## License

Apache-2.0
