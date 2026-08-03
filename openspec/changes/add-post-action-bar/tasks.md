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

- 공개 UI API는 `PostActionBar` 하나와 actual Post fragment ref, `reply`·`reaction`·`bookmark`·`more`의 명시적 optional config, Repost error callback으로 제한한다. 구현된 Repost는 composite parent fragment 아래 private child action으로 조립한다. Repost의 concrete disabled host input 또는 fragment shape는 actual caller와 함께 PROD-432가 설계한다.
- Reply의 controlled `expanded`, Reaction의 `hasReacted`, Bookmark의 `hasBookmarked`를 처리 상태와 분리하고, Repost child는 `viewerRepost`에서 `hasReposted`를 파생한다. 범용 공개 `selected`를 만들지 않는다. 공개 처리 상태는 default·pending·disabled만 제공하고 pending·disabled만 입력을 차단한다. 일시적 요청 실패를 `error`·danger 상태로 표현하지 않는다.
- Bar와 각 control은 모든 플랫폼에서 높이 28을 사용하고, 좌우 padding 8, social action 너비 50, More target 너비 최소 28, glyph 16×16, icon-count 간격 4를 제공한다. Web target은 24×24 CSS px 사각형을 포함하고 서로 겹치지 않아야 한다. Native 28pt·28dp는 출시 전 임시 예외이며 Native 접근성 완료 증거로 사용하지 않는다.
- Reaction과 Bookmark는 count를 받지 않는다. Reply config와 Repost child fragment는 선행 계약이 제공한 count만 실행 환경 기본 locale의 표준 compact formatting으로 표시하고 K/M 반올림·단위 승격·상한을 수동 구현하거나 count가 없을 때 `0`을 합성하지 않는다.
- More는 callback과 접근성 label만 제공하고 count·도메인 상태·처리 상태, 팝업이나 링크 복사를 구현하지 않는다.
- production surface, navigation, Content·Reply Parent·Repost Source 관계 조합 정책과 Figma 파일을 수정하지 않는다. 구현된 child action의 Relay fragment·mutation은 PROD-414가 소유하고 toolbar container가 mutation payload나 cache update 정책을 재구현하지 않는다.

**Verification**

- 고정 순서, optional 표시, Reaction·Bookmark count 제외, Reply·Repost count 유무와 한국어·영어 locale의 표준 compact 결과를 렌더링 검증한다.
- Reply `expanded`, actual Relay fragment에서 파생한 Repost `hasReposted`, Reaction `hasReacted`, Bookmark `hasBookmarked`, config 기반 Reply·Reaction·Bookmark의 default·pending·disabled와 Repost child의 default·mutation pending에 대한 시각 표현, active Reaction·Bookmark의 채워진 icon, default callback 또는 child mutation 호출과 각 소유 경계의 입력 차단을 검증한다. Repost policy-disabled는 PROD-432 actual surface 통합에서 검증한다.
- 390px mobile·900px compact·1400px full Storybook에서 실제 surface 콘텐츠 폭 기준 한 행과 exact 28px geometry를 검토한다.
- keyboard/touch activation과 role·label·expanded·pressed·selected·busy·disabled metadata를 공개 도메인 상태에 맞게 검증한다.
- React Native type/Relay check, Storybook build와 관련 component test를 통과시킨다.

- [x] 1.1 고정 공개 API와 optional 액션으로 Post Action Bar의 표시·입력 계약을 구현하고 공개 처리 상태를 default·pending·disabled로 제한한다.
- [x] 1.2 theme token과 기존 icon dependency를 사용해 active Reaction·Bookmark의 채워진 icon, default·pending·disabled 처리 상태 표현, locale-aware compact count, 한 행 반응형 배치, 최소 interactive target 및 접근성 metadata를 구현한다.
- [x] 1.3 Reply `expanded`, Reaction `hasReacted`, Bookmark `hasBookmarked`와 config 기반 default·pending·disabled, actual Relay fragment에서 파생한 Repost `hasReposted`·default·mutation pending, Reaction·Bookmark count 제외·한국어와 영어 compact count·count 없음·optional 액션·More callback-only 및 390px·900px·1400px 폭의 Storybook 상태 카탈로그를 추가한다. Repost policy-disabled fixture와 실제 surface 검증은 PROD-432에 남긴다.
- [x] 1.4 default callback 호출, pending·disabled 입력 차단, active Reaction·Bookmark의 채워진 icon·도메인 상태 유지·locale compact count·More 상태 제외·접근성 계약의 component test를 추가하고 관련 검증 명령을 통과시킨다.

## 2. PROD-434 canceled surface ownership 정리

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `PROD-432`
- `PROD-434`

**Deliverable**

PROD-434의 독립 `actionBar?: ReactNode`·mock surface slice를 실행하지 않고 canceled ownership record로 남기며, 최초 실제 surface 배치와 Repost 연결은 PROD-414, 나머지 action 통합은 PROD-432에 둔다.

**Guardrails**

- canceled 이슈의 구현 checkbox를 열린 작업으로 남기거나 별도 mock seam을 만들지 않는다.
- surface 배치·navigation 비중첩·responsive geometry 검증을 PROD-414와 PROD-432의 실제 action 결과에 배분한다.
- PROD-434의 과거 설명은 결정 이력으로 보존하되 현재 구현 authority로 사용하지 않는다.

**Verification**

- Linear PROD-434가 Canceled이고 PROD-432·414의 최신 본문과 이 OpenSpec이 같은 ownership을 가리키는지 확인한다.

- [x] 2.1 PROD-434의 canceled 상태와 독립 surface PR 비병합 결정을 확인한다.
- [x] 2.2 최초 실제 surface 배치·Repost 결과는 PROD-414, 나머지 action 조립·최종 통합은 PROD-432로 task와 spec ownership을 정렬한다.

## 3. PROD-414 최초 production 배치와 Repost menu·toast

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/design/post-action-bar.md`
- `PROD-414`
- `PROD-431`
- `PROD-471`

**Deliverable**

`PostLayout`은 Action Bar를, `PostListItem`은 Action Bar를 담은 목록 전용 slot을 content grid의 마지막 sibling으로 직접 렌더링하고, 일반 Post·Quote는 자신을, 순수 Repost는 direct Source를 Repost target으로 사용한다. Repost trigger는 Web anchored menu와 Android·iOS bottom action sheet에서 `재게시하기` 또는 `재게시 취소`를 제공하며 실제 mutation과 action별 실패 toast까지 동작한다.

**Guardrails**

- `PostList`, route 또는 `actionBar?: ReactNode` seam을 추가하지 않고, 본문·작성자·timestamp·Source navigation link 밖에 Action Bar를 둔다.
- private Repost child의 fragment·mutation·pending·actor 격리와 생성 cache 정규화·취소 cache 비변경을 유지한다.
- trigger에서 mutation을 즉시 실행하지 않고 menu item 선택 뒤 실행한다. `인용하기`는 PROD-431 전까지 노출하지 않는다.
- 새 외부 dependency 없이 최소 공용 toast host와 platform action menu 경계만 구현한다.
- toast는 exact action별 copy, 약 3초 dismiss, latest-replace, 동일 문구 반복 시 새 alert instance와 dismiss timer 재시작, safe area·tab bar 위치와 alert semantics를 제공하고 close·retry control·success toast를 두지 않는다.
- 최종 disabled policy, 나머지 action 조립, More와 전체 통합 archive는 PROD-432에 남긴다.

**Verification**

- 일반 Post·순수 Repost·Quote의 목록 final slot·상세 final Action Bar, link 비중첩과 순수 Repost Source target을 검증한다.
- 목록의 세 Post variant에서 Action Bar slot 상단 padding 0·하단 padding 4, 1px semantic divider color, 순수 Repost attribution line box 20과 Source 표준행까지 gap 0, Quote Source preview 내부 하단 padding 4px과 border 밖에서 Action Bar까지 8px을 검증한다.
- Web outside/Escape/focus return·keyboard navigation과 Native backdrop/back/dismiss/safe area·modal semantics를 검증한다.
- menu label·item 선택 뒤 create/delete identity·pending, exact toast·latest-replace·동일 문구 반복 시 새 alert instance와 dismiss timer 재시작·자동 dismiss·alert semantics·light `#262626` accent·message 2px optical shift, 실패 뒤 상태 유지·menu 재시도를 검증한다.

- [x] 3.1 `PostListItem`·`PostLayout`에 actual Action Bar를 final sibling으로 배치하고 순수 Repost Source target과 navigation 비중첩을 연결한다.
- [x] 3.2 Web anchored menu와 Android·iOS bottom action sheet를 구현하고 선택·미선택 label, dismiss·focus/back·접근성, `인용하기` 미노출과 항목 선택 뒤 mutation을 검증한다.
- [x] 3.3 앱 provider의 단일 transient toast host와 Repost action별 surface callback을 연결하고 exact copy·latest-replace·자동 dismiss·safe area·alert semantics·light `#262626` accent·message 2px optical shift·실패 상태 유지를 검증한다.
- [x] 3.4 Figma 기반 28px geometry를 Action Bar에 적용하고 exact height·padding·action width·glyph·gap, Web 최소 target과 non-overlap을 Storybook에서 검증한다.
- [x] 3.5 app·Relay·unit·Storybook·static build·Web runtime과 두 OpenSpec의 scoped·전체 strict validation을 통과시킨다. Native는 공통 구현의 정적·Storybook 검증만 수행하고 44pt·48dp 복구와 runtime 관찰을 출시 gate에 남긴다.
- [x] 3.6 목록 일반 Post·Quote·순수 Repost의 Action Bar 하단 외부 padding을 0으로 맞추고, 순수 Repost attribution을 20px line box·Source gap 0으로 줄여 기존 Storybook interaction으로 exact geometry를 검증한다.
- [x] 3.7 compact spacing 변경 뒤 app·Storybook·lint와 전체 OpenSpec strict validation을 다시 통과시키고 390px Web runtime을 관찰한다.
- [x] 3.8 목록 Action Bar의 28px geometry를 유지한 채 final slot에 상하 2px을 추가하고, light/dark semantic `divider` token을 1px Post 구분선에만 적용해 focused Storybook interaction을 통과시킨다.
- [x] 3.9 spacing·divider 변경 뒤 app·Storybook·lint와 전체 OpenSpec strict validation을 다시 통과시키고 390px Web runtime을 관찰한다.
- [x] 3.10 목록 Action Bar final slot의 상단 padding을 0, 하단 padding을 `spacing.xs` 4px로 조정하고 Quote Source preview border 아래에만 4px 간격을 추가해 focused Storybook interaction을 통과시킨다.
- [x] 3.11 비대칭 spacing 변경 뒤 app·Storybook·lint와 전체 OpenSpec strict validation을 다시 통과시키고 390px Web runtime을 관찰한다.
- [x] 3.12 Web Repost menu를 scroll container 밖의 downward overlay로 배치해 첫 item이 trigger pointer 지점을 덮고 viewport 안으로 보정되게 하며, theme card surface·36px item 높이·128px 최소폭·18px icon·14px·500 label·8px 좌우 padding·1px border·`0 2px 4px` shadow 및 같은 위치 두 번째 pointer 선택을 focused Storybook interaction으로 검증한다.
- [x] 3.13 Web menu 변경 뒤 app·Storybook·lint와 전체 OpenSpec strict validation을 통과시키고 Home·Bookmark scroll surface와 390px Web runtime에서 비클리핑·pointer 선택·focus 복귀를 관찰한다.
- [x] 3.14 Quote 목록에서만 Source preview 내부 하단 padding을 `spacing.xs` 4px로 줄이고 border 밖에서 Action Bar까지 `spacing.sm` 8px 간격을 두며, 일반 Post·순수 Repost·상세 Source preview는 변경하지 않는다.
- [x] 3.15 focused Storybook interaction에서 Quote preview 내부 4px·외부 8px geometry를 검증하고 390px Web runtime에서 시각 결과를 확인한다.
- [x] 3.16 활성 toast와 동일한 실패 문구가 다시 발생해도 증가하는 identity의 새 alert instance로 교체하고 dismiss timer를 다시 시작하도록 하며, 단일 alert host·반복 알림·두 번째 호출 기준 자동 dismiss를 focused Storybook interaction으로 검증한다.

## 4. PROD-432 실제 액션 연결·통합 검증 완료 이력

**Authority / Provenance**

- `docs/domain/decisions/0014-post-structure-relations.md`
- `docs/domain/decisions/0015-post-share-reference.md`
- `docs/domain/objects/post.md`
- `docs/domain/objects/reaction.md`
- `docs/domain/objects/bookmark.md`
- `docs/domain/objects/profile.md`
- `docs/domain/README.md`
- `docs/design/post-action-bar.md`
- `PROD-432`
- `PROD-433`
- `PROD-414`
- `PROD-417`
- `PROD-418`
- `PROD-420`
- `PROD-425`
- `PROD-598`

**Deliverable**

PROD-414가 배치한 actual Action Bar와 Repost menu·toast 및 PROD-425가 연결한 Reply Composer 위에 Reaction·Bookmark 구현 결과를 연결하고, 선택 Profile에 상대적인 도메인 상태, 최종 대상 적격성·현재 세션 실행 권한 정책, PROD-432 링크 복사와 완료된 PROD-598 삭제 action의 More menu 조합 및 전체 실패 복구를 통합 검증한 기존 완료 이력을 유지한다.

**Guardrails**

- 각 action의 schema, 저장, mutation, count 집계, 도메인 상태 의미, 권한과 개별 UI 계약을 재구현하지 않고 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425의 완료 결과를 소비한다. Repost child는 PROD-414의 fragment·mutation·pending을, Reply surface와 controlled `expanded`는 PROD-425의 Composer 연결을 유지하고 toolbar container는 payload/cache 정책을 재구현하지 않는다.
- 선행 action 계약이 제공하는 viewer-independent Reply·Repost count와 선택 Profile별 `hasReposted`·`hasReacted`·`hasBookmarked`의 기존 Relay cache 경계를 유지한다. Repost의 count와 `hasReposted`는 child fragment에서 파생하고, Reaction·Bookmark count를 연결하지 않으며 count 계약이 없는 액션에 `0`이나 새 집계를 합성하지 않는다. Reply `expanded`는 상위 Composer가 소유한다.
- pending은 액션별로 격리하고, 한 액션 요청이 다른 액션을 불필요하게 차단하지 않는다. 요청 실패는 Action Bar의 지속 처리 상태로 만들지 않고 요청 직전의 확정 상태를 유지한다. PROD-414의 Repost menu·toast를 재구현하지 않고 전체 조합에서 회귀만 확인한다.
- Bookmark 해제 성공은 현재 Relay actor Store의 `Post.viewerBookmark`, Bookmark record와 mutation 응답 처리 시점에 로드된 `BookmarkConnectionList_bookmarks` edge를 함께 정규화하고 다른 actor Store를 변경하지 않는다.
- 목록과 상세는 다섯 액션을 같은 위치에 유지하고, 대상 자체가 부적격하거나 인증된 실행 주체가 실행 권한을 갖지 못한 액션을 disabled로 제공한다.
- guest에게 `Account.Active`·`Profile.Member`·선택 Profile이 없다는 이유만으로 대상 자체가 적격한 소셜 액션을 disabled로 만들지 않고 상위 인증 진입 계약으로 위임한다. 대상 자체 제한은 guest에게도 disabled로 유지하고 임시 인증 화면은 추가하지 않는다. More 링크 복사는 guest에게도 허용한다.
- More menu는 PROD-432의 `링크 복사`를 항상 첫 항목으로 유지하고 PROD-598 자격을 충족하는 작성자에게만 `삭제`를 마지막 항목으로 조합한다. 삭제 확인·mutation·cache·실패 계약은 PROD-598 결과를 재사용하고 이 change에서 다시 소유하지 않는다.
- 구현 자식 하나의 완료만으로 공유 change를 부분 archive하지 않는다.

**Verification**

- 선택 Profile 전환 시 제공된 Reply count와 child fragment의 Repost count 공유, `hasReposted`·`hasReacted`·`hasBookmarked` 격리, 상위 Composer가 제어하는 Reply `expanded`를 검증한다.
- Reply·Repost·Reaction·Bookmark 각각의 성공, action별 pending 중복 차단, 실패 시 이전 확정 상태 유지와 각 action 계약의 접근 가능한 안내·다음 입력 재시도를 검증한다. Bookmark 해제는 현재 actor의 `viewerBookmark`·Bookmark record·로드된 connection edge 제거와 다른 actor 격리를 함께 검증하고, Repost는 PROD-414의 menu·exact toast 결과를 재사용한다.
- Content·Reply Parent·Repost Source 관계 조합, Post Visibility 등 대상 자체가 부적격한 액션과 인증된 실행 주체의 권한이 부족한 액션의 disabled 표시, 대상이 적격한 guest의 인증 위임, 대상이 부적격한 guest의 disabled 유지와 Home·Profile 목록·상세의 동일 계약을 검증한다.
- More 팝업에서 `링크 복사`가 항상 첫 항목이고 PROD-598 작성자 삭제 자격을 충족할 때만 `삭제`가 마지막 항목인지 검증한다. Web·Android·iOS가 configured Local Instance의 `canonical_origin`을 공통 기준으로 사용하는 ADR 0015 Post Share Reference의 clipboard 복사, Content 없는 Repost에서 direct Source 공유 참조·삭제 자격 선택, Web current Host 불일치, guest 사용과 Visibility 우회 방지를 함께 검증한다.
- 모든 구현 자식과 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425 완료, OpenSpec task 정합성과 canonical 문서·Linear·OpenSpec·코드 일치를 확인한다.
- 4.6에서 당시 archive 전 strict validation을 통과시킨 이력을 유지한다. 완료 뒤 발견된 실제 Clipboard 회귀 복구와 최종 archive는 PROD-632가 이어받는다.

- [x] 4.1 구현 자식과 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425의 완료·공개 계약을 확인하고, PROD-425가 연결한 Reply callback·surface·controlled `expanded`를 재구현하지 않으면서 아직 config 기반인 action 상태를 연결할 경계를 정리한다. Reaction은 하나 이상의 Reaction Type 존재를 `hasReacted`로 연결하되 count는 연결하지 않는다.
- [x] 4.2 목록·상세에서 Reaction·Bookmark의 callback과 default·pending·disabled 처리 상태를 PROD-414가 배치한 공통 Action Bar에 연결하고 각각 `hasReacted`·`hasBookmarked`를 공급한다. Reply는 PROD-425의 상위 Composer `expanded`와 optional count 경계를 유지한다.
- [x] 4.3 선택 Profile cache 경계를 유지하면서 대상 적격성과 현재 실행 주체·세션의 실행 권한을 분리하고 관계 조합, Post Visibility·권한별 disabled, target이 적격한 guest의 인증 위임, target이 부적격한 guest의 disabled 유지와 action별 pending·실패 복구를 적용한다. display Post와 action target을 구분하고 순수 Repost는 Source target을 유지한다.
- [x] 4.4 Surface가 guest도 사용할 수 있는 ADR 0015 Post Share Reference `링크 복사`를 `moreItems` 첫 항목으로 공급하고, private `PostDeletionAction`이 접근 가능한 팝업에서 완료된 PROD-598의 작성자 `삭제`를 자격 충족 시 마지막 항목으로 조합한다. 삭제 확인·mutation·cache·실패 계약은 재구현하지 않는다. Web menu는 trigger 오른쪽을 기준으로 왼쪽으로 펼치되 첫 item overlap·viewport 보정을 유지하고, Repost 시작 정렬과 Native bottom action sheet는 유지한다. Web·Android·iOS의 canonical origin 계약을 검증한다.
- [x] 4.5 Home·Profile 목록·Post 상세의 실제 성공·중복 차단·실패 복구·controlled Reply Composer·Profile별 도메인 상태, Bookmark 해제의 응답 처리 시점 loaded connection row 제거·GraphQL 오류 보존·actor 격리, PROD-414 Repost menu·toast 및 PROD-598 삭제 회귀, 대상 정책·guest 위임과 More 항목 순서 통합 테스트를 추가하고 전체 관련 검증을 통과시킨다. 390·900·1400px에서 Reply·More target이 PostBody content column 양끝에 맞고 나머지 action이 그 사이에 균등 분배되며, non-More glyph는 각 target 왼쪽에 맞고 More glyph는 가운데를 유지하는 geometry를 검증한다. 상세 thread current Post는 상단 16px을 보존하고 Reaction Summary와 Action Bar 사이를 4px로 둔다. selected Profile이 있고 inline Reply Composer가 닫힌 상태에서도 빈 wrapper 없이 Action Bar와 다음 divider 사이가 4px인지 검증한다. Web More menu의 끝 정렬, 첫 `링크 복사` item overlap과 viewport clamp도 실제 Home 및 Storybook에서 확인한다.
- [x] 4.6 canonical 문서·Linear·OpenSpec·구현과 모든 task의 정합성을 확인하고 archive 전 strict validation을 통과시킨다.

## 5. PROD-632 링크 복사 런타임 복구와 최종 archive

**Authority / Provenance**

- `docs/domain/decisions/0015-post-share-reference.md`
- `docs/domain/objects/post.md`
- `docs/design/post-action-bar.md`
- `PROD-632`

**Deliverable**

사용자가 게시글 목록·상세의 More 메뉴에서 조회 가능한 현재 Post의 canonical public Web URL을 실제 지원 런타임의 clipboard에 복사할 수 있고, 실패 시 한국어 안내 뒤 같은 action을 다시 선택해 재시도할 수 있다. 복구와 검증이 끝나면 PROD-632가 공유 change의 최종 정합성 확인과 archive를 완료한다.

**Guardrails**

- configured Local Instance의 canonical origin과 `/{relativeHandle}/{postId}`를 결합하고 query·hash, API origin과 native 전용 deep link를 사용하지 않는다. Content 없는 Repost는 조회 가능한 direct Source의 공유 참조를 사용한다.
- guest도 조회 가능한 Post의 링크를 복사할 수 있게 유지하고 Post Visibility·Eligibility를 우회하지 않는다.
- `링크 복사`는 More menu의 첫 항목을 유지하고, PROD-598 삭제 자격을 충족할 때만 `삭제`를 마지막 항목으로 조합한다. 선택 뒤 menu dismiss와 한국어 실패 안내·다음 입력 재시도를 유지한다.
- 새 공유 채널, 별도 native deep link, 서버 권한·schema·migration·ActivityPub 계약을 추가하지 않는다.
- Storybook Clipboard mock 성공만 실제 Web·Native adapter의 완료 증거로 사용하지 않는다.

**Verification**

- 실제 Web과 지원 Native 플랫폼에서 일반 Post·Quote·순수 Repost의 목록·상세 `링크 복사` 성공, canonical URL 붙여넣기와 menu dismiss를 확인한다.
- guest 사용, Web current Host 불일치, query·hash 제외, 순수 Repost direct Source와 Post Visibility 유지 여부를 검증한다.
- Clipboard 실패가 조용히 무시되지 않고 접근 가능한 한국어 안내를 표시하며 menu 재개방·동일 action 재선택으로 재시도되는지 검증한다.
- 가까운 component 또는 E2E 회귀 검증, 관련 앱 check와 archive 전·후 strict validation을 통과시킨다.

- [ ] 5.1 실제 Web과 지원 Native 런타임에서 Clipboard 실패를 재현하고 Storybook mock과 실제 adapter의 차이 및 원인을 검증 가능한 근거로 기록한다.
- [x] 5.2 기존 production surface 소유 경계 안에서 `postClipboard` platform boundary를 통해 목록·상세 링크 복사를 복구하고 canonical origin·direct Source·guest·More item 순서·dismiss·실패 재시도 계약을 유지한다.
- [x] 5.3 `postClipboard.web.test.ts`의 성공·API 부재·rejection 검증과 기존 Storybook `ProductionMoreShareReferences`·`PostDetailThreadRoute`의 성공·실패·menu dismiss·재시도 회귀로 일반 Post·Quote·순수 Repost·guest 경로를 가까운 경계에서 증명한다.
- [ ] 5.4 실제 Web·지원 Native 런타임과 관련 앱 검증 및 archive 전 strict validation을 통과시키고 canonical 문서·Linear·OpenSpec·구현의 최종 정합성을 확인한다.
- [ ] 5.5 전체 계약 완료 승인을 받은 뒤 공유 change를 archive하고 archive 후 strict validation을 통과시킨다.
