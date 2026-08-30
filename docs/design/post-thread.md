# Post Detail Thread

Post 상세 thread는 API가 제공한 조상·현재·하위 Post 순서와 직접 관계만 표시하고, 현재 Post를 상세 앵커로 유지한다. 이 문서는 Reply thread의 현재 presentation과 row boundary 소유권을 정의한다.

## Authority

- `PROD-422`: production Reply thread data·route integration
- `PROD-593`: thread row 구분선 정리
- `PROD-866`: canonical PostLayout·connector geometry 정렬
- `docs/design/colors.md`: 저강도 콘텐츠 행 경계의 `border/subtle` semantic token
- Figma `PostLayout` 4686:12079, Center thread 4762:17631

## 렌더링과 소유권

- 조상과 하위 Reply는 기존 목록 Post와 같은 정보 밀도의 `PostListItem`으로 표시하고, 현재 Post는 기존 상세 `PostLayout`으로 앵커를 만든다.
- `PostThreadLayout`은 caller가 공급한 item, role, 순서, direct connector metadata와 thread row boundary presentation을 소유한다.
- caller는 API 결과, 관계 metadata, pagination, loading과 오류 상태를 소유한다. `PostThreadLayout`은 공급되지 않은 관계를 추론하거나 숨겨진 Post를 암시하지 않는다.
- 각 Post renderer는 자신의 Profile·Post navigation과 nullable direct Repost Source presentation을 소유한다. thread layout은 Source를 별도로 선택하거나 중복 렌더링하지 않는다.
- 상세 thread는 조상·현재·하위 Reply의 관계를 이미 connector와 행 순서로 제공하므로, 일반 목록용
  `{displayName}님에게 답글` attribution을 어느 행에도 중복 표시하지 않는다. 조상과 하위가 공용
  `PostListItem`을 사용하더라도 상세 thread caller가 이 목록 전용 metadata를 명시적으로 끈다.

## Row boundary

- N개 thread row 사이에 N-1개의 구분선을 표시한다. 마지막 행과 단일 행에는 구분선을 표시하지 않는다.
- 구분선은 `theme.borderSubtle` 색상의 1px 선이며 왼쪽 64px, 오른쪽 8px inset을 사용한다.
- 왼쪽 64px은 connector와 겹치지 않는 thread row boundary inset이다. 현재 `PostLayout`의 Body·Engagement는
  48px Avatar가 있는 Header와 달리 current row의 왼쪽 8px에서 full width로 시작하므로 divider와 본문 시작선을
  일치시키지 않는다.
- thread 안의 `PostListItem`은 자체 row divider를 끄고 `PostThreadLayout`의 구분선만 사용한다. Home·Profile·Bookmark 등 thread 밖 목록의 기본 divider는 유지한다.
- Home timeline과는 `border/subtle` token과 1px 시각 무게만 공유하며 geometry는 thread 관계 표현에 맞게 독립적으로 유지한다.

## Connector

- connector metadata는 caller가 공급하되 canonical Center thread는 조상 구간과 마지막 조상→현재 경계만
  표시한다. 현재→첫 하위 Reply와 하위 Reply 사이에는 connector를 그리지 않는다.
- current row는 좌우 8px/12px, 상하 16px/4px padding을 사용한다. 마지막 조상→현재 connector와 current
  Before connector는 48px Avatar 중심선 x=32에 맞추고 supplied visibility 경계에서 종료한다.
- 가로 구분선은 connector 오른쪽에서 시작하며 connector와 교차하지 않는다.

## 검증과 rollout

- Storybook에서 N-1 구분선, 마지막·단일 행 예외, 1px `theme.borderSubtle`, 64px/8px inset, current row의
  8px/12px 좌우 padding, 48px Avatar와 full-width Body·Action Bar, 조상→현재 connector, descendant connector
  생략, connector 비중첩, thread 내부 중복 border 제거와 thread 밖 기본 divider 유지를 검증한다.
- Reply 대상 attribution이 일반 목록에서는 유지되지만 상세 thread의 조상·현재·하위 모든 행에서는
  표시되지 않는지 검증한다.
- Web Light·Dark 대표 Storybook에서 구분선 x=64, connector x=32~34, 오른쪽 inset 8px과 비중첩을 확인한다.
- iOS·Android 실기기 paint와 입력 동작 확인은 출시 gate에 남긴다.
