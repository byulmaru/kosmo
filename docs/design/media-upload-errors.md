# 이미지 업로드 오류 안내

Post Composer와 Local Profile 편집은 Media Storage Service로 직접 전송하는 이미지 업로드 실패를 같은
분류와 복구 정책으로 안내한다. 이 문서는 `PROD-657`의 사용자-facing 계약을 소유하며, 저장 서비스의 원문
오류나 내부 정보를 화면에 노출하지 않으면서 사용자가 다른 이미지를 선택할지 재시도할지 판단할 수 있게 한다.

## 공통 오류 모델

업로드 오류는 실패 단계와 사용자-facing 원인을 서로 독립적으로 기록한다.

| 차원 | 값                   | 의미                                                                     |
| ---- | -------------------- | ------------------------------------------------------------------------ |
| 단계 | `issue`              | Kosmo에서 Uploading Media와 제한된 upload URL을 발급받지 못했다          |
| 단계 | `transfer`           | 선택한 byte를 signed URL에 PUT하지 못했다                                |
| 단계 | `complete`           | PUT 성공 뒤 Kosmo에서 같은 Media의 Ready 전환을 확인하지 못했다          |
| 원인 | `unsupported-format` | 지원하지 않는 형식이거나 선언한 Content Type과 실제 이미지 형식이 다르다 |
| 원인 | `file-too-large`     | 이미지 byte가 업로드 용량 상한을 넘는다                                  |
| 원인 | `image-too-large`    | 긴 변 또는 전체 pixel 수가 이미지 해상도 상한을 넘는다                   |
| 원인 | `invalid-image`      | 형식은 식별됐지만 손상되었거나 decode할 수 없다                          |
| 원인 | `transient`          | 네트워크·일시적 서버 오류이거나 안전하게 세분할 수 없는 실패다           |

`issue`와 `complete` 단계의 현재 GraphQL 실패는 `transient`로 분류한다. `transfer` 단계의 non-2xx 응답은
HTTP status와 `{ error: { code } }` 형태의 machine-readable code가 모두 아래 조합과 일치할 때만 세분한다.

| HTTP status | 허용 code                                          | 사용자-facing 원인   |
| ----------- | -------------------------------------------------- | -------------------- |
| `415`       | `unsupported_image`, `content_type_mismatch`       | `unsupported-format` |
| `413`       | `size_limit_exceeded`                              | `file-too-large`     |
| `422`       | `pixel_limit_exceeded`, `dimension_limit_exceeded` | `image-too-large`    |
| `422`       | `invalid_image`                                    | `invalid-image`      |

네트워크 실패, `5xx`, 알 수 없는 status/code 조합, 비어 있거나 유효하지 않은 JSON은 `transient`로
폴백한다. Storage Service의 `error.message`, 응답 본문, upload URL, request header와 내부 식별자는 화면 문구나
accessible name에 사용하지 않는다.

## 사용자 문구

각 consumer는 외부 응답이 아니라 현재 UI가 소유한 안전한 `{subject}`를 제공한다. Post Composer는 선택 순서를
반영한 `1번째 이미지` 같은 항목 이름을, Profile 편집은 `아바타 이미지` 또는 `헤더 이미지`를 사용한다.

| 조건                   | 문구                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| `unsupported-format`   | `{subject}는 지원하지 않는 이미지 형식이에요.`                      |
| `file-too-large`       | `{subject} 파일이 너무 커요. 16 MiB 이하의 이미지를 선택해 주세요.` |
| `image-too-large`      | `{subject} 해상도가 너무 커요. 더 작은 이미지를 선택해 주세요.`     |
| `invalid-image`        | `{subject} 파일을 읽을 수 없어요. 다른 이미지를 선택해 주세요.`     |
| `issue + transient`    | `{subject} 업로드를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.` |
| `transfer + transient` | `{subject}를 업로드하지 못했어요. 잠시 후 다시 시도해 주세요.`      |
| `complete + transient` | `{subject} 업로드를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.` |

문구는 사용자의 다음 행동을 안내하되 서비스 구현, token, status, machine code나 원문 message를 포함하지 않는다.

## 실패 보존과 재시도

- Post Composer는 실패한 항목의 preview와 순서를 유지하고 해당 항목에만 재시도와 제거 action을 제공한다.
- Profile 편집은 실패한 avatar/header field의 local preview와 나머지 draft, 다른 field의 Ready Media ID를 유지한다.
- 명시적 재시도는 실패한 항목이나 field에 새 Uploading Media와 새 제한 URL을 발급받아
  `issue → transfer → complete` 전체 순서를 다시 실행한다.
- 자동 재시도, 실패한 signed URL 재사용, upload 취소와 orphan Media/object 정리는 이 정책에 포함하지 않는다.

## 처리된 실패의 Sentry 관측

- Post Composer와 Profile 편집은 각자 실패를 capture하지 않고, 두 흐름이 공유하는 이미지 업로드 경계에서 처리된 실패를 공통 Web·Native Sentry 수집 진입점으로 한 번만 전달한다.
- 실패 event에는 이 문서의 공통 오류 모델에서 안전하게 구성한 `stage`·`reason`과 `operation`을 context로 전달한다. `operation`은 `issue`, `normalize`, `read`, `put`, `complete` 중 하나이며, `transfer` 단계 안에서 정규화·normalized Blob read·signed PUT을 구분한다. 공통 업로드 경계에서 직접 확인할 수 있는 normalized-image read/PUT 응답이 있는 실패에만 숫자 `status`를 추가하고, `unsupported_image`, `content_type_mismatch`, `size_limit_exceeded`, `pixel_limit_exceeded`, `dimension_limit_exceeded`, `invalid_image` 중 하나인 경우에만 machine-readable `code`를 추가한다.
- 성공, 비활성 항목의 `null` 결과와 명시적 no-op은 Sentry 처리된 실패 event를 만들지 않는다.
- Sentry capture 실패는 원래 업로드 오류, 실패 항목 보존, 오류 UI와 재시도 동작을 바꾸지 않는다.
- 업로드에서 실제 발생한 Error는 직접 capture에 전달하거나 기존 UI 분류 wrapper의 표준 `cause` chain에 원본 객체를 연결하여 원래 message·stack·cause를 모든 오류 단계에서 보존한다. 기존 UI 분류 wrapper는 유지할 수 있지만, 원본 오류 연결 없이 수집만을 위한 일반 메시지의 새 Error로 대체하거나 복제·전역 정제하지 않는다. 이 진단 정보는 Sentry에서 사용하며 사용자-facing 오류 분류와 안내 문구는 기존 정책을 유지한다.
- 새 관측 context에는 위에서 허용한 진단 필드만 넣는다. 이미지 byte, File/Blob, signed upload URL, 인증 토큰, raw request/response와 사용자 콘텐츠를 오류나 context에 별도로 첨부하지 않는다.
- SDK가 생성한 원본 Error는 data/blob/file URI가 message·stack·cause에 포함되어 있어도 수정 없이 보존한다. 업로드 경계는 URI 치환, message·stack 변경이나 오류 복제를 하지 않는다. SDK 오류에 이미 포함된 진단을 보존하는 것과 이미지·토큰·raw response를 별도로 첨부하는 것을 구분한다.

## 접근성

- 새 실패 문구는 해당 항목이나 field의 오류 상태에서 한 번 alert로 전달하며 같은 render의 다른 상태 문구와
  중복 announcement하지 않는다.
- 재시도 action의 accessible name은 `{subject} 업로드 다시 시도`처럼 대상과 행동을 함께 식별한다.
- 시각 문구, alert와 accessible name은 같은 실패 대상과 복구 행동을 가리키며 색상만으로 원인이나 상태를
  구분하지 않는다.
- Web·iOS·Android의 role, live region과 interactive target은 [접근성 기준](./accessibility.md)을 따른다.

## 검증 경계

- 공통 분류는 정상 PUT, 각 허용 status/code 조합, 네트워크 실패, `5xx`, malformed/unknown 응답과 단계별
  fallback을 단위 테스트로 고정한다.
- 공통 업로드 경계가 처리된 실패를 한 번만 보고하고 성공·no-op은 보고하지 않으며, 허용된 `stage`·`reason`과
  원래 오류 결과를 보존하는지 검증한다. 직접 전달하거나 표준 `cause` chain으로 연결한 실제 Error의 객체 identity·message·stack·cause 보존과 관측 context에
  민감한 입력·URL·토큰·응답 본문이 추가되지 않는지를 실행 결과로 검증한다. 관측 실패가 업로드 결과를 바꾸지
  않는지도 확인한다.
- Post Composer와 Profile 편집은 같은 분류 결과를 각 UI 상태에 연결하고 실패 보존·항목별 재시도·accessible
  name을 유지하는지 component test로 검증한다.
- 현재 Web 출시 gate에서는 실제 browser 흐름을 검증한다. 공용 React Native 자동화는 유지하지만 Web 결과를
  Android·iOS 실제 기기 업로드와 보조 기술 검증의 완료 증거로 사용하지 않는다.

## 제외 범위

- Media Storage Service의 status/code 또는 제한 변경
- Kosmo GraphQL schema, Media 상태와 persistence 변경
- 자동 retry, backoff, offline queue와 background upload
- Media Worker request ID와 구조화 로그
- HEIC/HEIF 지원이나 client-side 변환
- upload 취소, 실패 object와 orphan Media 정리
