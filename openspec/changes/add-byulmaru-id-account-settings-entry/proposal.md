## Why

Kosmo의 `/settings`에는 Byulmaru ID가 소유한 Account Settings로 이동할 수 있는 명확하고 안전한 진입점이
없다. Account 관리 기능을 Kosmo에 중복 구현하지 않고도 인증 사용자가 비밀번호·인증·계정 관리의 실제
소유 서비스로 이동할 수 있어야 한다.

## What Changes

- `/settings`의 첫 번째 Account 행에 Byulmaru ID Account Settings 외부 진입점을 제공한다.
- 행 label, 이동 동작과 접근성 이름에서 Byulmaru ID 외부 서비스와 Account 수준 설정임을 전달하고,
  `계정 설정` heading·소유자 label·설명 block을 별도로 반복하지 않는다.
- canonical URL `https://id.byulmaru.co`를 사용해 Web에서는 외부 HTTPS navigation을, Android·iOS에서는
  시스템 브라우저 또는 승인된 external link flow를 실행한다.
- 지원하지 않는 URL 또는 외부 이동 실패를 조용히 무시하지 않고 안전한 한국어 오류와 같은 동작의 재시도를
  제공한다.
- 실제 외부 navigation 행에만 chevron을 표시하고 Kosmo 내부 Account route·UI·데이터 상태를 만들지 않는다.
- Web·Android·iOS와 keyboard·screen reader 기준에서 label, external navigation, 오류 복구와 접근성 계약을
  검증한다.

## Authority / Provenance

- Canonical: `docs/design/settings.md`, `docs/design/accessibility.md`
- Linear Contract: `PROD-645`
- Linear Implementations: `PROD-645`; page-level integration owner `PROD-653`

## Capabilities

### New Capabilities

- `byulmaru-id-account-settings-entry`: Byulmaru ID Account Settings의 정확한 외부 URL, 플랫폼별 이동,
  소유권을 드러내는 label·접근성 이름과 실패 후 재시도 계약

### Modified Capabilities

없음.

## Impact

- `apps/app`의 universal settings Account 행과 platform-specific external navigation 경계
- Account 외부 이동 component test와 React Native Web Storybook 상태
- `PROD-653`이 소유한 `add-settings-page-shell`의 후속 page-level 통합 surface
- GraphQL, DB, Relay Account 데이터 계약과 Kosmo 내부 Account route에는 변경 없음
