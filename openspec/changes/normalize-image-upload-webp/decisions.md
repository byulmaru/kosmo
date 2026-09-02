## Context

이 기록은 PROD-881에서 승인된 이미지 업로드 크기·형식 정규화와 기존 Media 저장 경계를 구현 전에 고정한다. 이미지 선택, UI 상태, 오류 정책, retry, metadata와 서버 파생 표현은 결정 대상에 포함하지 않는다.

## Decision Records

### 긴 변을 최대 2048px로 축소하고 확대하지 않는다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, PROD-881
- Status: Active
- Context / Problem: 원본 고해상도 이미지는 실제 앱 표시보다 큰 byte를 전송·저장하지만, 작은 이미지를 같은 크기로 맞추기 위한 확대는 이 목표에 기여하지 않는다.
- Decision Outcome: 긴 변이 `2048px`를 초과할 때만 비율을 유지해 긴 변을 `2048px`로 축소하고, 가로와 세로가 모두 기준 이하이면 dimension을 유지한다.
- Alternatives Considered: Media Storage Service의 `4096px` 상한만 적용하는 방식은 전송량 감소 목표가 약해 제외했고, 모든 이미지를 `2048px`로 확대·축소하는 방식은 작은 입력을 불필요하게 확대하므로 제외했다.
- Consequences: landscape, portrait와 square 입력은 같은 긴 변 기준을 사용하며 별도 crop이나 화면별 크기 정책을 두지 않는다.
- Confirmation / Follow-up: 기준 초과, 정확한 경계와 기준 이하 입력에서 결과 dimension과 비율을 검증한다.

### 업로드 표현을 품질 0.8의 WebP로 통일한다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, PROD-881
- Status: Active
- Context / Problem: dimension만 줄여도 입력 형식에 따라 전송 byte와 Content-Type이 달라져 공통 업로드 표현을 보장하지 못한다.
- Decision Outcome: 성공적으로 변환 가능한 이미지는 dimension과 관계없이 품질 `0.8`의 WebP로 인코딩하고 signed PUT body와 Content-Type `image/webp`에 같은 결과를 사용한다.
- Alternatives Considered: 원본 형식 보존은 형식 정규화 목표를 만족하지 않아 제외했고, 사용자별 품질 선택은 PROD-881 범위를 넘어 제외했다.
- Consequences: 기준 이하 이미지도 WebP encode를 수행한다. 입력 codec 목록은 제품 계약으로 고정하지 않고 공통 변환 라이브러리가 처리 가능한 범위를 따르며, metadata·투명도·애니메이션의 별도 정책은 이 결정이 정의하지 않는다.
- Confirmation / Follow-up: 변환 adapter의 WebP·품질 입력과 signed PUT body/header가 같은 결과를 사용하는지 검증한다.

### 클라이언트 정규화는 저장 서비스 소유권을 바꾸지 않는다

- Decision Date: 2026-09-02
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, PROD-881
- Status: Active
- Context / Problem: 앱이 전송 전에 byte를 변환하더라도 저장된 원본·파생 표현, 형식 검증과 제공 책임을 Kosmo 앱이나 API로 옮기면 기존 Media 경계를 바꾸게 된다.
- Decision Outcome: 앱은 Media Storage Service에 제출할 입력 표현의 크기와 형식만 정규화한다. 저장 서비스는 수신 byte의 검증·저장, 저장 결과와 파생 표현을 계속 소유하고 Kosmo API는 byte proxy가 되지 않는다.
- Alternatives Considered: 서버 API에서 byte를 변환·proxy하는 방식과 Storage Service 정책을 같은 변경에서 수정하는 방식은 기존 책임 경계와 PROD-881 범위를 벗어나 제외했다.
- Consequences: GraphQL schema, Media persistence와 Storage Service API는 변경하지 않으며 클라이언트 upload adapter와 dependency만 변경된다.
- Confirmation / Follow-up: 구현 diff에 API·서버·storage contract 변경이 없고 signed URL direct PUT이 유지되는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
