# Reply Composer

Reply Composer는 기존 일반 Post Composer에 direct Parent 맥락을 주입해 Local Reply를 작성하는 UI다.
Reply 전용 입력·검증·제출 체계를 새로 만들지 않고, surface가 Parent 표시와 open/close lifecycle을 소유한다.

## 기준 source와 범위

- Web modal의 시각적 출발점은 Figma `KOSMO` 파일의
  [`ComposeModal (ComposeWidget 600w)` node 993:4057](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=993-4057)다.
- 좁은 화면의 Reply 맥락은
  [`Edit / Reply` node 277:73](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=277-73),
  상세 진입점은
  [`ReplyComposer` node 693:518](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=693-518)을 기준으로 한다.
- 일반 Post Composer가 지원하는 Plain Text 본문, Visibility, 글자 수, validation, pending과 오류 상태를
  그대로 재사용한다.
- Parent가 일반 Post, Reply 또는 Quote이면 화면에 표시되는 direct Parent의 자체 Content와 Source preview를
  보여준다. Action Bar와 Post menu는 Parent 맥락 안에 중복 표시하지 않는다.

## surface별 진입

- Web `≥ compact` 목록 surface에서는 Reply action이 중앙 modal dialog를 연다.
- Web `< compact`와 Android/iOS 목록 surface에서는 같은 Reply 맥락을 전체 화면 작성기로 연다.
- Post 상세에서는 compact `ReplyComposer` 진입점을 현재 thread 안에 유지하고, 활성화하면 그 자리에서 기존
  Composer를 인라인으로 펼친다.
- 어느 surface에서도 Reply 전용 mutation, 별도 입력 상태 또는 Post kind를 만들지 않는다.

## Web Reply modal

### geometry와 scroll

- modal 너비는 `600px`이고 기본 높이는 content 길이와 관계없이 `720px`로 유지한다.
- 작은 viewport에서는 `85dvh`를 상한으로 적용하므로 실제 높이는 `min(720px, 85dvh)`다.
- header와 footer는 modal 안에 고정하고, 제한 높이를 넘는 Parent와 editor만 하나의 중앙 scroll 영역에서
  함께 스크롤한다. Parent만 별도 스크롤하는 nested scroll은 만들지 않는다.
- card surface, semantic `border`, `radius/lg` 16px과 기존 modal backdrop을 사용한다. 배경 document는 modal이
  열린 동안 스크롤되지 않는다.

### header

- 좌측에 `답글 쓰기` 제목을 표시한다.
- 우측에는 텍스트가 아닌 `X` 아이콘 닫기 버튼을 둔다. accessible name은 `닫기`다.
- 닫기 버튼의 visual box와 interactive target은 과거의 고정 44x44 가정을 복사하지 않는다. Web·Native별
  최신 승인 접근성 지침을 확인한 뒤 해당 surface의 target을 정한다.

### Parent와 thread 맥락

- Parent 영역은 작성자 Avatar, 표시 이름, handle, 작성 시각과 전체 본문을 보여준다.
- Quote Parent는 기존 Source preview를 유지한다. Source preview는 일반 본문과 같은 background를 사용하고,
  semantic border만으로 경계를 구분한다. 구분용 별도 tonal surface는 사용하지 않는다.
- Reply Parent는 화면에 표시되는 direct Parent만 표시하고, 조상 thread 전체를 modal 안에서 다시 펼치지
  않는다.
- Parent 본문은 줄 수로 생략하지 않는다. 제한 높이를 넘을 때 중앙 영역의 단일 scroll로 접근한다.
- Parent Avatar 아래의 thread connector를 Reply 작성 Profile의 Avatar까지 이어 기존 Reply 표시 구조와 같은
  대화 관계를 표현한다.
- Parent 영역은 작성 맥락 확인을 위한 비대화형 presentation이다. 작성자·Source·본문을 활성화해 modal 작성
  상태를 잃는 route 이동을 만들지 않는다.
- 일반 첨부 이미지는 Parent 맥락에 표시하되, Sensitive Media는 가림 placeholder만 유지한다. Sensitive 공개와
  이미지 오류 재시도처럼 상태를 바꾸는 Media control은 Parent 영역에 노출하지 않는다.

### editor와 고정 footer

- 중앙 editor는 기존 Composer의 작성 Profile, TextArea와 error 표현을 사용한다. Web TextArea의 브라우저
  기본 사각 outline은 중복 표시하지 않고, semantic `focus` token을 적용한 둥근 editor surface border 하나를
  focus indicator로 사용한다. 이 focus 경계는 인접 editor background와 3:1 이상의 대비를 유지한다. 오류
  상태에서는 같은 경계를 semantic danger border로 바꾼다. placeholder는 `답글을 입력하세요…`다.
- 제목·control label·button에는 공용 UI typography를, Parent·입력 본문에는 공용 body typography를 사용한다.
  modal 전용 raw font size나 font family를 만들지 않는다.
- footer 좌측에는 Visibility control을 둔다.
- footer 우측에는 남은 글자 수와 `답글 게시` primary button을 이 순서로 둔다.
- 남은 글자 수는 `500`에서 시작해 항상 표시하며 초과 시 semantic danger 상태로 표시한다.
- 빈 본문, 500자 초과와 제출 중에는 `답글 게시`를 disabled로 표시한다.
- 제출 중에는 button에 spinner와 `게시 중` 상태를 표시하고 본문·Visibility의 중복 변경과 닫기를 막는다.
- validation 또는 network 오류는 editor 아래, 고정 footer 위에 inline alert로 표시한다.

## Visibility

- Reply Visibility는 Parent Visibility와 독립적이다.
- 기본값은 일반 Composer와 같은 `UNLISTED`다.
- 현재 Reply 작성 범위에서는 `PUBLIC`, `UNLISTED`, `FOLLOWERS`를 제공한다.
- `DIRECT`/지정 멤버만 공개는 노출하지 않는다. Mentioned Profile recipient 결정과 작성 계약은 이 범위에
  포함하지 않는다.

## lifecycle

- modal을 열면 Reply action은 expanded 상태를 노출하고 본문 editor로 focus를 이동한다.
- 빈 상태에서는 `X`, backdrop과 `Escape`로 즉시 닫는다.
- 본문 또는 Visibility가 초기값에서 바뀐 상태로 닫기를 시도하면 `답글 작성을 취소할까요?` 확인을 표시한다.
  사용자는 `계속 작성` 또는 `작성 취소`를 선택한다.
- 상세 inline surface에서 현재 Reply action을 다시 활성화하거나 다른 Parent의 Reply action을 선택하는 동작도
  같은 close 요청으로 처리한다. dirty 상태에서는 확인 뒤 닫거나 Parent를 전환하고, pending 상태에서는
  현재 작성과 active Parent를 유지한다.
- 제출 실패 시 modal, direct Parent 맥락, 본문과 Visibility를 유지한다.
- selected Profile, direct Parent 또는 Relay Environment가 바뀌면 새 문맥의 첫 Composer commit부터 본문,
  Visibility, error와 pending을 초기 상태로 시작한다. 이전 문맥의 늦은 mutation completion은 새 문맥의 상태나
  성공 callback을 변경하지 않는다.
- 제출 성공 시 modal을 닫고 원래 Reply action으로 focus를 복원한 뒤 `답글을 게시했어요` 성공 snackbar와
  `보기` action을 표시한다. 이 snackbar는 기존 공용 toast처럼 약 3초 뒤 자동으로 사라지며, 표시 중 사용자가
  `보기`를 활성화할 때만 생성된 Reply 상세로 이동하고 자동으로 route를 바꾸지 않는다.
- 성공 payload 반영은 modal이 임의의 Post나 다른 Profile Store membership을 합성하지 않고, 이를 연 surface가
  제공한 현재 actor의 connection/callback 경계만 사용한다. 상세 surface는 현재 detail query만 targeted
  refetch하며, 새 Reply가 현재 query 범위에 포함될 때만 기존 thread 정렬에 따라 자연스럽게 표시한다.

## 접근성·입력

- Web modal은 이름이 `답글 쓰기`인 modal dialog semantics와 focus trap을 제공한다.
- `X`, backdrop, `Escape`, 취소 확인과 성공 close에서 focus 이동을 각각 검증한다.
- 오류는 alert semantics, Visibility와 Reply action은 name/state, 남은 글자 수는 입력과 연관된 설명을 제공한다.
- interactive target 수치는 이 문서에서 고정하지 않는다. Web·Android·iOS의 최신 승인 접근성 지침과 runtime
  관찰을 source of truth로 삼고, 이전 target-size 수치를 자동으로 이식하지 않는다.
- 중앙 scroll은 keyboard focus가 Parent 또는 editor의 현재 위치를 가리지 않게 유지한다. Parent 전용 nested
  scroll과 배경 document scroll은 만들지 않는다.

## 제외 범위

- Mentioned Profiles recipient와 `DIRECT` Reply
- Media, Poll, Content Warning과 Sensitive Media를 포함한 Reply 작성
- Reply+Quote 동시 작성
- ActivityPub Reply와 Notification inbox
- modal 안의 전체 조상 thread, Parent Action Bar와 Post menu
- 일반 Composer 전체를 재설계하거나 별도 Reply Composer state를 만드는 작업

## 구현 정렬 gate

- 이 디자인의 목록 modal, 좁은 화면 전체 작성기와 상세 inline surface를 구현하기 전에 PROD-425와
  `add-local-reply-creation`의 UI scope를 이 문서와 동기화한다.
- Figma component와 screen state를 먼저 검토한 뒤 구현 계획을 확정한다. 디자인 문서나 Figma 완료만으로
  Reply 작성·cache 통합 또는 runtime 검증 완료를 주장하지 않는다.

## 검증 기준

- Web 목록 Reply가 Parent 전체 맥락과 기존 Composer control을 가진 600×720px modal을 여는지 자동화로
  확인한다. 작은 viewport에서 높이가 `85dvh`로 제한되는 실제 layout은 Web runtime 후속 검증으로 남긴다.
- content가 중앙 영역을 넘을 때 header/footer는 유지되고 중앙 영역 하나만 스크롤되는지 확인한다.
- 일반 Post, Reply, Quote Parent의 Content/Source 표시와 Action Bar/menu 제외, thread connector를 확인한다.
- Visibility 독립성, `UNLISTED` 기본값, `DIRECT` 제외, 500자 count와 disabled/pending/error 상태를 확인한다.
- pristine/dirty/pending/success close, 취소 확인, focus open/restore, 성공 snackbar의 `보기` 이동과 자동 이동
  없음, selected Profile·Parent·Relay Environment 전환의 첫 commit과 늦은 completion 격리를 확인한다.
- Web `< compact` 전체 화면과 상세 inline surface의 Parent·Composer 계약을 Storybook에서 확인한다. 실제 API의
  targeted refetch 실패·retry와 Web 짧은-height layout은 통합 runtime 검증으로 분리한다.
- Native 전체 화면 구현은 같은 Parent·Composer 계약을 공유하지만, Android·iOS의 scroll, keyboard, safe area,
  platform back과 접근성 runtime은 이번 Web 우선 PR의 Ready 근거로 사용하지 않고 Native 출시 gate에서 별도로
  확인한다.
