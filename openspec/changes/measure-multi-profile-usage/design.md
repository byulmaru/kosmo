## Context

현재 Web 분석은 PostHog 표준 pageview와 앱 소유 이벤트를 함께 쓴다. Account는 opaque global ID로 식별하며,
`profile_created`, `profile_selected`, `post_created`, `follow_succeeded`에는 선택 또는 행동 주체 Profile ID가
들어간다. 검색 행동도 이미 타입이 정해진 이벤트로 수집한다.

현재 자료만으로는 두 가지를 알 수 없다. 첫째, 화면을 볼 때 선택된 Profile과 동시에 선택할 수 있었던 Profile
수가 기록되지 않는다. 둘째, `profile_selected`는 직접 전환뿐 아니라 첫 선택, 같은 Profile 재선택과 생성 직후 자동
선택도 함께 담는다. 이 상태에서 WAA 대비 비율은 만들 수 있지만 승인된 자격 분모와 전환 횟수는 재현할 수
없다.

인증 shell 쿼리는 현재 selected Profile과 Account가 선택할 수 있는 `me.profiles`를 이미 조회한다.
`Account.profiles`는 Membership이 있고 공통 Profile 조회 가능 조건을 통과한 목록이므로 자격 판정에 필요한
새 API는 없다. 다만 ProfileSwitcher는 desktop·compact·drawer 형태로 여러 번 렌더될 수 있어 그 안에서 화면
관측을 보내면 중복될 수 있다.

## Goals / Non-Goals

**Goals:**

- 기존 PostHog Account identity를 유지하면서 인증 화면의 선택 Profile과 멀티 Profile 자격을 한 번 관측한다.
- 기존 선택 성공 관측은 보존하고, 그중 직접 전환만 별도 집계할 수 있게 한다.
- mutation을 시작한 Account와 Profile을 완료 시점까지 고정하고 전송 재시도를 중복 집계하지 않는다.
- PostHog에서 주간 집합, 두 비율, 리텐션, 생성·전환·핵심 행동을 같은 제외 목록으로 재현한다.
- 합성 페이로드와 production 실수집 관측을 각각 대조할 수 있는 운영 증거를 남긴다.

**Non-Goals:**

- Profile, Membership, 선택 mutation이나 전환 화면의 동작 변경
- PostHog 표준 pageview·metadata·Replay 설정 변경
- Native 분석 추가
- 과거 OpenPanel 자료 이관과 과거 주 소급 복원
- 북극성 지표 또는 다른 지표의 공통 WAA 정의

## Implementation Guidance

### Current Constraints

- 앱 소유 이벤트는 하나의 TypeScript 이벤트 map을 통해서만 PostHog `capture`로 전달된다. 새 관측도 이 경계를
  거쳐야 한다.
- PostHog SDK 표준 `$pageview`는 selected Profile과 Membership 자격을 모른다. 표준 이벤트를 앱에서 다시
  보내거나 메타데이터 필터로 바꾸면 기존 분석 계약과 충돌한다.
- `ProfileSwitcher`의 현재 성공 콜백은 선택 원인과 출발 Profile을 보존하지 않고 모든 성공을
  `profile_selected`로 보낸다.
- Profile 생성 성공 뒤 같은 코드 경로로 자동 선택한다. 생성 성공과 선택 성공을 묶으면 생성 뒤 선택 실패를
  표현할 수 없다.
- mutation 완료 전에 logout이나 Account 전환이 일어나면 PostHog의 현재 식별자가 달라질 수 있다. 이때
  현재 식별자로 성공 이벤트를 보내면 다른 Account에 귀속된다.
- PostHog 브라우저 SDK는 이벤트 UUID를 전송 식별자로 사용한다. 현재 의존성 계열은 공개 capture 옵션으로
  UUID를 받을 수 있지만, 임의의 `$insert_id` 속성이나 내부 API에 기대면 버전 변경에 취약하다.
- 멀티 Profile 활성 Account는 한 Account의 한 주 관측을 모아 distinct Profile 수를 세야 하므로 단순 Trends
  formula만으로는 부족하다.

### Recommended Approach

인증 shell 쿼리를 소비하는 단일 관측 컴포넌트를 shell 최상위에 둔다. Web에서 Account 식별자와 쿼리가
준비된 뒤 route가 바뀌거나 selected Profile·선택 가능 Profile 집합이 바뀌면
`multi_profile_context_observed`를 보낸다. 속성은 다음 두 개로 제한한다.

- `selected_profile_id`: 선택 Profile의 opaque ID 또는 선택 없음
- `multi_profile_eligible`: 현재 선택 가능한 Profile이 2개 이상인지 나타내는 boolean

선택 가능 수는 `me.profiles`의 현재 결과로 계산한다. 이 목록은 Membership과 조회 가능 조건을 이미 반영한다.
관측 컴포넌트는 같은 shell 상태에서 중복 effect가 실행돼도 한 번만 보내고, 실제 route 이동 뒤 같은 경로로
돌아온 경우에는 새 화면 조회로 보낸다. ProfileSwitcher 안에서는 이 이벤트를 보내지 않는다. 앱 소유
속성에 pathname을 복제하지 않고 표준 SDK metadata는 그대로 둔다.

기존 `profile_selected`는 모든 성공한 선택의 도착 Profile 관측으로 유지한다. 직접 선택을 시작할 때 출발
Profile, 도착 Profile과 선택 원인을 콜백 closure에 고정한다. 직접 선택이고 두 ID가 다를 때만 별도
`profile_switched` 이벤트를 추가한다.

- `previous_profile_id`: 출발 Profile의 opaque ID
- `selected_profile_id`: 도착 Profile의 opaque ID

첫 선택은 출발 ID가 없으므로 제외한다. 같은 ID 재선택은 제외한다. Profile 생성 흐름은 원인을 자동 선택으로
넘겨 `profile_selected`만 성공 시 보내고 `profile_switched`는 보내지 않는다. 이 구조는 기존 시계열을
깨뜨리지 않으면서 새 전환 시계열의 시작점을 분명히 한다.

생성·Post·Follow mutation은 요청을 시작할 때 Account identity와 행동 주체 Profile을 고정한다. 성공
콜백은 고정한 Profile ID를 사용한다. 현재 PostHog Account identity가 시작 시점과 다르면 잘못 귀속하지
않고 이벤트를 생략하며 이 경계를 브라우저 인수 검증으로 확인한다. 분석 관측 누락은 허용되지만 다른 Account로
옮기는 것은 허용하지 않는다.

각 mutation 호출은 논리적 작업 ID를 한 번 만들고 관련 앱 소유 이벤트의 PostHog capture UUID로 넘긴다. 같은
콜백이나 전송이 재시도돼도 이벤트 종류별 UUID를 다시 만들지 않는다. 서로 다른 이벤트에는 서로 다른 UUID를
사용한다. 공개 capture 옵션을 사용하고 `$insert_id`, SDK persistence나 내부 계산 함수를 직접 조작하지 않는다.
현재 lockfile의 SDK가 이 옵션을 제공하는지 타입과 전송 페이로드로 함께 확인한다.

PostHog에는 Account·주차 단위의 저장 HogQL 쿼리를 둔다. 쿼리는 다음 순서로 계산한다.

1. 승인된 화면·생성·선택·Post·Follow·검색 이벤트의 합집합에서 WAA를 만든다.
2. `multi_profile_context_observed.multi_profile_eligible = true`가 한 번 이상인 Account를 멀티 Profile 대상
   WAA로 표시한다.
3. 문맥, `profile_selected`, `post_created`, `follow_succeeded`의 행동 주체 또는 선택 Profile ID를 합쳐
   Account별 distinct 사용 Profile 수를 센다.
4. 대상 WAA이면서 사용 Profile 수가 2 이상인 Account를 멀티 Profile 활성 Account로 표시한다.
5. 같은 주간 Account 집합에서 활성 사용률과 도달률을 계산하고 세 집단의 절대 수를 함께 반환한다.

전환은 `profile_switched`, 생성은 `profile_created`, 핵심 행동은 `post_created`와 `follow_succeeded`를 사용한다.
Follow `result`로 관계 성립과 요청 생성을 나눈다. 처음 멀티 Profile 활성 Account가 된 주는 주간 집합의 첫
등장으로 계산하고 W+1·W+4 기능 리텐션과 대상 Account 제품 리텐션을 별도 저장 쿼리로 만든다.

운영 제외 목록은 PostHog의 접근 제한된 cohort 또는 같은 수준의 관리 surface에서 버전별로 유지한다. 모든
저장 쿼리는 한 버전만 참조한다. 대시보드 설명과 쿼리 결과에는 계산 규칙 버전, 제외 목록 버전,
Asia/Seoul 관측 기간과 실행 시각을 함께 표시한다. 최신 제외 목록을 과거 주에도 적용한다.

### Allowed Alternatives

새 `profile_switched` 대신 기존 `profile_selected`에 선택 원인과 출발 Profile을 추가할 수 있다. 다만 새
속성이 있는 관측만 전환 후보로 사용하고, 기존 관측과 생성 자동 선택을 섞지 않으며, 동일한 합성·브라우저
인수 검증을 통과해야 한다. 기존 시계열의 의미가 넓고 쿼리 실수 가능성이 커서 별도 이벤트를 기본안으로
권장한다.

자격 집계는 저장 HogQL 쿼리 대신 같은 결과를 내는 PostHog cohort와 Insight 조합으로 만들 수 있다. 주간
Account 집합, distinct Profile 수, 최신 제외 목록의 과거 적용과 실행 metadata를 같은 방식으로 검증할 수
있어야 한다.

### Known Traps

- 표준 `$pageview`에 selected Profile이 있다고 가정하거나 앱 소유 `$pageview`를 다시 보내지 않는다.
- `profiles.length >= 2`인 화면만 문맥 이벤트를 보내면 자격이 없는 WAA와 관측 누락을 구분할 수 없다.
- `profile_created`의 `selected_profile_id` 이름만 보고 생성된 Profile을 사용 Profile로 세지 않는다.
- `profile_selected` 전체를 전환으로 세지 않는다.
- 현재 화면의 selected Profile을 mutation 완료 시 다시 읽지 않는다. 요청 시작 시점의 주체를 보존한다.
- 앱 소유 속성에 Account ID, 이름, handle, Post Content, 검색 원문이나 Follow 대상 Profile ID를 더하지
  않는다.
- PostHog의 일반 test-account filter와 PROD-555의 버전별 제외 목록을 혼용하지 않는다.
- 진행 중인 주, 미도래 리텐션과 분모 0을 0%로 바꾸지 않는다.

## Risks / Trade-offs

- [Relay cache가 짧은 시간 동안 이전 Profile 목록을 보여줄 수 있음] → 네트워크 갱신 뒤 상태 변화도 다시
  관측하고, 실제 production 인수 검증에서 서버 응답과 전송 이벤트를 맞춰 본다. 오래된 자격 관측이
  확인되면 관측 컴포넌트만 네트워크 응답이 확인된 쿼리 경계로 좁힌다.
- [화면마다 문맥 이벤트가 하나 늘어 이벤트 양이 증가함] → route별 한 번으로 제한하고 별도 pathname과
  Profile 목록을 속성으로 보내지 않는다.
- [식별자가 바뀐 동안 끝난 mutation 이벤트가 누락될 수 있음] → 다른 Account로 잘못 귀속하는 것보다 누락을
  택하고, 인수 검증에서 누락 경계를 기록한다.
- [늦게 도착한 이벤트와 최신 제외 목록으로 과거 수치가 바뀜] → 완료 주를 고정값으로 표현하지 않고 실행 시각과
  두 버전을 함께 남긴다.
- [PostHog UI만으로 복합 집합이 표현되지 않을 수 있음] → 저장 HogQL 쿼리를 기준 계산으로 두고 Insight는 그
  결과를 시각화한다.
- [production 실수집 표본이 적어 초기 리텐션이 흔들림] → 비율과 절대 수를 함께 보고 미도래 주는 계산하지
  않는다.

## Migration Plan

1. 타입이 정해진 이벤트와 호출부 검증을 추가하고 합성 페이로드로 선택 원인, 자격, 주체 고정과 UUID 재사용을 확인한다.
2. 브라우저 인수 검증에서 인증 화면, Profile 0·1·2개, 직접 전환, 생성 자동 선택, Account 전환과 전송 실패를
   확인한다.
3. production 배포 전에 운영 제외 목록 첫 버전과 계산 규칙 버전을 만든다.
4. PROD-795 통합 검증 뒤 production 실수집 페이로드를 개인정보 없는 증거로 대조한다.
5. 관측 시작점을 기록하고 저장 쿼리, Insight, 대시보드와 주간 점검 절차를 연다.
6. rollback이 필요하면 새 앱 소유 이벤트 호출부와 대시보드를 비활성화한다. 기존 PostHog runtime과 이벤트는
   유지하고, 이미 수집한 기간은 계산 계약이 적용되지 않는 구간으로 표시한다.

## 2026-09-22 현재 구현 대조

이 절은 최신 `main`의 `8650253d7cfaea3cab94f35d318d381c838af6c9`를 읽고 보완한 작업 메모다.
계산식과 제품 요구사항은 2026-09-03 승인한 계약을 유지한다. 아래 구현 선택은 같은 계약을 만족하는
더 작은 접근이 확인되면 바꿀 수 있다.

- 현재 관측 위치 후보는 `apps/app/src/components/shell/UniversalShell.tsx`다. 이 쿼리는
  `SidebarNavigation_query`를 통해 `ProfileSwitcher_query`를 조회한다. 새 관측 컴포넌트는 자신의
  Relay fragment를 선언하고 부모가 spread한다. responsive navigation의 표시 여부와 무관하게 인증 화면을
  관측하며, Profile 0개·선택 없음·공개 화면의 인증 방문도 빠지지 않는지 확인한다.
- `apps/api/src/graphql/resolvers/profile/field/account.ts`의 `Account.profiles`는 Membership과
  `visibleProfileWhere`를 적용한다. 별도 API·DB·migration 없이 이 결과를 사용한다. 최신 ADR 0019에 따라
  Origin·Role·생성자를 추가 자격 조건으로 삼지 않으며, Remote 동작 지원을 새로 약속하지 않는다.
- `AnalyticsSessionBridge.tsx`는 `useSession()`을 구독한다. 새 앱 소유 지표는 행동 발생 시 인증 Account와
  SDK identity가 일치할 때만 보낸다. SDK에 이전 로그인 identity가 남아 있다는 사실만으로 인증됐다고
  판단하지 않는다. 인증 복원·logout·Account 전환과 늦게 완료된 성공을 실제 경로로 검증한다.
- 모든 지표는 typed event의 인증 관측을 사용한다. 로그인 후 person 병합으로 익명 관측이 연결되더라도
  WAA에 소급하지 않는다. 쿼리는 capture 당시 Account `distinct_id`를 기준으로 하고, 사후 person 연결만으로
  인증을 판정하지 않는다. 기존 미검증 이벤트 기간은 새 관측 시작점 이전으로 구분한다.
- 전송 재시도의 UUID뿐 아니라 최초 성공 관측의 `timestamp`도 고정한다. 요청 시작은 주체를 고정하는
  시점이며 성공 시각을 앞당기는 근거가 아니다. 성공이 확인될 때 정한 시각을 재전송에서 보존한다.
  SDK가 제공하는 공개 `uuid`·`timestamp` 옵션을 사용하고 별도 재시도 큐는 추가하지 않는다.
- PostHog의 중복 제거는 즉시 완료되지 않는다. 저장 쿼리도 Account, 이벤트 종류와 UUID가 같은 성공을
  한 번만 세도록 작성하고 같은 UUID·시각을 가진 중복 입력을 집계 직후부터 검증한다.
  [PostHog Events](https://posthog.com/docs/data/events)의 timestamp·deduplication 설명과 설치된
  `CaptureOptions`를 대조했다. person 병합은 [PostHog People](https://posthog.com/docs/data/persons)를 참조한다.
- `ProfileSwitcher.tsx`는 생성 성공을 보내고 자동 선택을 호출하며, `PostComposer.tsx`와
  `FollowButton.tsx`가 핵심 행동의 성공을 관측한다. 기존 성공 판단과 Relay actor reset을 보존한 채
  선택 원인·시작 주체·성공 시각만 분석 경계로 전달한다. GraphQL 부분 오류는 실제 도달 가능한 응답으로
  성공 객체 유무와 관측 결과를 확인한다.
- PROD-795는 2026-09-22 조회에서 Done이다. 기존 handoff의 Todo 표시는 갱신한다. PROD-555 자체의
  production 수집 대조는 아직 실행하지 않았으며 이 선행 이슈의 Done으로 대신하지 않는다.
- 현재 Web runtime은 `disable_session_recording: true`다. 이 지표 작업은 Product Analytics 설정과
  Replay 비활성 상태를 유지한다. Replay 재활성화와 품질 인수는 PROD-741의 책임이다.
- 리텐션의 최초 활성 주는 사용자가 대시보드에서 고른 조회 기간으로 잘라 계산하지 않는다. 새 관측 시작점
  이후의 전체 확인 가능 이력에서 기준 집단을 만들고, 관측 이전의 첫 사용을 추정하지 않는다. Profile별
  사용량도 Account·행동 주체 Profile 조합으로 확인하며, 사용 Profile distinct 집계와 행동 횟수를 구분한다.
- 현재 저장소 지침에 따라 OpenSpec archive는 선택적 정리다. 과거 본문의 archive gate를 제거하되
  합성 검증·초기 대시보드·production 실수집·주간 운영이라는 이슈 결과는 그대로 유지한다.

### 구현 세션의 focused validation

- 분석 adapter·이벤트 타입·Native no-op unit 검증과 `pnpm --filter @kosmo/app check`
- Shell/ProfileSwitcher/PostComposer/FollowButton의 Storybook 실제 상호작용 검증
- `apps/web/e2e/analytics.e2e.ts`에서 SDK 전송을 가로채 identity·Profile·UUID·시각·선택 분류 대조
- 동일한 합성 입력에 대한 독립 기대표와 실제 저장 쿼리의 출력 비교
- 이슈 범위의 앱 build·lint와 production 수집 대조. Spec 단계에서는 실행 코드 테스트를 수행하지 않는다.

## Open Questions

없음.
