# 시나리오: 어느 직장인의 하루

> Status: product target scenario. Endpoint examples describe the planned Jium-native JSON UI runtime, while the current runnable implementation still uses the GGUI-backed agent loop.

> Jium이 하루 동안 사용자의 맥락을 읽고 선제적으로 UI를 띄우는 end-to-end 데모 시나리오.
> 모든 요청/응답은 `services/api-gateway`의 API 엔드포인트 기준으로 기술한다.

## 전제

- 사용자: 서울 거주 직장인, 캘린더/위치 연동 완료
- Jium은 항상 **Ambient Home** 상태에서 시작
- 톤은 항상 `gentle_proactive` — 제안하지, 강제하지 않음
- 모든 surface에는 dismiss 옵션이 있음

## services/api-gateway API 요약

```
GET  /api/openapi.json          Operation Registry (planner/renderer가 참조)
POST /api/intent                transcript + context → intent 추론
POST /api/render                intent + context + registry → UiSurface (JSON)
POST /api/action                ActionEnvelope → ActionResult (data/patch/replace/dismiss/error)
```

## Multi-Source Aggregation

Jium의 핵심 가치는 **단일 API 결과를 보여주는 게 아니라, 여러 소스를 합쳐서 하나의 surface에 담는 것**이다.

- 당근 검색 결과만 띄우면 그냥 당근앱을 여는 것과 다를 바 없다.
- 당근 매물 + 지도 + 거리순 정렬이 하나의 surface에 합쳐져야 Jium만의 경험이 된다.
- 배민과 쿠팡잇츠를 나란히 비교할 수 있어야 한다.

### render 시 multi-source fetch 패턴

`POST /api/render` 과정에서 core 서버가 **여러 operation을 병렬로 호출**하고, 결과를 하나의 `UiSurface`에 합성한다.

```
POST /api/render
  → core 내부:
       ├── api-fuse: daangn.search       ──┐
       ├── api-fuse: junggo.search       ──┼── 병렬 호출
       └── api-fuse: map.resolve_coords  ──┘
  → 결과를 합성하여 단일 UiSurface 반환
       └── list (거리순 정렬, source 태그 포함) + map_preview (핀)
```

### action 시 multi-source fetch 패턴

`POST /api/action`에서도 동일하게 여러 provider를 병렬 호출할 수 있다.

```
POST /api/action { operationId: "food.compare_delivery" }
  → core 내부:
       ├── api-fuse: baemin.search   ──┐
       └── api-fuse: coupangeats.search ──┘ 병렬
  → ActionResult: replace_surface (비교 surface)
```

### UiNode에 source 태그

multi-source 결과를 구분하기 위해 `list_item`에 `source` 필드를 추가한다.

```json
{
  "type": "list_item",
  "title": "리얼포스 R3",
  "subtitle": "₩180,000 · 500m",
  "source": "당근",
  "badge": "근처"
}
```

renderer는 source별 아이콘/색상을 매핑한다. 사용자는 어떤 플랫폼의 매물인지 한눈에 구분 가능.

---

## API 라우팅 원칙

`POST /api/action`이 받은 `operationId`를 Operation Registry에서 조회하고, handler가 실행한다.
handler 내부의 라우팅은 두 갈래:

| 도메인 | handler 구현 | 이유 |
|---|---|---|
| 모빌리티 (택시 호출 등) | `src/providers/swing.ts` — 직접 연동 | write/purchase 액션, 실시간성, 커스텀 파라미터 |
| 나머지 전부 | `src/providers/api-fuse.ts` — 패스스루 | 이미 125개 operation 묶여있음 |

```
POST /api/action
  → registry.resolve(operationId)
  → handler 분기
       ├─ swing.*     → providers/swing.ts  (직접 HTTP)
       └─ 그 외 전부  → providers/api-fuse.ts (패스스루)
  → ActionResult 반환
```

---

## Scene 1-A: 아침 — Ambient Home

### 트리거

- **시간**: 평일 오전 7:40
- **캘린더**: `9:00 출근` (office: 강남역)

### 1. `POST /api/intent`

프론트엔드가 주기적으로 (또는 신호 변화 시) context를 보낸다.

**Request:**

```json
{
  "transcript": "",
  "contextWindow": [],
  "signals": {
    "time": "07:40",
    "dayOfWeek": "wednesday",
    "location": "$home",
    "nextCalendarEvent": {
      "time": "09:00",
      "label": "출근",
      "location": "강남역"
    }
  }
}
```

**Response:**

```json
{
  "intent": "morning.briefing",
  "confidence": 0.92,
  "reason": "평일 아침, 출근 일정 존재"
}
```

### 2. `POST /api/render`

**Request:**

```json
{
  "intent": "morning.briefing",
  "confidence": 0.92,
  "signals": {
    "time": "07:40",
    "location": "$home",
    "nextCalendarEvent": { "time": "09:00", "label": "출근", "location": "강남역" }
  },
  "availableOperations": ["schedule.today", "weather.forecast.current"]
}
```

**Response** — `UiSurface`:

```json
{
  "id": "surface_morning_001",
  "kind": "dashboard",
  "intent": "morning.briefing",
  "confidence": 0.92,
  "tone": "quiet",
  "layout": "card_stack",
  "components": [
    {
      "type": "calendar_block",
      "title": "오늘 일정",
      "items": [
        { "time": "09:00", "label": "출근", "location": "강남역" },
        { "time": "12:30", "label": "☕ 커피챗 — 김민수", "location": "성수동" },
        { "time": "14:00", "label": "Sprint Review" },
        { "time": "18:00", "label": "퇴근" }
      ]
    },
    {
      "type": "weather_card",
      "temperature": "24°C",
      "condition": "흐리고 오후 소나기",
      "high": "28°C",
      "low": "19°C",
      "advisory": "우산 챙기세요"
    }
  ]
}
```

> render 과정에서 core 서버가 내부적으로 `schedule.today`, `weather.forecast.current`를 API Fuse 패스스루로 호출하여 데이터를 채운다.

### 화면

캘린더 타임라인이 위에, 날씨 카드가 아래에 차분하게 깔려있음. 액션 버튼 없이 정보만.

### 호출된 operation (core 서버 내부)

| operationId | provider | risk |
|---|---|---|
| `schedule.today` | api-fuse.ts | read |
| `weather.forecast.current` | api-fuse.ts | read |

---

## Scene 1-B: 시간이 촉박해짐 — "지각이다!"

### 트리거

- **시간**: 오전 8:25 (아직 집)
- **위치**: `$home`
- 출근까지 35분 남음, 대중교통 50분 → 시간 부족

### 1. `POST /api/intent`

**Request:**

```json
{
  "transcript": "",
  "contextWindow": [],
  "signals": {
    "time": "08:25",
    "location": "$home",
    "nextCalendarEvent": {
      "time": "09:00",
      "label": "출근",
      "location": "강남역"
    },
    "transitEstimate": {
      "publicTransport": "50min",
      "taxi": "25min"
    }
  }
}
```

**Response:**

```json
{
  "intent": "transport.time_pressure",
  "confidence": 0.88,
  "reason": "출근까지 35분, 대중교통 50분 소요 — 시간 부족"
}
```

### 2. `POST /api/render`

**Request:**

```json
{
  "intent": "transport.time_pressure",
  "confidence": 0.88,
  "signals": {
    "time": "08:25",
    "location": "$home",
    "destination": "$office",
    "transitEstimate": { "publicTransport": "50min", "taxi": "25min" }
  },
  "availableOperations": ["swing.taxi.search", "swing.taxi.call"]
}
```

**Response** — `UiSurface`:

```json
{
  "id": "surface_taxi_001",
  "kind": "suggestion",
  "intent": "transport.need_ride",
  "confidence": 0.88,
  "tone": "gentle_proactive",
  "layout": "compact_overlay",
  "components": [
    {
      "type": "hero_card",
      "title": "택시 부를까요?",
      "description": "대중교통이면 9:15 도착이에요. 택시는 8:55 도착 예상.",
      "emphasis": "medium"
    },
    {
      "type": "map_preview",
      "from": "$home",
      "to": "$office",
      "estimatedTime": "25분",
      "estimatedCost": "₩14,000"
    },
    {
      "type": "action_row",
      "actions": [
        {
          "label": "택시 보기",
          "operationId": "swing.taxi.search",
          "params": { "from": "$home", "to": "$office" },
          "style": "primary"
        },
        {
          "label": "괜찮아요",
          "operationId": "surface.dismiss",
          "style": "ghost"
        }
      ]
    }
  ]
}
```

### 화면

아래에서 슬라이드업하는 오버레이. 지도 미리보기에 집→회사 경로.

### 3. 사용자 액션: "택시 보기" 탭 → `POST /api/action`

**Request** — `ActionEnvelope`:

```json
{
  "surfaceId": "surface_taxi_001",
  "operationId": "swing.taxi.search",
  "params": {
    "from": "$home",
    "to": "$office"
  }
}
```

core 서버 처리:
1. `registry.resolve("swing.taxi.search")` → `providers/swing.ts`
2. `$home`, `$office` 심볼릭 참조를 context에서 실제 좌표로 resolve
3. Swing API 직접 호출
4. 결과를 `ActionResult`로 반환

**Response** — `ActionResult` (`kind: 'replace_surface'`):

```json
{
  "kind": "replace_surface",
  "surface": {
    "id": "surface_taxi_001",
    "kind": "result",
    "intent": "transport.need_ride",
    "confidence": 0.95,
    "tone": "confirming",
    "layout": "card_stack",
    "components": [
      {
        "type": "list",
        "items": [
          {
            "type": "list_item",
            "title": "일반택시",
            "subtitle": "약 4분 후 도착 · ₩14,200",
            "badge": "최저가"
          },
          {
            "type": "list_item",
            "title": "모범택시",
            "subtitle": "약 3분 후 도착 · ₩21,000"
          },
          {
            "type": "list_item",
            "title": "벤티",
            "subtitle": "약 7분 후 도착 · ₩24,500"
          }
        ]
      },
      {
        "type": "action_row",
        "actions": [
          {
            "label": "일반택시 호출",
            "operationId": "swing.taxi.call",
            "params": { "type": "standard", "from": "$home", "to": "$office" },
            "style": "primary",
            "confirm": true
          },
          {
            "label": "취소",
            "operationId": "surface.dismiss",
            "style": "ghost"
          }
        ]
      }
    ]
  }
}
```

### 화면

풀 카드로 확장. 택시 3개 옵션. `confirm: true`라서 호출 전 한 번 더 확인.

### 호출된 operation

| operationId | provider | risk |
|---|---|---|
| `swing.taxi.search` | swing.ts (직접) | read |
| `swing.taxi.call` | swing.ts (직접) | purchase, confirm 필수 |

---

## Scene 2: 오전 — 출근 후 조용히

### 트리거

- **위치**: `$office` 도착
- **시간**: 오전 9시~12시

### 1. `POST /api/intent`

**Request:**

```json
{
  "transcript": "",
  "contextWindow": [],
  "signals": {
    "time": "09:05",
    "location": "$office",
    "nextCalendarEvent": {
      "time": "12:30",
      "label": "커피챗 — 김민수",
      "location": "성수동"
    }
  }
}
```

**Response:**

```json
{
  "intent": "idle",
  "confidence": 1.0,
  "reason": "근무 중, 다음 일정까지 3시간 이상"
}
```

### 2. `POST /api/render`

`intent: "idle"` → 최소한의 Ambient Home surface.

**Response** — `UiSurface`:

```json
{
  "id": "surface_ambient",
  "kind": "status",
  "intent": "idle",
  "confidence": 1.0,
  "tone": "quiet",
  "layout": "compact_overlay",
  "components": [
    {
      "type": "status_badge",
      "label": "다음 일정",
      "value": "12:30 커피챗 — 김민수 (성수동)"
    }
  ]
}
```

### 화면

화면 상단에 작은 배지 하나. 일하는 동안 방해하지 않음.

### 호출된 operation

없음. intent가 `idle`이므로 외부 API 호출 없이 캘린더 캐시만 사용.

---

## Scene 3: 점심 전 — "커피챗 장소 찾아야지"

### 트리거

- **시간**: 오전 11:50
- **캘린더**: `12:30 커피챗 — 김민수` (location: 성수동) 40분 전

### 1. `POST /api/intent`

**Request:**

```json
{
  "transcript": "",
  "contextWindow": [],
  "signals": {
    "time": "11:50",
    "location": "$office",
    "nextCalendarEvent": {
      "time": "12:30",
      "label": "커피챗 — 김민수",
      "location": "성수동",
      "minutesUntil": 40,
      "hasExactVenue": false
    }
  }
}
```

**Response:**

```json
{
  "intent": "venue.find_cafe",
  "confidence": 0.82,
  "reason": "40분 후 커피챗인데 구체적 장소 없음"
}
```

### 2. `POST /api/render`

**Request:**

```json
{
  "intent": "venue.find_cafe",
  "confidence": 0.82,
  "signals": {
    "meetingWith": "김민수",
    "area": "성수동",
    "minutesUntil": 40
  },
  "availableOperations": ["venue.search_cafe", "venue.search_more", "calendar.update_location"]
}
```

> core 서버가 내부적으로 `venue.search_cafe`를 API Fuse 패스스루로 호출하여 카페 데이터를 가져온 뒤 surface에 채운다.

**Response** — `UiSurface`:

```json
{
  "id": "surface_cafe_001",
  "kind": "suggestion",
  "intent": "venue.find_cafe",
  "confidence": 0.82,
  "tone": "gentle_proactive",
  "layout": "card_stack",
  "components": [
    {
      "type": "hero_card",
      "title": "커피챗 카페 찾아볼까요?",
      "description": "12:30 김민수님과 성수동 커피챗이에요. 근처 카페를 골라둘게요.",
      "emphasis": "medium"
    },
    {
      "type": "map_preview",
      "center": "성수동",
      "radius": "500m",
      "pins": ["cafe"]
    },
    {
      "type": "list",
      "items": [
        {
          "type": "list_item",
          "title": "블루보틀 성수",
          "subtitle": "도보 3분 · 지금 여유 · ★ 4.5",
          "badge": "조용함"
        },
        {
          "type": "list_item",
          "title": "카페 어니언 성수",
          "subtitle": "도보 5분 · 웨이팅 있음 · ★ 4.7"
        },
        {
          "type": "list_item",
          "title": "할아버지공장",
          "subtitle": "도보 7분 · 지금 여유 · ★ 4.3"
        }
      ]
    },
    {
      "type": "action_row",
      "actions": [
        {
          "label": "블루보틀 성수로 할게요",
          "operationId": "calendar.update_location",
          "params": { "eventId": "$nextEvent", "location": "블루보틀 성수" },
          "style": "primary"
        },
        {
          "label": "더 볼게요",
          "operationId": "venue.search_more",
          "params": { "area": "성수동", "type": "cafe" },
          "style": "secondary"
        },
        {
          "label": "직접 정할게요",
          "operationId": "surface.dismiss",
          "style": "ghost"
        }
      ]
    }
  ]
}
```

### 3. 사용자 액션: "블루보틀 성수로 할게요" 탭 → `POST /api/action`

**Request** — `ActionEnvelope`:

```json
{
  "surfaceId": "surface_cafe_001",
  "operationId": "calendar.update_location",
  "params": {
    "eventId": "$nextEvent",
    "location": "블루보틀 성수"
  }
}
```

core 서버 처리:
1. `registry.resolve("calendar.update_location")` → `providers/api-fuse.ts`
2. `$nextEvent` → context에서 실제 event ID로 resolve
3. API Fuse 패스스루 호출
4. 성공 시 surface 업데이트

**Response** — `ActionResult` (`kind: 'patch'`):

```json
{
  "kind": "patch",
  "patch": {
    "surfaceId": "surface_cafe_001",
    "mode": "set_status",
    "status": "success"
  }
}
```

### 화면

성수동 지도 + 카페 핀. 카페 3곳 리스트. 선택하면 캘린더 장소 업데이트 후 success 상태.

### 호출된 operation

| operationId | provider | risk |
|---|---|---|
| `venue.search_cafe` | api-fuse.ts | read |
| `calendar.update_location` | api-fuse.ts | write |

---

## Scene 4: 커피챗 중 — "이거 좋다!" (Multi-Source: 당근 + 중고나라 + 지도)

### 트리거

- **대화 맥락** (음성 STT):
  - 김민수: "이 키보드 진짜 좋다. 리얼포스인데..."
  - 사용자: "오 좋다. 나도 하나 갖고 싶다."

### 1. `POST /api/intent`

**Request:**

```json
{
  "transcript": "오 좋다. 나도 하나 갖고 싶다.",
  "contextWindow": [
    { "speaker": "other", "text": "이 키보드 진짜 좋다. 리얼포스인데..." },
    { "speaker": "user", "text": "오 좋다. 나도 하나 갖고 싶다." }
  ],
  "signals": {
    "time": "12:45",
    "location": "성수동"
  }
}
```

**Response:**

```json
{
  "intent": "shopping.want_item",
  "confidence": 0.78,
  "reason": "대화에서 '갖고 싶다' 표현 + 구체적 제품명 감지",
  "entities": [
    { "type": "product", "value": "리얼포스 키보드" }
  ]
}
```

### 2. `POST /api/render`

**Request:**

```json
{
  "intent": "shopping.want_item",
  "confidence": 0.78,
  "signals": {
    "location": "성수동",
    "entity": "리얼포스 키보드"
  },
  "availableOperations": ["daangn.search", "junggo.search", "map.resolve_coords"]
}
```

confidence가 0.78로 낮으므로 `compact_overlay`로 조용하게 제안.

**Response** — `UiSurface`:

```json
{
  "id": "surface_market_001",
  "kind": "suggestion",
  "intent": "shopping.secondhand_search",
  "confidence": 0.78,
  "tone": "gentle_proactive",
  "layout": "compact_overlay",
  "components": [
    {
      "type": "hero_card",
      "title": "리얼포스 중고 찾아볼까요?",
      "description": "대화에서 리얼포스 키보드에 관심이 있으신 것 같아요.",
      "emphasis": "low"
    },
    {
      "type": "action_row",
      "actions": [
        {
          "label": "중고 매물 보기",
          "operationId": "shopping.search_secondhand",
          "params": { "keyword": "리얼포스 키보드", "location": "$currentLocation" },
          "style": "primary"
        },
        {
          "label": "됐어요",
          "operationId": "surface.dismiss",
          "style": "ghost"
        }
      ]
    }
  ]
}
```

### 3. 사용자 액션: "중고 매물 보기" 탭 → `POST /api/action`

**Request** — `ActionEnvelope`:

```json
{
  "surfaceId": "surface_market_001",
  "operationId": "shopping.search_secondhand",
  "params": {
    "keyword": "리얼포스 키보드",
    "location": "$currentLocation"
  }
}
```

core 서버 처리 — **multi-source aggregation**:
1. `registry.resolve("shopping.search_secondhand")` → 내장 composite handler
2. `$currentLocation` → 실제 좌표로 resolve (성수동 37.5445, 127.0567)
3. **병렬 호출**:
   - `api-fuse: daangn.search` → 당근 매물 N건
   - `api-fuse: junggo.search` → 중고나라 매물 N건
   - `api-fuse: map.resolve_coords` → 각 매물의 판매자 위치를 좌표로 변환
4. 결과를 **거리순 정렬**하여 합성, `source` 태그로 출처 구분
5. `map_preview`에 매물 위치 핀을 함께 포함

**Response** — `ActionResult` (`kind: 'replace_surface'`):

```json
{
  "kind": "replace_surface",
  "surface": {
    "id": "surface_market_001",
    "kind": "result",
    "intent": "shopping.secondhand_search",
    "confidence": 0.92,
    "tone": "confirming",
    "layout": "card_stack",
    "components": [
      {
        "type": "map_preview",
        "center": "$currentLocation",
        "radius": "5km",
        "pins": [
          { "label": "R3 풀배열", "source": "당근", "distance": "500m" },
          { "label": "87U 텐키리스", "source": "중고나라", "distance": "2.1km" },
          { "label": "R2 PFU", "source": "당근", "distance": "4.3km" }
        ]
      },
      {
        "type": "list",
        "sortedBy": "distance",
        "items": [
          {
            "type": "list_item",
            "title": "리얼포스 R3 풀배열 (저소음)",
            "subtitle": "₩180,000 · 3일 전 · 500m",
            "source": "당근",
            "badge": "가장 가까움"
          },
          {
            "type": "list_item",
            "title": "리얼포스 87U 텐키리스",
            "subtitle": "₩150,000 · 1주 전 · 2.1km",
            "source": "중고나라"
          },
          {
            "type": "list_item",
            "title": "리얼포스 R2 PFU Limited",
            "subtitle": "₩220,000 · 2일 전 · 4.3km",
            "source": "당근",
            "badge": "인기"
          },
          {
            "type": "list_item",
            "title": "리얼포스 R3 무접점 (블랙)",
            "subtitle": "₩200,000 · 5일 전 · 6.7km",
            "source": "중고나라"
          }
        ]
      },
      {
        "type": "action_row",
        "actions": [
          {
            "label": "당근앱에서 열기",
            "operationId": "external.open_app",
            "params": { "app": "daangn", "deeplink": "search?q=리얼포스" },
            "style": "secondary",
            "confirm": true
          },
          {
            "label": "중고나라에서 열기",
            "operationId": "external.open_app",
            "params": { "app": "junggo", "deeplink": "search?q=리얼포스" },
            "style": "secondary",
            "confirm": true
          },
          {
            "label": "새 매물 알림",
            "operationId": "alert.create",
            "params": { "keyword": "리얼포스 키보드", "sources": ["daangn", "junggo"] },
            "style": "ghost"
          }
        ]
      }
    ]
  }
}
```

### 화면

**지도 + 통합 리스트**가 하나의 surface에. 지도에 매물 위치 핀이 찍혀있고 (당근은 주황, 중고나라는 파랑 등 source별 색상), 아래에 거리순 정렬된 리스트. 각 아이템에 `source` 태그로 어떤 플랫폼인지 표시. 알림은 두 플랫폼 모두에 걸 수 있음.

### 호출된 operation (core 내부 병렬)

| operationId | provider | risk | 비고 |
|---|---|---|---|
| `daangn.search` | api-fuse.ts | read | 당근 매물 |
| `junggo.search` | api-fuse.ts | read | 중고나라 매물 |
| `map.resolve_coords` | api-fuse.ts | read | 주소→좌표 변환 |
| `external.open_app` | 내장 (core) | external_navigation | 각 플랫폼 딥링크 |
| `alert.create` | 내장 (core) | write | multi-source 알림 |

---

## Scene 5: 퇴근 전 — "밥 먹으러 가자" (Multi-Source: 배민 + 쿠팡잇츠 비교)

### 트리거

- **대화 맥락** (음성 STT):
  - 동료: "오늘 야근이네. 뭐 시켜 먹을까?"
  - 사용자: "치킨 먹고 싶다."

### 1. `POST /api/intent`

**Request:**

```json
{
  "transcript": "치킨 먹고 싶다.",
  "contextWindow": [
    { "speaker": "other", "text": "오늘 야근이네. 뭐 시켜 먹을까?" },
    { "speaker": "user", "text": "치킨 먹고 싶다." }
  ],
  "signals": {
    "time": "18:30",
    "location": "$office"
  }
}
```

**Response:**

```json
{
  "intent": "food.delivery_order",
  "confidence": 0.91,
  "reason": "야근 맥락에서 '시켜 먹자' + 구체적 음식 언급",
  "entities": [
    { "type": "food", "value": "치킨" }
  ]
}
```

### 2. `POST /api/render`

**Request:**

```json
{
  "intent": "food.delivery_order",
  "confidence": 0.91,
  "signals": {
    "location": "$office",
    "entity": "치킨"
  },
  "availableOperations": ["baemin.search", "coupangeats.search"]
}
```

> core 서버가 **배민 + 쿠팡잇츠를 병렬로 호출**하고 결과를 비교 surface로 합성한다.

**Response** — `UiSurface`:

```json
{
  "id": "surface_food_001",
  "kind": "result",
  "intent": "food.delivery_order",
  "confidence": 0.91,
  "tone": "gentle_proactive",
  "layout": "card_stack",
  "components": [
    {
      "type": "hero_card",
      "title": "치킨 배달 비교",
      "description": "배민과 쿠팡잇츠에서 회사 근처 치킨집을 찾았어요.",
      "emphasis": "medium"
    },
    {
      "type": "section",
      "title": "교촌치킨 강남점",
      "components": [
        {
          "type": "list",
          "items": [
            {
              "type": "list_item",
              "title": "배민",
              "subtitle": "허니콤보 ₩18,000 · 배달비 ₩2,000 · 35분",
              "source": "배민",
              "badge": "배달비 저렴"
            },
            {
              "type": "list_item",
              "title": "쿠팡잇츠",
              "subtitle": "허니콤보 ₩18,000 · 배달비 ₩0 · 28분",
              "source": "쿠팡잇츠",
              "badge": "빠른 배달"
            }
          ]
        }
      ]
    },
    {
      "type": "section",
      "title": "BBQ 역삼점",
      "components": [
        {
          "type": "list",
          "items": [
            {
              "type": "list_item",
              "title": "배민",
              "subtitle": "황금올리브 ₩20,000 · 배달비 ₩3,000 · 40분",
              "source": "배민"
            },
            {
              "type": "list_item",
              "title": "쿠팡잇츠",
              "subtitle": "황금올리브 ₩20,000 · 배달비 ₩1,000 · 32분",
              "source": "쿠팡잇츠",
              "badge": "최저 총액"
            }
          ]
        }
      ]
    },
    {
      "type": "action_row",
      "actions": [
        {
          "label": "배민에서 주문",
          "operationId": "external.open_app",
          "params": { "app": "baemin", "deeplink": "search?q=치킨&sort=nearby" },
          "style": "secondary",
          "confirm": true
        },
        {
          "label": "쿠팡잇츠에서 주문",
          "operationId": "external.open_app",
          "params": { "app": "coupangeats", "deeplink": "search?q=치킨" },
          "style": "secondary",
          "confirm": true
        },
        {
          "label": "됐어요",
          "operationId": "surface.dismiss",
          "style": "ghost"
        }
      ]
    }
  ]
}
```

### 화면

**같은 가게를 플랫폼별로 나란히 비교**하는 구조. 교촌치킨에서 배민은 배달비 ₩2,000이지만 쿠팡잇츠는 ₩0, 대신 배민이 좀 더 느림 — 이런 비교가 한눈에 보임. 각 항목에 `source` 태그 + 장점별 badge. 최종 주문은 해당 앱으로 이동.

### 호출된 operation (core 내부 병렬)

| operationId | provider | risk | 비고 |
|---|---|---|---|
| `baemin.search` | api-fuse.ts | read | 배민 검색 |
| `coupangeats.search` | api-fuse.ts | read | 쿠팡잇츠 검색 |
| `external.open_app` | 내장 (core) | external_navigation | 각 앱 딥링크 |

---

## 전체 흐름: API 호출 시퀀스

```
07:40  Browser ─── POST /api/intent ──→ core ──→ { intent: "morning.briefing" }
       Browser ─── POST /api/render ──→ core ──→ UiSurface (dashboard)
                                         ├── api-fuse: schedule.today
                                         └── api-fuse: weather.forecast.current
       Browser ◀── UiSurface (calendar + weather)

08:25  Browser ─── POST /api/intent ──→ core ──→ { intent: "transport.time_pressure" }
       Browser ─── POST /api/render ──→ core ──→ UiSurface (taxi suggestion)
       Browser ◀── UiSurface (compact_overlay)

       User taps "택시 보기"
       Browser ─── POST /api/action ──→ core
                                         └── swing.ts: swing.taxi.search (직접)
       Browser ◀── ActionResult: replace_surface (taxi list)

       User taps "일반택시 호출" (confirm dialog)
       Browser ─── POST /api/action ──→ core
                                         └── swing.ts: swing.taxi.call (직접)
       Browser ◀── ActionResult: patch (success)

09:00  Browser ─── POST /api/intent ──→ core ──→ { intent: "idle" }
~11:50 Browser ─── POST /api/render ──→ core ──→ UiSurface (status_badge)

11:50  Browser ─── POST /api/intent ──→ core ──→ { intent: "venue.find_cafe" }
       Browser ─── POST /api/render ──→ core ──→ UiSurface (cafe suggestion)
                                         └── api-fuse: venue.search_cafe
       Browser ◀── UiSurface (card_stack)

       User taps "블루보틀 성수로 할게요"
       Browser ─── POST /api/action ──→ core
                                         └── api-fuse: calendar.update_location
       Browser ◀── ActionResult: patch (success)

12:45  Browser ─── POST /api/intent ──→ core ──→ { intent: "shopping.want_item" }
       Browser ─── POST /api/render ──→ core ──→ UiSurface (compact_overlay)
       Browser ◀── UiSurface

       User taps "중고 매물 보기"                              ← MULTI-SOURCE
       Browser ─── POST /api/action ──→ core
                                         ├── api-fuse: daangn.search      ──┐
                                         ├── api-fuse: junggo.search      ──┼─ 병렬
                                         └── api-fuse: map.resolve_coords ──┘
                                         → 거리순 정렬 + source 태그 합성
       Browser ◀── ActionResult: replace_surface (지도 + 통합 리스트)

18:30  Browser ─── POST /api/intent ──→ core ──→ { intent: "food.delivery_order" }
       Browser ─── POST /api/render ──→ core                   ← MULTI-SOURCE
                                         ├── api-fuse: baemin.search      ──┐
                                         └── api-fuse: coupangeats.search ──┘ 병렬
                                         → 같은 가게 기준 플랫폼 비교 합성
       Browser ◀── UiSurface (가게별 비교 card_stack)
```

---

## 시나리오 흐름 요약

```
07:40  ┌─ Ambient Home ──────────────────────┐
       │  📅 오늘 일정  +  🌤️ 날씨           │  quiet / dashboard
       │  intent → render (api-fuse 2건)     │
       └─────────────────────────────────────┘
                    │
08:25  ┌─ 택시 제안 ─────────────────────────┐
       │  🚕 "택시 부를까요?"                 │  gentle_proactive / compact_overlay
       │  🗺️ 집→회사 경로 + 예상 시간/요금    │
       │  [택시 보기]  [괜찮아요]              │  intent → render
       └─────────────────────────────────────┘
                    │ action (swing.taxi.search)
       ┌─ 택시 결과 ─────────────────────────┐
       │  일반택시  4분 · ₩14,200  [최저가]   │  confirming / card_stack
       │  모범택시  3분 · ₩21,000             │  replace_surface
       │  벤티      7분 · ₩24,500             │
       │  [일반택시 호출]  [취소]              │  action (swing.taxi.call, confirm)
       └─────────────────────────────────────┘
                    │
09:00  ┌─ Ambient (조용) ────────────────────┐
~11:50 │  다음: 12:30 커피챗 — 김민수 (성수동) │  idle → render (no API)
       └─────────────────────────────────────┘
                    │
11:50  ┌─ 카페 추천 ─────────────────────────┐
       │  ☕ "커피챗 카페 찾아볼까요?"         │  intent → render (api-fuse 1건)
       │  🗺️ 성수동 지도 + 카페 핀            │
       │  블루보틀 · 카페어니언 · 할공         │
       │  [블루보틀로] [더 볼게요]             │  action (api-fuse)
       └─────────────────────────────────────┘
                    │
12:45  ┌─ 중고거래 제안 ─────────────────────┐
       │  ⌨️ "리얼포스 중고 찾아볼까요?"       │  intent → render (compact_overlay)
       │  [중고 매물 보기]  [됐어요]           │
       └─────────────────────────────────────┘
                    │ action (multi-source: 당근 + 중고나라 + 지도)
       ┌─ 중고 통합 검색 ───────────────────────────┐
       │  🗺️ 지도 + 매물 핀 (source별 색상)          │  replace_surface
       │  R3 풀배열 · ₩180,000 · 500m  [당근] [근처] │  거리순 정렬
       │  87U 텐키리스 · ₩150,000 · 2.1km [중고나라] │  source 태그
       │  R2 PFU · ₩220,000 · 4.3km [당근] [인기]   │
       │  [당근앱] [중고나라앱] [새 매물 알림]        │
       └────────────────────────────────────────────┘
                    │
18:30  ┌─ 배달 비교 ─────────────────────────────────┐
       │  🍗 "치킨 배달 비교"                         │  multi-source render
       │                                              │
       │  교촌치킨 강남점                              │
       │    배민     허니콤보 ₩18k + 배달비 ₩2k · 35분 │  [배달비 저렴]
       │    쿠팡잇츠  허니콤보 ₩18k + 배달비 ₩0 · 28분 │  [빠른 배달]
       │                                              │
       │  BBQ 역삼점                                   │
       │    배민     황올 ₩20k + 배달비 ₩3k · 40분     │
       │    쿠팡잇츠  황올 ₩20k + 배달비 ₩1k · 32분    │  [최저 총액]
       │                                              │
       │  [배민에서 주문] [쿠팡잇츠에서 주문] [됐어요]  │
       └──────────────────────────────────────────────┘
```

---

## Operation Registry 전체

### providers/swing.ts — 직접 연동

| operationId | risk | 설명 |
|---|---|---|
| `swing.taxi.search` | read | 실시간 차량 조회 |
| `swing.taxi.call` | purchase | 택시 호출, `requiresConfirmation: true` |

### providers/api-fuse.ts — 패스스루

| operationId | risk | 설명 |
|---|---|---|
| `schedule.today` | read | 오늘 캘린더 조회 |
| `weather.forecast.current` | read | 현재 날씨 |
| `venue.search_cafe` | read | 주변 카페 검색 |
| `venue.search_more` | read | 추가 장소 검색 |
| `calendar.update_location` | write | 캘린더 이벤트 장소 수정 |
| `daangn.search` | read | 당근 중고 검색 |
| `junggo.search` | read | 중고나라 검색 |
| `map.resolve_coords` | read | 주소→좌표 변환 (거리 계산용) |
| `baemin.search` | read | 배민 배달 검색 |
| `coupangeats.search` | read | 쿠팡잇츠 배달 검색 |

### 내장 (core 자체)

| operationId | risk | 설명 |
|---|---|---|
| `surface.dismiss` | — | 프론트엔드 로컬 처리, 서버 호출 없음 |
| `external.open_app` | external_navigation | 딥링크로 외부 앱 열기, `requiresConfirmation: true` |
| `alert.create` | write | 키워드 알림 설정 |
| `shopping.search_secondhand` | — | composite handler: 당근 + 중고나라 + 지도 병렬 → 거리순 합성 |

---

## 설계 원칙

| 원칙 | 이 시나리오에서의 적용 |
|---|---|
| intent → render → action 3단계 | 모든 scene이 이 흐름을 따름 |
| **multi-source aggregation** | 단일 API 결과가 아니라 여러 소스를 합쳐서 하나의 surface에 담음 — Jium의 핵심 가치 |
| API Fuse 우선 | 모빌리티 외 전부 패스스루 |
| 심볼릭 참조 resolve | `$home`, `$office`, `$currentLocation`, `$nextEvent`는 core 서버의 context layer가 resolve |
| confidence → 레이아웃 | 높으면 card_stack, 낮으면 compact_overlay |
| confirm on write | purchase/external_navigation 액션은 `requiresConfirmation: true` |
| render 시 data fetch | render 과정에서 core가 필요한 operation을 내부 병렬 호출하여 데이터를 미리 채움 |
| action은 순수 실행 | 사용자 탭 → ActionEnvelope → core → provider(s) → ActionResult |
| source 태그 구분 | multi-source 결과의 각 list_item에 `source` 필드로 출처 표시, renderer가 source별 아이콘/색상 매핑 |
| 비교 surface | 같은 대상(가게/매물)을 플랫폼별로 나란히 비교 — 가격, 배달비, 시간 등 |
