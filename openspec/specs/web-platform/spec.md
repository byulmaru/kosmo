## Purpose

kosmo SvelteKit 웹 애플리케이션의 공통 플랫폼 계약을 문서화한다. 이 스펙은 특정 화면이나 API bridge가 아니라 웹 런타임이 공통으로 제공하는 상태 확인 같은 기반 동작을 다룬다.

## Requirements

### Requirement: Web health endpoint

웹 애플리케이션은 상태 확인 endpoint를 제공해야 한다(MUST).

#### Scenario: Web health check

- **WHEN** 클라이언트가 `/health`에 GET 요청을 보낸다
- **THEN** 시스템은 plain text `ok`를 반환한다

### Requirement: Application typography fonts

웹 애플리케이션은 UI 텍스트에 SUIT를, 게시글 본문 텍스트에 Pretendard Variable을 적용해야 한다(MUST). 두 폰트는 서드파티 CDN에 런타임 의존하지 않고 애플리케이션 자체 origin에서 제공해야 한다(MUST).

#### Scenario: UI text renders in SUIT

- **WHEN** 사용자가 임의의 화면을 본다
- **THEN** 버튼·내비게이션·라벨·헤딩 등 UI 텍스트는 SUIT로 렌더된다

#### Scenario: Post body renders in Pretendard

- **WHEN** 사용자가 게시글 본문(상세·목록·작성 입력)을 본다
- **THEN** 본문 텍스트는 Pretendard Variable로 렌더된다

#### Scenario: Fonts are served from the application origin

- **WHEN** 브라우저가 폰트 리소스를 요청한다
- **THEN** 폰트는 애플리케이션 자체 origin에서 제공되며 외부 CDN에 런타임 의존하지 않는다
