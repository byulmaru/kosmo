# Reaction Quick Picker

Reaction Quick Picker는 현재 제공된 Reaction option을 빠르게 선택하는 펼쳐진 패널이다. option 목록과 상태는 부모가 공급하며, Picker는 시각 표현과 toggle intent만 소유한다.

## 형태

- 바깥 컨테이너는 border가 있는 둥근 직사각형이며 radius는 16px이다.
- 각 option은 44×44px의 둥근 사각형이며 radius는 12px이다.
- option 자체에는 border를 표시하지 않는다.
- 선택 여부는 border가 아니라 배경색으로만 구분한다.
- 오류 상태에도 빨간 border를 표시하지 않는다. 마지막 선택 배경은 유지하고 접근성 문구와 재시도 동작으로 오류를 전달한다.

## Pending과 Disabled

- pending option의 이모지는 그대로 표시한다.
- 투명한 overlay가 option의 네 방향을 0으로 채워 44×44px 전체를 덮고, 가운데의 큰 원형 loading animation만 표시한다.
- overlay는 이모지 뒤에 렌더되는 sibling의 paint order를 사용하며 별도 `zIndex`를 두지 않는다.
- pending option만 입력을 막고 다른 option은 계속 선택할 수 있다.
- Picker 전체가 disabled이면 비활성 UI를 표시하지 않고 Picker를 렌더링하지 않는다.

## 유지하는 계약

- 부모가 공급한 option 순서와 opaque ID를 그대로 사용한다.
- 서로 다른 Reaction Type은 동시에 선택될 수 있다.
- option은 button role, pressed·busy 상태와 상태별 접근성 label을 제공한다.
- trigger, popover 위치, Post Action Bar 배치, mutation·Relay/cache와 custom emoji Full Picker는 이 컴포넌트의 범위가 아니다.

## 검증

- Storybook interaction에서 border 없는 option, selected 배경, pending overlay, 오류 재시도와 disabled 시 미렌더링을 검증한다.
- 390px와 600px Web viewport에서 여섯 option이 한 줄을 유지하고 각 target이 44×44px인지 확인한다.
