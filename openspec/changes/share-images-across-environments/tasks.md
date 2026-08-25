## 1. Browser runtime config

- [x] 1.1 BFF allowlist와 no-store runtime config를 구현한다.
- [x] 1.2 Config 검증 뒤 telemetry와 product를 시작하고 실패 시 retry를 제공한다.
- [x] 1.3 Runtime config와 same-origin 회귀 테스트를 통과시킨다.

## 2. Telemetry와 source map

- [x] 2.1 Sentry와 OpenPanel을 runtime config 뒤에 초기화한다.
- [x] 2.2 Source map upload에서 browser DSN을 제거하고 full-SHA release를 유지한다.
- [x] 2.3 Telemetry와 artifact 검증을 통과시킨다.

## 3. Environment-neutral image

- [x] 3.1 Expo와 Docker build에서 환경별 browser input을 제거한다.
- [x] 3.2 Static asset과 runtime config cache 회귀를 검증한다.
- [ ] 3.3 반복 build와 final image content를 검증한다.

## 4. Canonical digest

- [x] 4.1 Docker Build artifact에 runtime digest map을 게시한다.
- [x] 4.2 Dev가 같은 run의 digest를 Argo에 전달한다.
- [x] 4.3 Workflow와 Helm 정적 검증을 통과시킨다.

## 5. Production 승격

- [x] 5.1 Manual target의 canonical Docker Build run과 digest를 승인 전에 고정한다.
- [x] 5.2 Artifact가 없으면 production mutation 전에 실패한다.
- [x] 5.3 Production build secret과 image 재build를 제거한다.
- [x] 5.4 승인, concurrency, migration과 audit 경계를 검증한다.

## 6. 전달과 live evidence

- [x] 6.1 운영 문서를 canonical digest 승격에 맞춘다.
- [x] 6.2 Focused/full validation과 Ready PR을 전달한다.
- [ ] 6.3 Dev runtime config, digest, migration과 health를 확인한다.
- [ ] 6.4 별도 승인 뒤 production digest, telemetry와 health를 확인한다.
- [ ] 6.5 PROD-831 stage 2 반영 뒤 runtime digest map을 확장한다.
- [ ] 6.6 Delta spec 동기화와 archive를 완료한다.
