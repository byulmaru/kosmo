## Why

Production ActivityPub inbox handler는 `suppressError`, 처리된 `catch`, post-commit effect 실패를 서로 다른 방식으로 삼켜서 정상 거절과 조사해야 할 실패를 구분하기 어렵다. PROD-608에서 드러난 object 역참조 실패를 포함해 모든 production inbound 경계를 공통 로그·Sentry 분류로 연결하되 Activity 처리 결과와 보안·멱등 계약은 유지한다.

## What Changes

- production에 등록된 Accept, Announce, Create, Delete, Follow, Like/EmojiReact, Reject, Undo, Update handler의 처리된 실패와 no-op inventory를 OpenSpec·테스트 범위에 기록한다.
- Activity 종류·handler·phase·outcome·안정적인 reason code를 가진 공통 inbound 관측 경계를 제공한다.
- 정상 보안/정책 거절과 멱등 no-op는 구조화 로그만 남기고, 원격 서버/외부 lookup·protocol·delivery 실패도 Sentry 없이 구조화 로그로 남긴다.
- Kosmo 내부 unexpected 오류와 내부 post-commit/projection/effect 실패만 기존 API/Web BFF Sentry 경계로 capture하고 안정적인 grouping metadata를 제공한다.
- raw Activity body, signature/key material, credential, 고카디널리티 URI와 불필요한 개인정보가 tag·fingerprint·로그에 들어가지 않도록 한다.
- 공통 helper 단위 테스트, 대표 handler 회귀 테스트와 production listener 통합 경계 테스트를 추가한다.

## Authority / Provenance

- Canonical: `docs/operations/sentry.md`
- Linear Contract: `PROD-634`
- Linear Implementations: `PROD-477`, `PROD-484`; 관련 사례 `PROD-608`

## Capabilities

### New Capabilities

- `activitypub-inbound-observability`: production inbound ActivityPub handler의 실패 분류, 구조화 로그, Sentry 연결과 민감정보 경계

### Modified Capabilities

- 없음.

## Impact

- `packages/fedify`의 inbound handler, 공통 관측 helper와 federation listener 등록
- `apps/web`의 기존 Web BFF Sentry capture callback 연결(필요한 경우 `apps/api`의 동일 callback seam)
- `packages/fedify` 단위/handler/listener 테스트와 운영 inventory 문서
