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
- 배포 대상의 기존 Local Profile handle 충돌을 읽기 전용으로 점검한다. PROD-816은 충돌 Profile을 자동
  변경하는 일회성 script를 저장소에 추가하지 않고, 별도 cleanup 이슈와 승인된 forward data migration 또는
  운영 절차로 다룬다.
- 서버·클라이언트의 목록과 정규화가 달라지면 실패하는 단위·API 통합·UI 검증을 추가한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/design/accessibility.md`
- Linear Contracts:
  - [PROD-816](https://linear.app/byulmaru/issue/PROD-816/local-profile-handle-예약어를-정의하고-생성-시-차단한다):
    System Reserved Handle과 Explicitly Harmful Handle Expression 하위 정책, 공용 서버·클라이언트 적용,
    기존 데이터 감사, 통합 검증과 전체 change archive 범위
- Linear Implementations: PROD-816 하나가 두 하위 정책의 구현·검증과 OpenSpec 생명주기 전체를 소유한다.

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
- 배포 전 기존 Local Profile handle을 새 정책으로 감사하고, 충돌 시 영향·변경 방식·rollback·재점검 조건을
  소유하는 별도 cleanup 결정이 필요하다.
