## ADDED Requirements

### Requirement: 현재 Post Content Media viewer 진입과 경계

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/post-media-viewer.md`, PROD-650 — 일반 Post surface는 공개된 정상 gallery tile의 선택을 받아 현재 조회가 승인된 Post Content revision과 `media` 목록만 사용하는 modal Media Viewer를 선택한 document index에서 SHALL 열어야 한다. Viewer는 standalone Media 조회나 별도 authorization을 MUST 추가하지 않으며, 대상 Post·Profile·Content revision이 바뀌거나 surface가 unmount되거나 Sensitive reveal·현재 Post 조회 결과가 무효화되면 이전 Media를 유지하지 않고 MUST 닫혀야 한다.

#### Scenario: 선택한 tile에서 viewer 열기

- **WHEN** 사용자가 현재 Post의 공개된 정상 Media tile을 선택한다
- **THEN** modal Viewer는 같은 Post Content revision의 Media 목록을 선택한 document index에서 연다
- **AND** 별도 Media 조회 없이 현재 Post surface가 이미 가진 승인된 표시 정보만 사용한다

#### Scenario: Sensitive Media가 가려진 상태

- **WHEN** 현재 Post Content의 Sensitive Media가 공개되지 않았다
- **THEN** Media byte를 mount하거나 viewer 진입 control을 제공하지 않는다
- **AND** 사용자는 gallery의 기존 공개 control을 먼저 실행해야 한다

#### Scenario: viewer 대상 lifecycle 변경

- **WHEN** 열린 Viewer의 대상 Post·Profile·Content revision이 바뀌거나 소유 surface가 unmount된다
- **THEN** Viewer는 이전 revision의 Media를 유지하거나 새 대상과 섞지 않고 닫힌다

#### Scenario: 열린 뒤 표시 권한 무효화

- **WHEN** 열린 Viewer의 Sensitive Media가 다시 가려지거나 대상 Post가 삭제되거나 현재 조회 결과에서 더 이상 사용할 수 없게 된다
- **THEN** Viewer는 이전 Media를 계속 표시하지 않고 즉시 닫힌다

### Requirement: 반응형 modal image와 Post detail layout

**Authority / Provenance:** `docs/design/post-media-viewer.md`, `docs/design/breakpoints.md`, `docs/design/figma.md`, PROD-650 — Viewer는 Web `<768px`와 iOS·Android에서 image surface 위·Post detail panel 아래의 세로 layout을 SHALL 사용하고, Web `>=768px`에서는 image surface 왼쪽·Post detail panel 오른쪽의 분할 layout을 MUST 사용해야 한다. 현재 이미지는 image surface 안에서 원본 비율을 유지한 `contain` 방식으로 MUST 표시하고 viewport를 초과하지 MUST NOT 한다.

#### Scenario: 좁은 Web viewer

- **WHEN** Web viewport 폭이 768px보다 작다
- **THEN** Viewer는 image surface를 Post detail panel 위에 배치한다
- **AND** 이미지와 panel은 viewport 경계 안에 남는다

#### Scenario: 넓은 Web viewer

- **WHEN** Web viewport 폭이 768px 이상이다
- **THEN** Viewer는 image surface를 왼쪽에, Post detail panel을 오른쪽에 배치한다
- **AND** 이미지는 배정된 surface 안에서 원본 비율을 유지한다

#### Scenario: Native viewer

- **WHEN** Viewer가 iOS 또는 Android에서 열린다
- **THEN** 화면 폭과 관계없이 image surface 위·Post detail panel 아래의 세로 layout을 사용한다

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

### Requirement: 원문 detail panel과 기존 Post Action Bar

**Authority / Provenance:** `docs/design/post-media-viewer.md`, `docs/design/post-action-bar.md`, `docs/domain/objects/post-content.md`, PROD-650 — Viewer의 Post detail panel은 현재 Post 작성자와 원문 text를 표시하고 원문을 기본 3줄로 SHALL 제한해야 한다. 넘치는 원문에만 접근 가능한 더 보기·접기 control을 MUST 제공하고, 펼친 원문은 text 영역 안에서만 scroll해야 한다. 기존 Post Action Bar는 panel 아래에 MUST 고정하고 현재 제공하는 Reply·Repost·Reaction·Bookmark·More target·상태·count 계약을 일반·Repost·Quote Post surface에서 MUST 재사용해야 하며 Quote를 새 action으로 추가하거나 Media 전용 action·파일 저장·공유·다운로드를 MUST 제공하지 않는다.

#### Scenario: 짧은 원문

- **WHEN** 원문이 3줄을 넘지 않는다
- **THEN** 작성자와 원문을 표시하고 더 보기 control은 표시하지 않는다
- **AND** 기존 Post Action Bar는 detail panel 아래의 고정 위치를 유지한다

#### Scenario: 긴 원문 펼치기와 접기

- **WHEN** 3줄을 넘는 원문에서 사용자가 더 보기를 실행한다
- **THEN** 원문은 펼쳐지고 control은 expanded 상태와 접기 action을 전달한다
- **AND** 넘치는 내용은 text 영역 안에서만 scroll하며 image surface와 Action Bar 위치를 밀지 않는다
- **AND** 접기를 실행하면 3줄 제한 상태로 돌아간다

#### Scenario: 기존 Post action 실행

- **WHEN** 사용자가 Viewer의 기존 Reply·Repost·Reaction·Bookmark 또는 More action을 실행한다
- **THEN** 기존 Post Action Bar와 같은 Post target·상태·count·실패 계약을 사용한다
- **AND** 현재 Media를 별도 action 대상으로 사용하거나 Media 파일 저장·공유·다운로드를 제공하지 않는다

#### Scenario: Repost와 Quote Post surface

- **WHEN** Viewer가 일반 Post가 아닌 Repost 또는 Quote Post surface에서 열린다
- **THEN** 기존 Post Action Bar의 해당 surface target routing과 action availability를 그대로 사용한다
- **AND** Quote를 새 Action Bar action으로 추가하지 않는다

### Requirement: Viewer 상태·오류와 재시도

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/design/post-media-viewer.md`, `docs/design/accessibility.md`, PROD-650 — 현재 Media가 loading이거나 표시 URL load에 실패해도 Viewer는 modal chrome, 현재 index와 Post detail panel을 SHALL 유지해야 한다. 실패한 Media에는 raw storage URL·내부 오류·authorization 세부 정보를 노출하지 않는 접근 가능한 재시도 control을 MUST 제공하고, 재시도는 현재 index나 다른 Media 상태를 변경하지 MUST NOT 한다.

#### Scenario: 현재 Media loading

- **WHEN** 현재 Media image가 loading 중이다
- **THEN** Viewer는 같은 image surface에 loading 상태를 전달한다
- **AND** close, 현재 위치와 Post detail panel을 유지한다

#### Scenario: 현재 Media load 실패

- **WHEN** 현재 Media의 표시 URL load가 실패한다
- **THEN** 같은 image surface에 안전한 오류 상태와 해당 Media 재시도 control을 표시한다
- **AND** raw storage URL, 내부 오류와 authorization 세부 정보를 표시하지 않는다

#### Scenario: 실패한 Media 재시도

- **WHEN** 사용자가 현재 실패한 Media의 재시도를 실행한다
- **THEN** 같은 index에서 해당 Media의 현재 승인된 표시 URL load를 다시 시작한다
- **AND** 다른 Media의 loading·ready·error 상태를 초기화하지 않는다

### Requirement: Modal dismiss와 focus 복귀

**Authority / Provenance:** `docs/design/post-media-viewer.md`, `docs/design/accessibility.md`, PROD-650 — Viewer는 modal role과 명시적인 close control을 SHALL 제공하고 open 시 초기 focus를 close control로 MUST 이동해야 한다. Web `Escape`·close control·backdrop press와 Native back으로 dismiss할 수 있어야 하며, Web image·detail panel·modal 내부 control의 press는 backdrop dismiss로 전파되지 MUST NOT 한다. 닫을 때 원래 선택한 tile이 존재하면 그 tile로 focus를 MUST 복귀해야 한다. 원래 tile이 사라졌다면 남아 있는 Post surface의 안전한 focus target으로 MUST 복귀해야 한다.

#### Scenario: Web keyboard modal lifecycle

- **WHEN** Web 사용자가 tile에서 Viewer를 열고 `Escape` 또는 close control로 닫는다
- **THEN** 열린 동안 focus는 modal 경계 안에 유지되고 초기 focus는 close control에 있다
- **AND** 닫힌 뒤 원래 tile이 존재하면 그 tile로 focus가 돌아간다

#### Scenario: Native dismiss

- **WHEN** iOS·Android 사용자가 close control 또는 Native back을 실행한다
- **THEN** Viewer가 닫히고 사용자는 원래 Post surface의 대응 위치로 돌아간다

#### Scenario: Web backdrop dismiss와 내부 press 격리

- **WHEN** Web 사용자가 Viewer backdrop을 직접 press한다
- **THEN** Viewer가 닫히고 원래 gallery tile 또는 안전한 Post focus target으로 돌아간다
- **AND** image·detail panel 또는 modal 내부 control을 press하면 backdrop dismiss를 함께 실행하지 않는다

#### Scenario: 원래 tile이 사라진 뒤 닫기

- **WHEN** Viewer를 연 tile이 더 이상 존재하지 않는 상태에서 Viewer가 닫힌다
- **THEN** focus는 제거된 node가 아니라 남아 있는 Post surface의 안전한 focus target으로 이동한다
