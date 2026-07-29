# Profile Tag 편집·공개 표시

## 목적

Local Profile Owner가 기존 Profile 편집 흐름에서 구조화된 Profile Tag를 관리하고, 공개 Profile 화면이 같은
태그를 Web·Android·iOS에서 일관되게 표시하도록 한다.

## 편집

- 기존 Profile 편집 화면에 bio와 함께 이해할 수 있는 `프로필 태그` 섹션을 둔다.
- 저장된 태그는 TagChip으로 표시한다. 사용자는 태그를 추가하거나 기존 TagChip을 제거할 수 있다.
- reorder UI를 제공하지 않으며 입력 또는 서버 응답의 안정적인 순서가 유지된다고 가정하지 않는다.
- 입력은 선택적인 앞 `#`를 허용하지만 chip과 공개 화면에는 정규화된 이름 앞에 `#`를 한 번만 표시한다.
- 빈 값, [Hashtag Name 규칙](../domain/objects/hashtag.md)에 맞지 않는 문자, 정규화 결과의 Unicode code point
  20자 초과와 동일 Hashtag identity 중복은 저장 전에 필드 가까이 안내한다. 서버 검증 실패도 같은 항목에
  연결하되 저장된 기존 목록은 유지한다.
- Tag 목록은 Profile의 다른 편집 값과 같은 저장 action에 포함한다. 저장 중 중복 제출을 막고 실패 뒤 현재
  입력을 보존해 재시도할 수 있게 한다.

## 공개 표시

- 공개 Profile의 bio 다음, 주요 Profile 통계나 콘텐츠 목록보다 앞에 TagChip 목록을 표시한다.
- TagChip 목록은 안정적인 표시 순서에 의존하지 않는다.
- 태그가 없으면 빈 섹션이나 안내 문구를 표시하지 않는다.
- TagChip은 줄바꿈할 수 있으며 긴 허용값과 좁은 화면에서도 Profile 본문을 가로로 넘치게 하지 않는다.
- Profile Tag 검색이 별도로 전달되기 전에는 TagChip을 링크나 버튼으로 표현하지 않는다.
- Profile이 공개 조회 조건을 통과하지 않으면 Profile Tag만 별도로 표시하지 않는다.

## 플랫폼과 접근성

- 공용 화면은 React Native primitive와 기존 theme token을 사용하고 Web·Android·iOS가 같은 정보 구조를
  공유한다.
- 제거 action은 compact `32×32` 시각 크기와 실제 입력 target을 분리한다. Web target은 최소 32×32 CSS px,
  iOS hit region은 `44×44 pt`, Android touch target은 `48×48 dp`로 제공하고 동작을 설명하는
  accessibility label/state를 유지한다.
- 색만으로 validation, 선택, disabled 상태를 구분하지 않는다.
- 별도 breakpoint나 Profile Tag 전용 foundation token은 추가하지 않는다. 기존 spacing, color, typography,
  radius와 공용 breakpoint를 사용한다.

## 제외 범위

- 태그 선택 시 검색 화면으로 이동하는 navigation
- 자동완성, 추천, trend와 관련도 표시
- Remote Profile Tag 편집·표시와 ActivityPub 표현
- Hashtag Post List 또는 검색 결과 화면 변경
