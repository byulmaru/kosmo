## MODIFIED Requirements

### Requirement: Reaction 요약 component

**Authority / Provenance:** `docs/domain/objects/reaction.md`의 조회 정책, `docs/design/reactions.md`의 Reaction 요약 row·Reaction People route, [PROD-938](https://linear.app/byulmaru/issue/PROD-938)의 포함 범위와 완료 조건. 클라이언트는 서버가 제공한 양수 Type별 count와 순서를 보존하는 한 줄 요약을 표시하고, token의 기존 toggle과 전용 People route 진입을 제공해야 한다(MUST). People 화면은 기존 조회 권한·페이지네이션·actor별 Relay 격리를 유지해야 한다(MUST).

#### Scenario: Type별 count 표시

- **WHEN** Post에 현재 Reaction이 존재한다
- **THEN** 서버가 제공한 현재 최초 Reaction 생성 시각 순서로 Type과 count를 표시한다
- **AND** count 증감이나 viewer 선택으로 순서를 재정렬하지 않으며 새 Type도 서버 응답 순서를 사용한다
- **AND** standalone `반응` 제목을 표시하지 않는다
- **AND** token은 Web 32px·iOS 44pt·Android 48dp 높이, radius 12, emoji 20, count 14, 내부 gap 4, 좌우 padding 8과 token gap 4를 사용한다
- **AND** selected token의 `primary`/`primaryHover` 배경 layer만 70% opacity이며 emoji·count는 100% opacity를 유지한다

#### Scenario: Reaction이 없는 Post

- **WHEN** 양수 `reactionCounts`가 없다
- **THEN** 요약 영역·빈 자리·zero-count Type을 합성하지 않는다

#### Scenario: 기존 Reaction token toggle

- **WHEN** 사용자가 양수 count의 token을 누른다
- **THEN** 기존 Quick Picker와 같은 controller로 해당 Type을 추가하거나 삭제한다
- **AND** token은 People 화면을 열지 않고 server-confirmed 선택·count와 pending·오류 동작을 보존한다
- **AND** selected Profile이 없으면 token은 disabled지만 People 진입점은 사용할 수 있다

#### Scenario: Reaction More geometry와 좁은 너비

- **WHEN** 요약의 가용 폭이 결정되거나 count·글꼴 크기·화면 폭이 바뀐다
- **THEN** 모든 token과 canonical Ellipsis가 완전히 들어가면 전체 token과 `반응한 프로필 보기` control을 표시한다
- **AND** 그렇지 않으면 뒤의 Type부터 제외하면서 숨겨진 Type 수 N의 실제 `+N` 폭을 다시 예약하여 완전히 들어가는 token만 표시한다
- **AND** N은 숨겨진 count의 합이 아니며 접근성 이름은 `숨겨진 반응 유형 N개, 반응한 프로필 보기`다
- **AND** token·control을 축소하거나 일부 자르지 않으며 wrap·가로 스크롤을 사용하지 않는다

#### Scenario: 목록·상세와 Reaction 대상

- **WHEN** 목록·상세·답글 알림·Wide Viewer의 People 진입점을 사용한다
- **THEN** 일반·Quote는 own Post, 순수 Repost는 source Post를 같은 reactionTarget으로 사용한다
- **AND** 요약의 Post body/source body 아래·Post Action Bar 위 배치를 보존한다
- **AND** Viewer에서 이동하면 열린 Viewer를 정리하고 목적지의 focus를 유지한다

#### Scenario: 전용 화면과 직접 진입

- **WHEN** People control 또는 공개 URL로 진입한다
- **THEN** `/:profileHandle/:postId/reactions`에서 PageHeader `반응한 사람` → pill filter → Profile 목록을 표시한다
- **AND** canonical 작성자·대상 Post 경로로 정규화하며 scrim·X·바깥 클릭 dismiss와 목록 내부의 중복 제목은 없다
- **AND** Web 중앙 600px column, Full RightRail, Mobile BottomTabBar를 유지하고 제목으로 focus를 옮긴다
- **AND** 조회할 수 없는 Post는 기존 route 오류·부재 표면을 사용하고 조회 권한을 우회하지 않는다

#### Scenario: 필터 선택과 URL

- **WHEN** 화면이 열리거나 선택 Type이 바뀐다
- **THEN** 서버의 양수 count 순서를 유지하고 유효한 `type` query를 선택한다
- **AND** query가 없거나 유효하지 않으면 서버 순서의 첫 양수 Type을 선택하며 양수 Type이 없으면 필터 없이 빈 목록을 표시한다
- **AND** 필터 변경은 현재 history 항목을 갱신하고 선택 tab의 focus를 유지하며 목록 위치를 초기화한다
- **AND** 선택 Type의 connection만 표시하고 목록 갱신을 보조 기술에 알린다

#### Scenario: 필터 펼침과 선택 보존

- **WHEN** 필터 입력에 6개를 초과하는 양수 Type이 있다
- **THEN** 접힌 상태는 앞 6개를 표시하며 선택 Type이 그 밖에 있으면 앞 5개와 선택 Type을 표시한다
- **AND** 나머지는 `나머지 반응 N개 모두 보기` 버튼으로 펼쳐 전체 Type을 wrap해서 표시하고 `반응 목록 접기`로 다시 접는다
- **AND** pill만 selected 상태의 tab/tablist이며 펼침·접기는 tablist 밖의 button이다
- **AND** 접힐 때 숨겨지는 control에 focus를 남기지 않는다

#### Scenario: 공용 Profile 행

- **WHEN** 선택 Type에 조회 가능한 Profile이 있다
- **THEN** 각 행은 Reaction emoji와 기존 ProfileListItem·FollowButton을 사용하며 bio가 있어도 숨긴다
- **AND** 팔로우·팔로잉·요청됨 상태와 프로필 링크를 기존 lifecycle로 제공한다
- **AND** separator는 인접한 행 사이에만 있고 pagination 영역의 별도 상단 border는 유지한다
- **AND** 서버가 숨긴 Profile을 복구하거나 count에서 빼지 않는다

#### Scenario: Back과 프로필 방문 복귀

- **WHEN** 사용자가 People 화면에서 Back을 실행한다
- **THEN** 앱 안의 이전 화면이 있으면 돌아가고 없으면 canonical Post 상세로 이동한다
- **AND** 기존 navigation scroll 복원 경계를 사용하며 존재하는 People 진입 control 또는 화면 fallback으로 focus를 복귀시킨다
- **AND** People 목록에서 프로필을 방문했다가 돌아오면 같은 Type과 기존 People scroll 위치를 복원한다

#### Scenario: Profile 목록 최초 조회 실패

- **WHEN** 선택한 Type의 최초 Profile 조회가 실패한다
- **THEN** header와 filter를 유지하고 목록 안에 오류와 해당 조회의 재시도를 표시한다
- **AND** snackbar·toast·전역 outlet을 요구하지 않는다

#### Scenario: Profile 목록 추가 page

- **WHEN** 다음 page가 있다
- **THEN** 기존 Relay connection과 cursor로 20개 단위로 추가 조회한다
- **AND** 중복 요청을 막고 이미 표시한 Profile을 중복 추가하지 않는다

#### Scenario: Profile 목록 추가 page 실패

- **WHEN** 추가 page 조회가 실패한다
- **THEN** 기존 행을 유지하고 같은 목록 위치에 오류와 재시도를 제공한다
- **AND** snackbar·toast를 요구하지 않는다

#### Scenario: Profile 목록 재진입과 actor 격리

- **WHEN** 같은 actor가 이전에 조회한 Type의 화면을 다시 방문한다
- **THEN** cache된 Profile을 먼저 표시하고 background에서 최신 목록을 조회한다
- **AND** selected Profile이 바뀌면 이전 actor Store의 행과 늦은 callback을 새 화면에 적용하지 않는다
- **AND** token mutation 오류와 Profile 조회 오류는 독립적으로 처리한다

#### Scenario: 현재 서버 계약과 UI 계약 검증

- **WHEN** Production Playground 또는 서버 통합 검증을 구성한다
- **THEN** 현재 허용된 여섯 Reaction Type만 사용한다
- **AND** 6종 초과 펼침·접기는 독립 UI Tests에서 검증하며 API·저장 가능한 Type 확장으로 해석하지 않는다
