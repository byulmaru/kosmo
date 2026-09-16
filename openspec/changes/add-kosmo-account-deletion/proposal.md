## Why

현재 Kosmo에는 인증된 사용자가 앱 안에서 Kosmo Account를 탈퇴하는 경로가 없다. iOS 심사에 필요한
접근성을 제공하면서도 Byulmaru ID와 Profile의 lifecycle을 침범하지 않도록, 모든 연결 Profile이 비활성화된
경우에만 Account를 terminal 상태로 전환하는 종단 간 계약이 필요하다.

## What Changes

- Profile이 없거나 모두 storage `DISABLED`(domain `Deactivated`)인 경우에만 탈퇴를 허용하고, 실패 시 활성
  Profile 개수와 이유를 표시한다. 성공은 기존 Account storage `DISABLED`를 canonical `Deleted`로 사용하며
  Profile·Membership·Account 속성을 보존하고, 명세된 인증·인가·토큰·코드·Push 관계를 원자적으로 정리한다.
- Settings root/master에 항상 보이는 마지막 `코스모 탈퇴` 행과 `/settings/account-deletion` detail을
  Web·Android·iOS에 제공한다. acknowledgement checkbox만 요구하고 재인증·유예기간·이유 입력은 추가하지
  않으며, pending·error·retry·success와 login 이동을 서버 확정 결과에 맞춘다.
- 같은 Byulmaru ID의 Kosmo 재가입은 후속 정책 전까지 임시 차단하고, Byulmaru ID 자체는 변경하지 않는다.
  공개 `/account-deletion`은 앱 안에서만 탈퇴할 수 있다는 안내만 제공한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/account.md`, `docs/domain/objects/account-profile-membership.md`,
  `docs/domain/objects/profile.md`, `docs/domain/objects/session.md`, `docs/design/settings.md`,
  `docs/design/profile-lifecycle.md`
- Linear Contract: `PROD-970`
- Linear Implementations: 없음. `PROD-970`이 계약·구현·통합·OpenSpec lifecycle을 소유한다.
- Release Evidence: `PROD-872`가 iOS device/store evidence를 소유한다.

## Capabilities

### New Capabilities

- `account-deletion`: Kosmo-only Account 탈퇴의 eligibility, Account·Session·OAuth·Push 정리, Settings lifecycle,
  동일 OIDC 재가입 차단과 공개 in-app-only 안내를 정의한다.

### Modified Capabilities

- `settings-page-shell`: 현재 Settings root/master의 direct entry 순서와 접근성 계약에 마지막 `코스모 탈퇴`
  행과 내부 detail 진입을 반영한다.

## Impact

- Account/Profile/Membership/Session 도메인과 명시된 인증·인가·토큰·코드·Push 관계, API/GraphQL transport가
  영향을 받는다.
- Web·Android·iOS Settings가 공통 lifecycle과 login 전환을 소비하고, 공개 안내와 iOS device evidence가
  추가된다.
- 새 `DELETED` enum·schema migration, Profile/Post/Media 정책 변경, Byulmaru ID 변경, OpenPanel 분석,
  유예·복구·설문·새 Figma source는 포함하지 않는다.
