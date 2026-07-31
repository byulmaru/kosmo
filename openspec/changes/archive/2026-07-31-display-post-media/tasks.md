## 1. PROD-571 Post 목록·상세 Media 표시

**Authority / Provenance**

- `docs/domain/objects/post-content.md`
- `docs/domain/objects/media.md`
- `docs/design/accessibility.md`
- `memory/frontend-react-native.md`
- PROD-570
- PROD-571

**Deliverable**

일반 Post 목록과 상세가 현재 Post Content의 최대 4개 이미지를 document 순서로 표시하고, media-only Post,
Alt Text, Sensitive Media와 이미지 오류·재시도를 접근 가능한 공용 Web·iOS·Android UI로 제공한다.

**Guardrails**

- viewer-authorized `PostContent.media`만 사용하고 standalone Media 조회, storage reference 조립 또는 Media
  Storage Service 호출을 추가하지 않는다.
- Sensitive Media 공개 전에는 실제 Image를 mount하지 않는다.
- `PostContent.media`의 empty와 unavailable을 구분하고 한 Media의 load 실패를 Post 나머지 내용에서 격리한다.
- retry는 현재 표시 URL의 Image load만 다시 시작하며 GraphQL refetch, URL 변형 또는 새 URL 발급을 추가하지
  않는다.
- 기존 본문·안전한 링크와 목록·상세 navigation을 회귀시키지 않는다.

**Verification**

- media-only, text+media, Media 없음, 1~4개 순서와 목록·상세 공용 표시를 검증한다.
- Alt Text/null Alt Text의 accessible name과 Sensitive Media 초기 가림·표시·다시 가리기 state를 검증한다.
- 표시 정보 unavailable, 개별 load 실패, 다른 내용 유지, retry remount와 반복 실패를 검증한다.
- Web keyboard interaction과 Storybook a11y/static build를 확인하고 iOS·Android touch·screen reader 검증 결과와
  미실행 범위를 구분해 기록한다.
- Relay compiler, app static check, 관련 unit/component test와 formatter를 통과시킨다.

- [x] 1.1 공용 Post body가 viewer-authorized ordered Media를 조회하고 media-only·text+media를 목록·상세에 표시한다.
- [x] 1.2 Alt Text fallback, Sensitive Media 공개 control과 Media unavailable·load failure·retry 동작을 구현한다.
- [x] 1.3 목록·상세 Storybook 상태와 공용 component interaction·accessibility·navigation 회귀 검증을 추가한다.
- [x] 1.4 Relay·static check·관련 test·Storybook build·format 검증을 실행하고 플랫폼별 증거와 미검증 범위를 기록한다.

## Verification Evidence

- 2026-07-30 `pnpm --filter @kosmo/app lint:tsc`: Relay compiler와 TypeScript static check 통과.
- 2026-07-30 `pnpm --filter @kosmo/app test:unit`: 90개 통과. Media 순서·상한, nullable Alt Text,
  Sensitive Media 미mount·표시·다시 가리기, 개별 실패·same-URL retry와 unavailable을 포함한다.
- 2026-07-30 `pnpm --filter @kosmo/app test:storybook`: Chromium에서 전체 17 files, 211 tests 통과.
  목록·상세의 media-only/text+media, 4개 순서, Web keyboard 공개·가리기, 개별 load 실패·재시도,
  unavailable과 기존 navigation을 포함한다.
- 2026-07-30 `pnpm --filter @kosmo/app build-storybook`: static build 통과. Storybook a11y는 저장소
  설정상 color contrast를 제외하므로 전체 WCAG 적합성 증거가 아니다.
- 2026-07-30 관련 ESLint, Prettier check와 `openspec validate display-post-media --strict` 통과.
- iOS VoiceOver·Android TalkBack, 각 플랫폼 touch target과 실제 binary runtime은 현재 환경에서 실행하지
  않았다. 공용 React Native props와 48 logical-unit target을 구현했지만 Native runtime 검증 완료로
  간주하지 않는다.
