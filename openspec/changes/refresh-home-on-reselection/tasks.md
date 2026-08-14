## 1. PROD-610 Home 재선택 Web 동작

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- `PROD-610`

**Deliverable**

모바일·compact·full Web의 모든 홈 진입 control이 다른 route에서는 홈으로 이동하고, 현재 홈에서는 document scroll을 최상단으로 이동하면서 중복 없는 Home Relay 새로고침을 실행한다. `PROD-610`이 구현·개별 검증·canonical/OpenSpec 정합성 확인과 archive를 소유한다.

**Guardrails**

- 진행 중 새로고침의 추가 activation도 scroll-top은 실행하지만 네트워크 요청은 추가하지 않는다. 성공·실패 뒤의 다음 activation은 새 요청을 정확히 한 번 시작하고 이전 요청이 실패했어도 현재 timeline을 유지한다.
- 브랜드 마크의 기존 시각 geometry를 유지하고 pointer·keyboard·screen reader에 같은 결과를 제공한다.
- 다른 주요 route의 guarded forward navigation, history restoration, query-only navigation과 current-route no-op 계약을 유지한다.
- Android/iOS Native, PageHeader 시각 규격, GraphQL schema·서버 timeline 정책, subscription과 새 Post prepend를 변경하지 않는다.
- 새 dependency, 공용 refresh framework, module/browser event bus를 추가하지 않는다.

**Verification**

- 테스트 코드 범위: 기존 shell navigation·PageHeader·Home Relay 동작을 직접 검증하는 최소 단위 테스트 영역과 기존 Web navigation E2E의 mobile·compact·full 홈 진입 영역.
- 테스트 필요성: 다른 route의 홈 이동, current-home scroll-top, Home query 요청 정확히 1회, 진행 중 중복 억제, 성공·실패 뒤 다음 activation의 새 요청 1회, 기존 데이터 유지와 keyboard·screen reader control 의미를 증명한다.
- 테스트 제외 범위: 관련 없는 route 조합·fixture·snapshot·Storybook interaction coverage 확대, Native runtime test, 테스트 helper·harness와 인프라 변경.
- 관련 app unit/check, focused Web E2E와 `pnpm exec openspec validate refresh-home-on-reselection --strict`를 통과시킨다. Web 자동화 결과를 Android/iOS runtime 증거로 일반화하지 않는다.

- [ ] 1.1 모든 Web shell 홈 navigation과 Home header 브랜드 control에 다른 route 이동 및 current-home activation 경계를 연결한다.
- [ ] 1.2 current-home activation마다 document scroll을 최상단으로 이동하고 Home Relay 새로고침의 요청 잠금·완료·실패·actor environment cleanup을 구현한다.
- [ ] 1.3 최소 단위 테스트로 current-home 분기, 단일 요청, 진행 중 중복 억제, 성공·실패 뒤 다음 activation의 새 요청 1회와 접근 가능한 브랜드 control을 검증한다.
- [ ] 1.4 기존 Web navigation E2E에서 mobile·compact·full의 route 이동, scroll-top과 Home query 요청 1회를 검증한다.
- [ ] 1.5 app check와 focused Web 검증을 통과시키고 canonical 문서·spec·구현 정합성과 미검증 Native 범위를 기록한 뒤 change를 archive한다.
