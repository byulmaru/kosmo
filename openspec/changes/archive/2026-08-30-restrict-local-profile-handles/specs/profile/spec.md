## MODIFIED Requirements

### Requirement: Profile creation

**Authority / Provenance:** `docs/domain/objects/profile.md`, `PROD-816`, `PROD-878` — 이 요구사항을 MUST
준수한다.
로그인한 계정은 형식, configured Local Instance 안의 유일성, System Reserved Handle과 Explicitly Harmful
Handle Expression 정책을 모두 통과한 handle로 자신이 소유한 configured local profile을 생성할 수 있어야
한다(MUST). 시스템은 Local Profile 생성의 모든 진입점에서 두 정책을 서버 권위로 적용해야 하며(MUST),
정책 위반을 일치한 표현이나 내부 목록을 노출하지 않는 handle field 오류로 반환해야 한다(MUST).

System Reserved Handle은 앞뒤 공백을 제거하고 소문자로 바꾼 handle 전체를 아래 집합과 정확히 비교해야 한다
(MUST).

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

Explicitly Harmful Handle Expression은 앞뒤 공백 제거와 소문자 변환 뒤 밑줄을 제거한 compact handle과,
그 값에 `0`→`o`, `1`→`i`, `3`→`e`, `4`→`a`를 적용한 substituted handle을 만들어야 한다(MUST).
두 값 중 하나가 아래 집합과 정확히 일치하면 생성을 거부해야 한다(MUST).

- 명백한 욕설·성적 표현: `fuck`, `slut`, `porn`, `p0rn`, `pr0n`, `xxx`
- 인종·민족 비하표현: `chink`, `chinks`, `coon`, `coons`, `nigg`, `niggs`, `nigga`, `niggas`, `nigger`,
  `niggers`, `nigglet`, `nigglets`
- 성적 지향 비하표현: `fag`, `fags`, `fagg`, `faggs`, `faggot`, `faggots`, `faggotry`, `faggotries`
- 유대인 비하표현: `kike`, `kikes`, `kyke`, `kykes`
- 트랜스젠더 비하표현: `tranny`, `trannys`, `trannie`, `trannies`

시스템은 두 정책을 부분 문자열 검사로 확대해서는 안 되며(MUST NOT), Remote Profile의 원격 handle에 적용해서는
안 된다(MUST NOT). Profile Lifecycle State와 handle 재사용 가능 여부는 두 정책에 우선해서는 안 된다(MUST
NOT). 두 정책은 새 Local Profile 생성 요청에만 적용해야 한다(MUST). 정책 도입 전에 생성된 Local Profile은
현재 정책과 충돌하더라도 그 충돌만을 이유로 자동 rename·disable·delete해서는 안 되며(MUST NOT), 기존 충돌의
감사 또는 cleanup을 신규 생성 정책 배포의 선행 조건으로 삼아서는 안 된다(MUST NOT).

#### Scenario: Create profile with valid handle

- **WHEN** 로그인한 계정이 형식, 유일성과 두 Local handle 정책을 모두 통과한 handle로 프로필 생성을 요청한다
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
- **AND** 두 Local handle 정책을 포함한 다른 생성 검증을 통과하면 configured local instance에 새 profile을 생성할 수 있다

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

#### Scenario: Reject a direct explicitly harmful handle

- **WHEN** 로그인한 계정이 Explicitly Harmful Handle Expression 목록 값과 대소문자만 다르게 일치하는 handle로 생성을 요청한다
- **THEN** 시스템은 Profile을 생성하지 않고 handle field 오류를 반환한다
- **AND** 응답은 일치한 표현이나 분류를 노출하지 않는다

#### Scenario: Reject underscore and numeric-substitution evasion

- **WHEN** 로그인한 계정이 `f_a_g_g_o_t`, `n1gg3r`, `tr4nny`처럼 밑줄이나 허용된 숫자 치환으로 명시적 유해표현을 우회한 handle로 생성을 요청한다
- **THEN** 시스템은 compact handle 또는 substituted handle의 정확 일치로 요청을 거부한다
- **AND** Profile과 Owner Membership을 저장하지 않는다

#### Scenario: Do not reject a normal word by harmful substring

- **WHEN** 로그인한 계정이 `class` 또는 `analysis`처럼 정상 단어 안에 짧은 문자열이 포함된 handle로 생성을 요청한다
- **THEN** 시스템은 Explicitly Harmful Handle Expression 정책만을 이유로 요청을 거부하지 않는다
- **AND** 다른 생성 검증을 모두 통과하면 Profile을 생성한다

#### Scenario: Reject a policy violation that bypasses client validation

- **WHEN** 클라이언트 사전 검증을 사용하지 않고 API를 직접 호출해 두 정책 중 하나를 위반한 Local Profile handle을 제출한다
- **THEN** 서버는 Profile과 Owner Membership을 생성하지 않는다
- **AND** handle field 오류를 반환한다

#### Scenario: Keep the policy ahead of handle reuse

- **WHEN** 과거 Profile의 lifecycle 또는 삭제 처리로 같은 문자열의 재사용 가능 여부가 달라지더라도 새 handle이 두 정책 중 하나에 해당한다
- **THEN** 시스템은 재사용 가능 여부와 관계없이 새 Local Profile 생성을 거부한다

#### Scenario: Preserve an existing profile that now conflicts with the policy

- **WHEN** 정책 도입 전에 생성된 Local Profile의 handle이 현재 두 정책 중 하나와 충돌한다
- **THEN** 시스템은 그 충돌만을 이유로 기존 Profile을 rename·disable·delete하지 않는다
- **AND** 기존 충돌의 감사 또는 cleanup 완료 여부와 관계없이 신규 생성 정책을 배포할 수 있다
