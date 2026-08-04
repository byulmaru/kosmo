## Context

PROD-571이 제공한 공용 Post Media renderer는 `PostContent.media`를 document 순서대로 최대 4개 받아 목록과 상세에서 같은 이미지·Alt Text·Sensitive·오류·재시도 동작을 제공한다. 현재 gallery는 각 이미지를 세로로 나열하고 각 이미지 컴포넌트가 측정한 원본 비율을 자신의 frame에 적용하므로, 다중 이미지를 고정 surface의 tile로 바꾸려면 layout 책임과 이미지 상태 책임을 분리해야 한다.

현재 Post 목록과 상세은 같은 `PostBody`와 Media renderer 경로를 사용한다. 따라서 이 변경은 API·Relay·route별 분기 없이 presentation 경계에서 완료할 수 있으며, PROD-650의 상세 viewer나 이미지 tile navigation을 미리 추가하지 않는다.

## Goals / Non-Goals

**Goals:**

- 한 장의 기존 비율 동작을 보존하면서 두 장부터 네 장까지 승인된 개수별 surface와 document 순서로 배치한다.
- gallery가 Post body 폭 안에서 Web·iOS·Android에 동일한 React Native layout 계약을 사용하게 한다.
- loading·ready·error와 Sensitive 공개 전후에도 tile 경계와 다중 gallery 높이를 안정적으로 유지한다.
- 기존 Alt Text, 오류 재시도, Sensitive 공개·다시 가리기와 Post navigation 의미를 보존한다.
- layout·접근성 결정과 자동화·runtime 검증 경계를 canonical design 문서에 남긴다.

**Non-Goals:**

- 이미지 viewer, tile 선택·navigation, zoom·pan·gesture, 다운로드·공유를 추가하지 않는다.
- Composer 이미지 선택·업로드, Reply·Quote 전용 배치, 서버 Media URL·authorization·metadata 계약을 변경하지 않는다.
- 새 breakpoint, 이미지 파생물, crop 위치 선택, 새 dependency나 test harness를 추가하지 않는다.

## Implementation Guidance

### Current Constraints

- gallery는 현재 최대 네 항목을 세로 `View`에 map하며 개수별 row/column 구조나 고정 surface가 없다.
- 각 이미지 frame은 `Image.getSize` 결과를 자체 `aspectRatio`로 사용한다. 이 동작은 한 장에는 필요하지만 다중 tile에 그대로 적용하면 부모 surface를 채우지 못한다.
- unavailable·error fallback은 현재 최소 높이를 가지므로 다중 tile 안에서 고정 경계를 채우도록 조정하지 않으면 gallery가 넘치거나 인접 tile을 밀 수 있다.
- Sensitive 상태는 공개 control과 이미지 surface를 같은 일반 flow에 렌더한다. 다중 공개 전후 높이를 유지하되 가림 상태에서 실제 tile을 그리지 않으려면 단일 placeholder/공개 gallery와 항상 존재하는 control의 layout 경계를 분리해야 한다.
- Reply Composer 부모 preview는 같은 공용 renderer에 `interactive=false` 경계를 전달해 Sensitive 공개와 오류 재시도 control을 의도적으로 생략한다. 목록·상세의 interactive control 계약을 이 preview에 확장하면 기존 범위를 바꾼다.
- React Native와 React Native Web을 함께 지원하므로 Web 전용 CSS Grid나 viewport별 별도 markup에 의존할 수 없다.

### Recommended Approach

공용 gallery가 Media 개수를 기준으로 React Native `View`의 중첩된 row/column flex layout을 선택한다. 한 장은 현재 이미지 컴포넌트의 측정 비율 경로를 그대로 사용한다. 두 장은 gallery 내부 폭에서 token gap을 제외한 나머지를 같은 flex 폭으로 나누고 각 tile에 1:1 비율을 적용해 row 높이를 결정한다. 세 장은 16:9, 네 장은 1:1의 승인된 전체 `aspectRatio` 안에서 tile 경계를 나눈다. 다중 이미지는 gallery가 tile 경계를 소유한 뒤 이미지·loading·error 표현이 그 경계를 채우도록 전달한다. 이 방식은 목록·상세 소비자를 바꾸지 않고 기존 데이터·상태 책임을 유지한다.

Sensitive Media는 별도 surface 안에서 단일 가림 placeholder와 공개된 gallery를 교체한다. 한 장의 가림 surface는 1:1이며 공개 뒤 기존 한 장 비율로 전환할 수 있다. 두 장은 같은 정사각 tile row geometry의 높이, 세 장은 16:9, 네 장은 1:1 surface를 가림과 공개 상태에 함께 사용하되 가림 상태에서는 실제 tile과 내부 gap을 렌더하지 않는다. 일반 목록·상세의 공개·다시 가리기 control은 두 상태에 공통인 안정된 형제로 유지한다. 비대화형 Reply Composer 부모 preview는 같은 단일 placeholder surface를 사용하지만 공개·재시도 control을 렌더하지 않는다.

다중 gallery는 기존 theme의 spacing·radius token을 재사용하되 외곽 border를 두지 않고 tile은 `cover`로 경계를 채운다. tile 자체에는 press handler나 interactive role을 추가하지 않는다. 기존 재시도와 Sensitive control은 interactive 목록·상세에서만 상호작용 가능하게 유지한다.

3장 16:9의 오른쪽 tile처럼 높이가 짧은 interactive 오류 fallback은 긴 시각 설명보다 전체 48 logical unit 재시도 control을 우선한다. 영향받은 이미지 맥락은 기존 재시도 accessible name으로 유지하고 긴 설명은 이 compact 경계에서만 생략한다. URL이 없거나 `interactive=false`라 재시도 control이 없는 fallback은 기존 오류 설명을 계속 표시한다.

### Allowed Alternatives

- gallery가 tile wrapper를 두고 이미지 표현을 채우게 하거나, 이미지 컴포넌트에 frame을 채우는 presentation prop을 전달하는 방식 모두 허용한다. 한 장의 측정 비율과 다중 fixed tile 책임이 분리되고 loading·error 표현까지 같은 경계를 채워야 한다.
- 개수별 row/column 구조를 작은 내부 presentation component나 순수 layout descriptor로 분리할 수 있다. 공개 API나 새 범용 layout abstraction을 만들지 않고 이 gallery 안에 한정해야 한다.

### Known Traps

- 다중 tile에도 원본 측정 `aspectRatio`를 적용하면 승인된 전체 surface와 같은 크기 배치가 깨진다.
- `stretch` 또는 원본 비율과 무관한 이미지 확대는 금지되며, fixed tile에서는 `cover` crop을 사용해야 한다.
- error fallback의 기존 `minHeight`와 padding을 그대로 두면 작은 tile을 넘을 수 있다.
- 짧은 tile에 긴 오류 설명과 48 logical unit 재시도 control을 함께 쌓으면 tile의 `overflow: hidden`에 control 일부가 잘릴 수 있다.
- Sensitive 이미지를 가림 상태에서 미리 mount하거나 크기 측정용으로 load하면 기존 공개 전 byte 미로드 계약을 깨뜨린다.
- Sensitive 가림 상태에서 공개 gallery의 빈 tile wrapper를 렌더하면 실제 이미지를 가렸는데도 분할선과 내부 gap이 노출된다.
- visibility control을 상태별로 다른 element로 교체하면 Web focus 유지와 screen reader state가 깨질 수 있다.
- 일반 목록·상세의 control을 `interactive=false` 부모 preview에도 강제로 추가하면 Reply Composer의 기존 비대화형 의미와 Storybook 계약을 깨뜨린다.
- 이미지 tile을 `Pressable`로 감싸면 Post shortcut·상세 link와 중첩된 interactive semantics가 생기며 PROD-650 범위를 선점한다.

## Risks / Trade-offs

- [고정 tile의 `cover`로 이미지 일부가 crop된다] → 개수별 surface를 compact하게 유지하는 승인된 trade-off이며 원본을 늘이거나 찌그러뜨리지 않고 중앙 crop을 사용한다.
- [두 장 gallery의 최종 외곽 비율은 token gap 때문에 정확한 2:1보다 조금 넓다] → 이미지 영역의 2:1과 두 정사각 tile을 우선하고 실제 외곽 높이를 tile 한 변에서 파생한다.
- [한 장 Sensitive placeholder는 공개 뒤 가로 원본 비율로 줄어들 수 있다] → 공개 전 byte 미로드와 서버 계약 제외를 우선하고, 사용자가 승인한 1:1 초기 surface를 명시한다.
- [Native flex·aspectRatio 결과가 Web과 미세하게 다를 수 있다] → component/layout 자동화와 Web·iOS·Android runtime 관찰을 분리해 기록한다.
- [기존 Post navigation과 내부 control 이벤트가 충돌할 수 있다] → tile은 비상호작용으로 유지하고 재시도·visibility control 실행이 부모 navigation을 함께 발생시키지 않는지 검증한다.

## Migration Plan

DB·API·저장 데이터 migration 없이 공용 presentation을 한 번에 교체한다. 자동화와 플랫폼 runtime 검증 결과를 PR에 구분해 기록하고, 회귀가 확인되면 renderer 변경과 design/spec delta를 함께 되돌려 기존 세로 나열 동작으로 복구한다. PROD-650은 이 change의 전체 완료와 archive 뒤 착수할 수 있다.

## Open Questions

없음.
