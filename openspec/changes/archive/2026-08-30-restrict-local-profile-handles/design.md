## Context

Local Profile 생성은 공용 Zod schema로 handle의 길이와 문자 형식을 검사하고, GraphQL resolver가 같은
schema를 input validation에 사용한다. 생성 UI도 이 schema를 사전 검증에 재사용하지만, 현재 Profile
Switcher의 입력과 오류 표시는 공용 TextField가 아닌 별도 구성이고 GraphQL 오류의 raw message를 표시할 수
있다.

GraphQL 경계에는 이미 `VALIDATION` code와 `field` extension을 제공하는 field error 계약이 있고, 앱에는 이
구조화된 정보를 읽어 특정 입력 오류로 연결하는 선례가 있다. 공용 TextField는 input과 오류 설명의 연결,
invalid 상태와 live-region 처리를 제공한다. PROD-816은 System Reserved Handle 하위 정책의 공용
서버·클라이언트 적용과 통합 완료를 함께 책임진다. GraphQL shape나 데이터베이스 schema는 바꾸지 않는다.

## Goals / Non-Goals

**Goals:**

- Local Profile 생성의 모든 서버 진입점에서 동일한 System Reserved Handle 정책을 적용한다.
- 공용 검증 계약을 서버와 Android·iOS·Web 클라이언트가 함께 소비해 예약 목록과 정규화의 drift를 막는다.
- trim과 lowercase 뒤 전체의 정확 일치만 적용해 정상 단어의 부분 문자열 오탐을 방지한다.
- Local handle로 생성 가능한 현재 앱의 최상위 정적 route namespace가 동적 Profile route와 충돌하지 않게
  System Reserved 목록에 포함한다.
- 정책 위반을 안전한 handle field 오류로 전달하고 기존 접근성 계약을 유지한다.
- System Reserved Handle 정책을 새 Local Profile 생성에만 적용하고 기존 Profile의 handle과 lifecycle을 유지한다.

**Non-Goals:**

- Remote Profile의 `preferredUsername`이나 원격 handle을 검사하지 않는다.
- 유해표현의 신고·맥락·정체성·제재·이의제기와 정책 목록 관리 주체는 이번 change와 PROD-816의 범위에서
  다루지 않으며 별도 범위로 남긴다.
- 외부 모더레이션 서비스, runtime dependency 또는 원격 목록을 도입하지 않는다.
- 기존 충돌 Profile을 자동으로 rename, disable 또는 delete하지 않는다.
- 기존 충돌의 전체 감사, 영향 분석, 유지·정리 결정과 후속 cleanup은 PROD-878 범위로 분리한다.

## Implementation Guidance

### Current Constraints

- handle 형식 schema는 Core에 있고 서버와 생성 UI가 함께 사용한다.
- GraphQL input validation 실패는 첫 issue를 `VALIDATION` code와 input-relative `field`로 변환한다.
- Local Profile의 유일성은 configured Local Instance와 정규화 handle의 데이터베이스 제약으로 보장된다.
- Profile 생성은 Profile과 Owner Membership을 한 transaction에서 저장하므로 정책 검증은 transaction의 쓰기보다
  앞서 끝나야 한다.
- 공용 TextField가 오류 border, `aria-invalid`, 오류 설명 연결과 live-region을 이미 소유한다.

### Recommended Approach

공용 Profile validation 경계에 System Reserved Handle 목록과 정규화·판정 로직을 함께 둔다. 판정은 부수
효과가 없는 단일 계약이어야 하며, 기존 handle schema가 이 계약을 사용하도록 구성한다. 서버와 클라이언트는
각각 목록을 복제하거나 독자적인 정규화를 구현하지 않고 같은 schema 또는 같은 판정 함수를 사용한다.

System Reserved Handle은 trim과 lowercase만 적용한 handle 전체를 예약 집합과 비교한다. 부분 문자열은
예약 식별자로 판정하지 않으며, underscore 제거와 숫자 치환도 적용하지 않는다.

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
발생하면 GraphQL의 `code`와 `field`를 구조적으로 확인해 같은 field 오류로 매핑하고 입력값을 보존한다. Relay
`onError`의 `source.errors`가 배열일 때도 기존 분류기를 재사용해 같은 안전한 field 오류와 dismiss 버전 가드를
적용하고, 일치하지 않는 오류나 network 오류는 기존 일반 오류 alert를 유지한다.

System Reserved Handle은 생성 transaction에 들어오는 새 Local Profile handle만 판정한다. 기존 Local Profile
데이터를 재검증하거나, 정책 충돌만을 이유로 handle 또는 lifecycle을 변경하는 migration이나 운영 쓰기 작업은
PROD-816에 포함하지 않는다. 기존 충돌의 전체 감사, 영향 분석, 유지·정리 결정과 후속 조치는 PROD-878에서
독립적으로 다룬다.

### Allowed Alternatives

- 기존 schema의 refinement로 직접 판정하거나 별도의 순수 evaluator를 schema에서 호출할 수 있다. 어느
  형태든 예약 목록·정규화·판정의 기준은 하나이고 독립적으로 검증 가능해야 한다.
- 내부 판정 결과를 boolean 또는 비공개 reason enum으로 표현할 수 있다. 외부 오류 shape와 안전한 사용자
  문구가 바뀌지 않는 한 내부 표현은 구현 세부사항이다.
- PROD-878에서 기존 데이터 감사를 수행하기로 결정하더라도 현재 change의 구현이나 배포 절차에 결합하지
  않는다. PROD-816에는 감사 전용 query, 일회성 code 또는 package script를 추가하지 않는다.

### Known Traps

- `includes`나 regex substring 검사로 목록을 적용하면 `supporter`, `cybersecurity`, `class`, `analysis` 같은
  정상 handle을 오탐한다.
- 클라이언트 사전 검증만 추가하면 직접 API를 호출해 우회할 수 있다.
- raw schema 또는 GraphQL message, 내부 분류나 목록을 UI·log·analytics에 노출하면 정책 정보가 새어 나간다.
- 공용 TextField의 error announcement와 별도 `alert`를 함께 쓰면 같은 오류가 중복 announcement될 수 있다.
- Remote Profile이나 기존 lifecycle·유일성 계약까지 함께 바꾸면 PROD-816의 범위를 벗어난다.

## Risks / Trade-offs

- [정적 목록이 시간이 지나며 낡거나 서버·클라이언트에서 달라질 수 있음] → 공용 기준과 parity test를
  두고 목록 변경 시 provenance와 예시를 함께 검토한다.
- [앱 route가 추가되었지만 예약 목록이 갱신되지 않을 수 있음] → 최상위 정적 route 중 handle 문자 형식으로
  생성 가능한 segment를 route 변경과 같은 배포 단위에서 목록·공용 단위 사례에 반영한다.
- [서버와 클라이언트 배포 시점 차이로 클라이언트 사전 검증을 통과할 수 있음] → 서버를 최종 권위로 유지하고
  구조화된 server field 오류를 안전한 동일 문구로 처리한다.
- [기존 Profile이 새 정책과 충돌한 상태로 남을 수 있음] → 기존 Profile은 호환성을 위해 그대로 유지하고,
  전체 감사와 유지·정리 결정은 PROD-878에서 독립적으로 수행한다.

## Migration Plan

1. 공용 정책 evaluator와 schema 연결을 추가하고 예약어, 정확 일치와 정상 단어 회귀 사례를 검증한다.
2. GraphQL Local Profile 생성이 transaction write 전에 정책을 거부하고 기존 field error 계약을 지키는지
   통합 검증한다.
3. Profile 생성 form을 공용 TextField와 구조화된 오류 매핑으로 전환하고 Android·iOS·Web 상호작용과
   접근성을 검증한다.
4. 기존 충돌의 감사·영향 분석·유지 또는 정리 결정을 PROD-878로 인계하고, 이 후속 범위가 PROD-816의
   배포·완료를 막지 않는지 canonical·Linear·OpenSpec을 대조한다.
5. PROD-816에서 System Reserved Handle의 서버 권위 검증과 클라이언트 사전 검증을 통합해 배포한다. 문제가
   생기면 신규 생성 차단을 되돌릴 수 있으며 기존 Profile에는 쓰기 작업이나 rollback을 수행하지 않는다.

## Open Questions

System Reserved Handle 정책에 관한 추가 질문은 없다. 유해표현 판정과 별도 모더레이션 기능의 결과·집행은
이번 change와 PROD-816의 결정 대상이 아니며 별도 범위로 남긴다. 신규 생성 차단과 OpenSpec archive는 PROD-816이
소유하고, 기존 충돌의 처리 절차는 PROD-878이 별도로 소유한다.
