## 1. PROD-820 Cloud project와 privacy controls

- [x] 1.1 PostHog Cloud US의 `Kosmo Production`과 `Asia/Seoul` timezone을 확인하고 Default project를 변경하지 않는 경계를 기록한다.
- [x] 1.2 Session Replay sampling 10%, production canonical origin URL 조건, Normal input masking과 retention 30일을 production 배포 전에 적용한다.
- [x] 1.3 canonical Post Content의 PostHog `ph-mask` marker를 runtime에 연결하고 Cloud input masking과 함께 단위·browser acceptance가 가능한 상태로 만든다.
- [x] 1.4 공개 project key·host와 credential의 경계 및 실제 값 비노출 규칙을 연결 운영 가이드와 PROD-820 댓글에 기록한다.

## 2. PROD-819 Web adapter와 provider 교체

- [x] 2.1 `pnpm` dependency 명령으로 `@openpanel/web`을 제거하고 `posthog-js`를 app dependency로 도입한다.
- [x] 2.2 공개 key와 host가 모두 있을 때만 초기화되고 SDK 오류를 격리하는 Web adapter와 Native no-op을 구현한다.
- [x] 2.3 설정 네 조합, singleton 초기화, SDK failure와 OpenPanel 부재를 단위 검증한다.
- [x] 2.4 Native export/dependency graph에서 PostHog runtime 비포함을 확인한다.

## 3. PROD-819 PostHog 표준 runtime과 typed custom event

- [x] 3.1 init config를 `api_host`, `defaults: '2026-05-30'` 중심으로 정리하고 자동 기능 disable, memory persistence, denylist와 sanitizer를 제거한다.
- [x] 3.2 앱 소유 route observer, route normalizer와 manual `$pageview`를 제거한다.
- [x] 3.3 `$pageview`를 app event map에서 제거하고 기존 custom event의 event별 typed passthrough를 유지한다.
- [x] 3.4 unit test에서 권장 defaults와 표준 metadata·remote config 비차단, custom event type contract를 검증한다.
- [x] 3.5 fake endpoint browser test에서 SDK automatic pageview·pageleave·autocapture, 표준 metadata와 설정 누락 no-op을 검증한다.

## 4. PROD-819 persisted identity와 fail-open

- [x] 4.1 module-local Account cache 대신 SDK persisted identity state를 기준으로 same Account, Account 전환과 guest reset을 구현한다.
- [x] 4.2 guest→A, persisted A→A, A→B, reload A→guest와 SDK failure sequence를 단위 검증한다.
- [x] 4.3 browser flow에서 identify/reset 순서, trait 부재와 endpoint 실패 시 인증·navigation 지속을 검증한다.
- [x] 4.4 app check, 관련 unit·browser test, Web·Native export와 formatting을 실행하고 결과를 PROD-795 handoff에 기록한다.

## 5. PROD-820 build/deployment 공개 설정 주입

- [x] 5.1 Docker build args와 Web build environment에 공개 PostHog key·host를 함께 전달한다.
- [x] 5.2 GitHub production release workflow가 같은 repository variables를 Docker build에 주입하고 OpenPanel 전환 순서를 유지한다.
- [x] 5.3 가짜 공개 설정 production-equivalent build와 image inspection으로 공개 설정·credential 경계를 검증한다.

## 6. PROD-795 개인정보·운영 통합

- [ ] 6.1 표준 automatic event, URL/referrer/session metadata, persistence, remote config와 Replay 보호를 실제 개인정보 처리방침에 반영한다.
- [ ] 6.2 Cloud 설정·배포·장애 대응·수집 확인 runbook을 작성하고 OpenPanel 운영 계약을 제거한다.
- [ ] 6.3 PROD-819와 PROD-820 결과를 production-equivalent Web flow에서 cross-slice 검증한다.

## 7. PROD-741 Session Replay acceptance

- [ ] 7.1 Post Media Viewer 표본 session의 navigation·전환·닫기 replay를 확인한다.
- [ ] 7.2 input·textarea와 canonical Post Content masking, 10% sampling, production origin과 30일 retention을 실제 recording에서 확인한다.
- [ ] 7.3 replay 초기화·업로드 실패가 Viewer와 제품 흐름에 영향을 주지 않음을 확인한다.

## 8. PROD-575 production acceptance와 archive

- [ ] 8.1 production에서 표준 자동 이벤트·metadata·remote config, typed custom event, identity/reset과 Replay 보호를 개인정보 없는 증거로 확인한다.
- [ ] 8.2 old `add-web-openpanel-product-analytics`를 `--skip-specs` archive한다.
- [ ] 8.3 `add-posthog-product-analytics`를 정상 archive하고 strict validation을 통과시킨다.
