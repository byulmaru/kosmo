# public-sitemap Specification

## Purpose

현재 승인된 세 canonical URL을 검색엔진이 발견할 수 있도록 정적 XML sitemap으로 제공하는 계약을 정의한다.

## Requirements

### Requirement: 정적 XML sitemap 응답

**Authority / Provenance:** `PROD-731`의 전달 결과와 `/sitemap.xml` 완료 조건. Web origin은 `/sitemap.xml` GET 요청에 검색엔진이 처리할 수 있는 UTF-8 Sitemap protocol XML을 `application/xml`로 응답해야 한다(MUST). 응답은 하나의 `urlset`이어야 하며(MUST), browser navigation 요청인지와 관계없이 Expo SPA HTML이나 다른 representation으로 대체되어서는 안 된다(MUST NOT).

#### Scenario: 검색 crawler가 sitemap을 요청한다

- **WHEN** 검색 crawler가 Web origin의 `/sitemap.xml`을 GET으로 요청한다
- **THEN** 시스템은 성공 상태와 `application/xml` content type을 가진 well-formed sitemap XML을 반환한다
- **AND** 응답 본문은 Expo `index.html`이 아니다

#### Scenario: browser navigation 형식으로 sitemap을 요청한다

- **WHEN** `/sitemap.xml` 요청이 browser navigation header를 포함한다
- **THEN** 시스템은 SPA fallback보다 export된 sitemap asset을 우선해 같은 XML 표현을 반환한다

### Requirement: 현재 공개 URL 집합

**Authority / Provenance:** 2026-08-27 정적 범위로 갱신한 `PROD-731`의 정확한 URL allowlist. Sitemap은 `https://kos.moe/`, `https://kos.moe/privacy`, Kosmo 공식 안내 계정 `https://kos.moe/@kosmo`를 각각 한 번 포함해야 하며(MUST), 그 밖의 URL을 포함해서는 안 된다(MUST NOT).

#### Scenario: 현재 sitemap을 읽는다

- **WHEN** 클라이언트가 `/sitemap.xml` 응답의 `<loc>`을 읽는다
- **THEN** `https://kos.moe/`, `https://kos.moe/privacy`, `https://kos.moe/@kosmo`가 각각 한 번 존재한다
- **AND** 네 번째 URL이나 중복 URL은 존재하지 않는다

#### Scenario: 다른 공개 route 또는 콘텐츠가 존재한다

- **WHEN** Web 애플리케이션에 다른 정적 route, Local·Remote Profile 또는 Post가 존재한다
- **THEN** sitemap은 해당 URL을 자동으로 추가하지 않는다

### Requirement: DB와 분리된 정적 제공

**Authority / Provenance:** 2026-08-27 갱신한 `PROD-731`의 정적 자산 제공과 DB 조회·런타임 동적 생성 제외 범위. Sitemap 응답 본문은 Expo export에 포함된 정적 asset이어야 하며(MUST), configured Local Instance 해석, Profile·Post 조회, 공개 eligibility 판정 또는 그 밖의 sitemap 전용 런타임 query에 의존해서는 안 된다(MUST NOT).

#### Scenario: sitemap을 제공한다

- **WHEN** Web workload가 export된 `sitemap.xml` asset을 제공한다
- **THEN** 응답 본문은 배포 artifact에 포함된 고정 XML과 같다
- **AND** sitemap 생성을 위해 Profile·Post 또는 Instance 데이터를 조회하지 않는다

#### Scenario: DB의 공개 콘텐츠가 바뀐다

- **WHEN** Profile·Post의 생성, 상태 또는 visibility가 바뀐다
- **THEN** 현재 sitemap URL 집합은 자동으로 바뀌지 않는다
- **AND** 동적 확장 계약이 별도 Linear 이슈와 OpenSpec change에서 승인되기 전까지 세 URL을 유지한다

### Requirement: 보수적인 metadata

**Authority / Provenance:** 2026-08-27 갱신한 `PROD-731`의 신뢰 가능한 수정 시각과 임의 metadata 제외 범위. 현재 세 URL은 신뢰할 수 있는 마지막 수정 시각을 제공하지 않으므로 `<lastmod>`을 포함해서는 안 되며(MUST NOT), `<changefreq>`와 `<priority>`도 포함해서는 안 된다(MUST NOT).

#### Scenario: sitemap entry를 읽는다

- **WHEN** 클라이언트가 현재 sitemap의 각 `<url>` entry를 읽는다
- **THEN** entry는 하나의 `<loc>`만 가진다
- **AND** `<lastmod>`, `<changefreq>`, `<priority>`는 존재하지 않는다

### Requirement: 프로덕션 무인증 접근

**Authority / Provenance:** 2026-08-27 갱신한 `PROD-731`의 durable production contract. 프로덕션 Web origin의 `/sitemap.xml`은 session cookie, bearer token 또는 그 밖의 인증 자격 증명 없이 가져갈 수 있어야 한다(MUST). 검색엔진 관리 도구에 제출하고 처리 결과를 기록하는 일은 이 요구사항의 반복 가능한 capability가 아니라 `PROD-731`의 일회성 운영 task다.

#### Scenario: 인증 정보 없이 프로덕션 sitemap을 요청한다

- **WHEN** 익명 클라이언트가 프로덕션 Web origin의 `/sitemap.xml`을 GET으로 요청한다
- **THEN** 시스템은 인증 challenge나 login redirect 없이 sitemap XML 응답을 반환한다

#### Scenario: 인증 session이 없는 crawler가 요청한다

- **WHEN** 검색 crawler가 cookie나 authorization header 없이 `/sitemap.xml`을 요청한다
- **THEN** 인증 session 유무는 sitemap의 공개 표현을 바꾸지 않는다
