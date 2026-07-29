# Profile Tag 편집·공개 표시

## 목적

Local Profile Owner가 기존 Profile 편집 흐름에서 구조화된 Profile Tag를 관리하고, 공개 Profile 화면이 같은
태그와 순서를 Web·Android·iOS에서 일관되게 표시하도록 한다.

## 편집

- 기존 Profile 편집 화면에 bio와 함께 이해할 수 있는 `프로필 태그` 섹션을 둔다.
- 저장된 태그는 현재 순서의 TagChip으로 표시한다. 추가한 태그는 목록 끝에 놓고 제거하면 남은 순서를
  유지한다.
- 사용자가 저장 전 현재 TagChip 순서를 바꿀 수 있는 명시적 제어를 제공한다. drag gesture를 사용한다면
  키보드와 스크린리더에서도 같은 이동을 수행할 대안을 함께 제공한다.
- 입력은 선택적인 앞 `#`를 허용하지만 chip과 공개 화면에는 정규화된 이름 앞에 `#`를 한 번만 표시한다.
- 최대 5개에 도달하면 추가 입력을 비활성화하고 이유를 텍스트와 접근성 상태로 알린다.
- 빈 값, 허용하지 않는 문자, 20자 초과와 정규화 뒤 중복은 저장 전에 필드 가까이 안내한다. 서버 검증 실패도
  같은 항목에 연결하되 저장된 기존 목록은 유지한다.
- Tag 목록은 Profile의 다른 편집 값과 같은 저장 action에 포함한다. 저장 중 중복 제출을 막고 실패 뒤 현재
  입력과 순서를 보존해 재시도할 수 있게 한다.

## 공개 표시

- 공개 Profile의 bio 다음, 주요 Profile 통계나 콘텐츠 목록보다 앞에 TagChip 목록을 저장 순서로 표시한다.
- 태그가 없으면 빈 섹션이나 안내 문구를 표시하지 않는다.
- TagChip은 줄바꿈할 수 있으며 긴 허용값, 5개 전체와 좁은 화면에서도 Profile 본문을 가로로 넘치게 하지
  않는다.
- 검색/navigation을 PROD-529가 전달하기 전에는 TagChip을 비대화형으로 표시한다. PROD-529 전달 후에는 [Profile Tag 검색 디자인](./profile-tag-search.md)의 검색 URL로 이동하는 링크 또는 버튼으로 활성화한다.
- Profile이 공개 조회 조건을 통과하지 않으면 Profile Tag만 별도로 표시하지 않는다.

## 플랫폼과 접근성

- 공용 화면은 React Native primitive와 기존 theme token을 사용하고 Web·Android·iOS가 같은 정보 구조를
  공유한다.
- 제거·이동 같은 편집 action은 최소 44×44 touch target과 동작을 설명하는 accessibility label/state를
  제공한다.
- 색만으로 validation, 선택, disabled 상태를 구분하지 않는다.
- 별도 breakpoint나 Profile Tag 전용 foundation token은 추가하지 않는다. 기존 spacing, color, typography,
  radius와 공용 breakpoint를 사용한다.

## 제외 범위

- [Profile Tag 검색 디자인](./profile-tag-search.md)에 정의된 태그 선택 navigation 자체
- 자동완성, 추천, trend와 관련도 표시
- Remote Profile Tag 편집·표시와 ActivityPub 표현
- Hashtag Post List 또는 검색 결과 화면 변경
