# Banner

## 역할과 경계

Banner는 화면 안에 계속 보이는 중립적인 맥락 정보를 담는 인라인 surface다. 메시지는 본문이며 제목이나 severity를 나타내지 않는다. 필요하면 소비처가 action과 닫기 동작을 제공한다.

Banner는 시간이 지나면 사라지는 Toast나 의미가 정해진 Info·Success·Warning·Danger feedback을 대신하지 않는다. Banner는 severity, 자동 닫힘, retry 정책을 갖지 않는다.

소비처는 Banner를 표시할 조건, 메시지와 선택적 action을 소유한다. `dismissalKey`가 있으면 Banner가 해당 브라우저에서 닫힘 상태를 복원하고 기록한다. 브라우저 기록을 읽거나 쓸 수 없어도 현재 표시에서는 닫을 수 있으며, `dismissalKey`가 없으면 닫기 control을 표시하지 않는다. 소비처는 필요한 경우 `dismissDisabled`로 닫기를 막을 수 있다.

## 중립 시각 계약

- 배경은 `background/surface`, 경계는 `border/default` 1px를 사용한다. Light·Dark에서 같은 semantic role을 유지한다.
- 모서리 반경은 `8px`, 수평 padding은 `12px`, 수직 padding은 `8px`, 내용 사이 간격은 `8px`다.
- 메시지는 `foreground/primary`의 `UI/Copy/L` 본문이다. 한 줄 제목으로 승격하지 않고, 가용 폭에서 자연스럽게 줄바꿈해 전체 내용을 표시한다.
- 선택적 장식 icon은 `20px`, stroke `2`, `foreground/secondary`를 사용한다. 배경·badge나 고정된 icon slot을 추가하지 않는다.
- 선택적 action은 소비처가 제공한다. Primary action의 색과 interaction은 Banner가 아니라 사용된 action control이 소유한다.
- 선택적 닫기 control은 공용 `IconButton`의 색상, focus, interaction과 platform target 계약을 따른다.

## Storybook 예시

대표 Storybook 예시는 알림이나 오류에 한정하지 않고 프로필 정보처럼 일반 맥락을 보여 준다. 긴 메시지와 Light·Dark 양쪽에서 줄바꿈과 조합을 확인한다. Storybook 검증은 실제 route·권한·저장·network 동작을 증명하지 않는다.
