# Post Media Viewer

일반 Post의 공개된 이미지 tile을 선택하면 기존 Post visibility·authorization 경계를 통과한 현재 Post query projection의 이미지를 document 순서대로 살펴보는 modal viewer를 연다. Viewer는 이미지만 고립시키지 않고 Post 맥락과 기존 interaction을 함께 제공한다. Compact Web과 Native는 작성자, 원문 text와 기존 Post Action Bar를 보여주고, Wide Web은 기존 Post 상세의 원문·reply thread를 사용할 수 있는 surface를 보여준다. Figma Target에서 Viewer의 현재 Post Reply Composer는 Compact Web에서 Viewer를 닫은 뒤 공용 modal로 열고 Full Web에서만 thread rail 안에 펼친다. 현재 runtime의 inline Reply는 이 Target의 완료 증거가 아니다.

## 디자인 권위와 적용 범위

- Mobile 시각 기준은 [`Mobile 390 · PostMediaViewer · Open · Target`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-8103)이다.
- Compact Web 대표 consumer는 [`Compact Web 1024 · PostMediaViewer · Open · Target`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6316-25262)이며,
  기존 DSN-63 Wide source의 image surface와 Post thread rail을 그대로 상속한다. Full Web은 같은 Wide source가
  확장 규칙을 소유하므로 별도 중복 screen FRAME을 만들지 않는다.
- Figma의 어두운 fullscreen image surface, 상단 close affordance와 Web split structure를 시각 기준으로
  사용한다. compact 원문 접기·펼치기, Action Bar와 wide Post 상세 thread의 현재 동작은 PROD-650과 runtime
  검증이 소유한다. 이 Target의 PostMediaViewer Production 반영은 PROD-849의 범위를 먼저 동기화한 뒤 별도
  Product PR에서 수행하며, DSN-50과 이 문서 변경은 component·Storybook·runtime을 수정하지 않는다.
- Figma 하단의 Media 파일 저장 action은 이 viewer에 포함하지 않는다. 현재 기존 Post Action Bar만 제공한다.
- Viewer는 일반 목록과 Post 상세의 interactive gallery에 적용한다. `interactive=false`인 Reply Composer 부모 preview는 viewer를 열지 않는다.

## 소유권과 데이터 경계

목록과 상세의 안정적인 surface 경계에 `PostMediaViewerHost`를 둔다. Gallery는 공개된 정상 tile을 선택했을 때 `{surfacePostId, mediaOwnerPostId, selectedIndex, originControl}`만 Host에 전달하고 modal lifecycle이나 Post 데이터를 소유하지 않는다. Host는 기존 GraphQL `node(surfacePostId)` 경로와 현재 Relay actor environment로 surface Post를 조회하고, `mediaOwnerPostId`가 그 surface 또는 direct `repostSource`인지 확인한다. 일반·Quote는 두 ID가 같고, pure Repost는 바깥 contentless Repost가 surface, direct Source가 Media·본문·Profile과 Repost·Reaction·Bookmark·More의 owner다. Reply는 surface Post identity를 유지하므로 pure Repost에서는 disabled다. Content availability로 owner를 재추론하지 않으므로 Quote Content가 일시 unavailable이어도 Source로 전환하지 않는다. 이 경로가 이미 사용하는 Post visibility·authorization을 그대로 적용하며 별도 Media 조회나 standalone authorization을 추가하지 않는다.

Host는 Viewer session, Post query, 기존 `PostActionSurface`·Reply binding과 Wide `PostDetailThread` 조합을 소유한다. Modal shell·close·focus fallback은 Post query의 Suspense·error boundary 밖에 유지하고, query가 제공하는 Content·Media·Profile과 detail presentation만 경계 안에서 교체한다. 목록·Quote·Repost·상세의 표시 branch가 바뀌어도 Host 위치와 열린 Viewer instance는 유지한다. Wide thread 안의 다른 Post Media는 기존 surface대로 별도 Viewer를 열 수 있으며 nested Viewer stack의 dismiss·focus 순서를 유지한다.

Query cache hit·loading·error·retry, null Post·Content·Media와 현재 index unavailable 상태에서도 modal chrome과 명시적인 close control을 유지한다. 현재 표시 가능한 query projection만 사용하고 이전 Media byte·URL을 snapshot으로 보존하거나 다른 Post의 Media를 합치지 않는다. 같은 Content revision이 일시 unavailable이었다 복구되면 탐색 index·원문 펼침·Media loading/error/retry 상태를 유지한다. 다른 non-null Content revision으로 바뀌면 원문·Media 상태를 초기화하고 처음 선택한 document index를 다시 사용하며, 그 index가 새 revision에 없으면 다른 Media로 이동하지 않고 unavailable을 표시한다. Relay actor/environment generation이 바뀌면 Viewer를 닫고 이전 query를 폐기한다. 명시적 dismiss, Viewer 안의 삭제 action, actor/environment 전환과 Host를 소유한 surface unmount가 Viewer session을 종료한다.

## 반응형 layout

| 환경          | Viewer layout                                                               |
| ------------- | --------------------------------------------------------------------------- |
| Web `<768px`  | image surface 위, compact Post detail panel 아래의 세로 layout              |
| Web `>=768px` | 선택 image surface 왼쪽, 기존 Post 상세 thread surface 오른쪽의 분할 layout |
| iOS·Android   | viewport 폭과 관계없이 compact 세로 layout                                  |

이미지는 배정된 image surface 안에서 원본 비율을 유지한 `contain` 방식으로 표시하고 viewport 밖으로 밀어내지 않는다. Wide Web modal은 viewport 사방의 `24px` backdrop inset을 제외한 가용 폭을 사용한다. 오른쪽 Post 상세 thread rail은 `clamp(320px, 25vw, 350px)`로 제한하고 나머지 폭을 왼쪽 image surface에 배정한다. 320px 최소폭은 기존 Post 상세의 avatar·간격·padding을 제외하고도 228px Action Bar가 가로 overflow 없이 유지되는 폭이다. 따라서 `768px` 경계에서는 thread interaction에 필요한 최소 폭을 보존하고, 큰 viewport에서는 image가 전체 modal의 대부분을 차지한다.

Compact Web과 Native의 detail panel에는 작성자, 원문 text와 기존 Post Action Bar를 이 순서로 둔다. Panel은 내용 높이를 따르되 최대 높이는 `clamp(192px, viewport height의 32%, 240px)`로 계산한다. `192px`은 낮은 viewport에서 작성자·원문 control·Action Bar를 보존하기 위한 최대 높이 계산의 안전 하한이지 panel의 최소 높이가 아니므로, 짧은 원문의 panel은 내용보다 크게 늘어나지 않는다. 짧은 원문에서 작성자·원문과 Action Bar 사이에 남는 높이를 채우지 않으며, Action Bar는 원문 바로 아래의 고정 영역을 유지한다. 원문은 처음에 3줄로 제한한다. 넘치는 경우에만 `더 보기` control을 제공하고 펼친 뒤에는 `접기`로 바꾼다. 펼친 원문은 detail panel의 text 영역 안에서만 줄어들고 scroll하며 image surface와 고정 Action Bar를 밀어내거나 가리지 않는다. Control은 펼침 상태를 접근성 state로 전달한다.

Wide Web의 오른쪽은 별도의 축약 panel이 아니라 기존 Post 상세와 같은 표현·interaction을 제공하는 thread surface다. 폭은 일반 Post 상세 route의 `600px` column을 복제하지 않고 위의 Viewer 전용 bounded rail 규칙을 따른다. 기존 `PostDetailThread`와 같이 reply ancestors, 선택한 현재 Post, reply descendants를 연결 순서대로 표시한다. 현재 Post는 작성자·원문 전체·기존 Post Action Bar를 제공하고 Reply Composer는 처음부터 열지 않는다. Compact Web `768–1279px`에서는 Reply action이 현재 Viewer를 먼저 닫고 다음 frame에 배경 Post surface의 공용 `600×720` Reply modal을 연다. 현재 Viewer 위에 Reply modal을 중첩하거나 rail 안에 Composer를 펼치지 않는다. Full Web `>=1280px`에서만 기존 Post 상세처럼 Reply action을 실행했을 때 현재 Post 아래에 Composer를 펼친다. 원본 Post의 Media는 왼쪽 image surface가 대표하므로 오른쪽 원본 Post에서 중복 표시하지 않되, ancestors·descendants와 Quote·Repost 등 thread 안의 Media 표현과 viewer interaction은 기존 Post surface 계약을 유지한다. 오른쪽 surface 전체가 왼쪽 image surface와 독립적으로 scroll하고, 끝에 가까워지면 기존 reply pagination을 이어서 수행한다. Route와 Viewer의 `PostDetailThread`는 각 scroll surface의 near-end, same-surface burst 재진입 guard와 loading·error·retry UI state를 독립적으로 소유한다. 두 surface 사이에는 request token을 공유하지 않으며, 같은 reply connection의 동일 cursor·count 요청이 같은 Relay environment에서 겹치면 Relay가 동일 operation을 in-flight dedupe하고 normalized connection에 병합한다. Viewer가 열렸다는 이유만으로 배경 document pagination을 중지하지 않으며, 미리 불러온 reply는 Viewer를 닫은 뒤 그대로 사용할 수 있다. Action Bar, Composer, reply interaction과 그 child overlay는 기존 Post 상세 계약을 그대로 유지한다.

Wide Web의 오른쪽 thread rail은 fullscreen modal 안의 별도 elevation surface가 아니므로 mode별 `color/background/canvas`를 사용한다. 왼쪽 image surface는 [`colors.md`](./colors.md)의 PostMediaViewer fixed black/white와 fullscreen media overlay 예외를 유지하며 별도 semantic token을 만들지 않는다.

## 선택과 탐색

- 선택한 gallery tile의 document index에서 viewer를 시작한다.
- 2장 이상이면 시각적 `현재 위치/전체`를 표시하고, 1장이면 시각 counter를 생략한다. Screen Reader에는 장수와 관계없이 현재 위치와 전체 개수를 알린다.
- 현재 이미지의 nullable Alt Text를 accessible name으로 사용하고, 없으면 document 순서 기반의 `N번째 첨부 이미지`를 사용한다. 현재 위치 안내는 이미지 이름과 별도로 전달해 내용을 위치 정보로 대체하거나 중복 낭독하지 않는다.
- 이전·다음 control은 document 순서를 따르며 첫 장의 이전과 마지막 장의 다음은 비활성화한다. 끝에서 반대편으로 순환하지 않는다.
- Web은 이전·다음 control과 `ArrowLeft`·`ArrowRight` keyboard 입력을 제공한다.
- iOS·Android는 이전·다음 control과 수평 swipe를 제공한다. Gesture가 성립하지 않으면 현재 이미지에 머문다.
- 현재 이미지가 바뀌어도 작성자·원문과 Action Bar의 surface routing은 바뀌지 않는다. Pure Repost에서는 Reply만 바깥 contentless Repost identity를 유지하고 나머지 표시·social action은 direct Source를 대상으로 한다.
- Viewer open과 Media 탐색은 route나 browser history를 변경하지 않는다.

## Post Action Bar

Viewer는 [기존 Post Action Bar](./post-action-bar.md)가 현재 제공하는 Reply, Repost, Reaction, Bookmark, More와 각 count·상태·target 계약을 그대로 재사용한다. 일반·Repost·Quote Post surface에서 기존 target routing을 유지하되 Quote를 새 Action Bar action으로 추가하지 않는다. Pure Repost의 Reply는 바깥 contentless Repost 기준으로 disabled이고, Repost·Reaction·Bookmark·More는 direct Source를 대상으로 한다. Compact Web에서 현재 Post의 Reply는 Viewer를 닫은 뒤 배경 surface의 공용 modal을 열고 Full Web만 rail의 inline Composer를 사용한다. 두 환경 모두 같은 Reply availability를 사용하므로 pure Repost에는 Source Composer를 열지 않는다. Viewer 전용 action row를 만들거나 Media를 action 대상으로 바꾸지 않는다. 기존 Post 링크 복사는 유지하지만 Media 파일 URL 복사·공유·다운로드·기기 저장은 제공하지 않는다.

## Sensitive, loading과 오류

- Sensitive Media가 가려진 동안에는 viewer 진입을 제공하지 않는다. Gallery에서 공개한 뒤에만 정상 tile이 viewer trigger가 된다.
- Viewer는 원래 Post surface에서 Content Warning을 공개한 뒤에만 열 수 있다. 열린 Viewer의 현재 Post는 원문을 공개 상태로 유지하고 Content Warning 안내와 다시 가리기 control을 표시하지 않는다. 이 Viewer 전용 표현은 다른 Post surface의 reveal 저장 상태를 변경하지 않는다.
- Viewer가 열린 뒤 background Gallery의 Sensitive 표시 상태가 바뀌어도 Viewer session을 자동 종료하지 않는다. 현재 Host query projection에서 선택 Media가 사라지거나 표시할 수 없게 되면 이전 이미지 byte·URL을 유지하지 않고 modal 안에 안전한 unavailable 상태를 표시한다.
- Host Post query가 cache hit·loading·error·retry이거나 null Post·Content·Media를 반환해도 modal shell과 close control은 유지한다. Error fallback은 안전한 한국어 상태와 retry만 제공하고 raw 오류·authorization 세부 정보를 노출하지 않는다.
- 현재 이미지가 loading 또는 실패해도 modal chrome, 현재 index와 현재 breakpoint의 Post detail surface는 유지한다.
- 실패한 Media는 같은 위치에서 다시 시도할 수 있고, retry는 현재 index를 바꾸거나 다른 Media의 상태를 초기화하지 않는다.
- Wide Web의 reply query가 loading 또는 실패해도 왼쪽의 선택 이미지와 modal chrome을 제거하지 않는다. 오른쪽 thread surface에서 기존 loading·error·retry 표현을 사용한다.
- 사용자에게 raw storage URL, 내부 오류 또는 authorization 세부 정보를 노출하지 않는다.

## Modal과 접근성

Viewer open 시 modal임을 전달하고 배경 Post surface를 focus와 interaction 대상에서 제외하며 초기 focus를 명시적인 close control로 이동한다. `Escape`, close control, Native back으로 닫을 수 있다. Web backdrop press도 Viewer를 닫되 image·detail panel과 modal 내부 control의 press는 backdrop dismiss로 전파하지 않는다. Backdrop press를 유일한 dismiss 수단으로 사용하지 않는다. 닫을 때 route·browser history를 변경하지 않고, 원래 선택한 gallery tile이 여전히 존재하면 그 tile로 focus를 돌려보낸다. 대상이 사라졌다면 Host가 속한 목록 또는 상세 screen의 안전한 focus target으로 복귀한다. Query loading·error·unavailable로 Content presentation이 교체되어도 close target과 screen fallback은 unmount하지 않는다.

Close, 이전·다음, 더 보기·접기와 retry는 keyboard·touch·Screen Reader에서 같은 기능을 제공하고 role, accessible name, disabled·expanded 상태를 전달한다. 현재 위치 변경은 이미지의 accessible name과 별도로 인지 가능하게 알린다.

## Product 후속 검증 경계

아래 자동화·Storybook·runtime 항목은 Figma Target을 Production에 이관하는 Product 이슈의 완료 기준이다.
DSN-50의 Figma·문서 완료를 현재 runtime 검증이나 component 반영 증거로 사용하지 않는다.

- Component test는 Host session의 `surfacePostId`·`mediaOwnerPostId`·선택 index·origin focus, 기존 `node(surfacePostId)` visibility 경계와 owner 검증, query cache hit·loading·error·retry와 null Post·Content·Media에서도 modal shell·close 유지, 같은 Content 복구 상태 보존, 다른 revision reset·원래 document index unavailable, URL 변경 시 이전 byte 비보존, actor/environment 전환 close·query 폐기, 명시적 dismiss·Viewer 삭제 action·surface unmount 종료와 origin·screen fallback focus 복귀를 확인한다. Pure Repost Viewer의 Reply가 바깥 contentless Repost 기준으로 disabled이고 Repost·Reaction·Bookmark·More와 Media는 Source를 대상으로 하는지 검증한다. 목록·Quote·Repost·상세 projection 전환과 nested Viewer stack, Viewer 현재 Post의 Content Warning 공개 표현, 비순환 이전·다음, Alt Text·fallback과 counter, compact 원문 접기·펼치기·내용 높이 panel과 fixed Action Bar, Compact wide rail Reply의 Viewer close→공용 modal 순서, Full wide bounded rail·원문 전체·inline Composer, route와 Viewer의 독립 pagination UI state·loading·error·retry와 Viewer completion 뒤 near-end 재평가를 함께 확인한다.
- Storybook은 1장과 다중 이미지, 긴 원문, 첫·중간·마지막 위치, image loading·error와 Host query loading·error·retry·unavailable, compact Web·Native와 wide Web thread layout을 확인한다.
- Web runtime은 backdrop·modal 내부 pointer 격리, keyboard arrow, Escape, 배경 surface 비활성화, focus trap·복귀, route·history 유지와 `<768px`·`>=768px` layout을 관찰한다. Compact에서는 짧은 원문의 content-height panel과 `clamp(192px, 32vh, 240px)` 최대 높이·낮은 viewport에서의 고정 chrome 보존·text-only scroll·Action Bar 인접 배치, `768–1279px` rail Reply의 Viewer close 뒤 공용 modal open과 focus 이동·복귀를 확인한다. Full에서는 `24px` inset·`clamp(320px, 25vw, 350px)` rail과 남은 image 폭, Action Bar의 가로 overflow 방지, 오른쪽 독립 scroll, inline Composer 작성, reply pagination, Action Bar·reply interaction과 child overlay layering을 함께 확인한다.
- iOS runtime은 touch, swipe, close·back과 VoiceOver를, Android runtime은 touch, swipe, close·back과 TalkBack을 각각 확인한다.
- 자동화·Storybook·Web 관찰은 iOS·Android runtime 접근성 증거를 대체하지 않으며 결과를 PR에 구분해 기록한다.

## 제외 범위

Zoom·pan, Media 편집·crop·caption·metadata, gallery layout 변경, viewer route·deep link, Media 전용 action bar와 파일 공유·다운로드·기기 저장은 제외한다. 기기 저장은 플랫폼별 permission, 파일 전달 방식과 실패·재시도 UX가 별도 제품·기술 계약을 필요로 하므로 후속 범위에서 다룬다.
