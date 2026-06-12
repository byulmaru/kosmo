## 1. 컴포넌트 구현

- [x] 1.1 `PostAuthorProfile` 컴포넌트를 추가하고 GraphQL `Profile` fragment 기반 작성자 이름, 핸들, fallback avatar, 선택적 링크 렌더링을 구현한다.
- [x] 1.2 긴 작성자 이름과 핸들이 줄임 처리되도록 레이아웃 클래스를 적용한다.
- [x] 1.3 새 컴포넌트를 필요한 위치에서 직접 import하도록 두고, 웹 패키지 public barrel export는 추가하지 않는다.

## 2. 문서화와 검증

- [x] 2.1 Storybook story로 기본, 이미지 없음, 긴 텍스트, 링크 상태를 확인할 수 있게 한다.
- [x] 2.2 `@kosmo/web` 타입 검사를 실행해 변경이 유효한지 확인한다.
