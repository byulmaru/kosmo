# Frontend: Storybook

Read this entire file when adding or reviewing `apps/app` Storybook stories, Relay fixtures, or interaction coverage.

## Storybook

- 상태 카탈로그는 `apps/app`의 React Native Web Storybook을 사용한다. Svelte story나 UI package를 병행하지 않는다.
- Relay fragment component story는 production fragment ref 계약을 유지하는 Relay mock environment/payload를 사용한다. raw object를 `$key`로 cast해 runtime contract를 우회하지 않는다.
- loading, error, empty, long display name/handle/content, selected/disabled, pagination retry와 platform width 상태를 포함한다.
- interactive element에는 접근성 metadata를 넣고 Storybook a11y 검증과 web static build를 함께 통과시킨다.
