## 1. GraphQL 프로필 상태

- [x] 1.1 현재 계정의 접근 가능한 활성 프로필을 조회하는 인증 GraphQL 필드를 추가한다.
- [x] 1.2 현재 세션의 활성 프로필은 PR#46의 `currentSession.selectedProfile` 조회를 사용한다.
- [x] 1.3 웹 schema artifact가 새 프로필 조회 필드를 포함할 수 있게 한다.

## 2. 사이드바 Shell UI

- [x] 2.1 주요 내비게이션 항목과 active item semantics를 포함하는 재사용 가능한 사이드바 컴포넌트를 만든다.
- [x] 2.2 프로필 목록 렌더링과 `selectProfile`을 통한 즉시 프로필 선택을 추가한다.
- [x] 2.3 사이드바에서 새 프로필을 생성하고 생성된 프로필로 즉시 전환할 수 있게 한다.
- [x] 2.4 사이드바를 `(tabs)` layout에 고정 데스크톱 사이드바로 연결한다.
- [x] 2.5 Figma-to-Code HTML/CSS 기준으로 drawer 폭, 프로필 히어로, 메뉴 row 간격, active 상태 표현을 맞춘다.

## 3. 모바일 Drawer 동작

- [x] 3.1 탭 shell에 모바일 drawer trigger 버튼을 추가한다.
- [x] 3.2 dependency를 추가하지 않고 왼쪽 edge swipe 제스처 열기를 구현한다.
- [x] 3.3 내비게이션 항목을 선택하면 모바일 drawer를 닫는다.

## 4. 검증

- [x] 4.1 OpenSpec change를 strict mode로 검증한다.
- [x] 4.2 웹 type check를 실행한다.
