## Context

이 기록은 PROD-650의 수정된 Linear 계약, Post Content·Media 도메인 경계, Post Media Gallery·Viewer·Post 상세 thread·Action Bar·접근성·breakpoint canonical 문서와 사용자에게 확인한 viewer layout·원문·Composer·thread·탐색·저장 제외 결정을 구현 전에 고정한다. 구현 지침은 `design.md`에 두고, 여기에는 여러 surface와 플랫폼이 함께 따라야 하는 durable choice만 기록한다.

## Decision Records

### Post surface가 Viewer session과 현재 Post를 소유한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/post-media-gallery.md`, `docs/design/post-media-viewer.md`, PROD-650
- Status: Active
- Context / Problem: Gallery는 Media geometry·Sensitive·retry만 알고 작성자·원문·Post action target은 알지 못한다. Gallery가 Viewer와 데이터를 직접 소유하면 현재 Content revision과 상위 Post action 경계가 분리된다.
- Decision Outcome: 목록·상세의 Post surface가 open 상태, 선택 index, 대상 Post·Profile·Content identity와 origin focus target을 소유한다. Gallery는 Sensitive 공개 뒤 정상 tile의 document index만 전달한다. Viewer는 현재 Post 조회 결과를 소비하며 별도 Media query나 standalone authorization을 추가하지 않는다.
- Alternatives Considered: Gallery 내부 modal state, Media ID 기반 별도 query, route 기반 viewer. 각각 Post 맥락 공급을 중복하거나 authorization·revision 경계를 갈라놓고, route는 승인된 제외 범위를 확장한다.
- Consequences: 목록과 상세은 같은 Viewer API를 사용해야 하며 대상 identity, 선택된 action Profile 또는 Relay actor/environment generation 변경·unmount 시 Viewer를 닫는다. Reply 부모 preview는 callback을 받지 않는다.
- Confirmation / Follow-up: 동일 Post·revision 고정, selected Profile·actor 변경 close, Sensitive 진입 차단, lifecycle close와 origin focus 복귀를 component·runtime에서 확인한다.

### Web 768px에서 compact detail과 Post 상세 thread를 분기한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-media-viewer.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`, PROD-650
- Status: Active
- Context / Problem: Figma는 Mobile fullscreen 기준만 제공한다. 넓은 Web에서 작은 축약 panel만 두면 기존 Post 상세의 원문·Composer·reply interaction을 이어가지 못하고, Native는 Web shell breakpoint를 사용하지 않는다.
- Decision Outcome: Web `<768px`와 iOS·Android는 image 위·compact detail panel 아래의 세로 layout을 사용한다. Web `>=768px`는 viewport의 `24px` inset 안에서 image 왼쪽·기존 Post 상세 thread surface 오른쪽의 분할 layout을 사용해 원문 전체·기존 Action Bar·Reply Composer·reply descendants를 제공한다. 오른쪽 rail은 `clamp(320px, 25vw, 350px)`로 제한하고 나머지 폭을 image에 배정한다. 320px 최소폭은 기존 Post 상세의 228px Action Bar가 내부 padding·avatar column 뒤에도 가로 overflow 없이 보존되는 최소 안전폭이다. 이미지는 두 layout 모두 `contain`으로 표시한다.
- Alternatives Considered: 모든 플랫폼 fullscreen image-only, 모든 폭 세로 layout, Wide Web의 축약 PostListItem 또는 작성자·원문·Action Bar만 있는 panel, Post 상세 route의 600px 폭 재사용, 고정 3:1·4:1 비율, Web compact/full shell의 1280px 추가 분기. 각각 승인된 Post 맥락을 제거하거나 넓은 Web을 낭비하고, Composer·thread interaction을 누락하거나 viewport에 따라 rail이 너무 크거나 작아지며 Viewer에 필요 없는 세 번째 layout을 만든다.
- Consequences: Web은 767px와 768px 경계, 25vw가 최소·최대 clamp에 걸리는 viewport를 직접 확인하고 Native는 화면 폭과 관계없이 compact 세로 layout을 유지한다. Wide 오른쪽은 기존 Post 상세와 같은 표현·interaction·pagination을 제공하지만 같은 600px 폭은 사용하지 않고, 원본 Post Media는 왼쪽에만 표시한다.
- Confirmation / Follow-up: Storybook과 Web runtime에서 `<768px`·`>=768px`, Wide 오른쪽 독립 scroll·Composer·reply pagination을 확인하고 iOS·Android runtime에서 compact 세로 layout을 구분해 확인한다.

### Compact 원문은 3줄에서 펼치고 Wide는 Post 상세 전체를 scroll한다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-media-viewer.md`, `docs/design/post-action-bar.md`, `docs/domain/objects/post-content.md`, PROD-650
- Status: Active
- Context / Problem: Compact 화면에서 원문 전체를 image와 같은 흐름에 두면 긴 Post가 Action Bar를 viewport 밖으로 밀지만, viewport 높이의 32%만 상한으로 쓰면 500px 이하의 낮은 화면에서 작성자·원문 control·Action Bar가 사용할 고정 영역보다 panel 상한이 작아질 수 있다. Wide Web까지 3줄 panel로 제한하면 기존 Post 상세와 thread interaction을 충분히 제공하지 못한다.
- Decision Outcome: Web `<768px`와 Native detail panel은 내용 높이를 따르되 최대 높이를 `clamp(192px, viewport height의 32%, 240px)`로 계산한다. `192px`은 낮은 viewport에서 작성자·원문 control·Action Bar를 보존하기 위한 최대 높이 계산의 안전 하한이지 panel의 최소 높이가 아니다. 실제로 3줄을 넘는 원문에만 더 보기·접기를 제공하고, 상한을 넘으면 원문 body만 줄어들고 scroll하며 기존 Post Action Bar를 원문 바로 아래의 고정 영역에 둔다. Web `>=768px` 오른쪽은 원문을 접지 않고 기존 Post 상세 thread 전체를 독립 scroll한다.
- Alternatives Considered: `min(240px, 32vh)`만 사용, 192px 또는 240px 고정 panel, 모든 환경에서 원문 전체 상시 표시, 모든 환경에서 3줄 panel, 원문 생략. 순수 32vh 상한은 낮은 화면에서 고정 chrome을 가릴 수 있고, 고정 panel은 짧은 원문에 불필요한 여백을 만들며, 나머지는 compact action 위치를 불안정하게 하거나 Wide의 원문·Composer·thread 맥락을 제거한다.
- Consequences: Compact 원문 overflow를 실제 layout으로 판정하고 expanded state를 전달해야 한다. Panel과 body가 남는 높이를 채우지 않도록 하되 상한을 넘는 body만 shrink·scroll해야 한다. 390px 높이에서도 작성자·원문 control·Action Bar가 남아야 한다. Wide는 기존 Post 상세의 Action Bar·Composer·reply pagination과 child overlay를 같은 fragment·binding으로 재사용해야 한다.
- Confirmation / Follow-up: Compact에서 짧은·긴 원문, 펼침·접기, 일반·390px 높이의 panel 상한·고정 chrome 보존·Action Bar 인접 배치·text-only scroll을 확인하고 Wide에서 원문 전체·독립 scroll·Composer·reply descendants를 확인한다.

### Wide Viewer는 route가 아닌 재사용 가능한 Post 상세 thread surface를 사용한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-media-viewer.md`, `docs/design/post-action-bar.md`, PROD-650
- Status: Active
- Context / Problem: 현재 detail route가 `PostDetailThread` query와 document scroll을 소유하고 Viewer API에는 thread 입력이 없다. Route를 Viewer 안에 중첩하거나 `PostListItem`을 복제하면 route·focus·Media가 중복되고 Composer·reply pagination이 누락된다.
- Decision Outcome: Detail route와 Viewer가 reply ancestors·현재 Post·reply descendants 표시를 공유할 수 있도록 Post 상세 thread surface를 추출한다. Reply Composer는 기존 상세처럼 초기에는 닫혀 있고 Reply action으로 현재 Post 아래에서 펼친다. Viewer는 같은 Post identity만 허용하고 원본 Post Media와 nested Viewer trigger를 오른쪽에서 생략하되 thread 안의 다른 Media와 viewer interaction은 유지한다. 목록 caller에서 필요한 thread data는 같은 Post node와 기존 visibility 정책으로 load하되 route·browser history를 변경하지 않는다. Loading·error는 오른쪽에만 표시해 왼쪽 image와 modal chrome을 유지한다.
- Alternatives Considered: Detail route component 직접 mount, Viewer 전용 thread 구현, `PostListItem` 하나만 표시, open 시 detail route로 navigation. 각각 ownership 중첩·계약 복제·Composer와 descendants 누락·승인된 URL/history 유지 위반을 만든다.
- Consequences: 기존 reply connection pagination을 오른쪽 scroller에 연결하는 seam과 원본 Media 생략 입력이 필요하다. 현재 Post의 Viewer가 배경 상세 route와 같은 reply connection을 재사용하는 경우에는 배경 document pagination effect를 중지해 Viewer 오른쪽을 단일 owner로 만들어야 한다. Ancestor·descendant·Quote·Repost처럼 다른 Post identity의 Viewer는 별도 reply connection을 사용하므로 배경 route pagination을 유용한 prefetch로 계속할 수 있다. Viewer 뒤 원래 Post surface는 focus와 interaction 대상에서 제외해야 한다.
- Confirmation / Follow-up: 목록·상세 양쪽에서 같은 원본 Post identity, Media 비중복, Composer 작성, Viewer scroller만 한 번 load하는 reply pagination, loading·error와 route/history 유지·focus 복귀를 확인한다.

### Media 탐색은 순환하지 않고 위치를 조건부 표시한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/design/post-media-viewer.md`, `docs/design/accessibility.md`, PROD-650
- Status: Active
- Context / Problem: 최대 4장의 document 순서를 유지하면서 끝 경계와 단일 이미지에서 불필요한 UI를 명확히 해야 한다.
- Decision Outcome: 선택한 index에서 시작해 이전·다음으로 document 순서를 탐색하고 첫·마지막 경계에서 control을 비활성화하며 순환하지 않는다. Web arrow key와 Native 수평 swipe를 추가하되 이전·다음 control을 모든 플랫폼의 명시적 입력으로 유지한다. 시각적 `현재/전체`는 다중 Media에서만 표시하고 Screen Reader 위치 정보는 한 장에도 제공한다. 현재 image는 Alt Text를 accessible name으로 사용하고 없으면 document 순서 fallback을 사용하며, 위치 안내는 image 이름과 별도로 전달한다.
- Alternatives Considered: 끝에서 순환, 단일 이미지에도 `1/1` 상시 표시, gesture-only 탐색. 각각 document 경계 예측성을 낮추거나 시각 noise를 늘리고 동등 입력을 제거한다.
- Consequences: keyboard·swipe는 동일 index reducer를 사용하고 disabled 상태를 보조 기술에 전달해야 한다. 원문 vertical scroll과 Native swipe의 gesture 경쟁을 조정해야 한다.
- Confirmation / Follow-up: 1장, 첫·중간·마지막, nullable Alt Text·fallback, 비순환 end state, Web keyboard와 Native button·swipe·Screen Reader 위치 안내를 확인한다.

### 기존 Post action만 제공하고 Media 파일 저장은 후속으로 둔다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-media-viewer.md`, `docs/design/post-action-bar.md`, PROD-650
- Status: Active
- Context / Problem: Figma Mobile frame에는 저장 affordance가 있지만, 현재 제품 계약은 이미지보다 원문과 기존 Post Action Bar 맥락을 우선한다. Media 파일 저장은 단순 UI 추가 외에 플랫폼별 permission·delivery·failure 처리가 필요하다.
- Decision Outcome: Viewer는 현재 기존 Post Action Bar가 제공하는 Reply·Repost·Reaction·Bookmark·More와 기존 Post 링크 복사를 같은 Post target으로 재사용한다. 일반·Repost·Quote Post surface의 기존 target routing은 유지하지만 Quote를 새 action으로 추가하지 않는다. Media 파일 URL 복사·공유·다운로드·기기 저장과 Media 전용 Action Bar는 제공하지 않는다.
- Alternatives Considered: Figma 저장 action을 그대로 구현, Web download만 먼저 제공, 현재 Action Bar를 제거하고 Media 전용 row 사용. 각각 승인되지 않은 플랫폼·권한 범위를 추가하거나 기존 Post action 맥락을 잃는다.
- Consequences: Figma와의 의도적 차이를 PR에 기록한다. 기기 저장이 필요하면 권한·파일 전달·실패·재시도 UX를 가진 별도 Linear·canonical 계약으로 시작한다.
- Confirmation / Follow-up: Viewer Action Bar에 기존 action만 있고 Media 파일 저장·공유 항목이나 새 URL 처리가 생기지 않았는지 검증한다.

### 병합된 PROD-626 gallery 계약을 재사용하고 최신 main을 부모로 둔다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-media-gallery.md`, `docs/design/post-media-viewer.md`, PROD-626, PROD-650
- Status: Active
- Context / Problem: PROD-650은 PROD-626이 추가하고 `main`에 병합된 compact gallery와 비대화형 tile 경계를 변경한다. 과거 stack 문구를 유지하면 현재 ancestry와 archive ownership을 잘못 설명한다.
- Decision Outcome: PROD-650 구현은 최신 `main`을 부모로 사용하고 병합된 Gallery geometry·Sensitive·retry 계약을 재사용한다. PROD-626의 남은 runtime QA와 archive 책임을 PROD-650 완료로 대신 처리하지 않는다.
- Alternatives Considered: 과거 PROD-626 head 위 stack을 계속 유지, Gallery를 복제, 두 Linear 이슈와 변경을 합치기. 각각 현재 Git 상태와 어긋나거나 중복 구현·소유권 혼합을 만든다.
- Consequences: push 전 exact `main` parent와 range diff를 확인한다. PROD-650 OpenSpec archive는 자체 task·runtime·CI 및 필요한 canonical spec sync가 완료된 뒤 별도로 판단한다.
- Confirmation / Follow-up: exact parent SHA, branch-only diff, PROD-626와 PROD-650의 남은 책임을 PR에 구분해 기록한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
