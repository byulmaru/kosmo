## Context

이 기록은 DSN-26에서 확정한 비로그인 root Welcome의 제품 카피, full logo geometry와 세 단계 Web 배치를 구현 입력으로 사용한다. 기존 root route가 소유하는 Web `/login`, 유효 세션 `/home`, session fail-open과 native AuthSession은 변경하지 않는다.

## Decision Records

### full logo와 Hero를 하나의 column으로 합친다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: [DSN-26](https://linear.app/byulmaru/issue/DSN-26/) 본문, 2026-07-31 `확정된 Welcome 카피·배치 계약` 댓글과 이를 대체하는 `PR #477 리뷰 반영 — 최종 Welcome 배치 계약 정정` 댓글
- Status: Active
- Context / Problem: 별도 84px header의 logo는 제품 카피와 분리되어 있고, 화면 상단의 큰 빈 영역 때문에 첫 정보 위계가 깨진다.
- Decision Outcome: full logo를 제목과 같은 왼쪽 정렬 Hero column에 포함하고 중복 `KOSMO` eyebrow와 별도 84px header를 제거한다. 모바일 Web은 화면 상단에서 logo box까지 44px 여백을 두고 compact/full Web은 Hero 전체를 viewport 수직 중앙에 둔다.
- Alternatives Considered: 44px 상단 여백을 가진 별도 site header 유지, 작은 brand mark를 Hero 위에 배치. 전자는 logo와 메시지 분리를 남기고 후자는 로그인 화면이 full logo를 사용한다는 기존 logo 소비처 계약을 약화한다.
- Consequences: 모바일 Web root는 상단 정렬 content flow를 사용한다. compact/full Web은 대칭 vertical padding과 flex 정렬로 Hero를 중앙에 두며 빈 header나 absolute position을 추가하지 않는다.
- Confirmation / Follow-up: 375/1024/1440 Web viewport와 Figma 1440/1024 frame에서 logo와 heading의 왼쪽 정렬과 수직 순서를 확인한다.

### full logo의 layout box를 160×101px로 명시한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: [DSN-26](https://linear.app/byulmaru/issue/DSN-26/) 본문, 2026-07-31 `확정된 Welcome 카피·배치 계약` 댓글과 이를 대체하는 `PR #477 리뷰 반영 — 최종 Welcome 배치 계약 정정` 댓글, `docs/design/logo.md`
- Status: Active
- Context / Problem: full logo asset은 `1665×1050` artboard이며 현재 Web 증거에서 width 136px에 원본 height 1050px가 layout box로 사용됐다.
- Decision Outcome: Web Welcome full logo는 1665:1050 비율의 `160×101px` box를 사용한다. `BrandLogo` full variant는 입력 width에서 계산한 height를 style에 명시한다.
- Alternatives Considered: `aspectRatio`와 width만 유지, root route에서만 height override. 전자는 현재 Web 회귀를 막지 못했고 후자는 공용 component가 잘못된 box를 다시 만들 수 있다.
- Consequences: full variant의 명시적 height 계산을 unit test로 고정하고 mark variant의 square geometry는 유지한다.
- Confirmation / Follow-up: `BrandLogo.test.ts`와 Web bounding box E2E에서 width 160px, rounded height 101px를 확인한다.

### 공용 breakpoint로 24/128/256px Web 여백을 적용한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: [DSN-26](https://linear.app/byulmaru/issue/DSN-26/) 본문, 2026-07-31 `확정된 Welcome 카피·배치 계약` 댓글과 이를 대체하는 `PR #477 리뷰 반영 — 최종 Welcome 배치 계약 정정` 댓글, `docs/design/breakpoints.md`
- Status: Active
- Context / Problem: root Welcome은 component-local 1024px 분기를 사용해 canonical 768/1280 단계와 어긋나며 small/medium/large Web 완료 조건을 직접 표현하지 못한다.
- Decision Outcome: `<768px`은 24px, `768~1279px`은 128px, `>=1280px`은 256px 가로 여백을 사용한다. 모바일 Web heading은 `word-break: keep-all`로 단어 경계 줄바꿈을 우선한다. Android/iOS presentation geometry와 줄바꿈 보장은 이 결정의 범위가 아니다.
- Alternatives Considered: 현재 48/128px과 1024px cutoff 유지, 새 Welcome 전용 breakpoint 추가. 둘 다 공용 3단계 계약과 소비자 일관성을 약화한다.
- Consequences: component-local 1024 숫자를 제거하고 `breakpoints.compact`, `breakpoints.full`만 분기에 사용한다.
- Confirmation / Follow-up: 375/1024/1440 Web bounding box에서 x=24/128/256, compact/full content center와 375 heading `keep-all`을 검증한다.

### 카피와 presentation만 바꾸고 기존 인증 분기를 보존한다

- Decision Date: 2026-07-31
- Decision Class: Derived Contract
- Authority / Provenance: [DSN-26](https://linear.app/byulmaru/issue/DSN-26/) 본문과 2026-07-31 확정 댓글, [PROD-226](https://linear.app/byulmaru/issue/PROD-226)
- Status: Active
- Context / Problem: Welcome redesign가 login/OIDC/session 동작까지 확장되면 완료된 인증 계약과 별도 ownership을 침범한다.
- Decision Outcome: 승인된 제목·오픈 베타·계정·이메일 안내만 교체하고 Web `/login` 문서 이동, 유효 세션 `/home`, session query 오류의 Welcome 유지와 native AuthSession을 변경하지 않는다.
- Alternatives Considered: CTA를 새 가입 route로 분리, session error에 별도 blocking UI 표시. 둘 다 DSN-26 제외 범위이며 새 제품 계약을 요구한다.
- Consequences: 기존 auth E2E는 새 heading locator로 갱신하되 세션 flow assertion은 유지한다.
- Confirmation / Follow-up: guest, session query 503와 mock OIDC E2E를 모두 통과시킨다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
