## Context

Local Profile 생성은 공용 Zod schema로 handle의 길이와 문자 형식을 검사하고, GraphQL resolver가 같은
schema를 input validation에 사용한다. 생성 UI도 이 schema를 사전 검증에 재사용하지만, 현재 Profile
Switcher의 입력과 오류 표시는 공용 TextField가 아닌 별도 구성이고 GraphQL 오류의 raw message를 표시할 수
있다.

GraphQL 경계에는 이미 `VALIDATION` code와 `field` extension을 제공하는 field error 계약이 있고, 앱에는 이
구조화된 정보를 읽어 특정 입력 오류로 연결하는 선례가 있다. 공용 TextField는 input과 오류 설명의 연결,
invalid 상태와 live-region 처리를 제공한다. PROD-816은 System Reserved Handle과 Explicitly Harmful Handle
Expression을 이 이슈 안의 하위 정책으로 관리하고, 공용 서버·클라이언트 적용과 통합 완료도 함께 책임진다.
GraphQL shape나 데이터베이스 schema는 바꾸지 않는다.

## Goals / Non-Goals

**Goals:**

- Local Profile 생성의 모든 서버 진입점에서 동일한 System Reserved Handle 및 Explicitly Harmful Handle
  Expression 정책을 적용한다.
- 공용 검증 계약을 서버와 Android·iOS·Web 클라이언트가 함께 소비해 목록과 정규화의 drift를 막는다.
- 정확 일치와 제한된 우회 정규화만 적용해 정상 단어의 부분 문자열 오탐을 방지한다.
- Local handle로 생성 가능한 현재 앱의 최상위 정적 route namespace가 동적 Profile route와 충돌하지 않게
  System Reserved 목록에 포함한다.
- 정책 위반을 안전한 handle field 오류로 전달하고 기존 접근성 계약을 유지한다.
- 기존 Local Profile과 새 정책의 충돌을 배포 전에 읽기 전용으로 감사한다.

**Non-Goals:**

- Remote Profile의 `preferredUsername`이나 원격 handle을 검사하지 않는다.
- post, display name, bio 또는 문맥에 따라 달라지는 모욕·불쾌 표현을 판별하지 않는다.
- 로마자 표기 한국어 욕설, Unicode confusable, 임의의 leetspeak를 일반화하지 않는다.
- 외부 moderation 서비스, Bluesky runtime dependency 또는 원격 denylist를 도입하지 않는다.
- 기존 충돌 Profile을 자동으로 rename, disable 또는 delete하지 않는다.

## Implementation Guidance

### Current Constraints

- handle 형식 schema는 Core에 있고 서버와 생성 UI가 함께 사용한다.
- GraphQL input validation 실패는 첫 issue를 `VALIDATION` code와 input-relative `field`로 변환한다.
- Local Profile의 유일성은 configured Local Instance와 정규화 handle의 데이터베이스 제약으로 보장된다.
- Profile 생성은 Profile과 Owner Membership을 한 transaction에서 저장하므로 정책 검증은 transaction의 쓰기보다
  앞서 끝나야 한다.
- 공용 TextField가 오류 border, `aria-invalid`, 오류 설명 연결과 live-region을 이미 소유한다.

### Recommended Approach

공용 Profile validation 경계에 두 목록과 정규화·판정 로직을 함께 둔다. 판정은 부수 효과가 없는 단일
계약이어야 하며, 기존 handle schema가 이 계약을 사용하도록 구성한다. 서버와 클라이언트는 각각 목록을
복제하거나 독자적인 정규화를 구현하지 않고 같은 schema 또는 같은 판정 함수를 사용한다.

System Reserved Handle은 trim과 lowercase만 적용한 handle 전체를 예약 집합과 비교한다. Explicitly Harmful
Handle Expression은 같은 기초 값에서 underscore를 제거한 compact 값과, compact 값에 허용된 네 숫자 치환을
적용한 substituted 값을 모두 만든다. 둘 중 하나를 유해표현 집합과 비교하되 모든 비교는 handle 전체의 정확
일치여야 한다. 예약어 정책에는 underscore 제거와 숫자 치환을 적용하지 않는다.

앱 route group은 URL segment에 나타나지 않으므로 `apps/app/src/app`의 최상위 정적 URL segment를 기준으로
검토한다. 그중 Local handle 문자 형식으로 생성 가능한 `bookmarks`, `compose`, `feedback`, `hashtags`, `home`,
`local`, `notifications`, `search`, `settings`를 System Reserved 목록에 포함한다. `login`과 `privacy`는 기존
범주에 이미 포함한다. `follow-requests`와 `profile-edit`는 하이픈 때문에 handle 형식 검증에서 거부되므로
underscore 별칭을 추가하지 않는다. 이후 최상위 정적 route 변경은 같은 변경에서 이 curated 목록을 검토한다.

서버는 기존 GraphQL input validation 경계에서 정책 위반을 차단하고 `VALIDATION` code와 `handle` field를
유지한다. 공개 오류에는 내부 분류, 일치한 표현 또는 전체 목록을 넣지 않는다. 이 계약을 표현하기 위해 내부
reason이나 판정 함수를 둘 수 있지만 GraphQL input·payload shape를 추가하지 않는다.

생성 UI는 mutation 직전에 공용 검증을 수행한다. 정책 위반이면 mutation을 호출하지 않고 공용 TextField의
error에 `사용할 수 없는 단어가 포함된 핸들이에요.`를 전달한다. 서버가 더 최신 정책으로 거부하는 배포 차이가
발생하면 GraphQL의 `code`와 `field`를 구조적으로 확인해 같은 field 오류로 매핑하고 입력값을 보존한다. 두
정책으로 식별할 수 없는 validation 오류나 다른 실패는 기존의 안전한 일반 오류 계약을 유지하며 raw GraphQL
message를 사용자에게 그대로 보여주지 않는다.

배포 전 감사는 배포 대상에서 실제 적용 정책과 같은 조건으로 기존 Local Profile handle만 읽는다. 감사만을
위한 일회성 code와 package script는 저장소에 남기지 않는다. 결과에는 운영 판단에 필요한 제한된 식별자와
정책별 충돌 수만 남기고, 일치한 유해표현을 일반 log나 analytics payload로 전송하지 않는다. 충돌이 있으면
PROD-816이 자동으로 write하지 않고 영향 Profile, 사용자·URL·연합 identity 영향, 정확한 변경 방식,
rollback과 재점검 완료 조건을 소유하는 별도 cleanup 이슈를 만든다. 실제 변경은 그 이슈에서 승인된 forward
data migration 또는 통제된 운영 절차로 수행한다.

### Allowed Alternatives

- 기존 schema의 refinement로 직접 판정하거나 별도의 순수 evaluator를 schema에서 호출할 수 있다. 어느
  형태든 목록·정규화·판정의 기준은 하나이고 독립적으로 검증 가능해야 한다.
- 내부 판정 결과를 boolean 또는 비공개 reason enum으로 표현할 수 있다. 외부 오류 shape와 안전한 사용자
  문구가 바뀌지 않는 한 내부 표현은 구현 세부사항이다.
- 기존 데이터 감사는 배포 대상에서 승인된 read-only query 또는 통제된 운영 점검으로 수행할 수 있다. 실행
  대상이 Local Profile로 제한되고 write가 없음을 검증할 수 있어야 하며, 감사만을 위한 일회성 code나 package
  script를 저장소에 남기지 않는다.

### Known Traps

- `includes`나 regex substring 검사로 목록을 적용하면 `supporter`, `cybersecurity`, `class`, `analysis` 같은
  정상 handle을 오탐한다.
- 예약어에도 underscore 제거나 숫자 치환을 적용하면 승인된 System Reserved Handle 경계를 넓힌다.
- substituted 값만 검사하면 원래 목록에 포함된 `p0rn`, `pr0n` 같은 표현을 놓칠 수 있으므로 compact 원본과
  substituted 값을 모두 비교해야 한다.
- 클라이언트 사전 검증만 추가하면 직접 API를 호출해 우회할 수 있다.
- raw schema 또는 GraphQL message, 일치한 표현이나 내부 분류를 UI·log·analytics에 노출하면 정책 목록과
  불필요한 유해정보가 새어 나간다.
- 공용 TextField의 error announcement와 별도 `alert`를 함께 쓰면 같은 오류가 중복 announcement될 수 있다.
- Remote Profile이나 기존 lifecycle·유일성 계약까지 함께 바꾸면 PROD-816의 범위를 벗어난다.
- Unicode confusable이나 추가 숫자 치환을 임의로 일반화하면 검토하지 않은 오탐 경계가 생긴다.

## Risks / Trade-offs

- [정적 목록이 시간이 지나며 낡거나 서버·클라이언트에서 달라질 수 있음] → 공용 기준과 parity test를
  두고 목록 변경 시 provenance와 예시를 함께 검토한다.
- [앱 route가 추가되었지만 예약 목록이 갱신되지 않을 수 있음] → 최상위 정적 route 중 handle 문자 형식으로
  생성 가능한 segment를 route 변경과 같은 배포 단위에서 목록·공용 단위 사례에 반영한다.
- [제한된 숫자 치환이 정상 handle을 거부할 수 있음] → compact/substituted 전체의 정확 일치만 허용하고 정상
  단어와 부분 문자열 회귀 사례를 고정한다.
- [서버와 클라이언트 배포 시점 차이로 클라이언트 사전 검증을 통과할 수 있음] → 서버를 최종 권위로 유지하고
  구조화된 server field 오류를 안전한 동일 문구로 처리한다.
- [기존 Profile이 새 정책과 충돌할 수 있음] → 배포 전 read-only 감사를 수행하고 자동 변경 없이 별도 운영
  결정을 요구한다.
- [유해표현 목록이 source와 test output에 포함됨] → 정책 전용 경계에 제한하고 실패 출력·telemetry에는 실제
  일치값을 포함하지 않는다.

## Migration Plan

1. 공용 정책 evaluator와 schema 연결을 추가하고 예약어, 유해표현, 우회, 정상 단어 회귀 사례를 검증한다.
2. GraphQL Local Profile 생성이 transaction write 전에 정책을 거부하고 기존 field error 계약을 지키는지
   통합 검증한다.
3. Profile 생성 form을 공용 TextField와 구조화된 오류 매핑으로 전환하고 Android·iOS·Web 상호작용과
   접근성을 검증한다.
4. 배포 대상의 기존 Local Profile을 승인된 read-only 운영 점검으로 감사하고 두 하위 정책의 결과를
   PROD-816에 남긴다. 충돌 시 별도 cleanup 이슈와 승인된 forward data migration 또는 운영 절차를 확정한다.
5. PROD-816에서 두 정책의 서버 권위 검증과 클라이언트 사전 검증을 통합해 배포한다. 문제가 생기면 코드
   enforcement를 되돌릴 수 있지만 감사 결과나 기존 Profile에는 write/rollback을 수행하지 않는다.

## Open Questions

없음. 예약 식별자와 명시적 유해표현은 PROD-816 안의 하위 정책으로 확정했으며, 공용 오류·감사·통합 완료
경계와 OpenSpec archive 책임도 PROD-816에 기록했다.
