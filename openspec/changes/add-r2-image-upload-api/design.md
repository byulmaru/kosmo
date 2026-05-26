## 맥락

API 앱은 Hono를 사용하고 있으며 현재 루트 `/health`와 `/graphql` 엔드포인트를 가진다. 요청 컨텍스트 생성은 GraphQL 전에 이미 실행되므로 REST route에서도 동일한 bearer session 인증 정보를 재사용할 수 있다. 이미지 바이너리 업로드는 GraphQL mutation보다 REST multipart endpoint로 처리하는 편이 적합하다.

이번 변경은 업로드 자체에 집중한다. API 요청 처리 중 이미지 변환, WebP 인코딩, 썸네일 생성, thumbhash 생성은 하지 않는다. 해당 작업은 추후 워커/파이프라인 변경에서 처리한다.

ActivityPub 서비스 특성상 미디어는 로컬 업로드뿐 아니라 리모트 URL도 표현해야 한다. 따라서 `file`은 우리 R2에 저장된 물리 파일, `media`는 제품에서 참조하는 논리 미디어로 분리한다. 리모트 미디어는 lazy image proxy가 처리하기 전까지 파일 참조 없이 remote metadata만 가질 수 있다.

## 목표 / 비목표

**목표:**

- `/api`나 `/rest` prefix 없이 API 루트에 `POST /upload`를 추가한다.
- 기존 bearer token context에서 파생된 인증 session을 요구한다.
- `multipart/form-data`의 `image` 파일 필드를 받는다.
- 업로드 최대 크기를 endpoint 정책 상수로 제한한다.
- 이미지 파일 MIME type으로 보이지 않는 입력은 거부한다.
- 입력 파일 stream을 R2에 업로드한다.
- 업로드된 R2 객체를 `file` row로 저장한다.
- 로컬 업로드를 `source = LOCAL`인 `media` row로 저장하고 account, optional profile, original file ref를 연결한다.
- 리모트 ActivityPub 이미지는 `source = REMOTE`인 `media` row로 URL/actor/fetchedAt metadata를 저장할 수 있게 한다.
- 성공 응답은 media id, file key, public URL, content type을 반환한다.

**비목표:**

- sharp 기반 이미지 디코딩/변환.
- WebP/AVIF 정규화.
- 썸네일 생성.
- thumbhash/blurhash 생성.
- 산출물 byte size/SHA-256 스트리밍 계측.
- 리모트 이미지 프록시 전체 구현.
- 이미지 moderation, virus scanning, EXIF 처리.
- 이미지 업로드용 GraphQL schema 변경.
- presigned direct browser upload.

## 결정 사항

1. REST route는 루트 Hono app에 mount한다.

   사용자-facing 경로는 `POST /upload`다. `/graphql`은 계속 GraphQL 전용 경로로 유지한다. 현재 API surface가 작으므로 `/api`나 `/rest` prefix는 추가하지 않는다.

2. 업로드 입력은 multipart `image` 필드를 사용한다.

   multipart는 브라우저와 네이티브 클라이언트에서 파일 업로드에 표준적으로 쓰이며 filename/content type metadata를 함께 보낼 수 있다. `image`가 없거나 File이 아니면 400 JSON error를 반환한다.

   REST 입력 검증은 route handler 내부 수동 검증이 아니라 Hono `validator('form', ...)` middleware 흐름으로 처리한다.

3. 현재 변경은 MIME type 기반의 가벼운 이미지 입력 검증만 수행한다.

   API는 `image/*` MIME type으로 보이지 않는 입력을 거부한다. 실제 디코딩 가능 여부, 애니메이션 처리, EXIF 정규화, 변환 실패 처리는 후속 이미지 처리 워커에서 다룬다.

4. R2 업로드는 S3-compatible client를 사용한다.

   R2는 S3 API와 호환되므로 `@aws-sdk/client-s3`를 사용한다. 런타임 설정으로 S3-compatible endpoint, bucket, credentials, public base URL을 받는다.

   R2 helper는 REST 전용 코드가 아니므로 `apps/api/src/utils/` 아래에 둔다. 저장 입력은 `Buffer`로 고정하지 않고 S3 `Body` 호환 stream/blob payload를 받는다.

   `R2_ENDPOINT`는 서버가 S3 API에 접근하기 위한 endpoint이고, `R2_PUBLIC_BASE_URL`은 업로드 성공 응답에서 클라이언트에 반환할 공개 URL을 만들기 위한 base URL이다. R2 API endpoint는 보통 객체 조회용 공개 URL과 다르므로 둘을 분리한다.

5. 추가 환경변수는 명시적으로 관리한다.

   필요한 환경변수는 `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`이다. 업로드 최대 크기는 환경변수가 아니라 route 정책 상수로 관리한다.

6. `file`과 `media`를 분리한다.

   `file`은 우리 R2에 존재하는 물리 객체다. 이번 upload endpoint는 storage key, URL, MIME type, byte size를 채운다. width, height, SHA-256은 후속 이미지 처리/계측 단계 전까지 nullable이다.

   `media`는 제품에서 참조하는 논리 미디어다. source, owner, file refs, remote metadata, thumbhash를 가진다. 로컬 업로드 직후에는 `originalFileId`만 채우고 `thumbnailFileId`와 `thumbhash`는 비워둘 수 있다.

7. 객체 key는 서버가 생성한다.

   사용자 filename을 storage path로 신뢰하지 않는다. 객체 key는 `uploads/yyyy/mm/<uuid>.<ext>` 형식을 사용한다.

## 위험 / 트레이드오프

- MIME type 검증만으로는 실제 이미지 디코딩 가능성을 보장하지 않는다. 이는 업로드 API 범위를 작게 유지하기 위한 결정이며, 워커 처리에서 보강한다.
- multipart 요청이 API memory를 많이 사용할 수 있으므로 최대 업로드 크기를 둔다.
- R2 업로드 성공 후 DB insert가 실패할 수 있다. 실패 시 업로드된 R2 객체를 정리한다.
- 리모트 image proxy와 이미지 변환 워커는 이번 변경의 비목표이므로, 모델만 준비하고 실제 fetch/cache/transform은 후속 변경으로 남긴다.
