# universal-expo-client Specification

## Purpose

Android, iOS, Web에서 하나의 Expo Router·React Native route tree와 React Relay 데이터 계층을 사용하는 kosmo 유니버설 클라이언트의 공통 runtime, 인증, navigation, build 검증 계약을 문서화한다.

## Requirements

### Requirement: Universal Expo runtime

클라이언트는 Expo Router와 React Native를 사용해 Android, iOS, Web에서 같은 route tree와 화면 컴포넌트를 실행해야 한다(MUST). 플랫폼 차이가 실제 UX 또는 platform API 경계에 있을 때만 platform-specific 파일을 사용할 수 있다(MAY).

#### Scenario: Run one route on every platform

- **WHEN** 개발자가 지원 route의 Android, iOS, Web 빌드를 실행한다
- **THEN** 세 빌드는 동일한 Expo Router route와 공용 화면 컴포넌트를 사용한다
- **AND** 별도 WebView 안에 원격 웹 UI를 호스팅하지 않는다

#### Scenario: Isolate a platform boundary

- **WHEN** secure storage, system browser 또는 web document layout처럼 플랫폼 API가 다른 기능을 구현한다
- **THEN** 시스템은 해당 경계만 platform-specific module로 분리한다
- **AND** GraphQL operation과 화면의 사용자 동작은 공용 구현에 유지한다

### Requirement: Universal route parity

유니버설 클라이언트는 기존 공개·보호 화면의 canonical URL을 Android, iOS, Web에서 동일하게 해석해야 한다(MUST).

#### Scenario: Navigate core routes

- **WHEN** 사용자가 `/`, `/home`, `/compose`, `/search`, `/notifications`, `/menu` 중 하나로 이동한다
- **THEN** Expo Router는 해당 온보딩 또는 앱 화면을 표시한다

#### Scenario: Navigate profile routes

- **WHEN** 사용자가 `/@{handle}`, `/@{handle}/followers`, `/@{handle}/following`, `/@{handle}/{postId}` 중 하나로 이동한다
- **THEN** Expo Router는 handle과 선택적 post ID를 route parameter로 해석해 해당 공개 화면을 표시한다

#### Scenario: Open a native deep link

- **WHEN** Android 또는 iOS가 지원 route를 가리키는 `kosmo://` custom-scheme deep link를 연다
- **THEN** 시스템은 웹과 같은 canonical 화면으로 이동한다

### Requirement: Platform-adaptive application shell

클라이언트는 같은 route content를 유지하면서 viewport와 native safe area에 맞는 앱 셸을 제공해야 한다(MUST).

#### Scenario: Render mobile shell

- **WHEN** native 앱 또는 폭 768px 미만의 web viewport에서 탭 화면을 표시한다
- **THEN** 시스템은 safe area를 반영한 mobile header/content와 하단 탭 navigation을 표시한다

#### Scenario: Render compact desktop shell

- **WHEN** web viewport 폭이 768px 이상 1280px 미만이다
- **THEN** 시스템은 아이콘 navigation rail과 최대 600px의 중앙 content를 표시한다
- **AND** 우측 composer rail은 표시하지 않는다

#### Scenario: Render full desktop shell

- **WHEN** web viewport 폭이 1280px 이상이다
- **THEN** 시스템은 20rem 좌측 sidebar, 최대 600px 중앙 content, 290px에서 350px 사이의 우측 rail을 표시한다

### Requirement: Relay GraphQL environment

클라이언트는 React Relay와 Relay Compiler를 GraphQL data layer로 사용해야 한다(MUST). 모든 operation과 fragment는 schema에 대해 ahead-of-time compile되어야 하고(MUST), Relay generated TypeScript type을 소비해야 한다(MUST).

#### Scenario: Compile GraphQL documents

- **WHEN** Relay compiler가 `apps/api/schema.graphql`과 클라이언트 source를 처리한다
- **THEN** 각 query, mutation, fragment의 runtime artifact와 TypeScript type이 생성된다
- **AND** schema와 맞지 않는 document는 빌드를 실패시킨다

#### Scenario: Read component data

- **WHEN** entity 데이터를 사용하는 공용 React component가 렌더된다
- **THEN** component는 자신이 선언한 Relay fragment key를 prop으로 받는다
- **AND** route query는 자식 component fragment를 spread한다

#### Scenario: Normalize mutation response

- **WHEN** create, select, follow 또는 unfollow mutation이 영향받은 Node ID와 갱신 필드를 반환한다
- **THEN** Relay store는 동일 Node를 구독하는 화면에 응답을 반영한다
- **AND** 정규화 가능한 변경 때문에 전체 application store를 수동 재조회하지 않는다

### Requirement: Cross-platform GraphQL transport

Relay network layer는 플랫폼별 인증 수단을 사용해 같은 `/graphql` bridge로 요청해야 한다(MUST).

#### Scenario: Send a web operation

- **WHEN** Web 클라이언트가 GraphQL operation을 실행한다
- **THEN** Relay network는 현재 origin의 `/graphql`에 credential 포함 POST 요청을 보낸다
- **AND** browser script는 HttpOnly session cookie 값을 읽지 않는다

#### Scenario: Send a native operation

- **WHEN** Android 또는 iOS 클라이언트가 GraphQL operation을 실행하고 SecureStore에 현재 configured web origin과 일치하는 session token envelope이 있다
- **THEN** Relay network는 설정된 web origin의 `/graphql`에 `Authorization: Bearer <session>` 헤더를 포함한다

#### Scenario: Discard a session from another native environment

- **WHEN** SecureStore session envelope의 origin이 현재 configured web origin과 다르거나 legacy plain token이다
- **THEN** client는 저장 값을 삭제하고 session token을 복원하지 않는다
- **AND** 이전 token을 현재 web origin의 `/graphql`로 전송하지 않는다

#### Scenario: Validate the native web origin

- **WHEN** native client가 configured web origin을 해석한다
- **THEN** origin은 credential, path, query, hash가 없는 HTTP(S) origin이어야 한다
- **AND** loopback 외 HTTP origin은 명시적 development override가 없으면 거부한다

#### Scenario: Send an anonymous operation

- **WHEN** session cookie 또는 native session token이 없는 클라이언트가 공개 query를 실행한다
- **THEN** Relay network는 Authorization 없이 요청하고 공개 profile/post data를 받을 수 있다

### Requirement: Universal client verification

마이그레이션된 클라이언트는 Relay compile, TypeScript, web export, web E2E와 Expo project 검증을 자동화해야 한다(MUST).

#### Scenario: Validate a pull request

- **WHEN** CI가 유니버설 클라이언트를 검증한다
- **THEN** Relay compiler와 TypeScript check가 성공해야 한다
- **AND** Expo web export가 성공해야 한다
- **AND** Playwright가 web 로그인, 보호 route, 홈, 검색, 프로필, 게시글 흐름을 검증해야 한다

#### Scenario: Validate native configuration

- **WHEN** Expo project configuration을 검사한다
- **THEN** Android package와 iOS bundle identifier는 `moe.kos`이고 callback scheme은 `kosmo`이다
- **AND** clean Expo prebuild 뒤 Android debug build가 성공해야 한다
- **AND** clean Expo prebuild 뒤 iOS simulator build가 성공해야 한다

### Requirement: Universal component catalog

유니버설 클라이언트는 공용 primitive와 주요 domain component의 독립 상태를 React Native Web Storybook에서 검토할 수 있어야 한다(MUST).

#### Scenario: Build component catalog

- **WHEN** CI 또는 개발자가 Storybook static build를 실행한다
- **THEN** 공용 Button, text input, avatar, shell navigation, post, profile, follow, composer component story가 build된다
- **AND** loading, error, empty, long text와 interactive state가 catalog에서 선택 가능하다

#### Scenario: Check story accessibility

- **WHEN** Storybook accessibility 검증이 component story를 실행한다
- **THEN** critical accessibility violation이 없어야 한다
