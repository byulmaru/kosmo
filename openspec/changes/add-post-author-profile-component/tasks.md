## 1. 컴포넌트 구현

- [x] 1.1 `PostAuthorProfile` 컴포넌트를 추가하고 GraphQL `Profile` fragment 기반 작성자 이름, 핸들, fallback avatar, 선택적 링크 렌더링을 구현한다.
- [x] 1.1a Storybook에서 Mearie client context 없이 렌더링할 수 있도록 표시 전용 컴포넌트를 분리한다.
- [x] 1.2 긴 작성자 이름과 핸들이 줄임 처리되도록 레이아웃 클래스를 적용한다.
- [x] 1.3 새 컴포넌트를 웹 패키지 public export에 추가한다.

## 2. 문서화와 검증

- [x] 2.1 Storybook story로 기본, fallback, 긴 텍스트, 링크 상태를 표시 전용 컴포넌트에서 확인할 수 있게 한다.
- [x] 2.2 `@kosmo/web` 타입 검사를 실행해 변경이 유효한지 확인한다.
