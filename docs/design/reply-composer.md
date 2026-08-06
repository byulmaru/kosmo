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
- 일반 Post Composer가 지원하는 Plain Text 본문, Content Warning, Visibility, 글자 수, Media
  선택·업로드·미리보기·제거·재시도, Alt Text, Sensitive Media, validation, pending과 오류 상태를 그대로
  재사용한다.
- Parent가 일반 Post, Reply 또는 Quote이면 화면에 표시되는 direct Parent의 자체 Content와 Source preview를
  보여준다. Action Bar와 Post menu는 Parent 맥락 안에 중복 표시하지 않는다.

## surface별 진입

- Web `≥ compact` 목록 surface에서는 Reply action이 중앙 modal dialog를 연다.
- Web `< compact`와 Android/iOS 목록 surface에서는 같은 Reply 맥락을 전체 화면 작성기로 연다.
- Post 상세에서는 compact `ReplyComposer` 진입점을 현재 thread 안에 유지하고, 활성화하면 그 자리에서 기존
  Composer를 인라인으로 펼친다.
- Post 상세의 ancestor·descendant `PostListItem`에서 inline Composer 외곽은 thread row의 왼쪽 `64px`,
  오른쪽 `8px` content boundary를 따른다. current Post의 inline Composer는 기존 `PostLayout` content column
  boundary를 유지한다.
- 이 boundary는 connector의 위치·길이를 바꾸거나 숨기지 않고 Composer가 connector lane을 침범하지 않게
  한다. connector는 caller가 공급한 direct relation을 계속 표현한다.
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

- 중앙 editor는 기존 Composer의 작성 Profile, TextArea와 error 표현을 사용한다. Web TextArea의 브라우저
  기본 사각 outline은 중복 표시하지 않고, semantic `focus` token을 적용한 둥근 editor surface border 하나를
  focus indicator로 사용한다. 이 focus 경계는 인접 editor background와 3:1 이상의 대비를 유지한다. 오류
  상태에서는 같은 경계를 semantic danger border로 바꾼다. placeholder는 `답글을 입력하세요…`다.
- editor는 기존 Composer의 nullable Plain Text Content Warning 입력을 함께 제공한다. surface가 새 Parent
  문맥으로 초기화될 때 direct Parent의 `contentWarning`이 있으면 그 값을 Reply Content Warning의 초기값으로
  한 번 복사하고, 없으면 빈 초기값을 사용한다. 복사 뒤에는 Parent와 연결된 값으로 취급하지 않으며 사용자는
  자유롭게 수정하거나 완전히 제거할 수 있다.
- 제목·control label·button에는 공용 UI typography를, Parent·입력 본문에는 공용 body typography를 사용한다.
  modal 전용 raw font size나 font family를 만들지 않는다.
- 기존 Composer의 Media control은 editor 안에서 본문 아래에 둔다. 선택한 이미지의 미리보기, 업로드 상태,
  제거·재시도, nullable Alt Text와 Sensitive Media control이 늘어나면 Parent와 editor가 공유하는 중앙 영역에서
  함께 스크롤하고 고정 footer를 밀어내지 않는다.
- footer 좌측에는 Visibility control을 둔다.
- footer 우측에는 남은 글자 수와 `답글 게시` primary button을 이 순서로 둔다.
- 남은 글자 수는 trim·normalize한 Content Warning과 본문 Plain Text의 합계를 500에서 차감해 항상 표시하며
  초과 시 semantic danger 상태로 표시한다.
- trim한 본문과 업로드를 완료한 Media가 모두 없거나, Content Warning과 본문 Plain Text의 합계가 500자를
  초과하거나, Media가 업로드 중·실패 상태이거나, Reply 제출 중이면 `답글 게시`를 disabled로 표시한다.
  Content Warning만으로는 contentful Reply가 되지 않지만, 본문이 없어도 Ready Media가 하나 이상 있으면
  Media-only Reply를 제출할 수 있다.
- Media 업로드 실패는 현재 preview와 Parent 맥락을 유지한 채 같은 위치에서 재시도하거나 제거할 수 있게 한다.
- 제출 중에는 button에 spinner와 `게시 중` 상태를 표시하고 본문·Content Warning·Visibility의 중복 변경과
  닫기를 막는다.
- validation 또는 network 오류는 editor 아래, 고정 footer 위에 inline alert로 표시한다.

## Visibility

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
  canonical `Post.id`다. Home, Profile, Thread와 Reply Composer의 Parent preview를 포함해 같은 Post를 표시하는
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
- Reply surface를 여는 순간 direct Parent 맥락 자체를 dirty로 취급하므로, 본문·Content Warning·Visibility와
  Media가 초기값이어도 `X`, backdrop 또는 `Escape`로 닫을 때 확인을 표시한다.
- Reply 보호 정책은 Parent와 close lifecycle을 아는 surface가 직접 소유한다. Reply surface는 입력별 dirty를
  다시 계산하지 않고 열린 동안 항상 폐기 확인 대상으로 취급하며, 공용 Post Composer에서는 제출 중 여부만
  전달받아 close 차단에 사용한다. 따라서 Parent에서 복사된 Content Warning을 그대로 두거나 수정·제거해도
  `답글 작성을 취소할까요?` 확인에서 사용자가 `계속 작성` 또는 `작성 취소`를 선택하게 한다.
- Media 업로드 중에도 확인 뒤 작성 전체를 폐기할 수 있으며, 늦은 업로드 완료는 닫힌 surface를 다시 열거나 상태를 변경하지
  않는다.
- Profile 기본 Visibility는 선택한 Profile의 값을 사용하고, 값이 없거나 지원하지 않는 경우 `UNLISTED`로
  fallback한다. Composer를 연 뒤 Profile 기본값이 저장되거나 다른 화면에서 바뀌어도 현재 draft의 개별
  Visibility는 자동으로 덮어쓰지 않으며, 다음 새 Composer부터 갱신된 기본값을 사용한다.
- 상세 inline surface에서 현재 Reply action을 다시 활성화하거나 다른 Parent의 Reply action을 선택하는 동작도
  같은 close 요청으로 처리한다. dirty 상태에서는 확인 뒤 닫거나 Parent를 전환하고, Reply 제출 pending
  상태에서는 현재 작성과 active Parent를 유지한다.
- 제출 실패 시 modal, direct Parent 맥락, 본문, Content Warning, Visibility와 Media 작성 상태를 유지한다.
- selected Profile, direct Parent 또는 Relay Environment가 바뀌면 새 문맥의 첫 Composer commit부터 본문,
  Content Warning, Visibility, Media, error와 pending을 초기 상태로 시작한다. Content
  Warning은 새 direct Parent 값에서 다시 한 번 초기화하며, 이전 Parent에서 수정한 값을 이어받지 않는다. 이전
  문맥의 늦은 upload·mutation completion은 새 문맥의 상태나 성공 callback을 변경하지 않는다.
- 선택한 Profile의 기본 Visibility, Media, error와 pending을 초기 상태로 시작한다. 이전 문맥의 늦은 설정
  조회·upload·mutation completion은 새 문맥의 상태나 성공 callback을 변경하지 않는다. Composer를 연 뒤
  Profile 기본값이 저장되거나 다른 화면에서 바뀌어도 현재 draft의 개별 Visibility는 자동으로 덮어쓰지 않으며,
  다음 새 Composer부터 갱신된 기본값을 사용한다.
- 제출 성공 뒤 같은 Composer가 초기화될 때의 Visibility는 성공 callback을 만든 render가 캡처한 Profile
  Fragment 값을 best-effort seed로 사용한다. 제출 중 별도 render에서 갱신된 최신 Profile 기본값까지 보장하지
  않는다.
- 제출 성공 시 modal을 닫고 원래 Reply action으로 focus를 복원한 뒤 `답글을 게시했어요` 성공 snackbar와
  `보기` action을 표시한다. 이 snackbar는 기존 공용 toast처럼 약 3초 뒤 자동으로 사라지며, 표시 중 사용자가
  `보기`를 활성화할 때만 생성된 Reply 상세로 이동하고 자동으로 route를 바꾸지 않는다.
- 성공 payload 반영은 modal이 임의의 Post나 다른 Profile Store membership을 합성하지 않고, 이를 연 surface가
  제공한 현재 actor의 connection/callback 경계만 사용한다. 상세 surface는 현재 detail query만 targeted
  refetch하며, 새 Reply가 현재 query 범위에 포함될 때만 기존 thread 정렬에 따라 자연스럽게 표시한다.

## 접근성·입력

- Web modal은 이름이 `답글 쓰기`인 modal dialog semantics와 focus trap을 제공한다.
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
- 일반 Composer 전체를 재설계하거나 별도 Reply Composer state를 만드는 작업

## 구현 정렬 gate

- 이 디자인의 목록 modal, 좁은 화면 전체 작성기와 상세 inline surface는 PROD-425의 기본 Reply 작성 계약과
  PROD-640의 기존 Media 계약 복구를 함께 적용한다. `add-local-reply-creation`의 최종 delta 동기화와 archive는
  전체 통합 검증을 소유한 PROD-423에서 수행한다.
- Local API 입력·저장(PROD-460)과 일반·Reply Composer 및 공용 reveal UI(PROD-642)의 Content Warning 계약은
  `add-local-content-warning` change가 공동 소유한다. PR readiness와 별개로 Android/iOS 및 원격 federation
  runtime gate가 완료되기 전에는 이 change를 archive하지 않는다.
- Figma component와 screen state를 먼저 검토한 뒤 구현 계획을 확정한다. 디자인 문서나 Figma 완료만으로
  Reply 작성·cache 통합 또는 runtime 검증 완료를 주장하지 않는다.

## 검증 기준

- Web 목록 Reply가 Parent 전체 맥락과 기존 Composer control을 가진 600×720px modal을 여는지 자동화로
  확인한다. 작은 viewport에서 높이가 `85dvh`로 제한되는 실제 layout은 Web runtime 후속 검증으로 남긴다.
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
- Reply-open dirty/pristine Post/pending/success close, 취소 확인, focus open/restore, 성공 snackbar의 `보기` 이동과 자동 이동
  없음, Media upload 중 dirty close, selected Profile·Parent·Relay Environment 전환의 첫 commit과 늦은
  설정 조회·upload·mutation completion 격리를 확인한다.
- Web `< compact` 전체 화면과 상세 inline surface의 Parent·Composer 계약을 Storybook에서 확인한다. 실제 API의
  targeted refetch 실패·retry와 Web 짧은-height layout은 통합 runtime 검증으로 분리한다.
- 상세 ancestor inline Composer가 row 기준 왼쪽 `64px`, 오른쪽 `8px`에 놓이고 connector를 표시한 채
  `connector.right < composer.left`를 만족하는지 Storybook과 `390px` Web E2E에서 확인한다.
- Native 전체 화면 구현은 같은 Parent·Composer 계약을 공유하지만, Android·iOS의 scroll, keyboard, safe area,
  platform back과 접근성 runtime은 이번 Web 우선 PR의 Ready 근거로 사용하지 않고 Native 출시 gate에서 별도로
  확인한다.
