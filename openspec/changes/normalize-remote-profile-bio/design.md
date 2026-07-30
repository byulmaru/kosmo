## Context

현재 `packages/fedify`의 remote actor projection은 Fedify actor `summary`를 `.toString()`으로 바꾼 뒤 곧바로 `profileBioSchema`에 전달한다. 이 때문에 HTML markup이 500자 이하이면 그대로 저장되고, markup 포함 원문이 500자를 넘으면 표시 가능한 평문은 짧아도 bio가 `null`이 된다. 최초 materialization과 refresh는 같은 projection을 사용하므로 결함도 공유하며, GraphQL과 React Native `Text`는 DB 값을 그대로 소비한다.

`packages/core`에는 이미 ActivityPub Note HTML을 JSDOM과 ProseMirror schema로 canonicalize하고 Plain Text를 파생하는 경계가 있다. 이 경계는 entity, paragraph/hard break, 링크 표시 텍스트, malformed/unknown markup과 script/style/template 제거를 테스트한다. 새 parser나 sanitizer dependency 없이 이 검증된 의미를 remote Profile bio에도 공유할 수 있다.

기존 DB row는 `profileByHandle`과 Node 조회만으로 갱신되지 않고, 7일 TTL refresh도 federation 내부 사용과 원격 instance 상태에 의존한다. 따라서 code fix와 별도로 저장된 ActivityPub Remote Profile bio를 직접 정리하는 실행 경계가 필요하다.

## Goals / Non-Goals

**Goals:**

- string 및 language-tagged remote actor `summary`를 동일한 표시 가능한 평문으로 투영한다.
- HTML projection 뒤에 `profileBioSchema`를 적용해 trim·nullable·500자 계약을 보장한다.
- 최초 materialization과 refresh가 같은 projection을 사용하게 한다.
- 기존 non-null ActivityPub Remote Profile bio를 dry-run 후 bounded batch로 보정하고 진행 결과를 확인할 수 있게 한다.
- 기존 Note projection의 보안·정규화 회귀와 Local Profile/outbound 회귀를 함께 검증한다.

**Non-Goals:**

- rich-text bio, 링크 클릭, HTML renderer 또는 GraphQL schema 변경.
- Local Profile 입력을 HTML로 해석하거나 local actor outbound 표현을 변경하는 것.
- remote actor 언어 선택 정책을 Fedify의 현재 `LanguageString.toString()` 경계 이상으로 확장하는 것.
- 이미 `null`로 저장되어 원문이 남지 않은 bio를 원격 fetch로 복구하는 것.
- background queue, 주기적 refresh worker 또는 DB schema migration 도입.

## Implementation Guidance

### Current Constraints

- remote actor projection은 federation package에 있지만 검증된 HTML parser와 Plain Text 추출기는 core의 PostContent 경계에 있다. Profile 전용 regex strip이나 DOM parser 복제는 기존 보안 테스트를 우회한다.
- 현재 `profileBioSchema`는 HTML 의미를 알지 못하며 trim과 최대 길이만 검증한다. 기존 호출 순서를 유지하면 markup 길이가 먼저 거절된다.
- `Profile.bio`는 Local/Remote가 공유하는 nullable text column이다. 정리 대상은 별도 Origin column이 아니라 연결된 ActivityPub Instance 경계로 제한해야 한다.
- GraphQL profile query는 DB-only이고 stale refresh는 비동기·요청 종속적이다. UI 조회나 TTL 대기는 기존 row 정리의 완료 증거가 아니다.
- 저장값을 바꾸는 작업은 schema migration이 아니어도 중단·재실행·진행 관측과 rollback 영향을 고려해야 한다.

### Recommended Approach

1. 기존 ActivityPub Note summary가 사용하는 DOM→ProseMirror→Plain Text pipeline을 순수한 공유 projection 경계로 정리한다. Note projection과 remote Profile projection이 같은 구현 및 fixture를 사용하되, Profile 코드는 PostContent document 자체를 저장하지 않는다.
2. Fedify가 선택한 string 또는 language-tagged summary 문자열을 공유 projection에 전달하고, 그 결과에만 `profileBioSchema`를 적용한다. projection 결과가 비어 있으면 `null`로 수렴시키며, 반환 projection은 최초 insert와 refresh update 모두에 사용한다.
3. 데이터 정리는 네트워크 fetch 없이 저장된 non-null ActivityPub Remote Profile bio를 stable Profile identity 순서의 bounded batch로 읽는다. 같은 projection과 schema 결과가 현재 값과 다를 때만 갱신하고, 각 batch는 독립 transaction으로 commit한다.
4. 정리 실행은 dry-run에서 대상·변경·null 전환·실패 수를 먼저 보고하고, apply 실행에서 batch 진행과 최종 합계를 출력한다. 같은 데이터에 재실행했을 때 추가 변경이 없어야 하며 Local Instance Profile은 항상 제외한다.
5. 검증은 projection pure test, remote actor materialization/refresh DB test, data cleanup DB test와 기존 local actor outbound test를 분리한다. UI 코드는 바꾸지 않고 기존 fragment가 정규화된 bio를 표시하는 경계를 회귀 확인한다.

### Allowed Alternatives

- shared projection을 별도 pure helper로 추출하거나 기존 remote Note projection의 summary 결과를 직접 재사용하는 방식은 모두 허용한다. 단, 기존 JSDOM/ProseMirror canonicalization 의미와 회귀 fixture를 공유하고 spec의 결과를 만족해야 한다.
- one-shot 정리 경계는 core package command 또는 동일 application image의 별도 entrypoint로 노출할 수 있다. 어느 쪽이든 dry-run, bounded batch, 재실행 수렴, ActivityPub Remote Profile 한정과 관측 가능한 결과를 제공해야 한다.

### Known Traps

- `profileBioSchema`를 projection 전에 호출하면 markup 길이 때문에 유효한 평문이 다시 유실된다.
- regex로 tag를 제거하면 entity, malformed markup, block boundary, script/style/template과 속성 처리를 기존 보안 계약과 다르게 만든다.
- HTML을 GraphQL 또는 React Native UI에서 처리하면 저장값과 다른 소비자에게 raw markup이 남고 Local/Remote 경계가 흐려진다.
- remote ingress helper를 Local Profile 편집이나 outbound actor 생성에 적용하면 평문에 포함된 의도적 `<`, `&` 의미를 바꿀 수 있다.
- 단일 무제한 transaction이나 전체 row 동시 파싱은 lock·memory·복구 경계를 없앤다.
- 원격 refetch를 정리의 필수 경로로 사용하면 unreachable/suspended instance, rate limit과 network 실패 때문에 완료를 보장할 수 없다.

## Risks / Trade-offs

- [기존 parser 의미가 Profile bio에도 전파됨] → entity·문단·hard break·malformed HTML fixture를 Profile projection test에서 고정하고 Note 회귀 test를 함께 실행한다.
- [정리 후 raw HTML 원문은 DB에서 복원할 수 없음] → apply 전에 dry-run 결과와 DB backup/복구 가능성을 확인하고, 변경 row 수와 실패를 기록한다.
- [대량 row 파싱의 CPU·memory·lock 비용] → stable cursor 기반 bounded batch와 batch별 transaction을 사용하고 batch 크기를 실행 옵션으로 조절한다.
- [기존 `null` bio는 원문 부재로 복구 불가] → 이번 완료 조건에서 제외하고, 원격 refetch 복구가 필요하면 별도 관측 근거와 이슈로 다룬다.
- [비동기 refresh 동안 기존 raw HTML이 잠시 남을 수 있음] → code rollout과 별도로 명시적 정리 command를 실행하고, 완료를 refresh TTL이 아닌 정리 결과로 검증한다.

## Migration Plan

1. schema 변경 없이 shared projection, remote materialization/refresh 적용과 one-shot 정리 command를 같은 application image에 포함한다.
2. pure projection, remote insert/refresh, cleanup, Local Profile/outbound 회귀 검증을 통과시킨다.
3. 대상 환경에서 dry-run을 실행해 scan/change/null/failure 수와 예상 batch 비용을 확인하고 필요한 DB backup을 확보한다.
4. bounded batch apply를 실행하고 batch별 진행 및 최종 합계를 보존한다.
5. 같은 command를 다시 dry-run해 추가 변경 0건, Local Profile 변경 0건과 representative GraphQL/UI 조회 결과를 확인한다.

애플리케이션 rollback은 이전 image로 되돌려 향후 projection을 중단할 수 있다. 이미 정리된 평문 bio는 올바른 canonical 값이므로 자동으로 raw HTML로 되돌리지 않으며, 정확한 원문 복원이 필요하면 apply 전 DB backup을 사용한다.

## Open Questions

없음.
