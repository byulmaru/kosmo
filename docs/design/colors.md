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

## Primary 상태 배경

- `primarySubtle`은 `primary`의 30% alpha 표현이며 light와 dark 양쪽 mode에서 함께 정의한다.
- Web 알림 목록의 Unread 행은 불투명한 `primary` 좌측 상태선과 `primarySubtle` 배경을 하나의 결합 표현으로 사용해 `card`인 Read 행과 구분한다.
- 좌측 상태선은 `primarySubtle`과 분리되는 고대비 edge가 아니다. Unread 상태는 기존 접근성명도 함께 제공하며 별도 고대비 경계를 추가하지 않는다.
- 이 의미를 다른 selected·pressed·visibility 상태로 일반화하지 않는다. `primarySubtle`의 Native 알림 행 사용 여부는 이 Web 정책으로 결정하지 않으며, 별도의 Native 제품 계약과 runtime 검증에서 정한다.

## Focus

- `focus`는 브라우저 기본 focus indicator를 컴포넌트 경계로 대체해야 하는 제한된 Web surface에 사용한다.
- focus 경계와 인접 배경은 상태 식별에 필요한 3:1 이상의 대비를 유지한다. 현재 light `focus`는 `#9a7800`,
  dark `focus`는 `#fce79a`에 매핑하며 각각 Reply editor background와 약 4.15:1, 15.32:1 대비를 갖는다.
- 기본 browser outline을 유지하는 control이나 Native focus style을 `focus` token으로 일괄 덮어쓰지 않는다.

## Divider

- `divider`는 서로 이어지는 콘텐츠 행을 나누는 저강도 1px 구분선에 사용한다.
- 입력, 메뉴, 모달처럼 컴포넌트의 외곽 경계를 분명히 해야 하는 곳은 기존 `border`를 유지한다.
- Post 목록의 행 구분선은 `divider`를 사용하며 light `#f2f2f2`, dark `#292929`에 매핑한다.
