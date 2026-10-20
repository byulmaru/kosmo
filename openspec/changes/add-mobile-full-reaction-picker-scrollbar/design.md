## Current Constraints

Working note다. 제품 범위와 사용자 결정은 PROD-1163에, presentation은 `docs/design/reactions.md`에 기록한다.

- 조사 revision은 `c25e6aec1b9333c4c2e03fd49e20e94d73a551be`다. Picker는 Browse·SearchResults에서 하나의 `FlatList`를 사용하고 `showsVerticalScrollIndicator={false}`를 지정한다. Empty·Loading에는 목록이 없다.
- 검색어가 바뀌면 `key={normalizedQuery}`로 목록을 다시 만들며, 기존 `SearchScrollResetContract`는 검색 결과의 첫 위치와 검색 focus 유지를 확인한다.
- 모바일 Web은 기존 `compactWeb` 조건인 `viewportWidth < breakpoints.compact`를 사용한다. Web dialog와 Native bottom sheet를 합치지 않는다. Native는 화면 폭과 글자 크기에 따라 48 이상의 이모지 target이 들어가는 열 수를 계산한다.
- 사용자 결정은 모바일 Web·iOS·Android 모두 적용, 스크롤 중에만 바 표시, 표시 중 바 드래그로 빠른 이동 지원이다. 상단 시트 핸들·검색 입력·Reaction controller는 각각 기존 책임을 유지한다.

## Practical Approach

1. 현재 `FlatList`의 실제 content extent, viewport와 offset을 입력으로 사용한다. virtualization으로 현재 mount된 행 수를 전체 목록 길이로 계산하지 않는다.
2. 기존 플랫폼 표시기를 재사용할 수 있는지 먼저 확인한다. 단순히 표시기 prop을 켠 사실만으로 세 플랫폼의 드래그와 표시 수명 계약을 만족했다고 판단하지 않는다. 부족한 경우 Picker에 한정한 얇은 바와 입력 경계로 보완한다. 공용 라이브러리나 범용 scroll manager를 전제로 하지 않는다.
3. 목록 오른쪽에 이모지 target과 겹치지 않는 공간을 확보한다. 시각적 두께와 hit region을 분리하고 기존 theme token과 Web·iOS·Android target 기준을 사용한다. 가용 폭이 줄면 실제 목록 폭으로 열 수를 다시 구하며 이모지 target을 축소하지 않는다. 숨겨진 바는 입력을 받지 않는다.
4. 위치는 실제 scroll event로 갱신하고 바 드래그는 같은 목록의 기존 imperative scroll handle로 전달한다. 새 ref가 필요하면 플랫폼 handle을 위한 이유를 설명하며 derived 값과 이전 props 저장용 ref는 만들지 않는다.

표시 상태의 기본 흐름은 `hidden → scrolling → dragging → hidden`이다. 관성 스크롤 중에는 표시하고 바를 잡으면 조작이 끝날 때까지 유지한다. 종료·취소 뒤에는 일반 목록 스크롤을 다시 사용할 수 있어야 한다. 검색 변경·Empty·Loading 전환이나 닫기로 조작 대상이 사라지면 해당 조작을 정리한다. 숨김 지연과 전환 수치는 구현에서 기존 token과 실제 touch 사용성을 확인해 정하며 제품의 새 정책으로 고정하지 않는다.

위치 계산의 검토 기준은 `R = max(0, contentHeight - viewportHeight)`다. track 길이를 `T`, thumb 길이를 `L`이라고 하면 이동 길이는 `D = max(0, T - L)`이고, 바의 위치와 목록 offset은 각 범위 안에서 비례하도록 맞춘다. `R`, `D`, content 크기가 0이거나 측정 전이면 나누지 않는다. overscroll은 유효 범위로 제한한다. 이 식은 권장 접근이며 구현을 복제한 테스트로 대체하지 않는다.

Web에서 별도 control을 만들면 접근 가능한 이름·현재 위치와 keyboard 이동을 연결한다. Native는 지원되는 adjustable action 또는 기존 플랫폼 목록의 접근 가능한 이동 수단을 유지한다. assistive technology focus를 받은 조작은 보이지 않는 target이 되지 않게 하고, 매 scroll event마다 announcement하지 않는다.

## Alternatives and Traps

- 항상 보이는 바와 표시 전용 바는 사용자 결정과 다르다.
- 이모지 위 투명 hit layer, 화면 전체 pan capture와 단순 overlay는 선택·시트 조작을 가로챌 수 있다.
- query remount 전의 offset이나 content 높이를 재사용하면 짧은 결과에 잘못된 바가 남을 수 있다. viewport·font scaling·sheet 높이 변경도 같은 실제 측정값으로 다시 계산한다.
- 바 드래그 중 검색 변경이나 unmount를 위한 별도 비동기 경쟁 계층을 추가하지 않는다. 현재 목록 lifecycle과 플랫폼 gesture 정리부터 사용한다.

## Risks / Limits

- 제보 환경과 플랫폼별 기존 표시기의 실제 드래그 지원은 아직 확인하지 않았다. 이번 세션에서는 앱을 실행하지 않았다.
- 긴 목록의 빠른 이동에서도 기존 virtualization과 반응 선택을 유지해야 한다. 측정 전·크기가 바뀐 순간·취소 뒤를 focused validation에 포함한다.
- 데이터 migration이나 새 rollout 정책은 없다. 문제 시 이번 Picker 변경을 되돌릴 수 있다. 원래 제보 환경 확인과 실제 runtime 수용은 다음 단계에 남긴다.

## Open Questions

미정인 제품 결정은 없다. 구체적인 바 두께·배치·숨김 지연과 플랫폼 API 선택은 확정된 동작을 만족하는 구현 선택이다.
