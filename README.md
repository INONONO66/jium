# Jium

**일상을 위한 앰비언트 프로액티브 UI 에이전트**

Jium은 사용자가 직접 검색하고, 앱을 전환하고, 타이핑하는 수고를 줄여주는 에이전트입니다. 맥락(캘린더, 위치, 대화)을 읽고 의도를 파악해서, 채팅 대신 **지금 필요한 행동 UI를 바로 띄웁니다**.

> 확인하거나, dismiss하거나, 살짝 고치는 것. 긴 문장을 타이핑하는 것보다 훨씬 자주 일어나야 합니다.

## 핵심 아이디어

- **채팅 아님** — 풀스크린 모바일 셸 위에 카드, 도구 진행 상태, 생성형 UI, 퀵 액션이 뜸
- **선제적 제안** — "택시 부를까요?", "커피챗 카페 찾아볼까요?" 같은 surface가 맥락에 맞춰 자동으로 올라옴
- **멀티소스 통합** — 단일 앱 결과가 아니라 당근+중고나라, 배민+쿠팡잇츠 등 여러 소스를 하나의 surface에 합성
- **GGUI 런타임** — AI가 UI를 설계하는 [GGUI](https://github.com/ggui-ai/ggui) 런타임 위에서 동작

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        apps/web                             │
│               풀스크린 셸 (React + GGUI React)               │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP / SSE
┌──────────────────────▼──────────────────────────────────────┐
│                      apps/agent                             │
│          OpenAI Agents SDK 오케스트레이터                      │
│          (MCP 클라이언트 — URL로 서비스 연결)                   │
└────┬─────────────────┬─────────────────┬────────────────────┘
     │ MCP             │ MCP             │ MCP
┌────▼────┐     ┌──────▼──────┐   ┌─────▼──────┐
│services/│     │  services/  │   │ services/  │
│  ggui   │     │api-gateway  │   │user-context│
│         │     │             │   │            │
│ GGUI    │     │ API Fuse    │   │ 캘린더     │
│ 렌더    │     │ + Swing     │   │ 프로필     │
│ 런타임  │     │ MCP 서비스   │   │ 위치 맥락  │
└─────────┘     └─────────────┘   └──────┬─────┘
                                         │ HTTP
                                  ┌──────▼─────┐
                                  │ services/  │
                                  │   audio    │
                                  │ VAD / STT  │
                                  └────────────┘
```

### 데이터 흐름: intent → render → action

```
1. 프론트엔드가 맥락 신호를 보냄 ──→ POST /api/intent
   (시간, 위치, 캘린더, 대화 transcript)

2. 서버가 의도를 추론 ──→ { intent: "transport.time_pressure", confidence: 0.88 }

3. 의도 + 맥락으로 UI 생성 ──→ POST /api/render ──→ UiSurface (JSON)
   (서버가 내부적으로 필요한 API를 병렬 호출해서 데이터를 채움)

4. 사용자가 버튼을 탭 ──→ POST /api/action ──→ ActionResult
   (data / patch / replace_surface / dismiss / error)
```

## 시나리오 예시: 어느 직장인의 하루

| 시간 | 맥락 | Jium이 하는 일 |
|---|---|---|
| 07:40 | 평일 아침, 출근 일정 | 캘린더 + 날씨 대시보드를 조용히 깔아둠 |
| 08:25 | 출근까지 35분, 대중교통 50분 | "택시 부를까요?" 오버레이 + 지도 경로 |
| 09:00 | 사무실 도착 | 다음 일정 배지만 표시, 방해 안 함 |
| 11:50 | 커피챗 40분 전, 장소 미정 | 성수동 카페 3곳 추천 + 캘린더 장소 업데이트 |
| 12:45 | 대화에서 "리얼포스 갖고 싶다" | 당근 + 중고나라 통합 검색, 거리순 정렬, 지도 핀 |
| 18:30 | "치킨 먹고 싶다" | 배민 vs 쿠팡잇츠 같은 가게 가격/배달비 비교 |

> 전체 시나리오는 [`docs/product/scenario-a-day.md`](./docs/product/scenario-a-day.md)에서 확인할 수 있습니다.

## 레포지토리 구조

```
apps/
  web/                    풀스크린 앱 셸 (React + Vite + GGUI React)
  agent/                  OpenAI Agents SDK 오케스트레이터
  landing/                랜딩 페이지

services/
  ggui/                   GGUI 렌더 런타임 서비스
  api-gateway/            API Fuse + Swing MCP 서비스
  user-context/           캘린더 · 프로필 · 위치 맥락 서비스
  audio/                  VAD / STT / 트랜스크립트 파이프라인

packages/
  api-gateway-core/       API 스키마, 라우터, 클라이언트, 배치 실행
  shared/                 공유 타입 · 유틸리티
  user-context-client/    User context 클라이언트

vendor/
  ggui/                   GGUI 포크 패키지 (패치가 필요한 것만)

docs/
  architecture/           아키텍처 설계 문서
  product/                제품 시나리오
  reference/ggui/         GGUI 레퍼런스 자료
```

## 기술 스택

| 영역 | 기술 |
|---|---|
| 프론트엔드 | React 19, Vite, TypeScript |
| UI 런타임 | [GGUI](https://github.com/ggui-ai/ggui) (`@ggui-ai/react`, `@ggui-ai/design`) |
| 에이전트 | OpenAI Agents SDK, MCP (Model Context Protocol) |
| 서비스 간 통신 | MCP over HTTP, SSE 스트리밍 |
| 데이터베이스 | PostgreSQL 16 (Docker) |
| 모노레포 | pnpm workspaces, Turborepo |

## GGUI

Jium은 [GGUI](https://github.com/ggui-ai/ggui)의 "AI가 UI를 설계한다"는 철학 위에 구축되어 있습니다.

- **`@ggui-ai/react`** — 에이전트가 생성한 UI를 샌드박스 iframe 안에서 안전하게 렌더링
- **`@ggui-ai/design`** — 테마 토큰 시스템 (Indigo Dark 테마 사용)
- **`DataContract`**, **`actionSpec`**, **`contextSpec`** — GGUI의 계약 슬롯을 활용하되, Jium 제품에 맞게 출력을 좁혀서 사용

GGUI 런타임 관심사는 `services/ggui`와 `vendor/ggui`에 격리합니다. 포크 패치가 필요한 패키지만 `vendor/ggui/`에 둡니다.

## 로컬 개발

### 사전 준비

- Node.js ≥ 20
- pnpm (`corepack enable`)
- Docker (PostgreSQL용)

### 실행

```bash
# 환경변수 설정
cp .env.example .env.local
# .env.local에 OPENAI_API_KEY 등 필수 키 입력

# PostgreSQL 기동
docker compose up -d

# 의존성 설치 & 전체 서비스 실행
pnpm install
pnpm dev
```

`pnpm dev`는 다음을 동시에 시작합니다:
- `services/ggui` — GGUI 렌더 서비스
- `services/api-gateway` — API 게이트웨이
- `services/user-context` — 사용자 맥락 서비스
- `apps/agent` — 에이전트 백엔드 (`:6791`)
- `apps/web` — 웹 프론트엔드

### 개별 서비스 실행

```bash
pnpm dev:ggui          # GGUI 렌더 서비스만
pnpm dev:api-gateway   # API 게이트웨이만
pnpm dev:agent         # 에이전트만
pnpm dev:web           # 웹 프론트엔드만
```

### 빌드 & 검증

```bash
pnpm build             # 전체 빌드
pnpm typecheck         # 타입 체크
pnpm test              # 테스트
```

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | — | OpenAI API 키 (필수) |
| `OPENAI_MODEL` | `gpt-5.5-2026-04-23` | 에이전트 모델 |
| `GGUI_MCP_URL` | `http://localhost:6781/mcp` | GGUI 렌더 MCP 엔드포인트 |
| `GGUI_API_GATEWAY_MCP_URL` | `http://localhost:6783/mcp` | API 게이트웨이 MCP |
| `GGUI_USER_CONTEXT_MCP_URL` | `http://localhost:6784/mcp` | 사용자 맥락 MCP |
| `USER_CONTEXT_DATABASE_URL` | — | PostgreSQL 연결 문자열 |
| `APIFUSE_API_KEY` | — | API Fuse 인증 키 |
| `SWING_API_KEY` | — | Swing 모빌리티 API 키 |

전체 목록은 [`.env.example`](./.env.example)을 참고하세요.

## 설계 원칙

| 원칙 | 설명 |
|---|---|
| **intent → render → action** | 모든 인터랙션이 이 3단계 루프를 따름 |
| **멀티소스 통합** | 여러 API 결과를 하나의 surface에 합성 — Jium의 핵심 가치 |
| **confidence → 레이아웃** | 확신이 높으면 `card_stack`, 낮으면 `compact_overlay`로 조용하게 |
| **confirm on write** | 결제·외부 앱 이동 등 위험한 액션은 반드시 확인 |
| **심볼릭 참조** | `$home`, `$office`, `$currentLocation` 등은 서버 context 레이어가 resolve |
| **source 태그** | 멀티소스 결과의 각 항목에 출처를 표시, 렌더러가 소스별 아이콘/색상 매핑 |

## 라이선스

[Apache License 2.0](./LICENSE)
