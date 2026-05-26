## 1. 의존성과 데이터 모델

- [x] 1.1 `pnpm`으로 S3-compatible R2 client와 Hono zod validator 의존성을 추가한다.
- [x] 1.2 물리 R2 객체와 논리 로컬/리모트 미디어 metadata를 위한 `Files`, `Media` 테이블을 추가한다.
- [x] 1.3 `Files`/`Media` table discriminator, `MediaSource` enum, file reference와 account/profile ownership Drizzle relation을 추가한다.
- [x] 1.4 R2 endpoint, bucket, access key, secret key, public base URL 런타임 설정을 `packages/core/env.ts`에서 zod로 파싱하고 업로드 최대 크기 상수를 정의한다.
- [x] 1.5 S3 `Body` 호환 payload와 content type, generated key로 저장하는 작은 R2 upload helper를 구현한다.

## 2. REST route 구조

- [x] 2.1 REST route를 모으는 `apps/api/src/rest/index.ts`를 만든다.
- [x] 2.2 `POST /upload` Hono route를 가진 `apps/api/src/rest/upload.ts`를 만든다.
- [x] 2.3 `/graphql`과 `/health` 동작을 바꾸지 않고 REST route를 API 루트에 mount한다.

## 3. Upload endpoint 동작

- [x] 3.1 `c.get('context').session` 인증 session을 요구하고 anonymous 요청은 HTTP 401 JSON으로 반환한다.
- [x] 3.2 `@hono/standard-validator`와 zod schema로 `multipart/form-data`를 파싱하고 `image` file field를 요구한다.
- [x] 3.3 원본 업로드 최대 byte size를 강제하고 초과 시 HTTP 413 JSON으로 반환한다.
- [x] 3.4 허용된 이미지 MIME type이 아닌 파일은 HTTP 400 JSON으로 반환한다.
- [x] 3.5 `uploads/yyyy/mm/` 형식의 object key를 서버에서 생성한다.
- [x] 3.6 입력 파일 stream을 R2에 업로드하고 R2 실패 시 HTTP 502 JSON으로 반환한다.
- [x] 3.7 R2 업로드 성공 후 `file` row와 `source = LOCAL` `media` row를 insert하고, DB persistence 실패 시 가능한 범위에서 업로드된 R2 객체를 정리한다.
- [x] 3.8 HTTP 201 JSON으로 local media `id`, file `key`, `url`, `contentType`을 반환한다.

## 4. 후속 작업으로 분리

- 이미지 디코딩 검증, WebP/AVIF 변환, 썸네일 생성, thumbhash 생성은 워커 기반 후속 변경으로 설계한다.
- 산출물 stream의 byte size와 SHA-256 계측은 후속 처리 파이프라인에서 설계한다.

## 5. 검증

- [x] 5.1 `pnpm --filter @kosmo/api lint:tsc`를 실행하고 type error를 수정한다.
- [x] 5.2 변경된 API/core DB 파일에 대해 관련 ESLint check를 실행하고 lint error를 수정한다.
- [ ] 5.3 R2 credentials가 있으면 authenticated, anonymous, invalid MIME type, oversized file, successful upload 요청을 대표 케이스로 수동 검증한다.
