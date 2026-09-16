## Context

Account storage는 `ACTIVE`, `SUSPENDED`, `DISABLED`를 사용하며 `DISABLED`가 이미 terminal 상태다. 도메인에서는
이를 Account `Deleted`로 해석하고 Profile은 별도 lifecycle로 보존한다. Profile 비활성화와 current-session
logout은 각각 Profile과 한 Session만 다루므로 Account 탈퇴의 전체 Active Session 및 명시된 인증·인가·토큰·코드·
Push 정리를 대신할 수 없다.

Settings에는 기존 route family와 confirmation 상태 패턴이 있고, public `/account-deletion`은 별도 안내 문서다.
이번 변경은 저장 enum과 Settings shell을 재사용해 Kosmo 내부 action과 public in-app-only 안내를 연결한다.

## Goals / Non-Goals

**Goals:**

- 연결 Profile eligibility를 확인한 뒤 Account, Active Session, `ApplicationAuthorization`, `OAuthTokens`,
  `OAuthAuthorizationCodes` 및 `PushInstallation`의 결과를 하나로 확정한다.
- Profile·Membership·Account 속성을 보존하고, 현재 storage `DISABLED`와 domain `Deleted`의 매핑을 유지한다.
- Web·Android·iOS가 동일한 Settings 확인·pending·error·success 의미와 login 전환을 사용하게 한다.
- 동일 OIDC subject의 Kosmo 재가입을 임시로 막고 public 문서는 앱 내 탈퇴 경로만 안내한다.

**Non-Goals:**

- 새 `DELETED` enum, schema migration, Profile/Post/Media 삭제 또는 lifecycle 정책 변경
- Byulmaru ID Account 삭제·변경, reauth·grace period·복구·이유 설문
- Profile·Membership cleanup, OpenPanel 분석, 새 Figma source 또는 이메일 수동 삭제 경로

## Implementation Guidance

### Current Constraints

- 기존 Account/Session 인증 경계가 `AccountState.DISABLED`를 로그인 불가 terminal 상태로 판정하므로, 탈퇴 후
  같은 subject로 새 Session을 만들지 않게 해야 한다.
- current-session logout은 한 Session만 revoke한다. Account 탈퇴는 현재 Session을 포함한 모든 Active Session을
  정리해야 한다.
- `ApplicationAuthorizations`는 `revokedAt`, `OAuthTokens`는 `state`·`revokedAt`을 사용하고,
  `OAuthAuthorizationCodes`·`PushInstallations`는 Account를 참조한다. 기존 상태·삭제 방식을 유지한다.
- Profile lifecycle은 Profile·Membership을 보존한다. eligibility 확인에서 Profile/Membership mutation을
  호출하지 않는다.
- 기존 public `/account-deletion`의 이메일·보관 안내는 in-app-only 계약과 섞이지 않게 교체한다.

### Recommended Approach

1. caller의 현재 Session과 Account를 식별하고 Active/Suspended 및 Profile 0개 또는 전체 storage `DISABLED`
   eligibility를 같은 transaction 경계에서 판정한다.
2. 허용되면 Account를 storage `DISABLED`로 전환하고 모든 Active Session, `ApplicationAuthorization`,
   `OAuthTokens`, `OAuthAuthorizationCodes`, `PushInstallation`을 명세된 방식으로 정리한다. Profile·
   Membership·Account 속성에는 쓰지 않는다.
3. Web·Native transport는 동일 결과를 노출하며, 성공 확정 뒤에만 client credential·viewer를 비우고 login으로
   이동한다. 결과 불명 상태에서 성공을 반환하지 않는다.
4. Settings root 마지막 행과 기존 route/header/back·접근성 패턴을 재사용한다. blocker에는 Active Profile 개수와
   이유만 표시하고 관리 action은 만들지 않는다. public route는 in-app-only 안내로 유지한다.
5. 기존 OIDC의 Disabled Account 거부 경계와 지원 안내를 유지하고 Byulmaru ID provider 상태는 변경하지 않는다.

### Allowed Alternatives

서버의 기존 transport·application action 구성에 맞춰 transaction wrapper, mutation/route 이름과 상태 조회 분리를
선택할 수 있다. 모든 경로는 동일한 atomic outcome, storage/domain 매핑, 관계별 cleanup과 cross-platform 결과를
독립적으로 검증해야 한다.

### Known Traps

- 일반 current-session logout을 호출해 현재 Session과 PushInstallation만 정리하는 것
- eligibility 확인 중 Profile을 삭제·비활성화하거나 Membership을 정리하는 것
- `DISABLED` 대신 새 `DELETED` enum/migration을 도입하거나 Account attrs/Profile attrs를 anonymize하는 것
- DB 결과가 불명확한데 client credential을 먼저 지우거나 success/login 전환을 optimistic하게 표시하는 것
- `/account-deletion` public 안내에 이메일 삭제 요청, grace/retention 또는 Byulmaru ID 삭제를 다시 넣는 것
- iOS device/runtime 검증을 Web·source/unit 통과만으로 대체하는 것

## Risks / Trade-offs

- [원자 경계가 너무 좁음] 명시된 정리 대상 중 일부만 정리된 상태가 남을 수 있다 → 명세된 상태 전이와 물리 삭제를
  같은 transaction 또는 복구 가능한 동등 경계로 실행하고, 결과 불명 시 성공을 반환하지 않는다.
- [terminal 전환의 비가역성] 운영자가 실수한 탈퇴를 되돌릴 수 없다 → confirmation checkbox와 명시적인
  irreversibility 안내를 유지하고 grace/recovery를 추가하지 않는다.
- [재가입 임시 차단의 장기화] 후속 정책 전까지 지원 문의가 필요하다 → 제한 문구와 `hello@byulmaru.co`
  지원 경로를 노출하되, 영구 정책이나 provider 상태 변경은 별도 승인으로 남긴다.
- [플랫폼별 결과 차이] Web·Native가 credential 정리 시점을 다르게 해 stale viewer가 남을 수 있다 →
  공통 성공/실패 의미와 플랫폼별 runtime evidence를 함께 검증한다.

## Migration Plan

- 기존 schema와 enum을 변경하지 않고 서버의 Account 탈퇴 action, client Settings route, public 안내를
  함께 배포한다.
- 배포 전 eligibility 거부, atomic cleanup, 재시도·중복 실행, 성공 후 login과 동일 subject 차단의 통합
  검증을 수행하고 Web·Android·iOS runtime 결과를 수집한다.
- 코드 rollback은 아직 실행하지 않은 요청의 동작만 되돌린다. 이미 `DISABLED`로 확정된 Account나 물리
  삭제된 관계를 다시 활성화·복원하는 rollback은 제공하지 않는다.

## Open Questions

없음.
