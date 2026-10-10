## Current Constraints

이 문서는 `main@6681db72670757f53e130a599114a38a6217a55c`에서 조사한 구현과 이번 세션에서 권장하는 접근을 기록한다. 구현 중 더 작은 방법을 찾으면 고칠 수 있으며 영구 구현 계약이 아니다.

| 경계                                    | 확인한 현재 구현                                                     | 이번 작업의 영향                                          |
| --------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| `PostListItem.tsx`의 `PostListItemCard` | root `View`가 padding과 feedback을 소유하고 상세 이동은 없다         | 카드 여백에 입력 경계가 필요하다                          |
| 같은 파일의 `PostListRow`               | Avatar는 Profile, 시간과 `onBodyPress`는 표시 Post의 상세로 이동한다 | 새 여백 입력과 기존 본문 입력이 중복 실행되지 않아야 한다 |
| `PostContentRenderer.tsx`               | CW 접힘 상태에서는 본문과 본문 `Pressable`을 렌더링하지 않는다       | 여백 입력은 본문 존재에 의존할 수 없다                    |
| `PostContentWarning.tsx`                | disclosure button이 전파를 막고 공개 상태만 전환한다                 | 공개·숨김과 상세 진입을 분리한다                          |
| `PostContentWarningRevealContext.tsx`   | `Post.id`별 상태를 공유하고 Profile·session 변경 시 초기화한다       | navigation에서 store를 변경하지 않는다                    |
| `PostSourcePresentationView.tsx`        | Source 작성자·시각·본문이 각 대상을 소유한다                         | Source preview 내부 여백과 입력 경계는 확대하지 않는다    |
| `usePostSurfaceFeedback.ts`             | Native `onTouchStart/End/Cancel`은 표시만 바꾼다                     | touch 종료 자체를 navigation으로 사용하지 않는다          |

`PostList`의 Home·Local·Profile 목록, `BookmarkList`, `PostDetailThread`의 조상·하위 Reply가 공용 카드를 소비한다. 상세 current row는 `PostLayout`이며 일반 상세는 CW `default`, viewer current row만 기존 `revealed` presentation을 사용한다. 이 viewer 예외는 변경하지 않는다.

## Practical Approach

### 카드 여백과 독립 입력

카드 root의 `View`와 content-level sibling 배치를 유지하고, 카드를 조합하는 경계에서 표시 대상의 상세 경로를 결정한다. 일반·Quote는 own Post, contentless Repost는 direct Source를 사용한다. 표시 컴포넌트에 route parameter나 새로운 전역 navigation registry를 추가하지 않는다.

우선 검토할 구현은 card content와 sibling인 배경 `Pressable`을 두고 여백만 그 target에 도달하게 하는 방식이다. `pointerEvents="box-none"`은 필요한 비대화형 layout wrapper에만 적용한다. 본문은 기존 이동 경계를 유지하고, 배경 target이 독립 액션·Source preview·비대화형 attribution의 입력을 받지 않도록 각 기존 경계를 보존한다. 실제 유효 입력 영역이 독립 target을 침범하지 않는지는 iOS hit test로 확인한다. layout wrapper 때문에 여백을 포착하지 못하거나 경계가 겹치면 비대화형 여백을 별도 `Pressable` 영역으로 나누는 방식으로 좁힌다. 이 선택은 제품 결정을 다시 여는 사유가 아니다.

Action Bar와 Reaction Summary를 포함한 전체 카드를 하나의 navigation `Link`나 `Pressable`로 감싸지 않는다. Source preview에 `box-none`을 무조건 전파하거나 공용 privacy wrapper 전체의 입력 의미를 바꾸지 않는다. wrapper는 카드 사용 범위에서 필요한 부분만 조정한다.

| 탭 위치                                                        | 기대 결과                       | 보존할 경계                                                   |
| -------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------- |
| 프로필 아래 빈 공간·카드 외곽 padding·독립 target 밖의 행 여백 | 표시 대상의 상세로 한 번 이동   | 인접 카드의 입력 영역을 침범하지 않는다                       |
| 일반·Quote의 본문 또는 생성 시각                               | own Post 상세로 한 번 이동      | 본문·시간과 여백 입력의 중복 이동을 막는다                    |
| 순수 Repost의 본문·시각 또는 바깥 카드 여백                    | direct Source 상세로 한 번 이동 | 바깥 Repost ID나 Source의 Source로 대상을 바꾸지 않는다       |
| 프로필 Avatar·이름·Repost attribution link                     | 해당 Profile로 이동             | 게시글 상세 이동을 함께 실행하지 않는다                       |
| 외부 링크·Mention                                              | 기존 URL 또는 Profile로 이동    | 부모 Post 이동을 함께 실행하지 않는다                         |
| 이미지·재시도·Sensitive Media 공개                             | 기존 Viewer·재시도·공개 동작    | 상세 navigation을 추가하지 않는다                             |
| CW 경고 행                                                     | 해당 Post의 공개·다시 가리기    | 상세 이동과 공개 상태 변경을 분리한다                         |
| Reply·Repost·Reaction·Bookmark·More·Reaction Summary           | 기존 action·menu·People 동작    | pending·disabled 입력도 상세 진입으로 새지 않게 한다          |
| Source preview·Reply attribution의 기존 비대화형 부분          | 기존 비대화형 상태 유지         | 새 Source padding 이동이나 attribution action을 만들지 않는다 |

### 탭과 스크롤

상세 이동은 framework가 완료한 `onPress`에서만 실행한다. 카드 root의 `onTouchEnd`나 capture responder에서 이동을 강제하지 않는다. iOS 목록이 스크롤을 인수하거나 입력이 취소되면 이동하지 않아야 한다. 임의 시간·거리 임계값, 전역 debounce, ref 기반 navigation coordination은 재현 근거 없이 추가하지 않는다.

기존 feedback overlay·Light/Dark token·CW hover suppression을 유지한다. 취소 뒤 pressed가 남는지는 함께 확인하되 PROD-1039의 소비처 motion 이관을 가져오지 않는다.

### CW와 접근성

새 여백 target은 CW 공개 여부와 무관하게 존재한다. 상세 경로를 활성화할 때 reveal store나 `contentWarningPresentation`을 변경하지 않는다. 접힌 Post는 상세·Back 이후에도 기존 공개 상태를 유지하며, 이미 공개한 Post는 기존 공유 상태를 그대로 사용한다. Quote와 Source의 상태를 합치지 않는다.

기존 시간 Link를 keyboard·VoiceOver의 상세 진입점으로 유지한다. 보조적인 여백 shortcut이 자식 액션을 하나의 accessibility element로 묶거나 중복 focus stop을 만들지 않게 한다. 실제 자식 role·name·expanded·disabled와 독립 target을 관찰한다.

### 검증과 문서

- `PostActionControl.test.ts`, `PostContentRenderer.test.ts`, `PostMediaViewerIntegration.test.ts`의 실제 렌더·상태 전환 경로를 재사용한다. 단순 handler 호출은 native responder·hit testing 증거로 분류하지 않는다.
- `Posts.stories.tsx`에서 실제 production 카드의 좌표 기반 여백 탭, 본문·독립 액션, CW 상태와 단일 route 결과를 확인한다. 기존 navigation mock은 외부 경계만 mock하며 순수 Repost·Quote의 대상도 검증한다.
- Native는 로그인된 목록에서 iOS 기기 또는 simulator의 실제 좌표 입력으로 일반·CW 상태의 여백 탭, 세로 drag, 취소와 VoiceOver focus를 확인한다. 기기·OS·binary build·확인 가능한 OTA revision·관찰 결과를 기록한다. 제보와 동일 환경을 확보하지 못하면 구분한다.
- 구현이 공용 경계를 바꾸면 Web·Android의 동일 입력 분리와 공용 카드 소비처를 회귀 확인한다. 해당 플랫폼을 실행하지 못하면 미검증으로 남긴다.
- 구현에서 새 여백 상호작용을 제공한 범위를 `docs/design/post-action-bar.md`에 반영한다. feedback 자체가 navigation을 만든다는 식으로 기존 PROD-977 문장을 바꾸지 않는다. 기존 제품 계약 복구이므로 domain·Linear에 구현 수단을 추가하지 않는다.

## Alternatives and Traps

- 전체 root를 navigation target으로 바꾸기: Action Bar sibling 계약, 중첩 링크와 자식 focus를 깨뜨릴 수 있어 채택하지 않는다.
- 기존 본문 target의 `hitSlop`만 확대하기: CW 접힘 때 target이 사라지며 parent bounds와 sibling 우선순위 때문에 카드 전체 여백을 보장할 수 없다.
- Source preview의 빈 공간까지 Source 이동으로 바꾸기: 현재 issue 범위와 기존 Source 입력 계약을 넓히므로 제외한다.

framework 근거: [React Native 0.85 Pressable](https://reactnative.dev/docs/0.85/pressable), [View pointerEvents](https://reactnative.dev/docs/0.85/view#pointerevents), [Gesture Responder System](https://reactnative.dev/docs/0.85/gesture-responder-system). 2026-10-10에 공식 문서를 확인했다. 문서의 sibling 우선순위·취소 모델은 설계 근거이며 현재 앱의 성공 증거가 아니다.

## Risks / Limits

- 최초 제보는 TestFlight `0.0.1 (36836991687001)`, iOS `26.7`이며 OTA revision은 미확인이다. 이 세션은 해당 환경에서 직접 재현하지 않았다.
- 현재 테스트는 Native touch handler를 호출해 feedback 상태를 확인하지만 실제 탭 포착·스크롤 인수는 증명하지 않는다. 정상 본문 단일 탭 누락의 원인은 미확인이다.
- 배경 layer를 사용하면 wrapper hit testing·Source 경계·disabled action이 주요 회귀 위험이다. 실패하면 입력 영역을 분할하며 자동 retry나 새로운 제스처 상태 기계로 숨기지 않는다.
- 서버·DB·migration·backfill은 없다. rollback은 scoped UI 변경을 되돌리는 방식이며 store의 기존 CW 의미를 보존한다. 배포 방식 변경은 제안하지 않는다.

## Open Questions

현재 Linear·canonical 기준으로 새 제품·보안·rollout 결정은 없다. 배경 layer의 유효 hit region과 정상 본문 탭 누락은 구현·runtime 조사에서 확인할 기술적 불확실성이다. 추가 원인이 독립된 범위·완료 조건을 요구하면 PROD-1075에 사실과 영향을 기록하고 결정한다.
