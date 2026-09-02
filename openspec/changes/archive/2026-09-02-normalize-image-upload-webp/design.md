## Context

PR #719의 `components/media/imageUpload` 경계는 Post Composer와 Profile 편집의 `ImagePickerAsset`을 받아 동일한 issue→signed PUT→complete 실행을 소유한다. 현재 PUT adapter는 `asset.file` 또는 `asset.uri`에서 읽은 원본 byte와 원본 MIME을 그대로 전송한다. PROD-881은 이 공통 transfer 경계에서 업로드 표현의 크기와 형식만 정규화하며, Media Storage Service가 저장된 원본·파생 표현과 검증을 소유하는 기존 경계는 바꾸지 않는다.

## Goals / Non-Goals

**Goals:**

- Web·Android·iOS에서 같은 `2048px` downscale와 WebP 품질 `0.8` 결과를 만든다.
- 변환 결과 byte와 `image/webp` Content-Type을 기존 signed PUT에 사용한다.
- Post와 Profile이 하나의 공통 구현과 회귀 계약을 사용한다.

**Non-Goals:**

- picker, preview, 상태 UI, 오류 분류, retry와 stale result 의미 변경
- 입력 codec allowlist 고정, metadata·투명도·애니메이션 별도 정책
- 서버 저장·파생 이미지·제한, orphan cleanup 또는 background upload 변경

## Implementation Guidance

### Current Constraints

- #719의 공통 helper는 `ImagePickerAsset`에서 PUT body를 바로 만들기 때문에 변환 결과의 URI, byte와 MIME을 함께 교체해야 한다. MIME header만 `image/webp`로 바꾸면 body와 선언 형식이 불일치한다.
- 작은 이미지도 형식을 WebP로 정규화해야 하므로 resize action의 필요 여부와 WebP encode 필요 여부를 분리해야 한다.
- aspect ratio 계산에서 두 축을 임의로 반올림하면 긴 변이 `2048px`를 넘거나 한 축이 0이 될 수 있다.
- 앱 단위 테스트는 Node에서 실행되므로 native image module 자체를 실제 decode하는 테스트와 순수 크기 계산·PUT 연결 테스트를 구분해야 한다.

### Recommended Approach

- Expo SDK와 Web·Android·iOS를 함께 지원하는 `expo-image-manipulator`를 앱 dependency로 추가한다.
- 공통 업로드 경계에서 원본 width/height로 목표 크기를 계산한다. 긴 변이 `2048px` 이하이면 resize action을 생략하고, 초과하면 긴 변을 정확히 `2048px`로 두고 다른 축은 라이브러리의 비율 유지 계산에 맡긴다.
- 원본 URI를 이미지 조작 context로 읽어 필요한 resize를 적용한 뒤 `WEBP`, `compress: 0.8`로 한 번 저장한다.
- 저장 결과 URI에서 Blob을 읽어 signed PUT body로 보내고 Content-Type을 `image/webp`로 고정한다. 기존 issue→transfer→complete와 active guard는 그대로 감싼다.
- 단위 테스트는 기준 초과 landscape/portrait, 정사각형, 기준 이하와 정확한 경계값을 포함하고, 변환 adapter의 호출 인자와 PUT body/header 연결을 검증한다. 실제 플랫폼 decode·WebP 결과는 Web 검증에서 확인한다.

### Allowed Alternatives

- 같은 Expo SDK 지원 범위에서 동일한 출력 dimension, WebP 품질과 PUT 계약을 증명하는 다른 공식 Expo 이미지 변환 API를 사용할 수 있다.

### Known Traps

- picker의 `quality` 옵션만 설정하면 clipboard 입력과 공통 Profile/Post transfer 경계를 포괄하지 못하고 WebP 출력도 보장하지 못한다.
- 기준 이하 이미지에서 변환 자체를 생략하면 원본 JPEG/PNG byte와 Content-Type이 전송되어 형식 정규화 계약을 위반한다.
- 각 consumer에서 변환하면 #719가 제거한 중복 upload adapter가 다시 생긴다.

## Risks / Trade-offs

- [WebP encode가 업로드 시작 전 CPU와 메모리를 사용함] → 업로드 시도당 한 번만 encode하고 dimension을 `2048px` 이내로 제한하며 플랫폼 검증에서 큰 입력을 확인한다.
- [변환 실패가 기존 일반 upload 실패로 보임] → 오류 분류 정책을 확장하지 않고 기존 field/item 실패 보존과 명시적 재시도를 유지한다.
- [플랫폼별 codec 결과 byte가 완전히 같지 않을 수 있음] → byte equality가 아니라 출력 dimension, WebP 형식, 품질 옵션과 PUT 계약을 검증한다.

## Migration Plan

1. PROD-688 / PR #719가 제공하는 공통 업로드 경계 위에 변경을 적용한다.
2. 공통 단위 테스트와 Post/Profile 회귀 테스트를 통과시킨다.
3. Web에서 실제 이미지 변환·업로드를 확인한 뒤 Stack layer를 Ready로 전환한다. Android/iOS 기기·시뮬레이터 수동 검증은 별도 후속 범위이며 이 change의 완료 gate가 아니다.
4. 문제가 있으면 해당 Stack layer를 되돌려 #719의 원본 byte 업로드 동작으로 복귀한다. 서버 migration이나 데이터 rollback은 필요하지 않다.

## Open Questions

없음.
