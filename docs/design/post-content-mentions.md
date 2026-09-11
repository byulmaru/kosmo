# Post Content Mention renderer

`PROD-910`은 `PROD-340`이 저장한 canonical Post Content Mention을 읽어 본문에 표시하고, 조회 가능한 Profile로 이동하는 consumer 계약을 소유한다. 이 문서는 저장·인식 계약을 다시 정의하지 않으며, 현재 Post Content와 같은 revision의 Profile 관계를 renderer에 연결하는 표시 경계를 정한다.

## 입력과 의미

- renderer는 현재 Post Content document의 Mention node와 같은 revision에서 투영된 `PostContent.mentionedProfiles: [Profile!]!`을 입력으로 받는다. 서버는 document의 canonical Profile UUID를 엄격하게 검증·저장하고, GraphQL은 기존 Media와 같은 방식으로 이 UUID를 client-facing global ID로 projection한다. node의 global ID와 relation의 `Profile.id`를 정확히 매칭할 때만 Mention target을 만든다.
- `mentionedProfiles`는 기존 Profile visibility predicate(Profile이 `ACTIVE`이고 소속 Instance가 `SUSPENDED`가 아님)를 통과한 같은 revision의 Profile만 포함하며, 같은 Profile은 한 번만 제공한다. Post visibility·eligibility는 PostContent 조회에서 기존 정책을 적용하고, 이 field는 viewer별 Profile Domain Block 정책을 새로 조합하지 않는다. document occurrence의 순서와 label은 document가 소유하므로 relation 배열의 positional order를 renderer 입력으로 사용하지 않는다.
- renderer는 raw ActivityPub `tag`, actor URI, 본문 anchor를 다시 해석하지 않는다. Mention을 해결하기 위한 WebFinger, actor fetch, Profile materialization과 label·handle 문자열 비교도 수행하지 않는다.
- canonical Mention의 `label`은 본문에 보이는 원래 표시 문자열이다. 표시 label이 같아도 `profileId`가 다른 대상은 각각의 Profile로 구분하며, label·handle만으로 대상을 합치거나 선택하지 않는다.
- 일반 link mark는 기존 link semantics를 유지한다. `PROD-340`의 unresolved·malformed·identity mismatch fallback은 저장된 안전한 link 또는 text로 표시하고 Profile navigation affordance를 추가하지 않는다.

## Profile 이동

- 관계된 Profile이 기존 Profile visibility predicate를 통과하고 현재 Post 조회 정책으로 노출되면 Mention label을 inline navigation link로 표시한다. 이동 target은 앱이 이미 사용하는 KOSMO 내부 `/${relativeHandle}` Profile route contract와 Profile의 기존 route field에서 만든다.
- client에서 Profile ID를 다시 encode/decode하거나 document node와 relation 응답을 positional/parallel zip하지 않는다. global ID exact match가 실패하면 Profile target을 만들지 않는다.
- 활성 Mention link는 [Profile identity](./typography.md#profile-identity)의 기존 text-link 의미·타이포그래피 강조 계약과 일반 link semantics를 재사용해 본문 일반 link와 구분한다. 새 색상·타이포그래피 token이나 tooltip은 추가하지 않는다. accessible name에는 visible label과 함께 target Profile의 `displayName` 및 `relativeHandle`을 포함한다.
- 새로운 Mention 전용 route, external Actor URL direct navigation 또는 remote Profile redirect를 만들지 않는다. Post visibility·eligibility는 기존 조회 결과를 그대로 사용하며, viewer별 Profile Domain Block 정책은 이 renderer 계약에서 새로 완성하지 않는다. Mention 관계나 label이 viewer의 접근 범위를 넓히지 않는다.
- 저장 후 Profile이 unavailable 또는 deleted가 되면 canonical Mention의 원래 `label`을 그대로 표시하고 링크만 비활성화한다. 대체 문구를 만들거나 actor URI·외부 URL로 우회하지 않으며, 비활성 상태는 click, keyboard focus와 navigation target을 제공하지 않는 text로 수렴한다.
- 동일 Post에서 반복 Mention occurrence는 문서 순서와 label을 유지한다. 같은 Profile을 가리킨다는 이유로 occurrence를 하나로 합쳐 표시하지 않으며, relation 중복 여부는 저장 계층의 set semantics를 따른다.

## Web·Native 접근성

- Mention은 본문 안의 inline link 또는 text로 표시한다. 기존 Post body의 `onBodyPress` callback과 그에 따른 부모 Post navigation은 유지한다. 활성 Mention link의 press는 event propagation을 막아 부모 `onBodyPress`가 함께 실행되지 않게 하며, Mention을 독립 icon button으로 바꾸지 않는다.
- Web link는 keyboard로 도달·실행할 수 있고 link role, visible label·target Profile `displayName`·`relativeHandle`을 식별하는 accessible name과 `focus-visible`을 제공한다. link가 아닌 fallback text는 tab 순서에 들어가지 않는다.
- Native link는 기존 Profile navigation primitive와 touch·focus semantics를 재사용한다. 실제 출시 target은 iOS `44pt`, Android `48dp` 이상이며, Web의 inline target 예외나 source 계산을 Native runtime 증거로 사용하지 않는다.
- 긴 label·handle·본문은 본문 폭 안에서 줄바꿈하며 label을 잘라 target identity를 잃지 않는다. Light·Dark 모두 기존 semantic link/text token과 focus indicator를 사용하고, 색상만으로 Mention 여부나 Profile availability를 전달하지 않는다.

## 검증 경계

- component 또는 Storybook 검증은 valid·repeated·서로 다른 Profile identity, 일반 link, unresolved fallback, unavailable/deleted Profile, 긴 label, Light·Dark와 link/non-link focus 상태를 확인한다.
- API/integration 검증은 현재 revision의 node와 Profile 관계가 함께 조회되고 기존 Profile visibility predicate와 Post visibility·eligibility가 유지되는지 확인한다. viewer별 Profile Domain Block 정책을 이 change의 완료 증거로 주장하지 않으며, 과거 revision이나 관계가 없는 fallback에서 Profile 이동을 만들지 않는다.
- Web runtime에서는 keyboard 이동, screen reader name/role, focus indicator와 reflow를 확인한다. Android·iOS는 실제 touch target, VoiceOver·TalkBack focus와 announcement를 별도 출시 gate로 기록하며 Web 결과로 대체하지 않는다.
- 구 reader의 2.x bodyText·Media·Content Warning 호환성 gate는 별도 후속 검증으로 deferred 상태다. 이 deferred evidence를 `PROD-910` renderer의 구현·통합 완료 증거로 주장하지 않는다.

## 제외 범위

- ActivityPub tag 인식, Profile materialization과 `post_mentions` 저장
- local compose, outbound federation, remote `Update(Note)`, audience·DIRECT visibility와 Notification/FCM
- 일반 link preview와 OG metadata
