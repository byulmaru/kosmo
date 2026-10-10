## Why

타임라인의 프로필 사진 아래와 카드 여백을 눌러도 상세로 이동하지 않는다. CW를 접으면 본문 이동 영역도 사라진다. 눌림 효과는 카드 전체에 표시되어 실제 이동 영역과 어긋난다. PROD-1075가 정한 상세 진입과 독립 액션 분리 결과를 구현 세션에 전달하려고 이번 하네스를 작성한다.

## Goal

iOS 타임라인에서 독립 액션을 제외한 게시글 카드 영역을 탭하면 올바른 게시글 상세로 한 번 이동한다. CW 접힘·펼침과 무관하게 여백에서 진입할 수 있으며, 상세 진입만으로 숨겨진 내용을 공개하지 않는다.

## What Changes

- 프로필 아래 빈 영역과 카드 여백을 상세 진입 영역으로 연결한다.
- 본문 탭과 기존 프로필·시간·링크·이미지·CW·게시글 액션의 결과를 보존한다.
- 정지 상태의 탭을 세로 스크롤·취소와 구분하고 중복 이동을 막는다.
- 공용 카드가 쓰이는 다른 목록과 상세 thread의 영향도 함께 확인한다.

## Non-Goals

- PROD-1016의 답글 알림 여백 수정, PROD-1039의 앱 전체 motion 이관.
- Source preview 내부의 이동 영역 확대, 상세 current row·MediaViewer 동작 변경.
- CW·Sensitive Media 정책, 조회 권한, 서버·GraphQL·DB·목록 후보 변경.
- 아직 재현되지 않은 정상 본문 탭 누락의 원인을 확정하거나 추정으로 제스처 보정 도입.
- 이 세션의 앱 코드 구현·제품 테스트·push·PR·배포.

## Constraints

- 제품 결과와 완료 기준의 authority는 PROD-1075와 기존 canonical 문서다. OpenSpec은 수정 가능한 세션 메모이며 추가 권위를 갖지 않는다.
- 일반·Quote 카드는 자신, 순수 Repost 카드는 표시한 direct Source의 기존 canonical 상세 대상을 유지한다. Source preview의 독립 입력과 기존 비대화형 attribution을 보존한다.
- Action Bar와 Reaction Summary는 navigation target의 sibling으로 유지한다. 독립 target의 유효 입력 영역을 줄이거나 겹침으로 크기를 충족했다고 주장하지 않는다.
- CW 공개 상태는 기존 canonical `Post.id` 단위 공유 상태를 사용한다. navigation이 공개·숨김 상태를 바꾸지 않는다.
- 기존 card geometry·token·hover suppression·접근성 진입점을 보존하고 새로운 motion 계약을 만들지 않는다.

## Verification

일반 텍스트·미디어·Quote·순수 Repost와 CW 없음·접힘·펼침을 조합해 여백·본문·독립 액션의 결과를 검증한다. 실제 iOS에서 정지 상태의 탭, 카드에서 시작한 세로 스크롤, 취소, VoiceOver focus를 관찰한다. 공용 구현을 바꾸면 Web·Android의 영향 범위도 확인한다. 자동화와 Native runtime 증거는 나누어 기록하고, 정상 본문 탭의 간헐적 누락이 남으면 별도 원인·재산정 필요성을 기록한다.

## Business Context

- Product canonical: `docs/domain/objects/post-content.md`, `docs/domain/policies/post-list.md`.
- Visual design source: `docs/design/post-action-bar.md`, `docs/design/accessibility.md`, `docs/design/motion.md`, `docs/design/figma.md`의 Content Warning 계약. 이 출처는 presentation과 접근성 범위만 소유한다.
- Linear: [PROD-1075](https://linear.app/byulmaru/issue/PROD-1075), 관련 PROD-1039와 PROD-1016. 2026-10-10에 본문·관계를 재조회했으며 PROD-1075의 추가 댓글은 없었다.
- User agreement: 2026-10-10 `$kosmo-personal-workflow:kosmo-spec-workflow PROD-1075` 요청. 조사·설계·handoff 작성 범위다.

## Session Status

- Status: Active
- Last updated: 2026-10-10
- 조사 기준: `main@6681db72670757f53e130a599114a38a6217a55c`.
- 제품 구현·runtime 검증: Pending. 이 세션은 코드 조사만 수행했다.
