# Jium Architecture Notes

이 디렉토리는 Jium의 제품/엔진 설계 초안을 정리한다.

Jium은 GGUI 런타임을 사용하되, 런타임 관심사는 `services/ggui`와 `vendor/ggui`에 격리한다.
GGUI의 핵심 아이디어인 `DataContract`, `actionSpec`, `contextSpec`, design primitive vocabulary,
render lifecycle을 활용한다.

## Documents

- [UI Spec and Component Vocabulary](./ui-spec.md)
- [OpenAPI Action Router](./openapi-action-router.md)

## One-line Philosophy

> GGUI의 "AI가 UI를 설계한다"는 철학을 유지한다. GGUI 런타임을 사용하되, 런타임 관심사는 `services/ggui`와 `vendor/ggui`에 격리한다.
