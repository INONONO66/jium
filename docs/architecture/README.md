# Jium Architecture Notes

이 디렉토리는 Jium의 제품/엔진 설계 초안을 정리한다.

Jium은 GGUI를 그대로 의존하지 않는다. 대신 GGUI의 핵심 아이디어인
`DataContract`, `actionSpec`, `contextSpec`, design primitive vocabulary,
render lifecycle을 흡수하고, 실행부는 Jium에 맞게 단순화한다.

## Documents

- [GGUI-derived JSON UI Engine](./ggui-json-ui-engine.md)
- [UI Spec and Component Vocabulary](./ui-spec.md)
- [OpenAPI Action Router](./openapi-action-router.md)
- [Migration Plan from GGUI Sample](./migration-plan.md)

## One-line Philosophy

> GGUI의 “AI가 UI를 설계한다”는 철학은 유지한다. 다만 “AI가 React 코드를 생성하고 iframe에서 실행한다”는 런타임은 JSON UI spec + in-app renderer로 대체한다.
