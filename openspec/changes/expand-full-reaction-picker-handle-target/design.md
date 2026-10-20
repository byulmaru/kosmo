## Current Constraints

Working note다. 제품 범위는 PROD-1175, 상호작용 presentation은 `docs/design/reactions.md`와 `docs/design/accessibility.md`를 따른다.

- 조사 revision은 `c25e6aec1b9333c4c2e03fd49e20e94d73a551be`다. `FullReactionOverlay`는 Web에 `presentation="web"`, Native에 `presentation="mobile"`을 전달한다. 모바일 Web에는 이 시트 핸들이 없다.
- `FullReactionPicker`의 Native 시트는 공용 `BottomSheetSurface`를 사용한다. 실제 responder는 이 컴포넌트의 바깥 `handleTarget`에 있으며, 현재 행 높이는 48, 내부 `Pressable`은 56×48, 보이는 바는 36×4다. 부모는 기본 stretch 배치를 사용하므로 코드만으로 바깥 영역이 56 너비라고 단정할 수 없다.
- 현재 전이는 위로 끌어 펼치기, 펼친 상태에서 아래로 끌어 접기, 접힌 상태에서 아래로 끌어 닫기다. 짧은 이동과 responder 취소는 진행 중 이동을 되돌린다. 이 전이를 새로 설계하지 않는다.
- `MobileHandleExpansionContract`는 중앙 손잡이 클릭 뒤 높이만 확인한다. 좌우에서 시작한 드래그나 Native responder 전달을 증명하지 않는다.

## Practical Approach

1. 적용 빌드를 기록하고 상단 행의 실제 layout·hit boundary와 좌·중앙·우 드래그를 먼저 관찰한다. 현재 main에서 이미 동작하는 부분과 제보 빌드의 차이를 나눈다.
2. 기존 responder와 상태 전이를 재사용한다. 행 전체에서 입력이 전달되지 않는 부분만 고친다. 명시적 행 너비 또는 responder 배치 조정은 관찰 결과에 따라 선택하며, 무조건 `width: '100%'`를 추가하는 것으로 원인을 확정하지 않는다.
3. 시각적 바와 중앙 버튼의 접근성 활성화는 유지하고 드래그 영역만 같은 행의 좌우까지 보장한다. 검색·목록·backdrop까지 responder를 확장하지 않는다.
4. 공용 컴포넌트를 수정하면 `ActionMenu`의 비확장형 시트, disabled와 기존 닫기를 함께 확인한다. Picker만을 위한 새 범용 제스처 계층은 만들 필요가 없다.

## Alternatives and Traps

- 내부 버튼 너비만 늘리면 드래그보다 넓은 탭 동작까지 바뀔 수 있다. 요구한 범위와 기존 접근성 경계를 먼저 대조한다.
- 화면 전체 gesture capture나 목록 위 hit slop은 목록 스크롤·검색 입력을 가로챌 수 있다.
- 소스의 style 문자열 존재나 Web에서 Mobile presentation을 띄운 결과만으로 Native 성공을 선언하지 않는다.

## Risks / Limits

- 제보 기기·OS·앱 버전과 실제 원인은 미확인이다. 이번 세션은 runtime을 실행하지 않았다.
- 작은 화면·가로 화면·safe area·font scaling에서 행이 잘리지 않는지 확인한다. 공용 시트 수정이 필요하지 않으면 ActionMenu 범위를 늘리지 않는다.
- 데이터 migration이나 새 rollout 정책은 없다. 회귀가 생기면 이번 입력 영역 변경을 되돌릴 수 있으며, 이는 배포 승인을 뜻하지 않는다.

## Open Questions

미정인 제품 결정은 없다. 배포 빌드·실제 touch 전달 경계는 다음 구현 세션에서 확인할 사실이다.

## Implementation Checkpoint (2026-10-20)

- 사용자 정정으로 제보 환경은 iPhone 14 Pro Max의 앱이다. Chrome 제보는 철회됐으며 OS·앱 버전은 미확인이다.
- 바깥 행은 기존에 전체 너비를 사용하므로 불필요하게 너비를 다시 설정하지 않는다. 내부 Pressable의 실제 터치 대상을 중앙 56×48에서 행 전체 너비×48로 넓힌다. 보이는 바는 36×4와 중앙 위치를 유지한다.
- 같은 핸들 행의 좌우도 중앙과 같은 버튼 입력 경계로 연결하며 기존 부모 PanResponder의 임계값·펼치기·접기·닫기·취소 로직은 변경하지 않는다. 검색·목록은 핸들 행 밖의 시트 콘텐츠로 유지한다.
- Native JS renderer에서 실제 Pressability·PanResponder 입력을 검증하는 테스트와 브라우저 렌더링의 전체 행 button hit boundary 검증을 추가했다. Native Yoga layout·OS hit testing·실기기 재현의 증거는 아니며 CI 실행 결과도 아직 없다.
