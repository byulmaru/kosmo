## Context

현재 Expo Router root screen `apps/app/src/app/index.tsx`는 session이 valid면 `/home`으로 이동하고, guest 또는 session query 오류에는 Welcome을 표시한다. Web `시작하기`는 Expo `Link`와 `startWebLoginFromPress`를 함께 사용해 `/login` 문서 이동 의미를 보존하며 native는 AuthSession과 Relay session 교환을 사용한다.

Welcome presentation은 full `BrandLogo`를 별도 84px header에 width 136으로 두고, Hero에서 `KOSMO` eyebrow, 임시 제목·설명, CTA·각주와 개인정보 처리방침을 표시한다. `BrandLogo` full variant는 width와 `aspectRatio`만 제공해 Chrome에서 원본 1050px 높이가 layout box로 사용되는 증거가 있다.

## Goals / Non-Goals

**Goals:**

- 확정된 제품 소개, 오픈 베타, 별마루 계정·이메일 인증 카피를 표시한다.
- full logo와 Hero를 같은 column으로 구성하고 160×101px logo와 44px 상단 여백을 유지한다.
- 768/1280 공용 breakpoint로 24/48/128px Web 가로 여백을 적용한다.
- 기존 auth/session/navigation와 개인정보 처리방침 진입을 보존한다.
- 최소 unit, Web E2E, 3 viewport smoke와 Figma 1440/1024 frame으로 검증한다.

**Non-Goals:**

- auth/OIDC/session 내부, `/home` 온보딩, 다른 route copy와 개인정보 처리방침 내용 변경
- 새 logo asset, dependency, GraphQL/API/DB/schema/migration
- 새 375 Figma frame, Android/iOS 실제 기기 QA와 배포 Web smoke 완료 주장

## Implementation Guidance

### Current Constraints

- root route의 session effect, native `login` 함수, Web `Link`와 error/privacy presentation은 기존 동작을 보존해야 한다.
- Web link는 browser 기본 의미를 위해 Expo Router `Link`를 유지한다.
- `breakpoints.compact=768`, `breakpoints.full=1280`과 기존 spacing token을 사용하고 새 breakpoint를 만들지 않는다.
- React Native `Image`의 full logo geometry는 공용 `BrandLogo`에서 해결하고 root에서만 CSS override하지 않는다.
- text column은 기존 max width 620px을 넘기지 않고 짧은 화면에서는 document/ScrollView로 privacy link까지 접근할 수 있어야 한다.

### Recommended Approach

- `BrandLogo` full variant의 style을 `{ height: (width * 1050) / 1665, width }`로 만들고 기존 unit test를 이 geometry로 갱신한다.
- root에서 platform과 공용 breakpoint에 따라 horizontal padding을 계산한다. Web은 24/48/128px, native는 24px이다.
- `ScrollView` content에 top 44px과 bottom semantic spacing을 주고, full logo와 `heroContent`를 gap 32px인 단일 `hero` column에 둔다.
- eyebrow와 width별 copy 분기를 제거하고 제목·두 줄 beta notice·CTA·두 줄 account notice를 승인 문구 그대로 표시한다.
- 기존 error alert, privacy link, Web/native login branch와 session effect를 그대로 둔다.
- Web E2E는 정확한 카피와 375/1024/1440 bounding box를 같은 기존 auth route suite에서 검증한다.

### Allowed Alternatives

- beta와 account 안내는 각각 하나의 `Text`에서 자연스럽게 wrap하거나 같은 의미 순서의 두 `Text`로 나눌 수 있다. 접근성 읽기 순서와 승인 문구를 바꾸지 않아야 한다.
- `hero`와 `heroContent`의 내부 View 수는 줄일 수 있지만 logo와 heading의 같은 x 좌표, logo→heading→notice→CTA 순서와 max width를 보존해야 한다.

### Known Traps

- `aspectRatio`만 다시 사용하거나 root-only height override로 공용 full logo Web 회귀를 남기지 않는다.
- 제목에 viewport별 하드코딩 copy를 만들거나 1024px local breakpoint를 유지하지 않는다.
- presentation 변경을 이유로 session effect, Web `Link`, native AuthSession, error alert와 privacy navigation을 리팩터링하지 않는다.
- logo와 title 사이를 별도 header, flex center 또는 큰 최소 높이로 다시 분리하지 않는다.
- 새 fixture, screenshot golden, Storybook interaction 또는 전체 navigation suite로 테스트 범위를 넓히지 않는다.

## Risks / Trade-offs

- [160×101px 계산 결과의 subpixel height] → component는 정확한 비율을 사용하고 Web E2E는 rendered bounding box를 반올림해 101px로 검증한다.
- [긴 제목과 안내가 small Web에서 접힘] → text는 자연스럽게 wrap하고 375px에서 overlap·horizontal overflow·privacy 접근을 smoke한다.
- [heading locator 변경으로 auth 회귀가 가려짐] → guest, session 503와 mock OIDC 테스트를 모두 새 exact heading으로 갱신하고 기존 destination assertion을 유지한다.
- [Figma가 code와 다시 어긋남] → production 구현과 3 viewport smoke 뒤 기존 Onboarding 1440/1024 frame만 동기화하고 node read-back과 screenshot을 남긴다.

## Migration / Rollback

데이터·schema migration은 없다. 배포는 app presentation과 테스트만 바뀐다. 문제가 생기면 DSN-26 presentation commit과 `BrandLogo` geometry commit을 되돌려 기존 Welcome과 logo box로 복구할 수 있으며 auth/session 데이터에는 영향이 없다. OpenSpec archive는 code, automated test, 3 viewport smoke와 Figma sync가 모두 끝난 뒤 수행한다.

## Open Questions

없음. 배포된 `dev.kos.moe` smoke와 Android/iOS 실제 기기 QA는 구현 선택이 아니라 자동화·local·Figma 증거와 구분해 최종 보고할 미실행 검증이다.
