## Purpose

kosmo SvelteKit 웹 애플리케이션의 공통 플랫폼 계약을 문서화한다. 이 스펙은 특정 화면이나 API bridge가 아니라 웹 런타임이 공통으로 제공하는 상태 확인 같은 기반 동작을 다룬다.

## Requirements

### Requirement: Web health endpoint

웹 애플리케이션은 상태 확인 endpoint를 제공해야 한다(MUST).

#### Scenario: Web health check

- **WHEN** 클라이언트가 `/health`에 GET 요청을 보낸다
- **THEN** 시스템은 plain text `ok`를 반환한다
