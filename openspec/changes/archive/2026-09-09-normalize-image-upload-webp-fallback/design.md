## Context

공통 업로드 경계는 Expo Image Manipulator로 이미지를 축소한 뒤 WebP byte를 읽어 signed URL에 직접 PUT한다. Web 구현은 canvas가 요청한 `image/webp`를 실제로 만들었는지 결과 MIME으로 확인하므로, Safari처럼 WebP encoding을 지원하지 않는 브라우저에서는 PNG가 반환되어 변환 단계가 실패한다. 이 change는 그 미지원 결과만 PNG로 재시도해 업로드를 완료하게 하며, WebP 지원 환경의 경로와 기존 Media lifecycle은 그대로 둔다.

## Goals / Non-Goals

**Goals:**

- WebP encoding이 지원되는 환경에서 기존 품질 `0.8` WebP 결과와 `image/webp` PUT을 유지한다.
- 요청한 WebP를 만들 수 없어 PNG 결과가 반환되는 Web 환경에서 같은 resize 결과를 PNG byte와 `image/png` Content-Type으로 전송한다.
- fallback에서도 긴 변 최대 `2048px`, 비율 유지와 no-upscale, issue→정규화→read→PUT→complete 순서를 유지한다.
- Post Composer picker/clipboard와 Profile avatar/header가 공통 경계를 통해 같은 결과를 사용하도록 한다.

**Non-Goals:**

- HEIC/HEIF decoder, 입력 codec allowlist, metadata·투명도·애니메이션 정책
- WebP 지원 환경의 출력 형식·품질 변경, 새 압축·byte 정책 또는 dependency 추가
- 일반 변환·read·PUT·complete 실패의 오류 의미 변경, 자동 retry·취소·orphan cleanup
- Media Storage Service, GraphQL, persistence와 Native Blob 동작 변경

## Implementation Guidance

### Current Constraints

- 공통 업로드 경계가 변환 결과를 읽고 signed PUT Content-Type을 결정하므로 consumer별 fallback을 두면 picker/clipboard와 Profile의 결과가 달라진다.
- Web Image Manipulator는 요청한 MIME과 실제 canvas 결과 MIME이 다르면 encoding 미지원 오류로 변환을 거부한다. Safari 경로는 이 오류에서 PNG가 실제 결과라는 사실을 보존해야 한다.
- PNG는 WebP와 같은 품질 인자를 표현하지 않을 수 있다. 따라서 이번 fallback의 핵심은 동일한 크기 정규화와 실제 byte/MIME 일치이며, PNG에 새 품질 계약을 만들지 않는다.
- signed PUT 이전의 변환 오류와 PUT 이후 오류는 현재 공통 오류·Sentry 경계를 공유하므로, fallback 판별이 일반 오류를 삼키지 않아야 한다.

### Recommended Approach

1. 기존 WebP 변환을 먼저 실행하고, 성공하면 현재 WebP byte와 `image/webp` 경로를 그대로 사용한다.
2. 변환 API가 요청한 WebP를 만들 수 없다고 식별되는 경우에만 같은 이미지 변환 결과를 PNG로 저장한다. 실제 결과가 `image/png`인 경우에만 fallback 성공으로 취급하고, 다른 오류는 현재 실패 경계로 전달한다.
3. PNG fallback의 byte와 Content-Type을 함께 공통 upload 값으로 전달해 signed PUT body가 `image/png`와 일치하게 한다. 원본 byte 또는 원본 Content-Type을 재사용하지 않는다.
4. fallback 분기는 공통 경계 안에 두고 picker/clipboard와 Profile이 같은 upload lifecycle을 통과하게 한다. issue, stale generation, retry, complete와 실패 원인 수집의 기존 순서를 유지한다.
5. WebP 지원 브라우저와 WebKit/Safari 유사 환경에서 차원, body, Content-Type, PUT/complete 순서를 실행 검증한다. 실제 Safari full flow evidence는 확보된 경우에만 별도 기록한다.

### Allowed Alternatives

- 변환 결과의 MIME mismatch를 기존 오류 객체의 명확한 신호로 판별하거나, Web 전용 변환 adapter에서 동일한 신호를 판별할 수 있다. 어느 방식이든 WebP encoding 미지원으로 PNG가 된 경우만 fallback해야 한다.
- PNG fallback byte를 기존 asset 결과 객체에 MIME과 함께 보관하거나 source-neutral upload 값으로 좁혀 전달할 수 있다. consumer별 upload 구현을 복제하지 않는 조건을 지킨다.

### Known Traps

- 모든 이미지 변환 오류를 PNG retry로 바꾸면 decode 실패와 손상된 입력의 오류 의미가 사라진다.
- WebP를 지원하는 브라우저에서 항상 PNG를 선택하면 기존 저장 형식과 품질 계약을 불필요하게 바꾼다.
- PNG byte를 보내면서 `image/webp` header를 유지하거나, 반대로 body와 무관하게 header만 바꾸면 Storage Service의 byte/MIME 일치 경계를 깨뜨린다.
- consumer별 fallback, 원본 직접 PUT, Media Storage Service의 새 MIME 정책과 Native 전용 분기를 추가하지 않는다.

## Risks / Trade-offs

- [브라우저가 WebP 미지원 여부를 변환 오류로 다르게 표현할 수 있음] → 현재 Web 구현이 반환하는 실제 MIME mismatch 신호를 기준으로 좁게 판별하고, Safari 실제 흐름과 WebP 지원 브라우저를 함께 검증한다.
- [PNG fallback은 WebP 품질 인자를 동일하게 표현하지 않을 수 있음] → 새 PNG 품질 요구를 만들지 않고 크기 축소, 비율, no-upscale과 byte/MIME 일치만 계약으로 유지한다.
- [fallback 재시도로 변환 호출이 한 번 더 실행됨] → WebP 성공 경로에는 재시도를 하지 않고, 미지원 신호에서만 같은 공통 lifecycle 안에서 PNG를 시도한다.

## Migration Plan

배포 시 클라이언트 공통 업로드 경계와 실행 검증을 함께 반영한다. 서버·데이터 migration은 없으며, rollback은 PNG fallback 분기와 관련 검증을 되돌려 기존 WebP 실패 동작으로 복원한다.

## Open Questions

없음.
