# Profile Tag 편집·공개 표시

## 목적

Local Profile Owner가 현재 선택한 Active Profile의 기존 편집 흐름에서 구조화된 Profile Tag를 관리하고, 공개
Profile 화면이 같은 태그를 Web·Android·iOS에서 일관되게 표시하도록 한다.

## 편집

- 기존 Profile 편집 화면에 bio와 함께 이해할 수 있는 `프로필 태그` 섹션을 둔다.
- 저장된 태그는 TagChip으로 표시한다. 사용자는 태그를 추가하거나 기존 TagChip을 제거할 수 있다.
- Profile Tag 관계·API·공개 노출은 순서를 보장하지 않고 reorder UI를 제공하지 않으며, 입력 또는 서버 응답의
  안정적인 순서가 유지된다고 가정하지 않는다.
- 입력은 선택적인 앞 `#`를 허용하지만 chip과 공개 화면에는 Hashtag가 보존한 Display Hashtag Name 앞에
  `#`를 한 번만 표시한다. canonical lowercase 이름은 identity·중복 판정에만 사용한다.
- 빈 값, [Hashtag Name 규칙](../domain/objects/hashtag.md)에 맞지 않는 문자, 정규화 결과의 Unicode code point
  20자 초과와 동일 Hashtag identity 중복은 저장 전에 필드 가까이 안내한다. 서버 검증 실패도 같은 항목에
  연결하되 저장된 기존 목록은 유지한다.
- Tag 목록은 Profile의 다른 편집 값과 같은 저장 action에 포함한다. 저장 중 중복 제출을 막고 실패 뒤 현재
  입력을 보존해 재시도할 수 있게 한다.

## 공개 표시

- 공개 Profile의 bio 다음, 주요 Profile 통계나 콘텐츠 목록보다 앞에 TagChip 목록을 표시한다.
- TagChip 목록은 안정적인 표시 순서에 의존하지 않는다.
- 태그가 없으면 빈 섹션이나 안내 문구를 표시하지 않는다.
- TagChip 목록은 chip 사이에서 여러 줄로 감쌀 수 있으며, 긴 허용값과 좁은 화면에서도 Profile 본문을 가로로
  넘치게 하지 않는다.
- PROD-529는 표시 전용 TagChip visual과 편집 책임을 유지하면서 공개 Profile의 진입점을 [Hashtag 관련 Profile 목록 탐색](./hashtag-related-profiles.md)으로 이동하는 링크로 활성화한다. PROD-525는 완료된 API·client slice의 종단간 정합성 검증과 shared OpenSpec archive를 소유한다.
- Profile이 공개 조회 조건을 통과하지 않으면 Profile Tag만 별도로 표시하지 않는다.

## 플랫폼과 접근성

- 공용 화면은 React Native primitive와 기존 theme token을 사용하고 Web·Android·iOS가 같은 정보 구조를
  공유한다.
- 편집기와 공개 Profile이 공유하는 TagChip은 시각 높이 `32`를 유지하고 표시 text를 한 줄로 제한하며, 너비를
  넘는 Display Hashtag Name은 ellipsis로 생략한다. 시각적으로 생략해도 저장된 이름을 바꾸지 않고 접근성 이름에는
  전체 `#<Display Hashtag Name>`을 제공한다.
- 제거 action은 시각 크기 `32×32`를 유지하고 실제 입력 target은 Web `32×32 CSS px`, iOS `44×44 pt`,
  Android `48×48 dp`로 제공한다. 공용 component는 시각 geometry와 platform별 입력 target을 분리한다.
- 현재 Profile Tag 제품 출시와 runtime 검증 범위는 Web이다. iOS·Android 실제 기기·simulator QA는
  `PROD-527` PR readiness와 구현 완료 조건에서 제외하고 Native 출시 gate로 미루되, 공용 구현의 플랫폼별
  target mapping은 유지한다. 현재 자동화는 React Native Web의 Web target과 layout만 실행하므로 이를
  iOS·Android target 또는 Native runtime 완료 증거로 사용하지 않는다.
- Native 출시 전에는 iOS·Android 실제 환경에서 플랫폼별 target, 인접 action 비중첩, 여러 줄 wrapping과 접근성
  동작을 다시 검증한다.
- text action은 최소 높이 `36`의 compact rhythm을 사용한다.
- 제거 같은 편집 action은 동작과 대상 Tag를 설명하는 accessibility label/state를 제공한다.
- 색만으로 validation, 선택, disabled 상태를 구분하지 않는다.
- 별도 breakpoint나 Profile Tag 전용 foundation token은 추가하지 않는다. 기존 spacing, color, typography,
  radius와 공용 breakpoint를 사용한다.

## 제외 범위

- [Hashtag 관련 Profile 목록 탐색](./hashtag-related-profiles.md)에 정의된 TagChip navigation 자체
- 자동완성, 추천, trend와 관련도 표시
- Remote Profile Tag 편집·표시와 ActivityPub 표현. 이 제외는 별도 관련 Profile 탐색에서 이미 저장된 Remote
  관계를 공용 Profile visibility 아래에서 읽는 동작은 제외하지 않는다.
- Hashtag Post List 또는 검색 결과 화면 변경

## 전달 경계

- `PROD-491`은 Profile 편집 presentation 안의 controlled Profile Tag editor, 로컬 추가·제거,
  client validation과 Storybook 상태를 제공한다.
- `PROD-527`은 위 editor를 다시 만들지 않고 Profile Tag mutation·server validation·Relay 상태에 연결하며 공개
  Profile 표시를 제공한다.
- `PROD-526`은 저장·정규화·권한·GraphQL 기반을 제공하고 `PROD-522`는 세 결과의 통합 검증과 OpenSpec
  archive를 소유한다.
- `PROD-529`는 공개 TagChip의 exact Hashtag identity link와 관련 Profile client route·목록 상태를 제공하고,
  `PROD-525`는 PROD-528 API와의 통합 검증 및 shared OpenSpec archive를 소유한다.
