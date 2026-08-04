## Context

이 기록은 PROD-650의 수정된 Linear 계약, Post Content·Media 도메인 경계, Post Media Gallery·Viewer·Action Bar·접근성·breakpoint canonical 문서와 사용자에게 확인한 viewer layout·원문·Action Bar·탐색·저장 제외 결정을 구현 전에 고정한다. 구현 지침은 `design.md`에 두고, 여기에는 여러 surface와 플랫폼이 함께 따라야 하는 durable choice만 기록한다.

## Decision Records

### Post surface가 Viewer session과 현재 Post를 소유한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/post-media-gallery.md`, `docs/design/post-media-viewer.md`, PROD-650
- Status: Active
- Context / Problem: Gallery는 Media geometry·Sensitive·retry만 알고 작성자·원문·Post action target은 알지 못한다. Gallery가 Viewer와 데이터를 직접 소유하면 현재 Content revision과 상위 Post action 경계가 분리된다.
- Decision Outcome: 목록·상세의 Post surface가 open 상태, 선택 index, 대상 Post·Profile·Content identity와 origin focus target을 소유한다. Gallery는 Sensitive 공개 뒤 정상 tile의 document index만 전달한다. Viewer는 현재 Post 조회 결과를 소비하며 별도 Media query나 standalone authorization을 추가하지 않는다.
- Alternatives Considered: Gallery 내부 modal state, Media ID 기반 별도 query, route 기반 viewer. 각각 Post 맥락 공급을 중복하거나 authorization·revision 경계를 갈라놓고, route는 승인된 제외 범위를 확장한다.
- Consequences: 목록과 상세은 같은 Viewer API를 사용해야 하며 대상 identity 변경·unmount 시 Viewer를 닫는다. Reply 부모 preview는 callback을 받지 않는다.
- Confirmation / Follow-up: 동일 Post·revision 고정, Sensitive 진입 차단, lifecycle close와 origin focus 복귀를 component·runtime에서 확인한다.

### Web 768px에서만 Viewer layout을 분기한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-media-viewer.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`, PROD-650
- Status: Active
- Context / Problem: Figma는 Mobile fullscreen 기준만 제공하며 Web에서 이미지와 긴 원문·Action Bar를 같은 세로 흐름으로 두면 넓은 viewport를 활용하지 못한다. Native는 Web shell breakpoint를 사용하지 않는다.
- Decision Outcome: Web `<768px`와 iOS·Android는 image 위·detail panel 아래의 세로 layout, Web `>=768px`는 image 왼쪽·detail panel 오른쪽의 분할 layout을 사용한다. 이미지는 두 layout 모두 `contain`으로 표시한다.
- Alternatives Considered: 모든 플랫폼 fullscreen image-only, 모든 폭 세로 layout, Web compact/full shell의 1280px 추가 분기. 각각 승인된 Post 맥락을 제거하거나 넓은 Web을 낭비하고, Viewer에 필요 없는 세 번째 layout을 만든다.
- Consequences: Web은 767px와 768px 경계를 직접 확인하고 Native는 화면 폭과 관계없이 세로 layout을 유지한다. Figma의 Mobile 시각 treatment와 승인된 Web 확장을 함께 사용한다.
- Confirmation / Follow-up: Storybook과 Web runtime에서 `<768px`·`>=768px`, iOS·Android runtime에서 세로 layout을 구분해 확인한다.

### 원문은 3줄에서 펼치고 Action Bar는 고정한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/post-media-viewer.md`, `docs/design/post-action-bar.md`, `docs/domain/objects/post-content.md`, PROD-650
- Status: Active
- Context / Problem: 원문 전체를 image와 같은 scroll 흐름에 두면 긴 Post가 Action Bar를 viewport 밖으로 밀어 viewer의 핵심 action 맥락을 잃게 한다.
- Decision Outcome: Detail panel은 작성자와 원문을 표시하고 실제로 3줄을 넘는 원문에만 더 보기·접기를 제공한다. 펼친 원문은 text 영역만 scroll하며 기존 Post Action Bar는 mobile viewer 아래와 Web side panel 아래에 고정한다.
- Alternatives Considered: 원문 전체 상시 표시, 원문 생략, `n/total`만 표시, Action Bar까지 전체 scroll. 각각 action 위치를 불안정하게 하거나 사용자가 승인한 원문·Post 맥락을 제거한다.
- Consequences: 원문 overflow를 실제 layout으로 판정하고 expanded state를 전달해야 한다. Viewer의 Action Bar는 같은 Post의 기존 fragment·binding·상태·count를 재사용해야 한다.
- Confirmation / Follow-up: 짧은·긴 원문, 펼침·접기, text-only scroll과 fixed Action Bar를 compact·wide와 Screen Reader에서 확인한다.

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

### PROD-626 위에서 구현하고 선행 gallery archive 뒤 동기화한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-media-gallery.md`, `docs/design/post-media-viewer.md`, PROD-626, PROD-650
- Status: Active
- Context / Problem: PROD-650은 PROD-626이 추가한 compact gallery와 비대화형 tile 경계를 변경한다. 선행 branch와 active delta가 아직 archive되지 않은 상태에서 독립 baseline을 가정하면 코드와 spec archive 순서가 충돌한다.
- Decision Outcome: PROD-650 구현은 검증한 최신 PROD-626 head 위에 stack하고 Gallery geometry·Sensitive·retry 변경을 복제하지 않는다. PROD-650의 `post-media-display` 수정 delta는 PROD-626의 gallery requirement가 canonical spec에 반영된 뒤 archive한다.
- Alternatives Considered: 현재 main에서 Gallery를 복제, 두 Linear 이슈와 변경을 합치기, PROD-626 전체 완료 전 구현을 중단. 각각 중복 구현·소유권 혼합을 만들거나 이미 해소된 P1 이후 독립적으로 가능한 viewer 작업까지 지연한다.
- Consequences: 부모 PR rewrite·merge 때 ancestry와 range diff를 다시 확인해야 한다. PROD-626의 남은 Native QA와 archive 책임을 PROD-650 완료로 대신 처리하지 않는다.
- Confirmation / Follow-up: 구현 전·push 전 exact parent SHA와 stack diff를 확인하고, 두 change의 strict validation과 archive 순서를 별도로 기록한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
