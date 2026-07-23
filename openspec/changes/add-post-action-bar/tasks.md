## 1. PROD-433 Post Action Bar UI 컴포넌트

**Authority / Provenance**

- `PROD-432`
- `PROD-433`
- `PROD-414`
- `PROD-417`
- `PROD-418`
- `PROD-420`
- `PROD-425`

**Deliverable**

Android·iOS·Web에서 공유하며 고정 순서, optional 액션, compact count, 필수 상태와 접근성 계약을 독립적으로 검토할 수 있는 Post Action Bar UI를 제공한다.

**Guardrails**

- 공개 UI API는 `PostActionBar` 하나와 `reply`·`repost`·`reaction`·`bookmark`·`more`의 명시적 optional prop으로 제한한다.
- Reply의 controlled `expanded`, Repost의 `hasReposted`, Reaction의 `hasReacted`, Bookmark의 `hasBookmarked`를 처리 상태와 분리하고 범용 공개 `selected`를 만들지 않는다. pending·disabled만 입력을 차단하며 error는 재시도를 허용한다.
- 각 control은 최소 44×44 interactive target과 접근성 label을 제공하고, Reply·Repost·Reaction·Bookmark는 공개 도메인 상태와 처리 상태에 대응하는 접근성 state도 제공한다.
- Reaction은 count를 받지 않는다. 다른 액션은 선행 계약이 제공한 count만 실행 환경 기본 locale의 표준 compact formatting으로 표시하고 K/M 반올림·단위 승격·상한을 수동 구현하거나 count가 없을 때 `0`을 합성하지 않는다.
- More는 callback과 접근성 label만 제공하고 count·도메인 상태·처리 상태, 팝업이나 링크 복사를 구현하지 않는다.
- production surface, Relay, mutation, navigation, Content·Reply Parent·Repost Source 관계 조합 정책과 Figma 파일을 수정하지 않는다.

**Verification**

- 고정 순서, optional 표시, Reaction count 제외, non-Reaction count 유무와 한국어·영어 locale의 표준 compact 결과를 렌더링 검증한다.
- Reply `expanded`, Repost `hasReposted`, Reaction `hasReacted`, Bookmark `hasBookmarked`와 각 액션의 default·pending·disabled·error 조합에 대한 시각 표현, callback 호출·차단·재시도를 검증한다.
- 390px mobile·900px compact·1400px full Storybook에서 실제 surface 콘텐츠 폭 기준 한 행, 44×44 target과 layout을 검토한다.
- keyboard/touch activation과 role·label·expanded·pressed·selected·busy·disabled metadata를 공개 도메인 상태에 맞게 검증한다.
- React Native type/Relay check, Storybook build와 관련 component test를 통과시킨다.

- [ ] 1.1 고정 공개 API와 optional 액션으로 Post Action Bar의 표시·입력 계약을 구현한다.
- [ ] 1.2 theme token과 기존 icon dependency를 사용해 도메인·처리 상태 표현, locale-aware compact count, 한 행 반응형 배치, 최소 interactive target 및 접근성 metadata를 구현한다.
- [ ] 1.3 Reply `expanded`와 Repost·Reaction·Bookmark의 `has*` 상태, 각 처리 상태 조합, Reaction count 제외·한국어와 영어 compact count·count 없음·optional 액션·More callback-only 및 390px·900px·1400px 폭의 Storybook 상태 카탈로그를 추가한다.
- [ ] 1.4 처리 상태의 시각 우선순위, callback 호출·입력 차단·재시도·도메인 상태 유지·locale compact count·More 상태 제외·접근성 계약의 component test를 추가하고 관련 검증 명령을 통과시킨다.

## 2. PROD-434 Post surface 배치

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `PROD-432`
- `PROD-434`

**Deliverable**

Home·Profile Post List와 Post 상세가 같은 Post Action Bar를 본문 interactive 영역과 충돌하지 않는 위치에 사용하며, 실제 action data 연결 전에는 production에서 불완전한 Action Bar 전체를 노출하지 않는다.

**Guardrails**

- 목록과 상세는 PROD-433의 공통 컴포넌트를 재구현하지 않는다.
- Action Bar는 본문 상세 링크와 중첩되지 않는 sibling interactive surface로 배치한다.
- 이 이슈에서 실제 action field, mutation, Relay cache, 권한 또는 Content·Reply Parent·Repost Source 관계 조합 정책을 새로 구현하지 않는다.
- PROD-415·PROD-422처럼 같은 Post surface를 수정하는 최신 변경과 충돌 여부를 구현 시점에 대조한다.

**Verification**

- Home·Profile 목록의 공통 `PostListItem` 경계와 Post 상세에서 동일 Action Bar 배치를 확인한다.
- mock 액션 상태에서 spacing·divider·compact/web layout과 interactive element 경계를 검증한다.
- action data가 아직 연결되지 않은 production 경로에서는 불완전한 Action Bar 전체가 표시되지 않음을 검증한다. 실제 연결 뒤 정책상 실행할 수 없는 개별 액션을 숨기는 fallback으로 사용하지 않는다.
- 프로필·timestamp·본문 상세 navigation과 Action Bar 입력이 함께 활성화되지 않음을 검증한다.
- 관련 Storybook/component test와 React Native Web 검증을 통과시킨다.

- [ ] 2.1 최신 Post surface 변경과 겹침을 대조하고 목록·상세의 공통 배치 경계를 확정한다.
- [ ] 2.2 지원되는 목록과 상세에 공통 Post Action Bar를 sibling interactive surface로 배치하고 data 없는 안전한 fallback을 적용한다.
- [ ] 2.3 mock 액션으로 목록·상세 배치와 spacing·responsive layout을 검토할 Storybook 또는 component integration 사례를 추가한다.
- [ ] 2.4 기존 navigation·접근성 회귀와 입력 전파 경계를 검증하고 관련 검증 명령을 통과시킨다.

## 3. PROD-432 실제 액션 연결·통합 검증·archive

**Authority / Provenance**

- `docs/domain/decisions/0014-post-structure-relations.md`
- `docs/domain/decisions/0015-post-share-reference.md`
- `docs/domain/objects/post.md`
- `docs/domain/objects/reaction.md`
- `docs/domain/objects/bookmark.md`
- `docs/domain/objects/profile.md`
- `docs/domain/README.md`
- `PROD-432`
- `PROD-433`
- `PROD-434`
- `PROD-414`
- `PROD-417`
- `PROD-418`
- `PROD-420`
- `PROD-425`

**Deliverable**

준비된 Reply·Repost·Reaction·Bookmark 구현 결과가 Home·Profile Post List와 Post 상세의 공통 Action Bar에서 선택 Profile에 상대적인 도메인 상태, 처리 상태와 대상 적격성·현재 세션 실행 권한을 분리한 Content·Reply Parent·Repost Source 관계 조합, Post Visibility와 권한 정책을 지키며 동작하고, More 링크 복사를 포함한 전체 계약을 검증한 공유 OpenSpec을 archive한다.

**Guardrails**

- 각 action의 schema, 저장, mutation, count 집계, 도메인 상태 의미, 권한과 개별 UI 계약을 재구현하지 않고 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425의 완료 결과를 소비한다.
- 선행 action 계약이 제공하는 viewer-independent non-Reaction count와 선택 Profile별 `hasReposted`·`hasReacted`·`hasBookmarked`의 기존 Relay cache 경계를 유지한다. Reaction count를 연결하지 않고, count 계약이 없는 액션에 `0`이나 새 집계를 합성하지 않는다. Reply `expanded`는 상위 Composer가 소유한다.
- pending·error는 액션별로 격리하고, 한 액션 요청이 다른 액션을 불필요하게 차단하지 않는다.
- 목록과 상세는 다섯 액션을 같은 위치에 유지하고, 대상 자체가 부적격하거나 인증된 실행 주체가 실행 권한을 갖지 못한 액션을 disabled로 제공한다.
- guest에게 `Account.Active`·`Profile.Member`·선택 Profile이 없다는 이유만으로 대상 자체가 적격한 소셜 액션을 disabled로 만들지 않고 상위 인증 진입 계약으로 위임한다. 대상 자체 제한은 guest에게도 disabled로 유지하고 임시 인증 화면은 추가하지 않는다. More 링크 복사는 guest에게도 허용한다.
- 구현 자식 하나의 완료만으로 공유 change를 부분 archive하지 않는다.

**Verification**

- 선택 Profile 전환 시 제공된 non-Reaction count 공유와 `hasReposted`·`hasReacted`·`hasBookmarked` 격리, 상위 Composer가 제어하는 Reply `expanded`를 검증한다.
- Reply·Repost·Reaction·Bookmark 각각의 성공, action별 pending 중복 차단, 실패 표시와 재시도를 검증한다.
- Content·Reply Parent·Repost Source 관계 조합, Post Visibility 등 대상 자체가 부적격한 액션과 인증된 실행 주체의 권한이 부족한 액션의 disabled 표시, 대상이 적격한 guest의 인증 위임, 대상이 부적격한 guest의 disabled 유지와 Home·Profile 목록·상세의 동일 계약을 검증한다.
- More 팝업의 단일 `링크 복사` 항목, ADR 0015 Post Share Reference의 clipboard 복사, guest 사용과 Visibility 우회 방지를 검증한다.
- 모든 구현 자식과 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425 완료, OpenSpec task 정합성과 canonical 문서·Linear·OpenSpec·코드 일치를 확인한다.
- archive 전후 strict validation을 통과시킨다.

- [ ] 3.1 구현 자식과 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425의 완료·공개 계약을 확인하고, Reaction은 하나 이상의 Reaction Type 존재를 `hasReacted`로 연결하되 count는 연결하지 않는 등 실제 Post 상태를 공통 Action Bar 입력으로 연결할 경계를 정리한다.
- [ ] 3.2 목록·상세에서 기존 Reply·Repost·Reaction·Bookmark의 callback과 액션별 처리 상태를 공통 Action Bar에 연결하고, Reply에는 상위 Composer의 `expanded`, Repost·Reaction·Bookmark에는 각각 `hasReposted`·`hasReacted`·`hasBookmarked`, 선행 계약이 제공하는 non-Reaction 액션에만 optional count를 연결한다.
- [ ] 3.3 선택 Profile cache 경계를 유지하면서 대상 적격성과 현재 실행 주체·세션의 실행 권한을 분리하고, Content·Reply Parent·Repost Source 관계 조합, Post Visibility·권한별 disabled, 대상이 적격한 guest의 인증 위임, 대상이 부적격한 guest의 disabled 유지와 action별 pending·failure·retry 동작을 적용한다.
- [ ] 3.4 More callback에 접근 가능한 최소 팝업과 guest도 사용할 수 있는 ADR 0015 Post Share Reference `링크 복사`를 연결한다. Web의 현재 origin 또는 Native의 검증된 `EXPO_PUBLIC_WEB_ORIGIN`과 `/{relativeHandle}/{postId}`를 결합한 query·hash 없는 절대 URL을 사용하고, 공유 clipboard 추상화가 없으면 Expo 호환 clipboard package를 추가해 native·Web 동작을 검증한다.
- [ ] 3.5 Home·Profile 목록·Post 상세의 실제 성공·중복 차단·실패 복구·controlled Reply Composer·Profile별 도메인 상태, 대상 적격성·현재 세션 실행 권한의 분리, guest 위임·대상 제한과 ADR 0015 More 링크 복사 통합 테스트를 추가하고 전체 관련 검증을 통과시킨다.
- [ ] 3.6 canonical 문서·Linear·OpenSpec·구현과 모든 task의 정합성을 확인하고 archive 전 strict validation을 통과시킨다.
- [ ] 3.7 전체 계약 완료 승인을 받은 뒤 공유 change를 archive하고 archive 후 strict validation을 통과시킨다.
