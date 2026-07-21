## 1. PROD-433 Post Action Bar UI 컴포넌트

**Deliverable**

Android·iOS·Web에서 공유하며 고정 순서, optional 액션, compact count, 필수 상태와 접근성 계약을 독립적으로 검토할 수 있는 Post Action Bar UI를 제공한다.

**Guardrails**

- 공개 UI API는 `PostActionBar` 하나와 `reply`·`repost`·`reaction`·`bookmark`·`more`의 명시적 optional prop으로 제한한다.
- Repost·Bookmark와 선행 계약이 의미를 제공한 Reaction의 selected를 처리 상태와 분리하고 pending·disabled만 입력을 차단하며 error는 재시도를 허용한다. Reply에는 selected를 만들지 않는다.
- 각 control은 최소 44×44 interactive target과 접근성 label을 제공하고, Reply·Repost·Reaction·Bookmark는 해당 접근성 state도 제공한다.
- count는 K/M 단위의 최대 네 글자 표시 계약을 따른다.
- More는 callback과 접근성 label만 제공하고 count·selected·pending·disabled·error, 팝업이나 링크 복사를 구현하지 않는다.
- production surface, Relay, mutation, navigation, Post Kind 정책과 Figma 파일을 수정하지 않는다.

**Verification**

- 고정 순서, optional 표시, count 유무와 compact count 경계를 렌더링 검증한다.
- Reply의 default·pending·disabled·error와 selected 지원 액션의 default·selected·selected+pending·selected+disabled·selected+error·disabled·error 시각 표현, callback 호출·차단·재시도를 검증한다.
- 390px mobile·900px compact·1400px full Storybook에서 실제 surface 콘텐츠 폭 기준 한 행, 44×44 target과 layout을 검토한다.
- keyboard/touch activation과 role·label·selected·busy·disabled metadata를 검증한다.
- React Native type/Relay check, Storybook build와 관련 component test를 통과시킨다.

- [ ] 1.1 고정 공개 API와 optional 액션으로 Post Action Bar의 표시·입력 계약을 구현한다.
- [ ] 1.2 theme token과 기존 icon dependency를 사용해 상태 표현, compact count, 한 행 반응형 배치, 최소 interactive target 및 접근성 metadata를 구현한다.
- [ ] 1.3 Reply의 selected 제외, selected 지원 액션의 조합 상태, compact count 경계·optional 액션·More callback-only와 390px·900px·1400px 폭의 Storybook 상태 카탈로그를 추가한다.
- [ ] 1.4 처리 상태의 시각 우선순위, callback 호출·입력 차단·재시도·count 경계·More 상태 제외·접근성 계약의 component test를 추가하고 관련 검증 명령을 통과시킨다.

## 2. PROD-434 Post surface 배치

**Deliverable**

Home·Profile Post List와 Post 상세가 같은 Post Action Bar를 본문 interactive 영역과 충돌하지 않는 위치에 사용하며, 실제 action data 연결 전에는 production에서 불완전한 Action Bar 전체를 노출하지 않는다.

**Guardrails**

- 목록과 상세는 PROD-433의 공통 컴포넌트를 재구현하지 않는다.
- Action Bar는 본문 상세 링크와 중첩되지 않는 sibling interactive surface로 배치한다.
- 이 이슈에서 실제 action field, mutation, Relay cache, 권한 또는 Post Kind 정책을 새로 구현하지 않는다.
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

**Deliverable**

준비된 Reply·Repost·Reaction·Bookmark 구현 결과가 Home·Profile Post List와 Post 상세의 공통 Action Bar에서 선택 Profile, 처리 상태, Post Kind·Post Visibility·권한 정책을 지키며 동작하고, More 링크 복사를 포함한 전체 계약을 검증한 공유 OpenSpec을 archive한다.

**Guardrails**

- 각 action의 schema, 저장, mutation, count 집계, selected 의미, 권한과 개별 UI 계약을 재구현하지 않고 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425의 완료 결과를 소비한다.
- viewer-independent count와 선택 Profile별 selected 상태의 기존 Relay cache 경계를 유지한다.
- pending·error는 액션별로 격리하고, 한 액션 요청이 다른 액션을 불필요하게 차단하지 않는다.
- 목록과 상세는 다섯 액션을 같은 위치에 유지하고 canonical 정책상 실행할 수 없는 액션을 disabled로 제공한다.
- guest의 소셜 액션은 상위 인증 진입 계약으로 위임하고 임시 인증 화면을 추가하지 않는다. More 링크 복사는 guest에게도 허용한다.
- 구현 자식 하나의 완료만으로 공유 change를 부분 archive하지 않는다.

**Verification**

- 선택 Profile 전환 시 count 공유와 selected 격리를 검증한다.
- Reply·Repost·Reaction·Bookmark 각각의 성공, action별 pending 중복 차단, 실패 표시와 재시도를 검증한다.
- Post Kind·Post Visibility·권한상 불가능한 액션의 disabled 표시, guest 인증 위임과 Home·Profile 목록·상세의 동일 계약을 검증한다.
- More 팝업의 단일 `링크 복사` 항목, canonical Post URL clipboard 복사와 guest 사용을 검증한다.
- 모든 구현 자식과 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425 완료, OpenSpec task 정합성과 canonical 문서·Linear·OpenSpec·코드 일치를 확인한다.
- archive 전후 strict validation을 통과시킨다.

- [ ] 3.1 구현 자식과 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425의 완료·공개 계약을 확인하고, 특히 PROD-417·PROD-418의 Reaction count·selected 의미가 확정된 뒤 실제 Post 상태를 공통 Action Bar 입력으로 연결할 경계를 정리한다.
- [ ] 3.2 목록·상세에서 기존 Reply·Repost·Reaction·Bookmark의 count, callback과 액션별 처리 상태를 공통 Action Bar에 연결하고, Repost·Bookmark 및 공개 계약이 의미를 제공한 Reaction에만 selected를 연결한다.
- [ ] 3.3 선택 Profile cache 경계, Post Kind·Post Visibility·권한별 disabled, guest 인증 위임과 action별 pending·failure·retry 동작을 적용한다.
- [ ] 3.4 More callback에 접근 가능한 최소 팝업과 guest도 사용할 수 있는 canonical Post URL `링크 복사`를 연결한다. Web의 현재 origin 또는 Native의 검증된 `EXPO_PUBLIC_WEB_ORIGIN`과 `/{relativeHandle}/{postId}`를 결합한 query·hash 없는 절대 URL을 사용하고, 공유 clipboard 추상화가 없으면 Expo 호환 clipboard package를 추가해 native·Web 동작을 검증한다.
- [ ] 3.5 Home·Profile 목록·Post 상세의 실제 성공·중복 차단·실패 복구·Profile 전환·disabled 정책·guest 위임·More 링크 복사 통합 테스트를 추가하고 전체 관련 검증을 통과시킨다.
- [ ] 3.6 canonical 문서·Linear·OpenSpec·구현과 모든 task의 정합성을 확인하고 archive 전 strict validation을 통과시킨다.
- [ ] 3.7 전체 계약 완료 승인을 받은 뒤 공유 change를 archive하고 archive 후 strict validation을 통과시킨다.
