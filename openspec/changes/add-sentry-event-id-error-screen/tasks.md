## 1. PROD-480 공용 오류 분류와 universal 오류 화면

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/colors.md`
- `docs/design/typography.md`
- `docs/design/breakpoints.md`
- `memory/coding-style.md`
- `memory/frontend-react-native.md`
- PROD-477
- PROD-480
- PROD-513

**Deliverable**

Android·iOS·Web 공용 앱이 예상 오류의 기존 inline·route-local 복구를 유지하면서, 화면을 사용할 수 없게 만드는 예상하지 못한 client 오류에는 민감한 원문을 노출하지 않는 전용 화면, optional Sentry event ID, 복사·다시 시도·public 안전 이동을 제공한다.

**Guardrails**

- 오류 종류는 구조화된 origin·type·code로 구분하고 사용자-facing message를 parsing하지 않는다.
- Server GraphQL response와 재시도 가능한 network·transport 오류는 새 client Sentry event로 중복 보고하지 않는다.
- 전용 화면에는 SDK adapter가 현재 capture에서 반환한 ID만 표시하고 앱 생성·이전 ID를 사용하지 않는다.
- 같은 오류 발생 건은 한 번만 보고하고 reset 뒤 재발은 새 발생 건으로 처리한다.
- 전용 화면은 함수형 error boundary 안에서 공용 React Native UI로 렌더링하고 Sentry SDK와 navigation singleton을 직접 소유하지 않는다.
- 오류 message, stack, 내부 경로, credential과 사용자 작성 콘텐츠를 UI·clipboard feedback·accessibility output에 포함하지 않는다.
- Clipboard dependency는 pnpm CLI로 추가하고 `expo-clipboard`와 기존 `ToastProvider`를 사용한다.
- 안전한 이동은 public root `/`로 replace하며 `/feedback` input·prefill·Slack payload는 변경하지 않는다.

**Verification**

- Expected mutation·GraphQL response·network fixture가 기존 inline 또는 route-local 상태를 유지하고 reporter를 호출하지 않는지 검증한다.
- Unexpected render fixture가 report 한 번, returned ID/no-ID, retry reset·재발과 public root 이동으로 이어지는지 단위·Storybook interaction으로 검증한다.
- ID·no-ID·긴 ID, copy success/failure, 좁은 Web viewport, keyboard, text scaling과 platform target 상태를 Storybook catalog와 접근성 검사에서 확인한다.
- `pnpm --filter @kosmo/app test`, `pnpm lint:eslint`, `pnpm lint:prettier`를 통과시킨다.

- [x] 1.1 GraphQL response·network·local render 오류의 구조화된 origin을 보존하고 expected/unexpected 분류 및 client 중복 보고 회귀 검증을 추가한다.
- [x] 1.2 공용 platform reporter가 현재 오류 발생 건의 optional event ID를 반환하고 occurrence 단위 중복 방지·reset 상태를 유지하도록 연결한다.
- [x] 1.3 안전한 한국어 안내, optional ID, copy·retry·public root 이동을 제공하는 universal 전용 오류 화면을 구현한다.
- [x] 1.4 `expo-clipboard`를 pnpm으로 앱 dependency에 추가하고 정확한 ID copy와 기존 toast 기반 성공·실패 feedback을 연결한다.
- [x] 1.5 기존 Error Boundary·feedback 회귀와 전용 화면의 component·Storybook 상태, 접근성·responsive 검증을 완료한다.
- [x] 1.6 리뷰 정정으로 안전한 이동 reset의 owner retry 분리, occurrence별 report·copy feedback cleanup, 단일 Toast announcement와 reporter/clipboard 회귀 검증을 보강한다.

## 2. PROD-486 Web 오류 화면과 실제 event ID

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/colors.md`
- `docs/design/typography.md`
- `docs/design/breakpoints.md`
- PROD-477
- PROD-480
- PROD-486
- PROD-493

**Deliverable**

Web에서 화면을 사용할 수 없게 만드는 예상하지 못한 client 오류 한 건이 PROD-493의 기존 Sentry 수집 경계를 통해 한 번 보고되고, 전용 화면의 동일 event ID·복사·재시도·public 안전 이동과 no-ID fallback이 실제 browser runtime에서 동작한다.

**Guardrails**

- 기존 DSN·environment·release 활성화 조건, `runtime=web`, component stack과 event 전달 정책을 유지한다.
- `beforeSend`, breadcrumb, BrowserSession, default PII, Web source map과 secret 경계를 이 이슈에서 다시 정의하지 않는다.
- Android·iOS entry나 native Sentry SDK를 Web slice에서 변경하지 않는다.
- Expected GraphQL response·network 오류와 server event를 별도 Web render event로 수집하지 않는다.
- 표시 ID는 현재 Web Sentry capture 반환값이어야 하며 전송·ID 실패가 화면과 복구 action을 실패시키지 않는다.
- 피드백 route와 Slack payload에 ID를 자동 연결하지 않는다.

**Verification**

- Web reporter 설정·return ID·disabled/throw/no-ID와 React boundary capture 한 번을 단위 테스트로 검증한다.
- Browser Storybook/runtime에서 ID copy, keyboard focus, retry reset, `/` replace와 no-ID fallback을 확인한다.
- 배포 metadata가 있는 검증 환경에서 의도한 client 오류 한 건을 발생시키고 화면 ID와 조회한 Sentry event ID, release·runtime·원본 위치가 일치하며 중복 event가 없는지 확인한다.
- `pnpm --filter @kosmo/app test`, Expo Web export와 관련 Sentry artifact 검증을 통과시킨다.

- [ ] 2.1 PROD-493 Web reporter의 현재 capture 반환 ID를 공용 optional event ID contract에 연결하고 설정·중복·expected 오류 회귀 테스트를 추가한다.
- [ ] 2.2 Web에서 추적 ID copy, retry, public root replace, keyboard·responsive 상태와 Sentry 실패 fallback을 통합 검증한다.
- [ ] 2.3 배포 검증용 unexpected Web 오류의 화면 ID와 실제 Sentry event·release·runtime·source 위치를 대조하고 증거를 PROD-486 handoff에 기록한다.

## 3. PROD-485 Android·iOS 오류 화면과 실제 event ID

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/colors.md`
- `docs/design/typography.md`
- `memory/frontend-react-native.md`
- PROD-480
- PROD-483
- PROD-485

**Deliverable**

PROD-483의 native Sentry 수집 경계가 제공된 뒤 Android·iOS에서 화면을 사용할 수 없게 만드는 예상하지 못한 오류 한 건이 한 번 보고되고, 공용 전용 화면의 동일 event ID·native clipboard·재시도·public 안전 이동과 no-ID fallback이 두 platform에서 동작한다.

**Guardrails**

- PROD-483이 native SDK·release·debug symbol·수집 경계를 제공하기 전에는 이 task group을 완료하지 않는다.
- Web Sentry module·browser SDK를 native bundle에 import하거나 native SDK 설정을 이 오류 UX slice에서 중복 구축하지 않는다.
- 공용 오류 화면·분류·reporter contract를 재사용하고 Android·iOS 전용 화면을 만들지 않는다.
- 표시 ID는 현재 native capture 반환값이어야 하고 fake/Web/이전 ID로 대체하지 않는다.
- iOS는 44×44pt, Android는 48×48dp target과 VoiceOver·TalkBack, font scaling을 실제 runtime에서 검증한다.
- Native 완료 증거를 Web Storybook이나 Web event로 대체하지 않는다.

**Verification**

- Native adapter의 return ID·disabled/throw/no-ID, expected 오류 제외와 occurrence 한 번 capture를 단위 또는 platform integration test로 검증한다.
- Android·iOS 각각에서 ID copy, clipboard 실패, retry reset·재발, `/` replace, text scaling과 assistive technology focus/announcement를 관찰한다.
- 검증용 오류의 화면 ID와 실제 Sentry event ID, environment·release와 native 원본 위치를 각 platform에서 대조한다.
- `pnpm --filter @kosmo/app test`, Android·iOS build/config 검증과 PROD-483이 요구하는 native artifact 검증을 통과시킨다.

- [ ] 3.1 PROD-483의 최신 완료 evidence와 native reporter contract를 독립 확인한 뒤 공용 optional event ID contract에 연결하고 expected·중복 회귀 검증을 추가한다.
- [ ] 3.2 Android·iOS에서 추적 ID copy·실패 feedback, retry·public root 이동, platform target·text scaling·VoiceOver·TalkBack을 검증한다.
- [ ] 3.3 각 platform 검증용 unexpected 오류의 화면 ID와 실제 Sentry event·release·원본 위치를 대조하고 증거를 PROD-485 handoff에 기록한다.

## 4. PROD-480 cross-platform 통합 검증과 archive

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/colors.md`
- `docs/design/typography.md`
- `docs/design/breakpoints.md`
- PROD-477
- PROD-479
- PROD-480
- PROD-483
- PROD-485
- PROD-486
- PROD-487
- PROD-493

**Deliverable**

공용 오류 분류·화면과 Web·Android·iOS adapter가 같은 보안·event ID·복구 계약을 만족한다는 통합 evidence를 확보하고, 최신 canonical·Linear와 delta spec을 동기화한 뒤 change 전체를 archive할 수 있다.

**Guardrails**

- PROD-485·486의 platform별 actual event ID, copy·retry·fallback evidence가 모두 완료되기 전에는 전체 change를 archive하지 않는다.
- Web 완료를 native 완료로, Storybook을 실제 browser·VoiceOver·TalkBack·Sentry event 대조로 대체하지 않는다.
- 오류 원문·stack·credential·사용자 콘텐츠 비노출과 expected 오류 client 비수집을 cross-platform으로 유지한다.
- Feedback input·Slack payload의 Sentry ID 자동 연결 제외 계약을 유지한다.
- Pull request readiness와 OpenSpec 전체 completion/archive를 별도로 판단한다.

**Verification**

- 최신 Linear 본문·relations·contract-changing comments와 canonical design 문서를 OpenSpec과 독립 대조한다.
- Requirement별 scenario와 PROD-480·485·486 task ownership을 Web·Android·iOS evidence에 매핑한다.
- `openspec validate add-sentry-event-id-error-screen --strict`, `pnpm --filter @kosmo/app test`, `pnpm lint:eslint`, `pnpm lint:prettier`와 필요한 platform build를 통과시킨다.
- Archive 직전 Blocked decision 없음, 모든 checkbox 완료, active spec sync와 archive 후 validation을 확인한다.

- [ ] 4.1 최신 canonical·Linear·선행 Sentry 계약을 독립 재확인하고 구현에서 드러난 requirement·decision·task 정합성 차이를 권위 순서대로 동기화한다.
- [ ] 4.2 Web·Android·iOS의 실제 event ID, 중복 보고, ID/copy 실패, retry·safe navigation과 접근성 evidence를 requirement scenario별로 통합 검토한다.
- [ ] 4.3 App test·lint·format·platform build와 strict OpenSpec validation을 실행하고 미실행·외부 검증 공백을 명시한다.
- [ ] 4.4 전체 scope와 승인 snapshot이 일치할 때 delta spec을 active specs에 동기화해 change를 archive하고 archive 후 validation을 통과시킨다.
