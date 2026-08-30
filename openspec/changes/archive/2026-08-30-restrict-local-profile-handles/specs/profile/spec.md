## MODIFIED Requirements

### Requirement: Profile creation

**Authority / Provenance:** `docs/domain/objects/profile.md`, `PROD-816`, `PROD-878` — 이 요구사항을 MUST
준수한다.
로그인한 계정은 형식, configured Local Instance 안의 유일성, System Reserved Handle 정책을 통과한 handle로
자신이 소유한 configured local profile을 생성할 수 있어야 한다(MUST). 시스템은 Local Profile 생성의 모든
진입점에서 System Reserved Handle 정책을 서버 권위로 적용해야 하며(MUST), 정책 위반을 일치한 예약
식별자나 내부 목록을 노출하지 않는 `handle` field 오류로 반환해야 한다(MUST).

System Reserved Handle은 앞뒤 공백을 제거하고 소문자로 바꾼 Local handle 전체를 아래 집합과 정확히 비교해야
한다(MUST). Remote Profile의 원격 handle에는 이 정책을 적용하지 않으며 원격 원본 값을 보존해야 한다(MUST).
비교에는 부분 문자열 검색, underscore 제거 또는 숫자 치환을 적용해서는 안 된다(MUST NOT).

- 운영 권한·공식 계정: `abuse`, `adm`, `admin`, `admins`, `administration`, `administrator`,
  `administrators`, `moderator`, `moderators`, `official`, `operator`, `owner`, `owners`, `root`, `security`,
  `staff`, `support`, `system`
- 인증·고객지원·정책: `api`, `auth`, `authentication`, `contact`, `contactus`, `copyright`, `dmca`, `help`,
  `hostmaster`, `legal`, `login`, `logout`, `oauth`, `policies`, `policy`, `postmaster`, `privacy`, `register`,
  `registration`, `report`, `reports`, `status`, `terms`, `tos`, `webmaster`
- Kosmo·연합·시스템 endpoint: `activitypub`, `actor`, `actors`, `ap`, `byulmaru`, `federation`, `fediverse`,
  `graphql`, `health`, `inbox`, `kosmo`, `nodeinfo`, `outbox`, `webfinger`
- 앱 최상위 정적 route namespace: `bookmarks`, `compose`, `feedback`, `hashtags`, `home`, `local`,
  `notifications`, `search`, `settings`
- 공식 계정으로 오인하기 쉬운 조합: `kosmo_admin`, `kosmo_moderator`, `kosmo_official`, `kosmo_security`,
  `kosmo_support`

`login`과 `privacy`는 현재 앱 route이면서 인증·고객지원·정책 목록에 이미 포함해야 한다(MUST).
`follow-requests`와 `profile-edit`처럼 하이픈을 포함한 route는 Local handle 문자 형식에서 거부해야 하며(MUST),
System Reserved 목록에 같은 의미의 underscore 별칭을 임의로 추가해서는 안 된다(MUST NOT). 앱의 최상위 정적
route를 추가하거나 이름을 바꿀 때 그 segment가 Local handle 문자 형식으로 생성 가능하면 route 변경과 같은
배포 단위에서 System Reserved 목록과 공용 검증을 함께 갱신해야 한다(MUST).

유해표현의 판정, 신고, 심사, 제재, 이의제기와 목록 소유권은 System Reserved Handle과 별개의 모더레이션
생명주기에서 다룬다. 이 요구사항은 해당 목록·판정 규칙·결과·집행을 정의하지 않으며, 값이 과거 유해표현 정책의
대상이었다는 이유만으로 현재 Local Profile 생성을 거부하지 않는다(MUST). 이는 유해표현 handle을
영구적으로 허용한다는 약속이 아니며 새로운 모더레이션 구현을 추가하지 않는다.

System Reserved Handle 정책은 새 Local Profile 생성 요청에만 적용해야 한다(MUST). Profile Lifecycle State와
handle 재사용 가능 여부는 이 정책에 우선해서는 안 된다(MUST NOT). 정책 도입 전에 생성된 Local Profile은
현재 목록이나 비교 규칙과 충돌해도 기존 handle과 lifecycle을 그대로 유지해야 하며(MUST), 그 충돌만을 이유로
자동 rename·disable·delete해서는 안 된다(MUST NOT). 기존 충돌의 전체 현황 점검과 후속 cleanup은 PROD-878의
별도 lifecycle에서 다루며, 그 완료 여부를 신규 생성 정책 배포의 선행 조건으로 삼아서는 안 된다(MUST NOT).

#### Scenario: Create profile with valid handle

- **WHEN** 로그인한 계정이 형식, 유일성과 System Reserved Handle 정책을 통과한 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 configured local instance에 속한 local profile로 handle과 정규화된 handle을 저장한다
- **AND** 표시 이름은 handle과 같은 값으로 초기화된다
- **AND** 팔로우 정책은 `OPEN`으로 초기화된다
- **AND** mutation은 `CreateProfilePayload.profile`로 생성된 `Profile`을 반환한다
- **AND** mutation은 `CreateProfilePayload.account`로 현재 계정과 갱신된 프로필 목록을 반환한다

#### Scenario: Create profile with duplicate local handle

- **WHEN** 로그인한 계정이 configured local instance 안에서 이미 사용 중인 정규화 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 `handle` field의 conflict 오류를 반환한다

#### Scenario: Create profile with remote-only duplicate handle

- **WHEN** 로그인한 계정이 다른 ActivityPub instance에만 존재하는 정규화 handle로 local profile 생성을 요청한다
- **THEN** 시스템은 그 remote profile을 local handle conflict로 취급하지 않는다
- **AND** System Reserved Handle 정책을 포함한 다른 생성 검증을 통과하면 configured local instance에 새 profile을 생성할 수 있다

#### Scenario: Reject a case-insensitive reserved handle

- **WHEN** 로그인한 계정이 `Admin`처럼 대소문자만 다른 System Reserved Handle로 Local Profile 생성을 요청한다
- **THEN** 시스템은 Profile을 생성하지 않고 handle field 오류를 반환한다
- **AND** 응답은 일치한 예약 식별자나 전체 목록을 노출하지 않는다

#### Scenario: Reject a handle that occupies a current app route namespace

- **WHEN** 로그인한 계정이 `notifications`, `settings` 또는 `hashtags`처럼 Local handle 문자 형식으로 생성
  가능한 현재 앱 최상위 정적 route namespace로 Local Profile 생성을 요청한다
- **THEN** 시스템은 Profile을 생성하지 않고 handle field 오류를 반환한다
- **AND** 정적 앱 route와 동적 Profile route가 같은 최상위 namespace를 공유하지 않는다

#### Scenario: Reject a hyphenated route at the handle format boundary

- **WHEN** 로그인한 계정이 `follow-requests` 또는 `profile-edit`처럼 하이픈을 포함한 현재 앱 route를 Local
  Profile handle로 제출한다
- **THEN** 시스템은 System Reserved 판정에 앞선 Local handle 문자 형식 검증으로 요청을 거부한다
- **AND** `follow_requests` 또는 `profile_edit`를 route와 같은 값으로 간주하지 않는다

#### Scenario: Allow a handle that only contains a reserved substring

- **WHEN** 로그인한 계정이 `supporter`, `cybersecurity` 또는 `administrator_dev`처럼 예약 식별자를 일부만 포함한 handle로 생성을 요청한다
- **THEN** 시스템은 System Reserved Handle 정책만을 이유로 요청을 거부하지 않는다
- **AND** 다른 생성 검증을 모두 통과하면 Profile을 생성한다

#### Scenario: Allow a handle outside the current creation policy

- **WHEN** 로그인한 계정이 `porn`, `p_o_r_n` 또는 `p0rn`처럼 과거 유해표현 정책이 거부했지만 System Reserved Handle과 정확히 일치하지 않고 형식이 유효하며 configured Local Instance 안에서 중복되지 않는 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 그 값이 과거 유해표현 정책의 대상이었다는 이유만으로 Profile 생성을 거부하지 않는다
- **AND** 형식과 configured local instance 안의 유일성 검증을 통과하면 Profile과 Owner Membership을 저장한다

#### Scenario: Reject a policy violation that bypasses client validation

- **WHEN** 클라이언트 사전 검증을 사용하지 않고 API를 직접 호출해 System Reserved Handle 정책을 위반한 Local Profile handle을 제출한다
- **THEN** 서버는 Profile과 Owner Membership을 생성하지 않는다
- **AND** handle field 오류를 반환한다

#### Scenario: Keep the policy ahead of handle reuse

- **WHEN** 과거 Profile의 lifecycle 또는 삭제 처리로 같은 문자열의 재사용 가능 여부가 달라지더라도 새 handle이 System Reserved Handle과 일치한다
- **THEN** 시스템은 재사용 가능 여부와 관계없이 새 Local Profile 생성을 거부한다

#### Scenario: Preserve an existing profile that now conflicts with the policy

- **WHEN** 정책 도입 전에 생성된 Local Profile의 handle이 현재 System Reserved Handle과 충돌한다
- **THEN** 시스템은 그 충돌만을 이유로 기존 Profile을 rename·disable·delete하지 않는다
- **AND** 기존 handle과 lifecycle을 변경하지 않은 채 신규 생성 정책을 배포할 수 있다
- **AND** 기존 충돌의 전체 현황 점검과 cleanup은 PROD-878의 별도 lifecycle에서 다루며 신규 생성 정책 배포를 막지 않는다
