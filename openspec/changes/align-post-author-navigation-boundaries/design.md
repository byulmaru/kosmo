## Current Constraints

이 문서는 구현을 돕는 working note다. 다음 세션에서는 Linear·canonical·실제 소스를 다시 확인하고 더 작은
구현이 가능하면 접근을 바꿀 수 있다.

- `ProfileNameBlock.tsx`의 기본 root는 `flex: 1`이고, 링크가 이름·핸들 뒤의 남는 폭까지 차지한다.
- `PostListItem.tsx`는 일반 Post와 순수 Repost의 직접 Source를 `PostListRow`로 표시한다. 카드 상단
  padding과 각 배경 responder는 상세 대상으로 연결돼 있다.
- Quote의 작성자와 직접 Source 작성자는 `PostSourcePresentationView.tsx`의 `PresentationLink`,
  `authorSlot`, `Author` 조합을 사용한다. 기본 이름 블록만 바꾸면 이 경로의 넓은 링크가 남을 수 있다.
- 최신 main의 프로필 진입은 `NavigationLink resetScroll`을 사용한다. 작성자 조합을 바꿔도 기존 scroll
  초기화·navigation guard·새 탭 의미를 보존한다.
- 순수 Repost의 attribution과 주된 Source, Quote의 자체 Post와 Source preview는 서로 다른 identity다.
  `PostDetailThread.tsx`의 조상·하위 행은 `PostListItem`, 현재 행은 `PostLayout`을 사용한다.
- `ProfileNameBlock`은 상세·Profile Hero·알림·Composer·설정에서도 사용한다. 전체 기본값을 바꾸기 전에
  이번 게시글 작성자 경계를 다른 소비자의 표시 계약과 구분해야 한다.

## Practical Approach

1. 작성자와 작성 시각 사이의 가용 폭 안에서 프로필 그룹을 표시 내용에 맞추고, 닉네임·핸들 중 더 넓게
   표시된 텍스트를 두 줄의 공통 오른쪽 경계로 삼는다. Avatar의 기존 프로필 입력은 유지한다.
2. 기존 React Native layout과 공용 Link/Pressable을 먼저 사용한다. 프로필 그룹과 그 바로 위의 기존 여백이
   같은 목적지를 갖도록 배치하되 카드 크기·본문 시작선·attribution·시간 target은 보존한다.
3. 남는 헤더 여백은 그 위치가 표시하는 Post의 기존 상세 대상에 연결한다. Quote Source header는 직접
   Source를 대상으로 하며, preview 전체나 나머지 빈 padding까지 하나의 Link로 감싸지 않는다.
4. 일반 행과 Quote 작성자 조합을 함께 맞춘다. 공용화가 필요하면 실제 production 조합의 중복 책임만
   줄이고, 전역 navigation이나 새 좌표 정책을 만들지 않는다.

### 목적지 확인표

| 표시 위치                                   | 프로필 영역과 바로 위 여백           | 오른쪽 헤더 여백의 상세 대상 |
| ------------------------------------------- | ------------------------------------ | ---------------------------- |
| 일반 Post·Reply                             | 표시 작성자                          | 그 Post·Reply                |
| Quote 바깥 작성자                           | Quote 작성자                         | Quote 자체                   |
| Quote의 직접 Source 작성자                  | 직접 Source 작성자                   | 직접 Source                  |
| 순수 Repost의 주된 작성자                   | 직접 Source 작성자                   | 직접 Source                  |
| Source가 Quote인 순수 Repost의 내부 preview | 그 Quote가 직접 인용한 Source 작성자 | 해당 preview의 Source        |
| 타래 조상·하위 목록 행                      | 그 행에 표시한 작성자                | 그 행의 기존 상세 대상       |

Repost attribution은 재게시자 프로필로 이동하는 기존 동작을 유지한다. 타래의 현재 `PostLayout`과
비대화형 preview는 별도의 소비자로 회귀를 확인하고, 기존에 없던 배경 이동을 전역으로 추가하지 않는다.

## Alternatives and Traps

- **표시 내용에 맞춘 선언형 layout:** 첫 선택이다. 가용 폭과 truncation을 같은 layout에서 처리할 수 있다.
  실제 Web·Native 결과가 요구된 경계를 만드는지는 좌표 입력으로 확인해야 한다.
- **텍스트 측정 상태로 링크 폭 계산:** layout만으로 해결하지 못한 실제 근거가 있을 때 검토한다. 원래
  문자열의 폭, font 로딩과 확대, Native 단위가 다른 점을 처리해야 하며 관리할 상태와 재계산이 늘 수 있다.
- **큰 overlay·hitSlop·부모의 좌표 분기:** 작성 시각·attribution·외부 링크와 겹치기 쉽고 focus 경계와 실제
  입력이 달라질 수 있다. 이번 요구를 위해 우선 도입할 이유는 확인하지 못했다.

## Risks / Limits

- 상단 여백을 이동시키는 layout 변경으로 텍스트·미디어·Action Bar가 밀리거나 target이 겹칠 수 있다.
- Node renderer와 mock layout은 실제 글꼴 폭·잘림·hit testing을 증명하지 못한다. Web browser의 실제
  좌표와 Native runtime의 탭·스크롤을 별도 근거로 남긴다.
- Web은 링크의 href·keyboard·새 탭 의미를 유지하고, Native는 기존 target·focus와 인접 영역 비중첩을
  확인한다. 새 접근성 예외를 이 계획으로 정하지 않는다.
- PROD-1167·1168도 관련 파일을 수정할 수 있다. 구현을 시작할 때 최신 diff를 대조하고 각 이슈의 범위를
  유지한다. 데이터 migration은 없으며 rollback은 해당 UI 변경을 되돌리는 범위다.
- 이번 조사는 정적 코드와 authority 확인이다. 실제 배포본과 browser·기기에서 원인을 재현한 증거는 없다.

## Open Questions

미정인 제품·보안·롤아웃 결정은 없다. 실제 layout 방식은 구현과 focused 검증으로 선택한다.
