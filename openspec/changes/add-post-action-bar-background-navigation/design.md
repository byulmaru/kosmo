이 문서는 이번 구현을 돕는 working note다. 요구사항이나 영구 구현 규칙을 추가하지 않는다.

## Current Constraints

조사 기준은 main `bfa5a9781cf94570eb9f2c76c21a4804d4bfb4ae`다.

| 현재 경계       | 확인한 코드와 영향                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 행별 상세 대상  | `PostListItem.tsx:125`는 Content가 있으면 자신의 상세, 순수 Repost이면 direct Source를 선택한다. `PostListRow`도 표시한 Post의 상세 callback이 있다.                                                                     |
| Action Bar 배치 | `PostActionSurface.tsx:101`의 style wrapper, `PostActionBar.tsx:93`의 toolbar와 trailing group, `PostActionControl.tsx:95`의 slot은 각각 별도 View다. 하나의 callback만 상위에 붙이면 자식 View 여백이 남을 수 있다.     |
| 실제 버튼 영역  | Web 버튼은 28px visual row 위아래로 4px 확장된 36px target이다. slot의 50px 최소 폭과 실제 버튼 폭은 다르다. Native social slot은 실제 버튼 영역으로 채워지므로 glyph 주변이 비어 보여도 여백 이동 대상으로 보지 않는다. |
| 배경 responder  | `postDetailBackgroundResponder.ts:47`은 직접 배경 입력만 받는다. 자식 입력을 제외하고, 이동·영역 이탈·termination에서 취소하며 스크롤에 responder를 양보한다.                                                            |
| 타래의 현재 행  | `PostDetailThread.tsx:415`는 현재 행을 PostLayout으로 표시하고 조상·하위 행에는 PostListItem을 사용한다. PostLayout에는 현재 Action Bar 상세 이동 callback이 없다.                                                       |
| 다른 소비자     | PostLayout·PostActionSurface는 Media Viewer와 Storybook에서도 쓰인다. callback을 공급한 대상 surface의 범위로 연결하고 다른 소비자에 새 이동을 자동 부여하지 않는다.                                                     |

## Practical Approach

1. 목록은 이미 있는 `openDetail`을 Action Bar 여백 경계까지 전달한다. 일반 Post·Quote는 자신의 ID, 순수 Repost는 direct Source ID를 유지한다. Reply binding과 social action fragment는 변경하지 않는다.
2. 현재 행은 상세 route 조합 지점이 canonical 상세 callback을 공급하고 PostDetailThread·PostLayout을 통해 전달하는 방안을 우선 검토한다. 같은 URL에 대한 router의 기존 처리와 history·scroll 정책은 유지하며 별도 reset 로직을 추가하지 않는다.
3. `PostActionSurface`의 상단 내부 padding, toolbar 루트, trailing group, 각 control slot에서 실제 비버튼 배경을 처리한다. 기존 `PostDetailBackground`를 재사용하는 방향을 우선 검토하되, 각 host가 자기 배경 입력만 소유하도록 한다. RepostAction·ReactionAction·More trigger의 private 렌더 경로까지 빠짐없이 확인한다.
4. Web pointer는 이동하는 여백에만 적용하고 자식 버튼의 기존 cursor·disabled 의미를 유지한다. 버튼이 visual row 밖으로 확장된 부분도 버튼 영역이다. target을 가로채는 overlay나 전체 toolbar Link를 만들지 않는다.
5. 공용 responder의 직접 target 판별·취소·스크롤 양보와 기존 카드 feedback을 유지한다. 새 제스처 상태 기계를 만들거나 전역 배경 판별을 느슨하게 바꾸는 접근은 필요성을 입증한 뒤에만 검토한다.
6. `docs/design/post-action-bar.md`와 `docs/design/post-thread.md`에 사용자에게 보이는 새 여백 이동 경계를 반영한다. 함수·prop 선택은 구현과 PR의 맥락으로 남긴다.

### 대상과 검증 입력

| 화면·행                         | 여백 목적지                | 별도로 유지할 액션                                      |
| ------------------------------- | -------------------------- | ------------------------------------------------------- |
| 타임라인 일반 Post·Reply        | 해당 Post                  | 해당 Post의 기존 액션                                   |
| 타임라인 Quote                  | Quote 자체                 | Quote의 액션과 direct Source preview 링크               |
| 순수 Repost·Quote를 재게시한 행 | direct Source Post·Quote   | 바깥 Repost의 disabled Reply, direct Source의 소셜 액션 |
| 타래 조상·하위 행               | 각 행의 상세 대상          | 각 행의 액션                                            |
| 타래 현재 행                    | 현재 Post의 canonical 상세 | 현재 Post의 기존 Reply·소셜 액션                        |

## Alternatives and Traps

- 여백을 소유한 host별로 기존 callback을 연결하는 방안을 권장한다. 단일 부모의 자식 입력을 모두 허용하는 방식은 disabled 버튼과 중첩 링크까지 잡을 수 있다.
- 전체 toolbar를 Link/Pressable로 감싸는 방안은 기존 sibling·입력 분리 계약에 맞지 않는다.
- 좌표 계산으로 버튼 영역을 매번 재구성하는 방안은 count 너비·Web 확장 target·Native target과 어긋날 위험이 있다. 실제 host 경계와 기존 입력 소유권을 먼저 활용한다.
- toolbar 높이 28px만 기준으로 여백을 고르면 Web 버튼의 확장된 36px 입력 영역을 잘못 분류할 수 있다.

## Risks / Limits

- pending 중 Native Pressable이 responder를 받지 않더라도 해당 버튼 입력이 부모의 상세 이동으로 넘어가지 않아야 한다.
- 메뉴 overlay·portal 안의 입력이 카드 feedback이나 navigation을 활성화하지 않는지 확인한다.
- 실제 좌표 검증은 button callback을 직접 호출하는 테스트와 구분한다. pathname만 비교하면 같은 경로의 중복 요청을 놓칠 수 있어 router 호출 횟수와 목적지도 확인한다.
- 이번 세션의 원인 설명은 정적 코드 근거다. 웹 재현·배포 revision·iOS·Android runtime 결과는 아직 없다.
- 변경은 클라이언트 UI에 한정한다. DB migration과 별도 flag를 추가할 근거는 확인되지 않았다.

## Open Questions

제품·보안·롤아웃·완료 경계를 바꾸는 미결정 사항은 발견하지 못했다. 실제 구현에서 새로운 선택이 드러나면 사용자 결정 경계에서 멈춘다.
