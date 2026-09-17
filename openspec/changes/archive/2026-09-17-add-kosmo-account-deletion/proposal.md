## Why

현재 Kosmo에는 인증된 사용자가 앱 안에서 Kosmo Account를 탈퇴하는 경로가 없다. iOS 심사에 필요한
접근성을 제공하면서도 Byulmaru ID와 Profile의 lifecycle을 침범하지 않도록, 모든 연결 Profile이 비활성화된
경우에만 Account를 terminal 상태로 전환하는 종단 간 계약이 필요하다.

## What Changes

- 클라이언트는 이미 조회한 `me.profiles`로 활성 Profile 개수와 이유를 사전 표시한다. 별도 eligibility API 없이
  account-deletion Workflow의 transaction Activity가 Active Account의 Profile이 없거나 모두 storage
  `DISABLED`(domain `Deactivated`)인지 원자적으로 재확인한다. GraphQL mutation은 Workflow 결과를 동기적으로
  기다린다. 성공은 기존 Account storage `DISABLED`를 canonical `Deleted`로 사용하며 Profile·Membership·Account
  속성을 보존하고, 명세된 인증·인가·토큰·코드·Push 관계를 정리한다. Deleted/storage `DISABLED` Account는
  공개 인증과 `deleteAccount` mutation을 허용하지 않는다. 다만 이미 인증·승인된 Workflow 실행이 DB commit 후
  결과 acknowledgement를 잃고 재시도되는 내부 경로에서는 transaction Activity가 `DISABLED`를 멱등 성공으로
  처리해 같은 정리를 다시 적용하고 `completed: true`를 반환할 수 있다. 완료된 `BLOCKED` 실행은 Account가
  Active인 동안 `ALLOW_DUPLICATE` 정책으로 새 실행을 시작해 현재 Profile 조건을 다시 판정하며, 이 정책은
  Deleted Account의 공개 재탈퇴를 허용하지 않는다. mutation payload는 `completed`만 반환한다.
- Settings root/master에 항상 보이는 마지막 `코스모 탈퇴` 행과 `/settings/account-deletion` detail을
  Web·Android·iOS에 제공한다. acknowledgement checkbox만 요구하고 재인증·유예기간·이유 입력은 추가하지
  않으며, pending·error·retry·success와 login 이동을 서버 확정 결과에 맞춘다.
- 같은 Byulmaru ID의 Kosmo 재가입은 후속 정책 전까지 임시 차단하고, Byulmaru ID 자체는 변경하지 않는다.
  공개 `/account-deletion`은 앱 안에서만 탈퇴할 수 있다는 안내만 제공한다.

## Authority / Provenance

- Durable canonical contract: `docs/domain/objects/account.md`, `docs/domain/objects/account-profile-membership.md`,
  `docs/domain/objects/profile.md`, `docs/domain/objects/session.md`, `docs/design/settings.md`,
  `docs/design/profile-lifecycle.md`
- Durable Linear scope and delivery results: `PROD-970`
- Follow-up runtime and release evidence: `PROD-727`가 Web·Android·iOS runtime·접근성 검증을, `PROD-872`가
  iOS device/store evidence를 소유한다.
- OpenSpec role: 이 change는 구현 세션의 비권위적 historical session record다. 이 artifact의 spec·task·lifecycle·
  archive는 제품 요구사항이나 완료 게이트를 새로 만들지 않으며, archive는 선택적인 세션 정리다.

## Capabilities

### New Capabilities

- `account-deletion`: Kosmo-only Account 탈퇴의 eligibility, Account·Session·OAuth·Push 정리, Settings lifecycle,
  동일 OIDC 재가입 차단과 공개 in-app-only 안내를 정의한다.

### Modified Capabilities

- `settings-page-shell`: 현재 Settings root/master의 direct entry 순서와 접근성 계약에 마지막 `코스모 탈퇴`
  행과 내부 detail 진입을 반영한다.

## Impact

- Account/Profile/Membership/Session 도메인과 명시된 인증·인가·토큰·코드·Push 관계가 영향을 받는다. GraphQL
  `deleteAccount` mutation resolver는 검증된 Account ID로 account-deletion Workflow를 동기 실행하고,
  Workflow의 transaction Activity가 검증·상태 전이·관계 정리를 수행한다. mutation은 `completed` payload만
  제공하며 별도 eligibility query나 count payload는 없다. Workflow는 향후 외부 효과를 추가할 수 있는 실행
  경계를 제공하지만 현재는 명세된 transaction Activity만 실행한다.
- Web·Android·iOS Settings가 공통 lifecycle과 login 전환을 소비하고, 공개 안내와 iOS device evidence가
  추가된다.
- 새 `DELETED` enum·schema migration, Profile/Post/Media 정책 변경, Byulmaru ID 변경, OpenPanel 분석,
  유예·복구·설문·새 Figma source는 포함하지 않는다.
