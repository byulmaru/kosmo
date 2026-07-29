# Profile Tag 검색

## 목적

로그인 사용자가 사람 검색에서 Profile Tag를 정확히 찾고, 공개 Profile의 TagChip을 선택해 같은 검색
상태로 이동하도록 Web·Android·iOS의 정보 구조와 상태 표현을 일치시킨다.

## 검색 입력과 URL

- 사람 검색 `people` 모드에서 `#`로 시작하는 입력은 태그 검색으로, 그 밖의 입력은 기존 handle 검색으로
  처리한다.
- 태그 입력은 Hashtag 정규화를 적용하고 화면에는 정규화된 이름 앞에 `#`를 한 번만 표시한다.
- 직접 입력과 공개 Profile의 TagChip 선택은 `/search?tab=people&q=%23<normalized-name>` URL을 공유한다.
- 검색 화면은 보호 라우트의 로그인 정책을 따르며, 인증되지 않은 사용자는 기존 로그인 흐름으로 이동한다.

## 결과와 상태

- 태그 결과는 공개 조회 가능한 Local Profile만 기존 Profile 목록 아이템으로 표시한다. Remote Profile과
  원격 조회는 표시하지 않는다.
- 결과는 관련도나 알파벳순을 표시하지 않고 안정적인 cursor 순서를 사용한다. 한 페이지는 최대 20개이며,
  다음 페이지는 기존 사람 검색의 loading/error/retry/종료 상태를 따른다.
- 결과가 없으면 입력한 `#태그`를 포함한 빈 상태를 보여준다.
- 정규화 실패는 입력 가까이에 안내하고 검색 요청을 보내지 않는다.
- 검색 또는 다음 페이지 요청이 실패해도 이미 표시된 결과와 handle 검색 상태는 유지하며 재시도할 수 있다.

## TagChip navigation

- 공개 Profile이 조회 조건을 통과하면 저장 순서의 TagChip을 링크 또는 버튼으로 표시한다.
- TagChip에는 `#<normalized-name>`과 목적을 설명하는 접근성 이름을 제공한다.
- 선택 시 태그 검색 화면으로 이동하며, 직접 검색과 동일한 결과·pagination 계약을 사용한다.
- 기존 Profile Tag 편집의 순서·최대 5개·정규화 표시 규칙은 [Profile Tag 편집·공개 표시](./profile-tags.md)를
  따른다.

## 제외 범위

- 태그 부분 일치, 자동완성, 추천, trend와 관련도 랭킹
- 일반 full-text 또는 게시글·미디어 검색
- Remote Profile Tag, ActivityPub 표현, 검색 중 원격 조회·refresh·materialization
- 별도 디자인 토큰, breakpoint, 검색 전용 시각 체계
