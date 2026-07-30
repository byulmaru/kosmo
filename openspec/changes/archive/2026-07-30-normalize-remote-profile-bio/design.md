## Context

현재 `packages/fedify`의 remote actor projection은 Fedify actor `summary`를 `.toString()`으로 바꾼 뒤 곧바로 `profileBioSchema`에 전달한다. 이 때문에 HTML markup이 500자 이하이면 그대로 저장되고, markup 포함 원문이 500자를 넘으면 표시 가능한 평문은 짧아도 bio가 `null`이 된다. 최초 materialization과 refresh는 같은 projection을 사용하므로 결함도 공유하며, GraphQL과 React Native `Text`는 DB 값을 그대로 소비한다.

`packages/core`에는 이미 ActivityPub Note HTML을 JSDOM과 ProseMirror schema로 canonicalize하고 Plain Text를 파생하는 경계가 있다. 이 경계는 entity, paragraph/hard break, 링크 표시 텍스트, malformed/unknown markup과 script/style/template 제거를 테스트한다. 새 parser나 sanitizer dependency 없이 이 검증된 의미를 remote Profile bio에도 공유할 수 있다.

기존 dev DB는 초기화할 예정이므로 저장된 raw HTML bio에 대한 별도 처리는 이번 변경에서 다루지 않는다. 이 변경은 DB schema와 dependency를 변경하지 않는다.

## Goals / Non-Goals

**Goals:**

- string 및 language-tagged remote actor `summary`를 동일한 표시 가능한 평문으로 투영한다.
- HTML projection 뒤에 `profileBioSchema`를 적용해 trim·nullable·500자 계약을 보장한다.
- 최초 materialization과 refresh가 같은 projection을 사용하게 한다.
- 기존 Note projection의 보안·정규화 회귀와 Local Profile/outbound 회귀를 함께 검증한다.

**Non-Goals:**

- rich-text bio, 링크 클릭, HTML renderer 또는 GraphQL schema 변경.
- Local Profile 입력을 HTML로 해석하거나 local actor outbound 표현을 변경하는 것.
- remote actor 언어 선택 정책을 Fedify의 현재 `LanguageString.toString()` 경계 이상으로 확장하는 것.
- 기존 저장 bio에 대한 별도 처리(개발 DB 초기화로 대체).
- DB schema와 dependency 변경.

## Implementation Guidance

### Current Constraints

- remote actor projection은 federation package에 있지만 검증된 HTML parser와 Plain Text 추출기는 core의 PostContent 경계에 있다. Profile 전용 regex strip이나 DOM parser 복제는 기존 보안 테스트를 우회한다.
- 현재 `profileBioSchema`는 HTML 의미를 알지 못하며 trim과 최대 길이만 검증한다. 기존 호출 순서를 유지하면 markup 길이가 먼저 거절된다.
- `Profile.bio`는 Local/Remote가 공유하는 nullable text column이다.

### Recommended Approach

1. 기존 ActivityPub Note summary가 사용하는 DOM→ProseMirror→Plain Text pipeline을 순수한 공유 projection 경계로 정리한다. Note projection과 remote Profile projection이 같은 구현 및 fixture를 사용하되, Profile 코드는 PostContent document 자체를 저장하지 않는다.
2. Fedify가 선택한 string 또는 language-tagged summary 문자열을 공유 projection에 전달하고, 그 결과에만 `profileBioSchema`를 적용한다. projection 결과가 비어 있으면 `null`로 수렴시키며, 반환 projection은 최초 insert와 refresh update 모두에 사용한다.
3. 검증은 projection pure test, remote actor materialization/refresh DB test, Local Profile/outbound 회귀 test를 분리한다. UI 코드는 바꾸지 않고 기존 fragment가 정규화된 bio를 표시하는 경계를 회귀 확인한다.

### Allowed Alternatives

- shared projection을 별도 pure helper로 추출하거나 기존 remote Note projection의 summary 결과를 직접 재사용하는 방식은 모두 허용한다. 단, 기존 JSDOM/ProseMirror canonicalization 의미와 회귀 fixture를 공유하고 spec의 결과를 만족해야 한다.

### Known Traps

- `profileBioSchema`를 projection 전에 호출하면 markup 길이 때문에 유효한 평문이 다시 유실된다.
- regex로 tag를 제거하면 entity, malformed markup, block boundary, script/style/template과 속성 처리를 기존 보안 계약과 다르게 만든다.
- HTML을 GraphQL 또는 React Native UI에서 처리하면 저장값과 다른 소비자에게 raw markup이 남고 Local/Remote 경계가 흐려진다.
- remote ingress helper를 Local Profile 편집이나 outbound actor 생성에 적용하면 평문에 포함된 의도적 `<`, `&` 의미를 바꿀 수 있다.

## Risks / Trade-offs

- [기존 parser 의미가 Profile bio에도 전파됨] → entity·문단·hard break·malformed HTML fixture를 Profile projection test에서 고정하고 Note 회귀 test를 함께 실행한다.
- [projection 후 길이 검증 순서가 회귀할 수 있음] → markup을 평문화한 뒤 `profileBioSchema`를 적용하는 pure projection과 remote actor test를 고정한다.

## Migration Plan

없음. DB schema 변경은 없다.

## Open Questions

없음.
