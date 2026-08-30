## Why

Local Profile handle은 형식과 Local Instance 내 중복만 검증하므로 운영·공식 계정으로 오인될 수 있는 이름과
명백한 욕설·혐오 비하표현을 일반 Profile이 선점할 수 있다. 서버와 클라이언트가 하나의 기준 정책을
공유해 API 우회와 정상 단어 오탐을 함께 막아야 한다.

## What Changes

- System Reserved Handle 목록에 Local handle로 생성 가능한 현재 앱 최상위 정적 route namespace를 포함하고,
  소문자 handle 전체의 정확 일치로 검사한다.
- Explicitly Harmful Handle Expression 목록은 소문자 변환, 밑줄 제거와 제한된 숫자 치환을 적용한 handle
  전체의 정확 일치로 검사한다.
- Local Profile 생성 API가 두 정책을 권위 있게 적용하고 정책 위반을 handle field 오류로 거부한다.
- Profile 생성 UI가 같은 정책으로 사전 검증하고 mutation을 호출하지 않은 채 기존 TextField 오류 상태에
  `사용할 수 없는 단어가 포함된 핸들이에요.`를 표시한다.
- 두 정책은 새 Local Profile 생성에만 적용한다. 기존 Profile은 충돌해도 변경하지 않으며 PROD-816의
  배포·완료를 막지 않는다. 기존 충돌의 감사·영향 분석·유지 또는 정리 결정은 PROD-878로 분리한다.
- 서버·클라이언트의 목록과 정규화가 달라지면 실패하는 단위·API 통합·UI 검증을 추가한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/design/accessibility.md`
- Linear Contracts:
  - [PROD-816](https://linear.app/byulmaru/issue/PROD-816/local-profile-handle-예약어를-정의하고-생성-시-차단한다):
    System Reserved Handle과 Explicitly Harmful Handle Expression 하위 정책, 공용 서버·클라이언트 적용,
    신규 생성 검증, 통합 검증과 전체 change archive 범위
  - [PROD-878](https://linear.app/byulmaru/issue/PROD-878/기존-local-profile-예약어-충돌을-별도로-정리한다):
    기존 충돌의 전체 감사, 영향 분석, 유지·정리 결정과 후속 cleanup 절차
- Linear Implementations: PROD-816 하나가 현재 change의 구현·검증과 OpenSpec 생명주기 전체를 소유한다.
  PROD-878은 독립된 후속 범위이며 현재 change의 완료를 막지 않는다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `profile`: Local Profile 생성이 System Reserved Handle과 Explicitly Harmful Handle Expression 정책을
  서버 권위로 적용하도록 변경한다.
- `web-app-shell`: Local Profile 생성 form이 같은 정책으로 사전 검증하고 기존 접근 가능한 field 오류로
  안전한 안내를 제공하도록 변경한다.

## Impact

- 공용 Profile validation과 이를 소비하는 Core·GraphQL Local Profile 생성 경계가 영향을 받는다.
- Profile switcher의 생성 form, 공용 TextField 오류 연결과 관련 Storybook interaction test가 영향을 받는다.
- GraphQL input·payload shape와 데이터베이스 schema는 변경하지 않는다.
- Bluesky 공개 목록은 선별 근거로만 사용하며 runtime dependency나 원격 denylist로 추가하지 않는다.
- 데이터베이스 schema나 기존 Local Profile 데이터를 변경하지 않는다. 기존 충돌의 조사·정리 여부는 PROD-878의
  독립된 결정이며 PROD-816 배포의 선행 조건이 아니다.
