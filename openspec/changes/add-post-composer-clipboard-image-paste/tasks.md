## 1. PROD-639 Web Composer clipboard 이미지 붙여넣기

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/domain/objects/post-content.md`
- `docs/design/accessibility.md`
- `PROD-639`

**Deliverable**

Web 사용자가 Media 첨부를 지원하는 Post Composer 본문에 image item을 붙여넣으면 이미지가 picker Media와 같은 목록·업로드·복구·제출 흐름에 추가된다. image와 텍스트가 함께 있으면 이미지만 첨부하고 본문·selection을 보존하며, image item이 없는 텍스트·링크와 Composer 밖 paste는 기존 browser 동작을 유지한다. PROD-639는 이 결과의 구현·Web 검증이 모두 끝난 뒤 change 전체 정합성 확인과 archive를 소유한다.

**Guardrails**

- clipboard와 picker Media는 합쳐서 최대 4개이며 source와 무관하게 추가 순서, 직접 PUT lifecycle, preview·실패·재시도·제거·Alt Text·Sensitive Media와 제출 계약을 공유한다.
- paste event는 실제 focus된 Composer editor에만 결속하고 document/window 전역 감시나 별도 clipboard read 권한을 추가하지 않는다.
- 하나 이상의 image item이 있는 payload는 지원 이미지만 첨부하고 함께 제공된 Plain Text·링크·HTML을 본문에 넣지 않는다. image item이 없을 때만 기본 text/link paste를 유지한다.
- clipboard source를 위한 MIME·크기·픽셀 allowlist, 변환·압축, GraphQL/Storage lifecycle 또는 Media state를 추가하지 않는다.
- Android·iOS OS clipboard, clipboard HTML rich-text 변환과 Reply 전용 Media 버그를 이 task group에서 변경하지 않는다.

**Verification**

- clipboard image 후보 순서·필터·남은 슬롯, object URL cleanup과 기존 upload 순서를 단위 검증한다.
- Storybook browser test에서 focus된 editor의 image paste, image+text payload의 이미지 전용 처리와 본문 비변경, picker와의 순서, 최대 4개, 실패·재시도·제거, text-only/link paste, 다른 editor와 Composer 밖 paste를 검증한다.
- Playwright compose E2E에서 실제 clipboard `File`과 텍스트를 함께 붙여넣어 발급·PUT·완료 뒤 `createPost` Media 순서로 이어지고 본문·selection은 보존되는지 검증한다.
- `pnpm --filter @kosmo/app test`와 PROD-639 범위의 `apps/web/e2e/compose.e2e.ts`를 격리 테스트 DB에서 통과시킨다.
- 모든 PROD-639 task와 required verification 완료 뒤 최신 canonical·Linear·OpenSpec 정합성, archive 전후 strict validation을 확인한다.

- [x] 1.1 focus된 Web editor의 clipboard image item을 현재 남은 슬롯 순서대로 기존 Composer Media 추가·업로드 lifecycle에 연결하고 함께 제공된 Plain Text·링크·HTML은 본문에 넣지 않는다.
- [x] 1.2 picker·paste 공용 item의 preview lifecycle, 실패·재시도·제거·Alt Text·Sensitive Media와 제출 순서를 보존한다.
- [x] 1.3 image item이 있는 payload는 본문·selection을 보존하고, image item이 없는 Plain Text·링크, 다른 editor·Composer 밖 paste와 Android·iOS 입력은 기존 동작을 유지하게 한다.
- [x] 1.4 clipboard 후보·슬롯·cleanup 단위 검증과 실제 Web component/browser 회귀 검증을 추가한다.
- [x] 1.5 compose E2E로 clipboard File의 upload·제출 흐름을 증명하고 관련 app check·test를 통과시킨다.
- [ ] 1.6 모든 구현·검증 결과가 완료되면 최신 authority와 delta spec을 다시 대조하고 change 전체를 archive한 뒤 strict validation을 통과시킨다.
