# 컬러 토큰 정책

## 토큰 이름으로 참조한다

컬러 토큰의 hex 값은 초안 상태라 바뀔 수 있다. 디자인과 코드 모두 hex 값(`#fce79a` 등)이 아니라 토큰 이름(`primary`, `textPrimary` 등)으로 참조한다.

- 토큰 이름은 유지된다.
- hex 값과 라이트/다크 매핑은 바뀔 수 있다.

## 라이트/다크 듀얼 모드

Color 변수 컬렉션은 라이트/다크 두 모드를 가진다. 새 컬러 토큰을 추가할 때는 반드시 양쪽 모드 값을 모두 정의한다.

## Accent

- `accent`는 Unread dot처럼 작지만 분명한 강조 표시에 사용한다.
- `onAccent`는 `accent` 배경 위에 텍스트나 아이콘이 필요할 때 사용하는 짝 토큰이다. 현재 숫자 없는 Unread dot은 foreground content가 없어 `accent`만 사용한다.
- 현재 Unread dot의 light/dark 외관은 각각 기존 `text`와 같은 값을 사용하지만, component는 `text`가 아니라 `accent`를 참조해 향후 강조색 변경을 한 곳에서 수행할 수 있게 한다.
