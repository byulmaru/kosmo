# 컬러 토큰 정책

## 토큰 이름으로 참조한다

컬러 토큰의 hex 값은 초안 상태라 바뀔 수 있다. 디자인과 코드 모두 hex 값(`#fce79a` 등)이 아니라 토큰 이름(`primary`, `textPrimary` 등)으로 참조한다.

- 토큰 이름은 유지된다.
- hex 값과 라이트/다크 매핑은 바뀔 수 있다.

## 라이트/다크 듀얼 모드

Color 변수 컬렉션은 라이트/다크 두 모드를 가진다. 새 컬러 토큰을 추가할 때는 반드시 양쪽 모드 값을 모두 정의한다.

## Accent

- `accent`는 Unread dot처럼 작지만 분명한 강조 표시와 toast 같은 고대비 transient feedback 배경에 사용한다.
- light `accent`는 순검정보다 부드러운 `#262626`, dark `accent`는 `#ffffff`에 매핑한다. light `text`와
  독립적으로 조정해 큰 강조 surface가 지나치게 진해지지 않게 한다.
- toast foreground는 현재 theme `background`를 사용해 accent와 반전 대비를 만들며, 다른 조합이 필요해지기
  전에는 별도의 짝 토큰을 선제 정의하지 않는다.

## Divider

- `divider`는 서로 이어지는 콘텐츠 행을 나누는 저강도 1px 구분선에 사용한다.
- 입력, 메뉴, 모달처럼 컴포넌트의 외곽 경계를 분명히 해야 하는 곳은 기존 `border`를 유지한다.
- Post 목록의 행 구분선은 `divider`를 사용하며 light `#f2f2f2`, dark `#292929`에 매핑한다.
