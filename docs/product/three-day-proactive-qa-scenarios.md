# 3-Day Proactive QA Scenarios

> Status: product QA scenario declarations. These flows describe the target Jium-native `intent → render → action` runtime and map each scene back to the current runnable stack: `apps/web` → `apps/agent` → MCP `services/api-gateway` tools (`search`, `get_schema`, `execute`, `batch`) plus `services/ggui` rendering.

## Goal

These scenarios prove that Jium is not a chat-first assistant. Jium should quietly infer a useful next surface from calendar, location, time, weather, recurring habits, and ambient audio context, then let the user confirm, dismiss, or lightly edit.

Non-negotiables:

- The primary trigger is context, not a direct command.
- Audio is weak context unless the user clearly expresses intent.
- Every proactive surface has a dismiss path.
- Multi-source results include visible `source` provenance.
- Write, purchase, booking, external navigation, courier instruction, and persistent notification actions require confirmation.
- Quiet/no-op behavior is valid when confidence is low or no useful next action exists.

## Runtime contract

### Target flow

```txt
signals + contextWindow + transcript
  → POST /api/intent
  → intent + confidence + entities + reason
  → POST /api/render
  → UiSurface(JSON)
  → user action
  → POST /api/action
  → ActionResult: patch / replace_surface / dismiss / error / external_navigation
```

### Current-stack QA mapping

Until the native `/api/*` endpoints exist, QA can inject fixture context through the current web shell and verify that the agent uses MCP gateway tools:

```txt
apps/web simulated-context prompt
  → apps/agent /agent
  → services/api-gateway MCP
      search(query)
      get_schema(toolName)
      execute(toolName, input)
      batch(actions, concurrency)
  → services/ggui render
  → apps/web modes: idle → tooling → generating → presenting
```

Current gateway routing:

| Tool shape | Route |
|---|---|
| `swing_*` | Swing direct client |
| `*__*` | API Fuse MCP `executeTool` |
| `apifuse.{provider}.{operation}` | API Fuse REST fallback |
| `mobility.*` | legacy alias to Swing |

---

# Day 1: Office commuter

Persona: Seoul office worker. Calendar, home/office location, weather, and mobility preferences are connected. The user rarely asks Jium directly.

## Day 1-A. Morning ambient briefing

### Hook

- Time: weekday `07:35`.
- Location: `$home`.
- Calendar: `09:00 출근`, `12:30 커피챗 — 성수동`, `18:00 퇴근`.
- Weather: afternoon rain probability `70%`.
- Transcript: empty.

### Flow

1. `POST /api/intent`
   - Expected `intent: "morning.briefing"`.
   - Confidence `>= 0.9`.
   - Reason includes weekday morning, commute, and weather risk.
2. `POST /api/render`
   - Operations: `schedule.today`, `weather.forecast.current`, optionally `air.pollution.current`.
   - Core fetches schedule/weather in parallel.
   - Surface:
     - `kind: "dashboard"`
     - `tone: "quiet"`
     - `layout: "card_stack"`
     - Components: `calendar_block`, `weather_card`, `status_badge`, `action_row`.
     - Actions: “우산 알림 켜기”, “닫기”.

### Expected result

Jium opens as Ambient Home. The user sees today’s shape without typing: schedule, weather, and one subtle reminder option.

### QA validation

| Check | Pass condition |
|---|---|
| Proactivity | Empty transcript still produces the briefing. |
| Quietness | No urgent modal or chatty question. |
| Render | Uses known UI vocabulary only. |
| Current stack | `search("오늘 일정 날씨 미세먼지")` discovers weather/schedule-like tools where credentials support them. |
| Failure | If weather fails, schedule still renders with a visible missing-weather card. |

## Day 1-B. Commute risk rescue

### Hook

- Time: `08:22`.
- Location: still `$home`.
- Calendar: `09:00 강남역 출근`.
- Transit estimate: public transit `50min`, taxi `25min`.
- Weather: rain starts around `08:40`; PM/scooter less suitable.
- Transcript: empty.

### Flow

1. `POST /api/intent`
   - Expected `intent: "transport.time_pressure"`.
   - Confidence `>= 0.86`.
   - Entities: `origin: $home`, `destination: $office`, `deadline: 09:00`.
2. `POST /api/render`
   - Operations: `swing.taxi.search`, `swing.pm.nearby`, route/weather operations.
   - Core resolves `$home/$office` coordinates.
   - Surface:
     - `kind: "suggestion"`
     - `tone: "gentle_proactive"`; `urgent` only if lateness is unavoidable.
     - `layout: "compact_overlay"`
     - Components: `hero_card`, `map_preview`, transport comparison `list`, `action_row`.
     - PM/scooter row is disabled or de-emphasized when rain makes it unsafe.
3. User taps “택시 보기”.
4. `POST /api/action` executes `swing.taxi.search` and returns `replace_surface` with taxi options.
5. User taps “일반택시 호출”; `swing.taxi.call` requires confirmation.

### Expected result

The user can decide from one screen whether to take a taxi, stay with transit, or dismiss. The user did not type “택시 불러줘”.

### QA validation

| Check | Pass condition |
|---|---|
| Evidence | Surface includes arrival delta, fare estimate, and rain caveat. |
| Provider use | Swing handles taxi/PM; API Fuse handles route/weather if available. |
| Current stack | `search("택시 요금 강남역")` returns Swing capability such as `swing_taxi_eta`; `execute` is used for ETA/search. |
| Safety | Taxi call has `confirm: true`; ETA/search does not. |
| Failure | If Swing fails, no fake call button is shown. |

## Day 1-C. Coffee-chat venue prefill

### Hook

- Time: `11:45`.
- Calendar: `12:30 커피챗 — 김민수`, area `성수동`, exact venue missing.
- Location: `$office`.
- Audio context: coworker says “성수는 낮에 사람 많더라.” User only says “응 그러게.”

### Flow

1. `POST /api/intent`
   - Expected `intent: "venue.find_cafe"`.
   - Confidence `0.78-0.86`.
   - Reason: meeting soon + missing venue; audio adds crowd preference but is not required.
2. `POST /api/render`
   - Operations: `venue.search_cafe`, `map.resolve_coords`, optional open-hours/crowd tool.
   - Surface:
     - `kind: "suggestion"`
     - `layout: "card_stack"` because the meeting is soon.
     - Components: `hero_card`, `map_preview`, source-tagged cafe `list`, `action_row`.
     - Actions: “캘린더에 저장”, “더 볼게요”, “직접 정할게요”.
3. User taps “캘린더에 저장”.
4. `POST /api/action` executes `calendar.update_location` and returns success `patch`.

### Expected result

The user gets three suitable cafes and can update the calendar with one tap. Jium should not ask the user to type a venue query.

### QA validation

| Check | Pass condition |
|---|---|
| Trigger | Exact venue missing is enough to create the surface. |
| Audio use | Audio modifies ranking/copy, not a direct command. |
| Current stack | `search("성수동 카페 조용한 곳")` maps Korean cafe/place keywords to API Fuse search. |
| Action | Calendar update returns `patch` with success status. |
| Failure | Empty cafe results show map/dismiss fallback, not random cafes. |

## Day 1-D. Evening food comparison

### Hook

- Time: `18:35`.
- Location: `$office`.
- Work signal: late meeting extended to `20:00`.
- Audio context: coworker says “저녁 시켜야겠다.” User says “가볍게 먹자.”

### Flow

1. `POST /api/intent`
   - Expected `intent: "food.delivery_compare"`.
   - Confidence `>= 0.8`.
   - Entities: dinner, light meal preference, office location.
2. `POST /api/render`
   - Operations: `baemin.search`, `coupangeats.search`, optionally `yogiyo.search`.
   - Core calls providers in parallel and merges by same/similar restaurant.
   - Surface:
     - `hero_card`: “가벼운 저녁 후보를 배달비까지 비교했어요.”
     - grouped `section` per restaurant.
     - platform `list_item`s with menu price, delivery fee, ETA, and `source`.
     - external order actions with confirmation.

### Expected result

The surface makes app switching unnecessary for the comparison step. The user only leaves Jium if they choose to order.

### QA validation

| Check | Pass condition |
|---|---|
| Multi-source | At least two delivery sources appear when available. |
| Comparison | Same restaurant/menu is grouped; not a raw mixed search dump. |
| Current stack | `search("배달 음식점 가벼운 저녁")` uses Korean delivery/restaurant mapping and `batch` for multiple providers if available. |
| External nav | “배민에서 주문”, “쿠팡잇츠에서 주문” require confirmation. |
| Failure | If one provider fails, remaining provider renders with “일부 플랫폼 결과 없음.” |

---

# Day 2: Remote worker and parent

Persona: Parent/freelancer with remote work and errands. Jium combines schedule, family logistics, grocery habits, delivery, weather, and ambient audio.

## Day 2-A. Air-quality school pickup adjustment

### Hook

- Time: `14:10`.
- Calendar: `15:30 아이 픽업`.
- Location: `$home`.
- Air quality: 미세먼지 `bad`.
- Transcript: empty.

### Flow

1. `POST /api/intent`
   - Expected `intent: "family.pickup_air_quality"`, confidence `>= 0.82`.
2. `POST /api/render`
   - Operations: `air.pollution.current`, `weather.forecast.current`, route-like map operation.
   - Surface: compact warning with `map_preview`, pickup route, and actions “마스크 알림”, “차량 경로 보기”, “괜찮아요”.
3. User taps “차량 경로 보기”; `POST /api/action` returns route alternatives.

### QA validation

| Check | Pass condition |
|---|---|
| Proactivity | Calendar + air quality triggers the surface without a request. |
| Current stack | `search("미세먼지 날씨 길찾기")` uses existing air/weather/route mappings. |
| Tone | Gentle, non-medical, non-alarmist. |
| Failure | If air data is unavailable, no fabricated warning appears. |

## Day 2-B. Grocery replenishment from routine and fridge note

### Hook

- Time: `17:20`.
- Habit: grocery order often happens Thursday evening.
- Calendar: dinner at home.
- Audio context: family member says “우유 거의 다 먹었네.” User says “내일 아침에 필요하긴 한데.”
- No direct “주문해줘”.

### Flow

1. `POST /api/intent`
   - Expected `intent: "grocery.replenish_candidates"`.
   - Confidence `0.72-0.84`.
   - Entities: milk and possible breakfast staples.
2. `POST /api/render`
   - Operations: `grocery.search` / `marketkurly.search`, optional price comparison.
   - Surface:
     - `kind: "suggestion"`, `layout: "compact_overlay"`.
     - Editable shortlist, source/delivery window, actions “장보기 리스트 만들기”, “마켓컬리에서 보기”, “됐어요”.
3. User taps “장보기 리스트 만들기”; `POST /api/action` creates a local/server list or `alert.create` fallback.

### QA validation

| Check | Pass condition |
|---|---|
| Audio minimalism | Audio is context; Jium prepares, not purchases. |
| Current stack | `search("마켓컬리 장보기 우유")` uses grocery/market mappings. |
| Safety | External grocery app open has confirmation; no auto-purchase. |
| Failure | Missing provider falls back to local checklist from entities. |

## Day 2-C. Delivery arrival conflict

### Hook

- Time: `19:05`.
- Package tracking: parcel ETA `19:20-19:50`.
- Location: user is away from home.
- Audio context: user says to companion, “집에 늦게 들어갈 것 같네.”

### Flow

1. `POST /api/intent`
   - Expected `intent: "delivery.arrival_conflict"`, confidence `>= 0.8`.
2. `POST /api/render`
   - Operations: `delivery.tracking.get`, `map.route.home`, optional `parking.search`.
   - Surface uses `timeline` for package ETA vs user ETA and actions “문앞 요청 남기기”, “집 경로 보기”, “나중에”.
3. “문앞 요청 남기기” is a write action and requires confirmation if it sends courier instructions.

### QA validation

| Check | Pass condition |
|---|---|
| Trigger | Package ETA + away-from-home state is enough. |
| Current stack | `search("택배 배송 조회 주차 길찾기")` discovers delivery/route/parking tools where available. |
| Safety | Courier instruction shows exact message before confirmation. |
| Failure | Unsupported courier writes become disabled or “알림만 받기”. |

## Day 2-D. Late-night quiet mode

### Hook

- Time: `22:40`.
- Calendar: no more events.
- Phone state: charging, user at home.
- Audio context: TV/background conversation only.

### Flow

1. `POST /api/intent`
   - Expected `intent: "idle.night_quiet"`, confidence `>= 0.9`.
2. `POST /api/render`
   - No external operation required.
   - Expected: no proactive surface, or a small `status_badge` for tomorrow’s first event.

### QA validation

| Check | Pass condition |
|---|---|
| Restraint | Background audio does not trigger false shopping/food/travel surfaces. |
| Quiet mode | UI remains Ambient Home or minimal status. |
| No API spam | No provider calls unless schedule lookup is required. |

---

# Day 3: Weekend social day

Persona: Weekend social user with loose plans. Jium uses calendar, location, weather, and overheard context, but does not wait for explicit commands.

## Day 3-A. Weekend plan gap discovery

### Hook

- Time: Saturday `10:00`.
- Calendar: `14:00 홍대에서 친구 만남`, no exact activity.
- Weather: clear but hot.
- Audio context: friend asks “만나서 뭐하지?” User says “그러게, 실내가 낫겠다.”

### Flow

1. `POST /api/intent`
   - Expected `intent: "weekend.activity_discovery"`, confidence `0.78-0.88`.
   - Entities: Hongdae, indoor preference, afternoon window.
2. `POST /api/render`
   - Operations: `place.search.nearby`, `weather.forecast.current`, optional `myrealtrip.activity.search`.
   - Surface: indoor activity/place list, `map_preview`, source/open-status rows, actions “일정에 붙이기”, “지도에서 보기”, “됐어요”.

### QA validation

| Check | Pass condition |
|---|---|
| Context blend | Calendar location + audio preference produce indoor recommendations. |
| Current stack | `search("홍대 실내 장소 날씨")` uses map/place/weather mappings. |
| No overreach | No booking or reservation happens automatically. |
| Failure | Missing activity provider still shows map/place results. |

## Day 3-B. In-conversation purchase interest, low-confidence first

### Hook

- Time: Saturday `15:20`.
- Location: Hongdae cafe.
- Audio context: friend says “이 조명 괜찮지?” User says “이런 거 하나 있으면 좋겠다.”
- Product name is vague; only category “무드등/조명” is inferred.

### Flow

1. `POST /api/intent`
   - Expected `intent: "shopping.soft_interest"`, confidence `0.65-0.78`.
2. `POST /api/render`
   - Low confidence means `compact_overlay` and no heavy fetch yet.
   - Actions: “중고/쇼핑 비교”, “알림만”, “됐어요”.
3. User taps “중고/쇼핑 비교”.
4. `POST /api/action`
   - Composite operation calls `daangn.search`, `junggo.search`, `shopping.price_compare` or Danawa-like provider, and `map.resolve_coords` for local listings.
   - Returns `replace_surface` with used/new comparison and source tags.

### QA validation

| Check | Pass condition |
|---|---|
| Low confidence | Initial surface is compact and non-invasive. |
| Deferred fetch | Multi-source shopping fetch happens after tap. |
| Current stack | `search("중고 쇼핑 가격비교 조명")` uses secondhand/shopping/price mappings and `batch` after schemas are discovered. |
| Failure | Vague product entity asks for one-tap refinement, not a chat question. |

## Day 3-C. Return-home timing after weather shift

### Hook

- Time: Saturday `18:10`.
- Location: away from home.
- Weather alert: rain begins in `35min`.
- Transit/route signal: subway delay or taxi ETA favorable.
- Transcript: empty.

### Flow

1. `POST /api/intent`
   - Expected `intent: "transport.return_home_weather_shift"`, confidence `>= 0.82`.
2. `POST /api/render`
   - Operations: `weather.forecast.current`, route/transit operation, `swing.taxi.search` if materially better.
   - Surface: “비 오기 전에 이동하면 덜 젖어요”, leave-now/wait/taxi alternatives, actions “집 경로 보기”, “택시 보기”, “닫기”.

### QA validation

| Check | Pass condition |
|---|---|
| Proactivity | Weather/location alone can trigger. |
| Current stack | `search("날씨 길찾기 택시")` discovers weather/route/Swing tools. |
| Safety | Taxi call still requires confirmation. |
| Failure | Route failure leaves weather-only copy useful and dismissible. |

## Day 3-D. Sunday prep from tomorrow schedule

### Hook

- Time: Sunday `20:30`.
- Calendar tomorrow: `08:30 병원 예약`, `10:30 외근`, `15:00 미팅`.
- Location: home.
- Audio context: user says while packing, “내일 정신없겠다.”

### Flow

1. `POST /api/intent`
   - Expected `intent: "tomorrow.prep_briefing"`, confidence `>= 0.85`.
2. `POST /api/render`
   - Operations: `schedule.tomorrow`, `weather.forecast.tomorrow`, route/place operations for first destination.
   - Surface:
     - `kind: "dashboard"`, `tone: "quiet"`, `layout: "card_stack"`.
     - Components: `calendar_block`, `weather_card`, `timeline`, `action_row`.
     - Actions: “아침 알림 설정”, “첫 목적지 경로 저장”, “닫기”.
3. Reminder setup is a write action and returns a success `patch`.

### QA validation

| Check | Pass condition |
|---|---|
| Timing | Appears evening before, not after the morning starts. |
| Current stack | `search("내일 일정 날씨 길찾기")` maps to available weather/route tools; schedule can be fixture-backed until user-context service is complete. |
| Safety | Reminder setup is confirmed or reversible. |
| Failure | Missing route data still shows schedule/weather and disables route action. |

---

# Cross-day QA matrix

| Capability | Evidence scenes |
|---|---|
| Empty-transcript proactivity | Day 1-A, 1-B, 2-A, 3-C |
| Audio as weak context | Day 1-C, 1-D, 2-B, 2-C, 3-A, 3-B, 3-D |
| Restraint / no surface | Day 2-D |
| Mobility/Swing | Day 1-B, Day 3-C |
| Weather/air quality | Day 1-A, 1-B, 2-A, 3-C, 3-D |
| Place/map routing | Day 1-C, 2-A, 2-C, 3-A, 3-D |
| Delivery/food/grocery | Day 1-D, 2-B, 2-C |
| Shopping/secondhand/price compare | Day 3-B |
| Multi-source aggregation | Day 1-D, Day 3-B; optionally Day 1-C and Day 3-A |
| Confirmation safety | Taxi call, external order, courier instruction, external shopping, reminder setup |

## Manual QA script shape

### Layer 1: Planner contract QA

Use fixture JSON for `signals`, `contextWindow`, and `transcript`. Assert:

1. Intent name and confidence band.
2. Entity extraction and symbolic references.
3. Surface kind/layout/tone.
4. Valid operation IDs.
5. Confirmation flags on risky actions.

### Layer 2: Current-stack smoke QA

1. Start `pnpm dev`.
2. Open `apps/web`.
3. Use the `+` input only to inject simulated context, not as a user command. Example:

   ```txt
   Simulate context only: time 08:22, user still at home, 09:00 Gangnam office event, public transit 50m, taxi 25m, rain soon. Do not answer in chat; render the smallest useful proactive Jium surface.
   ```

4. Confirm shell mode reaches `presenting`.
5. Confirm the surface matches this QA contract.
6. Click one safe read action and one dismiss path.
7. For risky actions, verify confirmation appears; do not complete real purchases/navigation outside sandbox credentials.

## Non-goals

- Do not build flows where the user says “택시 불러줘”, “치킨 주문해줘”, or “카페 찾아줘” as the primary trigger.
- Do not fabricate unavailable provider data to make a surface look full.
- Do not automatically perform booking, purchase, courier instruction, navigation, or notification creation without confirmation.
- Do not make every signal produce a card. Quiet/no-op behavior is correct when confidence is low and no useful next action exists.
