## Delivery boundary

이 delta의 최종 행동 계약은 하나로 유지하되 전달과 검증 owner는 분리한다. PROD-650의 완료된
Host·query·runtime 구현은 historical evidence로 보존한다. PROD-853은 Production consumer와 분리된
공용 Viewer UI·component test·Storybook을 먼저 제공하고, PROD-849가 Production Host·Relay·route
연결·교체와 Web/iOS/Android runtime을 수행한다. PROD-853 Storybook fixture는 Gallery·permission·Production
연결 완료의 증거가 아니며, PROD-853 PR 완료만으로 이 change를 archive하지 않는다.

- DSN-63 Target transition은 최종 계약이다. PROD-849는 top-level Host query·Media 상태를 shared surface의
  `Loading`·`Error`·`Unavailable` `viewState`로 MUST 매핑한다. 세 상태는 close와 canonical 상태 설명을
  MUST 유지하고 navigation·counter와 Compact tray를 MUST NOT 렌더링한다. `Loading`은 spinner,
  `Error`는 `다시 시도` action을 제공하고 `Unavailable`은 설명만 제공한다. Wide presentation의 context rail은
  세 상태에서도 MUST 유지한다.

## Current/Target state hierarchy and transition

- `PROD-650 Current historical`로 표시한 기존 Host·Gallery·query·Media retry requirement는 현재 연결된 Production 동작과 완료 이력을 보존하는 non-normative evidence다.
- DSN-63 Target의 `viewState`는 PROD-853이 Production consumer와 분리된 shared surface에서 제어하는 최종 presentation contract다. `Ready`·`Sensitive`는 presentation별 secondary surface와 navigation을 사용한다. `Loading`·`Error`·`Unavailable`은 navigation·counter와 Compact tray를 숨기되 Wide context rail은 유지하며, `Error`만 retry action을 제공한다.
- PROD-849는 Gallery를 이 shared surface consumer로 교체·연결하면서 `onRevealSensitive`와 `onRetry` callback을 기존 permission/reveal·retry 경계에 매핑한다.

## PROD-650 Current historical retry evidence (non-normative)

> 다음 항목은 PROD-650의 연결된 Host/query/Media retry 동작을 historical evidence로만 보존한다. DSN-63 Target의 active `viewState` 최종 계약을 대체하지 않으며, 이 절에는 active MUST 규범이 없다.

- Host Post query의 cache hit·loading·error·retry·null Post·Content·Media에서는 modal shell과 close control이 유지되고, content 영역에는 안전한 loading·error·retry 표현이 사용됐다. raw 오류와 authorization 세부 정보, 이전 Media byte·URL은 노출하지 않았다.
- 현재 Media가 loading이거나 표시 URL load에 실패해도 현재 index와 당시 breakpoint의 Post detail surface가 유지됐고, 같은 image surface에서 안전한 오류와 해당 Media retry를 제공했다.
- Media retry는 같은 index에서 승인된 표시 URL load를 다시 시작하고 다른 Media의 loading·ready·error 상태를 초기화하지 않았다.
- 현재 query projection에 Post·Content·Media 또는 선택 index에 대응하는 Media가 없으면 modal chrome과 명시적 close control을 유지한 unavailable 상태를 사용했으며, 이전 Media byte·URL과 raw 내부 정보를 노출하지 않았다.

## ADDED Requirements

### Requirement: 현재 Post Content Media viewer 진입과 경계 (PROD-650 Current historical)

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/post-media-viewer.md`, PROD-650 Current historical — 일반 Post surface는 공개된 정상 gallery tile의 `{surfacePostId, mediaOwnerPostId, selectedIndex, originControl}`을 안정적인 surface-level Host에 전달해 modal Media Viewer를 SHALL 열어야 한다. Host는 현재 Relay actor environment에서 기존 Post `node(id)` visibility·authorization 경계로 surface Post를 조회하고 Media owner가 그 surface 또는 direct Source인지 MUST 검증해야 한다. 일반·Quote는 두 ID가 같고, pure Repost는 바깥 contentless Repost가 surface, direct Source가 Media owner여야 한다. Standalone Media 조회나 별도 authorization을 MUST 추가하지 않아야 한다. Modal shell·close·focus fallback은 query의 Suspense·error boundary 밖에 MUST 유지해야 한다. 현재 선택 Media를 더 이상 표시할 수 없으면 이전 Media byte·URL을 유지하지 않고 modal chrome·unavailable 상태·명시적 close control을 MUST 유지해야 한다. 명시적 dismiss, Viewer 안의 삭제 action, Relay actor/environment 전환과 Host surface unmount는 Viewer session을 MUST 종료해야 한다.

#### Scenario: 선택한 tile에서 viewer 열기

- **WHEN** 사용자가 현재 Post의 공개된 정상 Media tile을 선택한다
- **THEN** modal Viewer는 surface Post ID·Media owner Post ID와 선택한 document index로 Host session을 연다
- **AND** Host query는 기존 Post Node visibility·authorization 경계가 승인한 surface와, session의 Media owner ID가 그 surface 또는 direct Source와 일치하는 projection만 사용한다

#### Scenario: Sensitive Media가 가려진 상태 (PROD-650 Current historical)

- **WHEN** 현재 Post Content의 Sensitive Media가 공개되지 않았다
- **THEN** Media byte를 mount하거나 viewer 진입 control을 제공하지 않는다
- **AND** 사용자는 gallery의 기존 공개 control을 먼저 실행해야 한다

#### Scenario: Viewer 현재 Post의 Content Warning

- **WHEN** 사용자가 Content Warning을 공개한 Post의 Media Viewer를 연다
- **THEN** Viewer의 현재 Post 원문은 공개 상태로 표시된다
- **AND** Content Warning 안내와 다시 가리기 control을 표시하지 않는다
- **AND** 다른 Post surface의 reveal 저장 상태를 변경하지 않는다

#### Scenario: 같은 Content projection의 일시 unavailable과 복구

- **WHEN** 열린 Viewer의 현재 Content ID가 query loading·error 또는 null projection 뒤 같은 ID로 복구된다
- **THEN** Viewer는 같은 instance와 current index·expanded·Media loading/error/retry state를 유지한다
- **AND** unavailable 동안 이전 Media byte·URL은 표시하지 않는다

#### Scenario: 다른 Content revision

- **WHEN** 열린 Viewer의 Post query가 다른 non-null Content ID를 반환한다
- **THEN** Viewer는 expanded·overflow·Media loading/error/retry state를 초기화하고 session을 연 document index를 다시 사용한다
- **AND** 새 revision에 그 index가 없으면 다른 Media로 이동하지 않고 unavailable을 표시한다

#### Scenario: selected Profile 또는 Relay actor 변경

- **WHEN** Viewer가 열린 동안 selected Profile 또는 Relay actor/environment generation이 바뀐다
- **THEN** Viewer session을 닫고 이전 actor environment의 query를 폐기한다
- **AND** 이전 Profile의 Post·Action·Composer state를 새 environment에 유지하지 않는다

#### Scenario: 열린 뒤 표시 권한 무효화

- **WHEN** 열린 Viewer의 current Post query에서 Post·Content·Media 또는 현재 선택 Media가 null이거나 표시할 수 없게 된다
- **THEN** Viewer는 이전 Media byte·URL을 계속 표시하지 않는다
- **AND** modal chrome과 명시적 close control을 유지한 unavailable 상태를 표시한다

#### Scenario: Viewer session 종료 경계

- **WHEN** 사용자가 명시적으로 dismiss하거나 Viewer 안의 삭제 action을 완료하거나 Relay actor/environment가 전환되거나 Host surface가 unmount된다
- **THEN** Viewer session을 종료한다

### Requirement: 반응형 modal image와 Post detail layout

**Authority / Provenance:** `docs/design/post-media-viewer.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`, PROD-650 — Viewer는 Web `<768px`와 iOS·Android에서 image surface 위·compact Post detail panel 아래의 세로 layout을 SHALL 사용하고, Web `>=768px`에서는 image surface 왼쪽·기존 Post 상세 thread surface 오른쪽의 분할 layout을 MUST 사용해야 한다. Wide Web modal은 viewport의 `24px` inset 안에서 가용 폭을 사용하고 오른쪽 thread rail을 `clamp(320px, 25vw, 350px)`로 제한해 나머지 폭을 image surface에 MUST 배정해야 한다. 현재 이미지는 image surface 안에서 원본 비율을 유지한 `contain` 방식으로 MUST 표시하고 viewport를 초과하지 MUST NOT 한다.

#### Scenario: 좁은 Web viewer

- **WHEN** Web viewport 폭이 768px보다 작다
- **THEN** Viewer는 image surface를 compact Post detail panel 위에 배치한다
- **AND** 이미지와 panel은 viewport 경계 안에 남는다

#### Scenario: 넓은 Web viewer

- **WHEN** Web viewport 폭이 768px 이상이다
- **THEN** Viewer는 image surface를 왼쪽에, 기존 Post 상세 thread surface를 오른쪽에 배치한다
- **AND** 오른쪽 thread rail은 viewport 폭의 25%를 사용하되 최소 320px·최대 350px로 제한되고 나머지 modal 폭은 image surface에 배정된다
- **AND** 기존 Post 상세 Action Bar는 thread rail 안에서 가로 overflow 없이 표시된다
- **AND** 이미지는 배정된 surface 안에서 원본 비율을 유지한다

#### Scenario: Native viewer

- **WHEN** Viewer가 iOS 또는 Android에서 열린다
- **THEN** 화면 폭과 관계없이 image surface 위·compact Post detail panel 아래의 세로 layout을 사용한다

### Requirement: 같은 revision 안의 비순환 Media 탐색

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/post-media-viewer.md`, `docs/design/accessibility.md`, PROD-650 — Viewer는 현재 Post Content document 순서를 그대로 사용하는 이전·다음 control을 SHALL 제공하고 첫 장과 마지막 장에서 반대편으로 순환하지 MUST NOT 한다. Web은 `ArrowLeft`·`ArrowRight`, iOS·Android는 수평 swipe로 같은 이동을 MUST 제공해야 한다. Media가 2장 이상이면 시각적인 현재 위치와 전체 개수를 MUST 표시하고, Screen Reader에는 장수와 관계없이 현재 위치와 전체 개수를 MUST 전달해야 한다. 현재 Media의 nullable Alt Text는 image accessible name으로 MUST 사용하고, 값이 없으면 document 순서 기반 fallback을 MUST 사용하며 위치 안내는 image 이름과 별도로 MUST 전달해야 한다.

#### Scenario: 선택 index와 다중 이미지 위치

- **WHEN** 사용자가 여러 Media 중 N번째 tile에서 Viewer를 연다
- **THEN** Viewer는 N번째 Media를 현재 이미지로 표시한다
- **AND** 시각적 counter와 Screen Reader 정보는 N과 전체 개수를 전달한다

#### Scenario: 첫 장과 마지막 장

- **WHEN** 현재 이미지가 첫 장 또는 마지막 장이다
- **THEN** 범위를 벗어나는 이전 또는 다음 control은 비활성화된다
- **AND** 해당 입력을 실행해도 반대편 끝으로 순환하지 않는다

#### Scenario: 플랫폼 탐색 입력

- **WHEN** Web 사용자가 arrow key를 누르거나 Native 사용자가 유효한 수평 swipe를 실행한다
- **THEN** Viewer는 같은 Post Content revision 안의 해당 방향 인접 Media로 이동한다
- **AND** Post detail과 Action Bar 대상은 바뀌지 않는다

#### Scenario: 한 장의 Media

- **WHEN** Viewer의 Media가 한 장뿐이다
- **THEN** 시각적 counter를 표시하지 않고 이전·다음 이동을 제공하지 않는다
- **AND** Screen Reader에는 첫 번째이자 전체 한 장이라는 위치를 전달한다

#### Scenario: 현재 이미지의 접근 가능한 이름

- **WHEN** 현재 Media에 non-empty Alt Text가 있다
- **THEN** Viewer image는 해당 Alt Text를 accessible name으로 사용한다
- **AND** 현재 위치와 전체 개수는 image 이름과 별도의 정보로 전달한다

#### Scenario: Alt Text가 없는 현재 이미지

- **WHEN** 현재 Media의 Alt Text가 null이거나 빈 문자열이다
- **THEN** Viewer image는 document 순서 기반의 한국어 fallback을 accessible name으로 사용한다
- **AND** 현재 위치와 전체 개수는 fallback 이름을 대체하지 않는다

### Requirement: Compact 원문 detail panel과 기존 Post Action Bar

**Authority / Provenance:** `docs/design/post-media-viewer.md`, `docs/design/post-action-bar.md`, `docs/domain/objects/post-content.md`, PROD-650 — Web `<768px`와 iOS·Android Viewer의 compact Post detail panel은 현재 Post 작성자와 원문 text를 표시하고 원문을 기본 3줄로 SHALL 제한해야 한다. Panel은 내용 높이를 따르되 최대 높이를 `clamp(192px, viewport height의 32%, 240px)`로 MUST 계산해야 한다. `192px`은 낮은 viewport에서 작성자·원문 control·Action Bar를 보존하기 위한 최대 높이 계산의 안전 하한이어야 하며 panel의 최소 높이로 사용해 짧은 원문에서 남는 높이를 채우지 MUST NOT 한다. 넘치는 원문에만 접근 가능한 더 보기·접기 control을 MUST 제공하고, panel이 상한에 닿으면 원문 body만 줄어들고 text 영역 안에서 scroll해야 한다. 기존 Post Action Bar는 원문 바로 아래의 고정 영역을 MUST 유지하고 현재 제공하는 Reply·Repost·Reaction·Bookmark·More target·상태·count 계약을 일반·Repost·Quote Post surface에서 MUST 재사용해야 하며 Quote를 새 action으로 추가하거나 Media 전용 action·파일 저장·공유·다운로드를 MUST 제공하지 않는다.

#### Scenario: 짧은 원문

- **WHEN** 원문이 3줄을 넘지 않는다
- **THEN** 작성자와 원문을 표시하고 더 보기 control은 표시하지 않는다
- **AND** detail panel은 내용 높이를 따르고 기존 Post Action Bar는 원문 바로 아래의 고정 위치를 유지한다

#### Scenario: 긴 원문 펼치기와 접기

- **WHEN** 3줄을 넘는 원문에서 사용자가 더 보기를 실행한다
- **THEN** 원문은 펼쳐지고 control은 expanded 상태와 접기 action을 전달한다
- **AND** 넘치는 내용은 text 영역 안에서만 scroll하며 image surface와 Action Bar 위치를 밀지 않는다
- **AND** detail panel의 최대 높이는 `clamp(192px, viewport height의 32%, 240px)`로 계산된다
- **AND** 접기를 실행하면 3줄 제한 상태로 돌아간다

#### Scenario: 낮은 viewport의 긴 원문

- **WHEN** viewport 높이의 32%가 192px보다 작은 Compact Viewer에서 원문이 panel 상한을 넘는다
- **THEN** detail panel의 최대 높이 계산은 192px 안전 하한을 사용한다
- **AND** 작성자·원문 control·Action Bar는 유지되고 원문 body만 줄어들어 scroll한다
- **AND** 같은 viewport의 짧은 원문 panel은 192px로 강제 확장되지 않고 내용 높이를 따른다

#### Scenario: 기존 Post action 실행

- **WHEN** 사용자가 Viewer의 기존 Reply·Repost·Reaction·Bookmark 또는 More action을 실행한다
- **THEN** 기존 Post Action Bar와 같은 Post target·상태·count·실패 계약을 사용한다
- **AND** 현재 Media를 별도 action 대상으로 사용하거나 Media 파일 저장·공유·다운로드를 제공하지 않는다

#### Scenario: Repost와 Quote Post surface

- **WHEN** Viewer가 일반 Post가 아닌 Repost 또는 Quote Post surface에서 열린다
- **THEN** 기존 Post Action Bar의 해당 surface target routing과 action availability를 그대로 사용한다
- **AND** Quote를 새 Action Bar action으로 추가하지 않는다

#### Scenario: Pure Repost의 surface와 Media owner

- **WHEN** 사용자가 Content 없는 pure Repost의 direct Source Media를 Viewer로 연다
- **THEN** Viewer의 Media·본문·Profile과 Repost·Reaction·Bookmark·More는 direct Source Post를 대상으로 한다
- **AND** Reply는 바깥 contentless Repost identity와 availability를 유지해 disabled다
- **AND** Wide Viewer는 Source Post의 Reply Composer를 열지 않는다

### Requirement: Wide Web Post 상세 thread surface

**Authority / Provenance:** `docs/design/post-media-viewer.md`, `docs/design/post-action-bar.md`, `docs/design/accessibility.md`, PROD-650 — Web `>=768px` Viewer의 오른쪽은 현재 Post 상세와 같은 reply ancestors·현재 Post·reply descendants를 연결 순서대로 SHALL 제공해야 한다. 현재 Post는 작성자·원문 전체·기존 Post Action Bar를 제공하고 Reply Composer는 초기에는 닫혀 있어야 한다. Web `768–1279px`에서 Reply action은 Viewer를 먼저 닫고 다음 frame에 배경 Post surface의 공용 `600×720` Reply modal을 열어야 하며, Web `>=1280px`에서만 기존 상세처럼 현재 Post 아래에 Composer를 MUST 펼쳐야 한다. 원본 Post Media와 nested Viewer trigger는 왼쪽 image surface가 표시하므로 오른쪽 현재 Post에서 MUST 중복하지 않아야 하며, ancestors·descendants와 Quote·Repost 안의 Media 표현과 viewer interaction은 기존 Post surface 계약을 MUST 유지해야 한다. 오른쪽 surface 전체는 왼쪽 image surface와 독립적으로 MUST scroll하고 기존 reply connection의 loading·error·retry·pagination 및 Post·Composer·reply interaction 계약을 MUST 재사용해야 한다.

#### Scenario: Compact wide Web의 원본 Post와 Reply modal

- **WHEN** Web viewport 폭이 768px 이상 1280px 미만인 Viewer가 열린다
- **THEN** 오른쪽 surface는 reply ancestors·현재 Post·reply descendants를 기존 연결 순서대로 표시한다
- **AND** 현재 Post는 작성자·원문 전체·기존 Post Action Bar를 표시하고 Reply Composer는 초기에는 닫혀 있다
- **AND** 현재 Post의 Reply action을 실행하면 Viewer가 먼저 닫히고 다음 frame에 배경 Post surface의 공용 `600×720` Reply modal이 열린다
- **AND** Viewer 위에 Reply modal을 중첩하거나 rail 안에 Composer를 펼치지 않는다
- **AND** 원본 Post Media와 nested Viewer trigger는 오른쪽에서 중복하지 않는다

#### Scenario: Full Web의 원본 Post와 Composer

- **WHEN** Web viewport 폭이 1280px 이상인 Viewer가 열린다
- **THEN** 오른쪽 surface는 reply ancestors·현재 Post·reply descendants를 기존 연결 순서대로 표시한다
- **AND** 현재 Post는 작성자·원문 전체·기존 Post Action Bar를 표시하고 Reply Composer는 초기에는 닫혀 있다
- **AND** 현재 Post의 Reply action을 실행하면 Composer가 현재 Post 아래에서 펼쳐진다
- **AND** 원본 Post Media와 nested Viewer trigger는 오른쪽에서 중복하지 않는다

#### Scenario: Wide Web의 reply thread와 Media

- **WHEN** 현재 Post에 reply descendants가 있다
- **THEN** 오른쪽 surface는 기존 Post 상세와 같은 reply 순서·표현과 interaction을 제공한다
- **AND** ancestors·descendants와 Quote·Repost 안의 Media 및 viewer interaction은 기존 Post surface 계약대로 유지한다

#### Scenario: 오른쪽 독립 scroll과 pagination

- **WHEN** 사용자가 Wide Web 오른쪽 thread surface의 끝에 가까워진다
- **THEN** 기존 reply connection은 같은 pending·error·retry 계약으로 다음 page를 요청할 수 있다
- **AND** route와 Viewer의 pagination UI state와 same-surface burst 재진입 guard는 각 scroll surface가 독립적으로 유지한다
- **AND** 같은 Relay environment에서 동일 connection의 동일 cursor·count pagination operation이 겹치면 in-flight dedupe와 결과 병합은 Relay가 소유한다
- **AND** Viewer open 상태만으로 배경 document pagination을 중지하지 않는다
- **AND** 오른쪽 scroll과 pagination은 왼쪽 현재 image 위치·loading·error 상태를 변경하지 않는다

#### Scenario: Reply Composer와 thread action

- **WHEN** 사용자가 Wide Web 오른쪽의 Reply Composer, Post Action Bar 또는 reply action을 실행한다
- **THEN** 기존 Post 상세와 같은 authentication·selected Profile·target·count·pending·cache·failure 계약을 사용한다
- **AND** 해당 child overlay의 open·dismiss·focus는 Viewer를 의도치 않게 함께 닫지 않는다

#### Scenario: Wide thread data loading 또는 실패

- **WHEN** Wide Web 오른쪽의 Post detail thread data가 loading이거나 load에 실패한다
- **THEN** 오른쪽 surface 안에 기존 정책을 따르는 loading 또는 안전한 error·retry 상태를 표시한다
- **AND** 왼쪽 선택 image, 현재 index와 modal chrome은 유지한다
- **AND** load 결과의 Post identity가 Viewer의 현재 Post와 다르면 그 결과를 표시하지 않는다
- **AND** thread 결과가 unavailable이어도 Viewer session을 자동 종료하지 않는다

### Requirement: Modal dismiss와 focus 복귀

**Authority / Provenance:** `docs/design/post-media-viewer.md`, `docs/design/accessibility.md`, PROD-650 — Viewer는 modal role과 명시적인 close control을 SHALL 제공하고 open 시 배경 Post surface를 focus와 interaction 대상에서 MUST 제외하며 초기 focus를 close control로 MUST 이동해야 한다. Web `Escape`·close control·backdrop press와 Native back으로 dismiss할 수 있어야 하며, Web image·detail surface·modal 내부 control의 press는 backdrop dismiss로 전파되지 MUST NOT 한다. Viewer open·Media navigation·close는 route와 browser history를 변경하지 MUST NOT 한다. 닫을 때 원래 선택한 tile이 존재하면 그 tile로 focus를 MUST 복귀해야 한다. 원래 tile이 사라졌다면 Host가 속한 목록 또는 상세 screen의 안전한 focus target으로 MUST 복귀해야 한다. Query loading·error·unavailable 동안에도 close target과 fallback focus surface를 MUST 유지해야 한다.

#### Scenario: Web keyboard modal lifecycle

- **WHEN** Web 사용자가 tile에서 Viewer를 열고 `Escape` 또는 close control로 닫는다
- **THEN** 열린 동안 focus는 modal 경계 안에 유지되고 초기 focus는 close control에 있다
- **AND** 배경 Post surface는 focus 또는 interaction 대상이 되지 않는다
- **AND** 닫힌 뒤 원래 tile이 존재하면 그 tile로 focus가 돌아간다

#### Scenario: Native dismiss

- **WHEN** iOS·Android 사용자가 close control 또는 Native back을 실행한다
- **THEN** Viewer가 닫히고 사용자는 원래 Post surface의 대응 위치로 돌아간다

#### Scenario: Web backdrop dismiss와 내부 press 격리

- **WHEN** Web 사용자가 Viewer backdrop을 직접 press한다
- **THEN** Viewer가 닫히고 원래 gallery tile 또는 안전한 Post focus target으로 돌아간다
- **AND** image·detail panel 또는 modal 내부 control을 press하면 backdrop dismiss를 함께 실행하지 않는다

#### Scenario: route와 browser history 유지

- **WHEN** 사용자가 Viewer를 열고 Media를 탐색한 뒤 닫는다
- **THEN** 현재 route와 browser history entry는 Viewer lifecycle 때문에 변경되지 않는다
- **AND** 닫힌 뒤 사용자는 navigation 없이 원래 Post surface와 gallery tile 문맥으로 돌아간다

#### Scenario: 원래 tile이 사라진 뒤 닫기

- **WHEN** Viewer를 연 tile이 더 이상 존재하지 않는 상태에서 Viewer가 닫힌다
- **THEN** focus는 제거된 node가 아니라 남아 있는 Post surface의 안전한 focus target으로 이동한다

### Requirement: DSN-63 Target 공용 Viewer surface의 상태와 전달 owner

**Authority / Provenance:** `docs/design/post-media-viewer.md`, DSN-63, PROD-853, PROD-849 — DSN-63 Target shared Viewer surface는 Compact·Wide presentation과 Ready·Sensitive·Loading·Error·Unavailable `viewState`를 SHALL 구분해야 한다. black 70% overlay와 radius 8 Media frame, 48×48 interaction target, 30px icon, 2.5 stroke를 사용해야 한다. Compact 390은 Media frame을 좌우 16px·상단 80px·하단 88px에 배치하고 하단 좌우 16px·높이 56px tray를 사용해야 한다. Wide 1024·1440은 560×420 Media frame을 image stage 가운데 배치하고 오른쪽 346px full-height rail을 사용해야 한다. Ready·Sensitive는 비순환 navigation·상단 counter와 presentation별 secondary surface를 제공한다. Sensitive는 상태 설명과 `보기` action을 제공한다. Loading은 spinner·설명, Error는 설명·`다시 시도`, Unavailable은 설명을 제공하며 navigation·counter와 Compact tray를 렌더링하지 않는다. Wide rail은 모든 상태에서 유지한다. PROD-849는 Gallery→shared surface consumer replacement·permission·retry mapping·Production 연결과 Web/iOS/Android runtime·archive evidence를 소유한다. PROD-853은 disconnected 공용 UI·component test·Storybook을 소유한다.

#### Scenario: 상태별 공용 surface

- **WHEN** 공용 Viewer surface가 Compact 또는 Wide presentation과 Ready·Sensitive·Loading·Error·Unavailable 중 하나를 받는다
- **THEN** Ready·Sensitive에서는 해당 presentation의 secondary surface와 비순환 이전·다음 navigation·상단 counter를 표시한다
- **AND** Sensitive에서는 상태 설명과 `보기` action을 표시한다
- **AND** Loading·Error·Unavailable에서는 navigation·counter와 Compact tray를 표시하지 않는다
- **AND** Loading은 spinner·설명, Error는 설명·`다시 시도`, Unavailable은 설명을 표시한다
- **AND** Wide context rail은 모든 상태에서 표시한다
- **AND** 모든 view state에서 사용자가 close를 실행할 수 있다

#### Scenario: Host query 또는 Media 오류의 Target viewState 매핑

- **WHEN** PROD-849가 연결된 Host query 또는 current Media의 loading·error·unavailable projection을 DSN-63 Target shared surface에 전달한다
- **THEN** top-level shared surface `viewState`를 `Loading`·`Error`·`Unavailable` 중 하나로 MUST 매핑한다
- **AND** Error의 `다시 시도`는 `onRetry`를 호출하고 현재 index를 바꾸지 않는다
- **AND** navigation·counter와 Compact tray는 MUST NOT 렌더링하며 Wide context rail은 MUST 유지한다

#### Scenario: Sensitive reveal callback과 consumer permission 경계

- **WHEN** PROD-853 disconnected shared surface가 Gallery 공개 전에 `Sensitive` state를 받고 사용자가 Sensitive reveal control을 실행한다
- **THEN** Gallery 공개 전에 새로운 Viewer trigger를 만들지 않고 `onRevealSensitive` callback을 호출한다
- **AND** PROD-849가 이 callback을 기존 Gallery permission/reveal mapping과 Production consumer에 연결·검증한다
- **AND** PROD-853 Storybook fixture는 permission, Gallery 연결 또는 Production route 완료를 표현하지 않는다

#### Scenario: PROD-853 Storybook-first delivery

- **WHEN** PROD-853의 component test와 Storybook fixture가 검증된다
- **THEN** disconnected 공용 UI의 상태·경계만 증명한다
- **AND** Gallery·permission·Production Host/Relay/route 연결 완료로 해석하지 않는다

#### Scenario: PROD-849 Production delivery와 archive

- **WHEN** PROD-849가 Production consumer 연결·교체와 Web/iOS/Android runtime 검증을 완료한다
- **THEN** 해당 Production·runtime evidence를 이 change의 남은 task에 기록한다
- **AND** 전체 선언 scope와 canonical sync가 끝나기 전에는 change를 archive하지 않는다
