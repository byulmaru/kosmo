# ADR 0024: Application Policy and Runtime DB Boundary

## 상태

Accepted

## 날짜

2026-08-16

## 결정

- GraphQL 사용자 데이터의 SNS 가시성 및 owner 권한에는 PostgreSQL Row-Level Security를 사용하지 않는다.
  이 결정은 PostgreSQL RLS의 모든 사용을 금지하는 일반 원칙이 아니라, 차단·팔로우·공개 범위와
  interaction 권한처럼 요청 actor에 따라 달라지는 Kosmo GraphQL 정책의 경계를 정한다.
- GraphQL 진입점은 caller 인증, Active Account와 selected Profile Membership 및 selected Profile 조회
  가능 상태를 검증한다. 이 경계를 통과한 resolver와 application action은 검증된 identity를 사용한다.
- Post visibility, owner 조건과 interaction 가능 여부는 기존 중앙 application policy helper가 소유한다.
  resolver와 selector는 이 policy를 재구현하지 않고, 목록의 후보·정렬·pagination도 application query
  계층에서 계산한다.
- PostgreSQL은 foreign key, unique, 상태 불변식과 runtime object ACL을 강제한다. GraphQL의 요청별
  가시성·owner business rule을 DB session actor state로 계산하지 않는다.
- GraphQL operation 전용 DB session, actor GUC, operation-scoped `ctx.db`와
  `OPERATION_DATABASE_URL`은 target architecture에서 제거한다. GraphQL application SQL은 process의
  shared DB access 경계를 사용한다.
- API, Web과 Worker application runtime은 표준 `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`,
  `PGPASSWORD`와 하나의 shared non-owner runtime role을 사용한다. migration owner와 Fedify queue의
  별도 database/role 경계는 유지한다.
- 이 전환은 hidden/deleted Post owner cleanup, `DELETE RETURNING` mutation payload, Notification cleanup,
  viewer-independent Reaction count를 변경하지 않는다.

## 근거

- 기존 application policy가 GraphQL 조회와 action의 가시성·owner 조건을 중앙화하고 있다. RLS를 추가해도
  application이 소유해야 하는 후보·정렬·pagination과 transport 결과 계약은 사라지지 않는다.
- 요청마다 변하는 차단·팔로우·공개 범위 정책을 DB session과 policy에 중복하면 query plan, connection
  lifecycle과 장애 원인의 결합이 커진다.
- 단일 non-owner runtime role과 object ACL은 application runtime이 schema owner 권한을 갖지 않게 하면서,
  요청별 actor credential과 role 분리를 유지하는 비용은 제거한다.
- 향후 cache, precomputed timeline, search index, sharding 또는 service 분리를 도입할 때 같은 application
  policy contract를 각 read model에 적용할 수 있어야 한다.

## 전환

- 이미 main에 병합된 Post/PostContent와 Bookmark RLS는 새 compensating migration으로 제거한다.
- 미병합 Reaction 및 Follow Request RLS 변경은 merge하지 않는다.
- RLS consumer가 제거된 뒤 operation session, actor helper와 전용 PgBouncer Pooler를 제거한다.
- runtime role 통합은 별도 구현 slice가 소유한다. production role drop, Secret sync/apply, cutover와 live
  verification은 이 결정의 실행 범위가 아니며 별도 승인이 필요하다.

## 관련 결정

- [ADR 0003: Policy Ownership Clarifications](./0003-policy-ownership-clarifications.md)
- [ADR 0019: Selected Profile Authorization Boundary](./0019-selected-profile-authorization-boundary.md)
- [Core 서비스 경계](../../architecture/core-services.md)
- [PROD-776](https://linear.app/byulmaru/issue/PROD-776/postgresql-rls-%EC%A0%84%ED%99%98%EC%9D%84-%EC%B2%A0%ED%9A%8C%ED%95%98%EA%B3%A0-application-policy-%EA%B2%BD%EA%B3%84%EB%A5%BC-%ED%99%95%EC%A0%95%ED%95%9C%EB%8B%A4)
