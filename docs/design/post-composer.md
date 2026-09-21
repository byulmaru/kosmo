# Post Composer

Post Composer는 일반 Post, Reply와 Quote가 공유하는 Local Post 작성 UI다. 세 mode는 같은
입력·검증·제출·Media·오류·draft lifecycle을 사용하며, surface는 mode에 맞는 관계 맥락 표시와
open/close lifecycle만 추가한다. Reply 또는 Quote 전용 Composer를 별도 계약이나 구현으로 만들지 않는다.

## 기준 source와 범위

- Web modal의 시각적 출발점은 Figma `KOSMO` 파일의
  [`ComposeModal (ComposeWidget 600w)` node 993:4057](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=993-4057)다.
- 좁은 화면은 별도 Mobile ReplyComposer를 조립하지 않고
  [`__MobileFullscreenComposerShell` node 5284:38074](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5284-38074)을
  재사용한다. Figma Target은 [`Focused · Keyboard 6665:56053`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6665-56053),
  [`Context · Initial anchor 6665:56250`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6665-56250)와
  [`Parent revealed on upward scroll 7392:27994`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7392-27994)이다.
  Dark inheritance는 같은 reveal 조립을 재사용한 [`5884:14891`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=5884-14891)로 확인한다.
- 일반 Post Composer가 지원하는 Plain Text 본문, Content Warning, Visibility, 글자 수, Media
  선택·업로드·미리보기·제거·재시도, Alt Text, Sensitive Media, validation, pending과 오류 상태를 그대로
  재사용한다.
- Parent가 일반 Post, Reply 또는 Quote이면 화면에 표시되는 direct Parent의 자체 Content와 Source preview를
  보여준다. Action Bar와 Post menu는 Parent 맥락 안에 중복 표시하지 않는다.

## surface별 진입

다음은 Figma Target의 surface 계약이며 현재 runtime 완료 상태를 뜻하지 않는다.

- Web `≥ compact` 목록 surface에서는 Reply action이 중앙 modal dialog를 연다.
- Compact Web Post 상세와 PostMediaViewer thread rail은 Composer를 인라인으로 펼치지 않고 같은 Reply modal을
  연다. Viewer rail의 현재 Post Reply는 Viewer를 먼저 닫은 뒤 다음 frame에 배경 Post surface의 modal을 열며
  현재 Viewer 위에 modal을 중첩하지 않는다. 기본 route frame과 Viewer frame은 closed thread만 표시하고
  Composer-open을 별도 frame으로 중복 만들지 않는다.
- Web `≥ compact`의 Post 상세도 목록과 같은 Reply modal을 연다. 일반 Post Composer의 Full Web right rail은
  유지하며, Reply/Quote surface만 modal로 분리한다.
- Current runtime과 OpenSpec은 Web `< compact`와 Android/iOS의 목록 surface에서 같은 관계 맥락을 전체 화면
  작성기로 연다. Reply Parent는 editor 앞에, Quote Source는 본문 아래에 표시한다.
- Figma Target의 Focused/Keyboard는 입력과 keyboard를 우선하고 `@kosmo님에게 답글` 같은 최소 맥락만 표시한다.
- Figma Target의 비키보드 Initial anchor에서도 direct Parent는 작성 영역 아래로 내려오지 않으며 기본
  viewport에 표시하지 않는다.
  사용자가 위로 스크롤했을 때만 공개 범위 행 위에 기존 `PostListItem` 기반의 비대화형 Parent가 나타난다.
  Parent Action Bar와 Post menu는 숨기고, Avatar 아래 thread line을 공개 범위 행의 위 border까지 연결해 답글
  대상임을 표시한다. Figma reveal consumer의 Parent와 line은 각각 [`7392:28076`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7392-28076),
  [`7392:28091`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=7392-28091)이다.
  Parent의 목록용 하단 divider는 끄고, 공개 범위 행의 위 border만 Parent와 Composer의 경계로 유지한다.
  실제 upward-scroll origin·threshold, keyboard 전환, safe area와 focus 이동은 Product runtime 계약이며 Figma
  정적 consumer만으로 완료를 주장하지 않는다.
- 어느 surface에서도 Reply 전용 mutation, 별도 입력 상태 또는 Post kind를 만들지 않는다.

## Web 관계형 Composer modal

### geometry와 scroll

- modal 너비는 `600px`이고 높이는 Parent, editor, Content Warning, media 내용에 맞춰
  자동으로 늘고 줄어든다.
- 최대 높이는 `min(720px, 85dvh)`로 제한한다.
- header·공개 범위 행·footer는 modal 안에 고정하고, 제한 높이를 넘는 Parent와 editor만 하나의 중앙 scroll
  영역에서 함께 스크롤한다. Parent만 별도 스크롤하는 nested scroll은 만들지 않는다.
- card surface, semantic `border`, `radius/lg` 16px과 기존 modal backdrop을 사용한다. 배경 document는 modal이
  열린 동안 스크롤되지 않는다.

### header

- 일반·Reply·Quote 구분 없이 중앙에 `글쓰기` 제목을 표시한다.
- 우측에는 텍스트가 아닌 `X` 아이콘 닫기 버튼을 둔다. accessible name은 `닫기`다.
- 닫기 버튼의 visual box와 interactive target은 과거의 고정 44x44 가정을 복사하지 않는다. Web·Native별
  최신 승인 접근성 지침을 확인한 뒤 해당 surface의 target을 정한다.

### Parent와 thread 맥락

- Reply Parent 영역은 작성자 Avatar, 표시 이름, handle, 작성 시각과 전체 본문을
  editor 앞에 보여준다.
- Quote Source preview는 본문 아래, Media 앞에 표시한다. 일반 본문과 같은 background를
  사용하고 semantic border만으로 경계를 구분한다. 구분용 별도 tonal surface는 사용하지 않는다.
- Reply Parent는 화면에 표시되는 direct Parent만 표시하고, 조상 thread 전체를 modal 안에서 다시 펼치지
  않는다.
- Parent 본문은 줄 수로 생략하지 않는다. 제한 높이를 넘을 때 중앙 영역의 단일 scroll로 접근한다.
- Parent에 Content Warning이 있으면 warning과 공용 reveal control을 표시한다. Parent 본문과 Media는 해당
  Post identity의 공용 reveal 상태를 따르며, 이 control은 작성 상태나 route를 변경하지 않는다.
- Parent Avatar 아래의 thread connector를 Reply 작성 Profile의 Avatar까지 이어 기존 Reply 표시 구조와 같은
  대화 관계를 표현한다.
- Parent 영역은 작성 맥락 확인을 위한 비대화형 presentation이다. 작성자·Source·본문을 활성화해 modal 작성
  상태를 잃는 route 이동을 만들지 않는다.
- 일반 첨부 이미지는 Parent 맥락에 표시하되, Sensitive Media는 Content Warning reveal과 독립된 가림
  placeholder를 유지한다. Sensitive 공개와 이미지 오류 재시도처럼 상태를 바꾸는 Media control은 Parent
  영역에 노출하지 않는다.

### editor와 고정 footer

- 중앙 작성 영역의 첫 행에는 원본 작성 Profile 정보만 표시한다. Profile 정보는
  정적 표시이며 switcher나 action이 아니다. Web TextArea의
  브라우저 기본 사각 outline과 중첩 editor border는 표시하지 않는다. modal/card surface의 semantic border는
  유지하고 입력 위치는 caret·selection으로 표시한다. placeholder는 일반 Post, Reply, Quote 모두 `무슨 일이 일어나고 있나요?`를
  사용한다.
- editor는 기존 Composer의 nullable Plain Text Content Warning 입력을 함께 제공한다. surface가 새 Parent
  문맥으로 초기화될 때 direct Parent의 `contentWarning`이 있으면 그 값을 Reply Content Warning의 초기값으로
  한 번 복사하고, 없으면 빈 초기값을 사용한다. 복사 뒤에는 Parent와 연결된 값으로 취급하지 않으며 사용자는
  자유롭게 수정하거나 완전히 제거할 수 있다.
- 제목·control label·button에는 공용 UI typography를, Parent·입력 본문에는 공용 body typography를 사용한다.
  modal 전용 raw font size나 font family를 만들지 않는다.
- 기존 Composer의 본문 아래 content 위치를 Quote Source preview와 Media가 공유한다. 순서는
  `본문 → Quote Source → Media`다. 선택한 이미지의 미리보기, 업로드 상태,
  제거·재시도, nullable Alt Text와 Sensitive Media control이 늘어나면 Parent와 editor가 공유하는 중앙 영역에서
  함께 스크롤하고 고정 footer를 밀어내지 않는다.
- Visibility control은 중앙 scroll 영역과 footer 사이의 고정된 전체 폭 행에 둔다. 모바일과 같이
  `공개 범위` label은 좌측, 현재 값과 펼침 아이콘은 우측에 표시하며 행의 위·아래 경계로 구분한다.
- footer는 modal 바닥에 고정한다. 좌측에는 기존 작성 도구를, 우측에는 남은 글자 수와 공용 `게시` primary
  button을 이 순서로 둔다.
- 남은 글자 수는 trim·normalize한 Content Warning과 본문 Plain Text의 합계를 500에서 차감해 항상 표시하며
  초과 시 semantic danger 상태로 표시한다.
- trim한 본문과 업로드를 완료한 Media가 모두 없거나, Content Warning과 본문 Plain Text의 합계가 500자를
  초과하거나, Media가 업로드 중·실패 상태이거나, Reply 제출 중이면 `게시`를 disabled로 표시한다.
  Content Warning만으로는 contentful Reply가 되지 않지만, 본문이 없어도 Ready Media가 하나 이상 있으면
  Media-only Reply를 제출할 수 있다.
- Media 업로드 실패는 공용 Danger Toast로 상세 원인을 한 번 알리고, 현재 preview와 Parent 맥락을 유지한 채
  같은 위치에 `업로드 실패` 상태와 재시도·제거 action을 남긴다. 상세 문구를 inline으로 중복하지 않는다.
- 제출 중에는 button에 spinner와 `게시 중` 상태를 표시하고 본문·Content Warning·Visibility의 중복 변경과
  닫기를 막는다.
- 게시 mutation의 network·GraphQL·미생성 실패는 공용 Danger Toast로 표시하고 작성 내용과 재시도 가능한
  `게시` action을 유지한다. Media 업로드는 상세 원인을 공용 Danger Toast로 알리되 실패한 항목의 상태와
  복구 action을 해당 위치에 유지한다.

## 공통 Visibility

- Reply Visibility는 Parent Visibility와 독립적이다.
- 기본값은 선택한 Local Profile의 기본 Post Visibility다. 저장값이 없거나 설정 조회가 실패·unavailable이면
  다른 Profile의 값을 재사용하지 않고 `UNLISTED`를 사용한다.
- 현재 Reply 작성 범위에서는 `PUBLIC`, `UNLISTED`, `FOLLOWERS`를 제공한다.
- `DIRECT`/지정 멤버만 공개는 노출하지 않는다. Mentioned Profile recipient 결정과 작성 계약은 이 범위에
  포함하지 않는다.

## Content Warning과 reveal 상태

- 일반 Post와 Reply의 Content Warning은 별도 모델이 아니라 `PostContentDocument.summary`에 nullable Plain
  Text로 저장하며, Composer는 이를 `CreatePostInput.contentWarning`으로 제출한다.
- Content Warning이 있는 Post는 warning을 표시하고, reveal 전에는 본문과 Media를 가린다. Content Warning이
  없는 Post에는 reveal 상태를 적용하지 않는다.
- reveal 상태의 key는 component instance, route, surface, selected Profile 또는 Post Content revision이 아니라
  canonical `Post.id`다. Home, Profile, Thread와 Post Composer Reply mode의 Parent preview를 포함해 같은 Post를 표시하는
  모든 surface는 하나의 공용 상태를 관찰한다.
- 이 공용 상태의 수명은 하나의 selected Profile·session lifecycle 안으로 한정한다. 같은 lifecycle에서는
  canonical `Post.id`만으로 surface와 remount 사이의 상태를 공유하지만, selected Profile 또는 session이 바뀌면
  Provider가 새 store를 만들고 모든 reveal 상태를 안전하게 초기화한다. 이 lifecycle reset은 다른 Post·Profile·session으로
  상태가 전파되지 않게 하는 예외이며, 같은 Post의 surface 이동·remount reset과 구분한다.
- 한 surface에서 같은 Post를 reveal하거나 다시 가리면 이미 mounted된 다른 surface와 이후 표시되는 surface도
  같은 상태를 사용한다. component unmount·remount나 surface 간 이동만으로 같은 Post의 상태를 초기화하지
  않는다.
- reveal 상태는 표시 전용 client 상태이며 Post Content, 별도 서버 모델 또는 DB 컬럼에 저장하지 않는다.
  Sensitive Media 가림 상태는 별도 정책이므로 Content Warning을 reveal해도 자동으로 공개하지 않는다.

## lifecycle

- modal을 열면 Reply action은 expanded 상태를 노출하고 본문 editor로 focus를 이동한다.
- Web modal의 `X`·backdrop·`Escape`, modal close와 원래 Reply action focus restore는 modal에만 적용한다.
  fullscreen은 보이는 header close와 Native platform back을 사용하고 backdrop dismiss를
  제공하지 않는다. 폐기 확인은 두 surface가 공유한다.
- 현재 Web 브라우저 뒤로가기·앞으로가기는 이 폐기 확인의 보호 범위에 포함하지 않는다. 페이지 전환으로
  Reply/Quote Composer가 닫히면 작성 중인 초안이 유실될 수 있으며, Browser Back 보호는 후속 범위로 남긴다.
  이를 위해 Composer를 열 때 브라우저 히스토리 항목을 추가하지 않는다. 저장되지 않은 작성 내용이 있을 때
  새로고침·탭 닫기에 사용하는 기존 브라우저 이탈 경고는 유지한다.
- Reply/Quote surface는 Web `≥ compact`에서 backdrop modal이므로 위 dismiss 계약을 상속한다. 일반 Post
  Composer에만 남는 Full Web right rail은 이 Reply lifecycle의 대상이 아니다.
- modal Reply surface를 여는 순간 direct Parent 맥락 자체를 dirty로 취급하므로, 본문·Content Warning·Visibility와
  Media가 초기값이어도 `X`, backdrop 또는 `Escape`로 닫을 때 확인을 표시한다. fullscreen도 같은 dirty
  판정을 사용하되 header close 또는 Native platform back에서 확인한다.
- Reply 보호 정책은 Parent와 close lifecycle을 아는 surface가 직접 소유한다. modal·fullscreen surface는 입력별 dirty를
  다시 계산하지 않고 열린 동안 항상 폐기 확인 대상으로 취급하며, 공용 Post Composer에서는 제출 중 여부만
  전달받아 close 차단에 사용한다. 따라서 Parent에서 복사된 Content Warning을 그대로 두거나 수정·제거해도
  `답글 작성을 취소할까요?` 확인에서 사용자가 `계속 작성` 또는 `작성 취소`를 선택하게 한다.
- Media 업로드 중에도 확인 뒤 작성 전체를 폐기할 수 있으며, 늦은 업로드 완료는 닫힌 surface를 다시 열거나 상태를 변경하지
  않는다.
- Profile 기본 Visibility는 선택한 Profile의 값을 사용하고, 값이 없거나 지원하지 않는 경우 `UNLISTED`로
  fallback한다. Composer를 연 뒤 Profile 기본값이 저장되거나 다른 화면에서 바뀌어도 현재 draft의 개별
  Visibility는 자동으로 덮어쓰지 않으며, 다음 새 Composer부터 갱신된 기본값을 사용한다.
- 열린 modal surface에서 현재 Reply action을 다시 활성화하거나 다른 Parent의 Reply action을 선택하는 동작도
  같은 close 요청으로 처리한다. dirty 상태에서는 확인 뒤 닫거나 Parent를 전환하고, Reply 제출 pending
  상태에서는 현재 작성과 active Parent를 유지한다.
- 제출 실패 시 열린 modal·fullscreen surface, direct Parent 맥락, 본문, Content Warning, Visibility와 Media 작성 상태를 유지한다.
- selected Profile, direct Parent 또는 Relay Environment가 바뀌면 새 문맥의 첫 Composer commit부터 본문,
  Content Warning, Visibility, Media, error와 pending을 초기 상태로 시작한다. Content
  Warning은 새 direct Parent 값에서 다시 한 번 초기화하며, 이전 Parent에서 수정한 값을 이어받지 않는다. 이전
  문맥의 늦은 upload·mutation completion은 새 문맥의 상태나 성공 callback을 변경하지 않는다.
- 새 Post Rail·Overlay Composer에 한해 Composer-local 작성 Profile을 전환할 수 있다. 이 전환은 전역
  Session/Profile과 Relay actor를 바꾸지 않으며, 본문·Content Warning·Media·ALT·Sensitive Media·현재 Visibility를
  보존한 채 다음 mutation과 새 Media upload issue에 선택한 Profile ID를 전달한다. Reply·Quote Composer에는
  이 local 전환을 제공하지 않는다.
- local Profile 선택이 성공하면 본문 editor로 focus를 옮겨 Native에서는 키보드를 이어서 입력할 수 있게 한다. Profile
  picker의 Escape·취소는 작성 Profile을 바꾸지 않고 trigger로 focus를 복원한다.
- 업로드·게시 중에는 작성 Profile 전환을 잠그고 요청이 끝나면 다시 허용한다. 실패한 첨부와 draft는 유지한다.
- 전역 Profile과 다른 작성 Profile로 게시하면 성공 ID만 확인하고 현재 화면의 목록과 캐시에는 작성자 관점의
  Post 내용을 넣지 않는다. 작성자가 전역 Profile과 같으면 기존 목록 갱신을 유지한다.
- 제출 성공 뒤 같은 Composer가 초기화될 때의 Visibility는 성공 callback을 만든 render가 캡처한 Profile
  Fragment 값을 best-effort seed로 사용한다. 제출 중 별도 render에서 갱신된 최신 Profile 기본값까지 보장하지
  않는다.
- 제출 성공 시 modal을 닫고 원래 Reply action으로 focus를 복원한 뒤 `답글을 게시했어요` 성공 snackbar와
  `보기` action을 표시한다. 이 snackbar는 기존 공용 toast처럼 약 3초 뒤 자동으로 사라지며, 표시 중 사용자가
  `보기`를 활성화할 때만 생성된 Reply 상세로 이동하고 자동으로 route를 바꾸지 않는다.
- 성공 payload 반영은 Reply surface가 임의의 Post나 다른 Profile Store membership을 합성하지 않고, 이를 연 surface가
  제공한 현재 actor의 connection/callback 경계만 사용한다. 상세 surface는 현재 detail query만 targeted
  refetch하며, 새 Reply가 현재 query 범위에 포함될 때만 기존 thread 정렬에 따라 자연스럽게 표시한다.

## 접근성·입력

- Web modal은 공용 `글쓰기` heading과 관계 맥락을 포함한 modal dialog semantics, focus trap을
  제공한다.
- `X`, backdrop, `Escape`, 취소 확인과 성공 close에서 focus 이동을 각각 검증한다.
- 오류는 alert semantics, Content Warning 입력·reveal control·Visibility와 Reply action은 name/state, 남은
  글자 수는 두 Plain Text 입력과 연관된 설명을 제공한다.
- Media 추가·제거·재시도, 업로드 상태, Alt Text와 Sensitive Media control은 기존 일반 Composer와 같은
  accessible name·state·live feedback을 제공한다.
- interactive target 수치는 이 문서에서 고정하지 않는다. Web·Android·iOS의 최신 승인 접근성 지침과 runtime
  관찰을 source of truth로 삼고, 이전 target-size 수치를 자동으로 이식하지 않는다.
- 중앙 scroll은 keyboard focus가 Parent 또는 editor의 현재 위치를 가리지 않게 유지한다. Parent 전용 nested
  scroll과 배경 document scroll은 만들지 않는다.

## 제외 범위

- Mentioned Profiles recipient와 `DIRECT` Reply
- Poll을 포함한 Reply 작성
- `PostContentDocument` 구조 변경, Content Warning 전용 모델·DB 컬럼 또는 서버 동기화 reveal preference
- 새 Media 형식·제한, Reply 전용 Media 모델·storage·API·uploader 또는 일반 Composer Media UI 재설계
- Reply+Quote 동시 작성
- ActivityPub Reply와 Notification inbox
- modal 안의 전체 조상 thread, Parent Action Bar와 Post menu
- 일반 Post Composer 전체를 재설계하거나 mode별 Composer state를 만드는 작업

## 구현 정렬 gate

- 이 디자인의 Web modal과 좁은 화면 전체 작성기는 PROD-425의 기본 Reply 작성 계약과 PROD-640의 기존 Media
  계약 복구를 함께 적용한다. `add-local-reply-creation`의 최종 delta 동기화와 archive는
  전체 통합 검증을 소유한 PROD-423에서 수행한다.
- Reply/Quote는 목록과 상세에서 Web `≥ compact`는 modal, Web `< compact`와 Android/iOS는 fullscreen을 사용한다.
  상세 inline Composer는 이 계약에서 제외하고 재도입은 별도 Product 범위로 남긴다. 일반 Full Web right rail은
  유지한다.
- Local API 입력·저장(PROD-460)과 공통 Post Composer 및 공용 reveal UI(PROD-642)의 Content Warning 계약은
  `add-local-content-warning` change가 공동 소유한다. PR readiness와 별개로 Android/iOS 및 원격 federation
  runtime gate가 완료되기 전에는 이 change를 archive하지 않는다.
- Figma component와 screen state를 먼저 검토한 뒤 구현 계획을 확정한다. 디자인 문서나 Figma 완료만으로
  Reply 작성·cache 통합 또는 runtime 검증 완료를 주장하지 않는다.

## Product 후속 검증 기준

아래 항목은 관련 Product 구현 이슈의 완료 기준이며 DSN-50 PR의 현재 runtime 검증 목록이 아니다.

- Web 목록과 Compact Post 상세 Reply가 Parent 전체 맥락과 기존 Composer control을 가진 600px 너비의
  modal을 여는지 자동화로 확인한다. modal이 내용에 맞춰 늘고 줄어들며 `720px`과 `85dvh`
  중 작은 값에서 제한되는지 Web runtime에서 확인한다.
- content가 중앙 영역을 넘을 때 header/footer는 유지되고 중앙 영역 하나만 스크롤되는지 확인한다.
- 일반 Post, Reply, Quote Parent의 Content/Source 표시와 Action Bar/menu 제외, thread connector를 확인한다.
- Visibility 독립성, 선택 Profile의 기본값과 `UNLISTED` fallback, `DIRECT` 제외, 500자 count와
  disabled/pending/error 상태를 확인한다.
- 일반 Post와 Reply의 Content Warning 입력·제출, Parent Content Warning 초기값, 수정·제거, 합산 500자 검증과
  Reply-open discard/reset/error 유지 상태를 확인한다.
- Home, Profile, Thread와 Reply Parent preview에서 같은 `Post.id`의 reveal·다시 가리기 상태가 공유되고 surface
  remount로 초기화되지 않으며, 서로 다른 Post와 Sensitive Media 상태는 독립적인지 확인한다.
- 모든 지원 Reply surface에서 이미지 선택·업로드·미리보기·제거·재시도, Alt Text, Sensitive Media와
  Media-only Reply payload를 확인한다. 업로드 중·실패 상태는 제출을 차단하고 재시도 또는 제거 뒤 유효성을
  다시 계산해야 한다.
- modal Reply-open dirty/pristine Post/pending/success close, 취소 확인, focus open/restore, 성공 snackbar의
  `보기` 이동과 자동 이동 없음, Media upload 중 dirty close를 확인한다. fullscreen은 backdrop 없이 header
  close와 Native platform back에서 같은 dirty·pending 보호를 제공하는지 확인한다. Web 브라우저 Back 보호는
  위의 알려진 제한에 따라 후속으로 검증한다. 두 surface 모두 selected
  Profile·Parent·Relay Environment 전환의 첫 commit과 늦은 설정 조회·upload·mutation completion 격리를 확인한다.
- Web `≥ compact` 목록·상세 modal과 Web `< compact` 전체 화면의 Parent·Composer 계약을 Storybook에서
  확인한다. 일반 Post Composer의 Full Web right rail은 유지하되 Reply/Quote에는 inline Composer wrapper가
  남지 않아야 한다. 실제 API의
  targeted refetch 실패·retry와 Web 짧은-height layout은 통합 runtime 검증으로 분리한다.
- Native 전체 화면 구현은 같은 Parent·Composer 계약을 공유하지만, Android·iOS의 scroll, keyboard, safe area,
  platform back과 접근성 runtime은 이번 Web 우선 PR의 Ready 근거로 사용하지 않고 Native 출시 gate에서 별도로
  확인한다.
