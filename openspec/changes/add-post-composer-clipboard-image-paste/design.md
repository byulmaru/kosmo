## Context

`PostComposer`는 공용 React Native `TextArea`로 본문 focus를 관리하고, 자식 `PostComposerMediaControls`가 picker 결과, item별 local preview, 업로드 lifecycle과 제출용 Media 값을 소유한다. Web의 clipboard image는 browser DOM `paste` event와 `File`에서만 얻을 수 있지만 React Native `TextInputProps`에는 동일한 cross-platform clipboard File 계약이 없다.

현재 Media control은 `ImagePickerAsset.file`이 있으면 그 byte를 직접 PUT하고, 없으면 local URI를 fetch한 Blob을 PUT한다. Web blob preview는 제거·unmount 때 이미 revoke한다. 따라서 새 source가 별도 Media state나 mutation을 만들 필요는 없지만, editor에 한정된 DOM event 경계와 clipboard File을 기존 asset/upload 입력에 안전하게 연결해야 한다.

PROD-639는 image-only paste와 텍스트·링크 회귀를 승인했지만 image item과 일반 텍스트가 함께 있는 payload의 결과는 아직 정하지 않았다. 이 선택은 관찰 가능한 제품 행동이므로 구현 편의로 확정하지 않는다.

## Goals / Non-Goals

**Goals:**

- Web Composer 본문에 focus한 image-only paste를 기존 picker Media 목록과 upload lifecycle에 연결한다.
- picker·paste Media를 합쳐 최대 4개, 추가 순서, preview·실패·재시도·제거·Alt Text·Sensitive Media·제출 계약을 공유한다.
- image item이 없는 Plain Text·링크 paste와 Composer 밖 paste의 browser 기본 동작을 보존한다.
- component/browser 검증에서 실제 clipboard `File`과 DOM paste event를 재현한다.

**Non-Goals:**

- Android·iOS OS clipboard 이미지 접근
- 새 MIME allowlist, byte/크기/픽셀 검증, 변환·압축·HEIC 지원
- Reply 전용 Media 버그나 별도 Composer 구현
- clipboard HTML rich-text 변환
- upload 취소·Media 삭제·orphan 정리 lifecycle

## Implementation Guidance

### Current Constraints

- 본문 `TextArea`의 ref와 Media item/upload state가 `PostComposer`와 `PostComposerMediaControls`에 나뉘어 있다. document 전역 listener를 두면 focus되지 않은 Composer나 동시에 렌더된 여러 Composer가 같은 paste를 처리할 수 있다.
- React Native의 공용 `TextInputProps`만으로 clipboard `File`을 받을 수 있다고 가정할 수 없다. Web DOM element와 `ClipboardEvent`는 platform 경계 안에서만 사용해야 한다.
- clipboard `DataTransferItem`은 `kind=file`이어도 `getAsFile()`이 `null`일 수 있고, `File.type`이 비어 있거나 image가 아닐 수 있다. 후보 추출과 storage-level 지원 여부 검증을 같은 것으로 취급하면 기존 Media Storage Service 책임을 중복한다.
- `PostComposerMediaControls`는 picker asset type을 내부 item에 그대로 보관한다. clipboard File을 별도 item state로 추가하면 preview·재시도·제거·제출 분기가 이중화된다.
- Web clipboard File에는 화면에 쓸 URI가 없으므로 object URL을 만들 수 있지만, 제거·초과 거부·Composer reset·unmount에서 해제하지 않으면 memory가 남는다.
- 혼합 image+text payload 정책이 막혀 있으므로 listener가 해당 경우 `preventDefault()` 여부를 임의로 정하면 승인되지 않은 본문 또는 Media 결과가 된다.

### Recommended Approach

1. Media control에 현재 editor ref를 전달하거나 동등하게 editor element에만 결속된 Web paste 구독을 둔다. `Platform.OS === 'web'`일 때 실제 editor DOM element에 listener를 등록하고 cleanup에서 제거한다. document/window 전역 listener는 사용하지 않는다.
2. clipboard item을 원래 순서대로 읽어 `kind=file`, non-null File, `type`이 `image/*`인 항목만 이미지 후보로 분류한다. 후보가 없는 payload는 event를 건드리지 않아 browser의 Plain Text·링크 paste를 유지한다.
3. image-only payload는 남은 슬롯만 계산한 뒤 event 기본 동작을 막고, 수용한 File마다 object URL preview와 MIME metadata를 가진 기존 upload 입력 형태로 정규화한다. picker와 clipboard가 같은 item 추가·업로드 함수로 들어가게 해 source별 lifecycle 분기를 만들지 않는다.
4. 각 수용 item은 기존 발급 → PUT → 완료 순서를 즉시 실행한다. storage가 형식·크기·픽셀 제한을 거부하면 현재 실패 item, 재시도와 제거 경계를 그대로 사용한다. 슬롯 밖 item에는 발급이나 PUT을 시작하지 않는다.
5. object URL은 item이 수용된 뒤에만 만들고, 기존 Web preview cleanup 경로가 제거·reset·unmount에서 회수하게 한다. picker Web blob URL도 같은 경로를 유지한다.
6. 순수 함수 수준에서는 clipboard item 순서·필터·남은 슬롯과 preview cleanup을 검증한다. Storybook browser test는 focus된 editor의 image-only paste, picker와의 혼합 순서, 실패·재시도·제거, text-only/link paste를 검증한다. Playwright compose E2E는 실제 DOM paste event로 image File을 전달해 upload mutation/PUT/완료와 제출 Media 순서를 확인하고, Composer 밖 paste 회귀를 확인한다.

### Allowed Alternatives

- editor element에 직접 listener를 붙이는 대신 Web 전용 wrapper/component가 DOM `onPaste`를 받고 Media control의 공용 item 추가 경계로 File을 전달할 수 있다. 이 경우에도 event scope는 실제 editor로 제한하고 Native bundle과 state를 분리하지 않아야 한다.
- clipboard File을 picker asset과 같은 최소 내부 asset shape로 정규화하거나, source-neutral upload input으로 picker asset을 좁혀 사용할 수 있다. 어느 방식이든 picker·paste가 item 상태와 upload 함수를 공유해야 한다.

### Known Traps

- `document.addEventListener('paste', ...)`로 모든 Composer를 동시에 반응시키지 않는다.
- `navigator.clipboard.read()` 권한 요청이나 polling을 추가하지 않는다. 사용자 paste event의 payload만 사용한다.
- clipboard File의 MIME·byte를 앱에서 새 allowlist로 판정하거나 변환하지 않는다. image 후보 분류 뒤 지원 여부는 기존 storage lifecycle 결과를 따른다.
- object URL, local preview URI 또는 clipboard File 이름을 Media identity나 `createPost` input에 넣지 않는다.
- paste item마다 별도 Media 목록, retry 함수 또는 submission 배열을 만들지 않는다.
- 혼합 image+text payload를 권위 없이 이미지 우선, 텍스트 우선 또는 둘 다 처리로 확정하지 않는다.

## Risks / Trade-offs

- [browser마다 clipboard item 구성과 MIME metadata가 다름] → Chromium 기반 component/E2E에서 실제 `File` event를 검증하고, non-null `image/*` File만 후보로 삼으며 나머지는 기본 paste에 남긴다.
- [여러 이미지 paste가 현재 슬롯을 초과함] → item 추가 직전에 최신 Media ref로 남은 슬롯을 다시 계산하고 초과 item에는 side effect를 만들지 않는다.
- [paste 뒤 object URL 누수] → 수용 item만 URL을 만들고 기존 제거·reset·unmount cleanup을 source-neutral하게 적용한다.
- [storage 거부가 clipboard 전용 오류처럼 보임] → picker와 같은 item 실패·재시도·제거 UI를 사용하고 별도 validation 정책을 만들지 않는다.
- [혼합 payload 처리 전 구현 착수 불가] → PROD-639 본문 또는 계약 변경 댓글에서 결과를 승인한 뒤 spec·decision·task를 갱신하고 strict validation을 다시 실행한다.

## Migration Plan

1. Web client event 경계와 기존 Media control 연결, component/browser 회귀 테스트를 같은 PROD-639 구현 slice로 배포한다.
2. GraphQL schema, persistence와 Media Storage Service는 변경하지 않는다.
3. rollback은 Web client의 paste 구독과 관련 테스트를 되돌린다. 이미 Ready가 된 Media나 작성된 Post는 기존 picker lifecycle과 같은 객체이므로 데이터 migration이 없다.

## Open Questions

- image item과 `text/plain` 또는 링크가 함께 있는 clipboard payload에서 이미지 첨부와 본문 삽입 중 무엇을 수행할지 PROD-639 upstream 결정이 필요하다. 가능한 결과는 이미지 우선, 텍스트 우선, 둘 다 처리이며 현재 OpenSpec은 어느 것도 승인된 것으로 간주하지 않는다.
