## Current Constraints

조사 기준은 `e0a85fb8f32707ca64124d47b74db91555ad15c7`이다. 다음은 소스 관찰이며 배포·DB 실행 증거는 아니다.

| 경계                                   | 현재 관찰                                                    | 이번 구현에서 확인할 점                                       |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| `apps/app/public/index.html`           | 공통 OG·Twitter Card와 기본 이미지만 존재                    | 동적 태그와 기본 태그 중복 제거, 앱 bootstrap 보존            |
| `apps/web/src/server/routes/static.ts` | navigation 중심 SPA fallback, 정적 ETag와 precompressed 응답 | 무헤더 Post 요청, 동적 HTML의 캐시·압축 헤더                  |
| `apps/web/src/server/app.ts`           | federation이 BFF·SPA보다 먼저 처리                           | 기존 content negotiation·인증·오류 유지                       |
| `packages/core/global-id.ts`           | Post 공유 경로는 GraphQL global ID 사용                      | DB UUID와 혼동하지 않고 Post typename 검증                    |
| `packages/core/visibility`             | guest Post·Profile/Instance 조회 predicate 존재              | viewer를 세션에서 가져오지 않기, 순수 Repost 직접 Source 검사 |
| `packages/core/post-content/server.ts` | Plain Text 변환은 Mention을 모두 fallback으로 표시           | 현재 revision의 조회 가능한 Mention 핸들 반영                 |
| `packages/core/db/tables.ts`           | Media에는 URL·MIME·Alt Text가 있고 width·height는 없음       | 확인되지 않은 이미지 크기를 생성하지 않기                     |

## Practical Approach

아래는 현재 코드에 맞춘 구현 후보이며 같은 결과를 내는 더 간단한 방법이 있으면 바꿀 수 있다.

1. **요청과 대상 선택.** 기존 `/{relativeHandle}/{postId}` 경로 중 문서 표현을 요청한 GET·HEAD만 처리한다.
   `decodeGlobalId`로 Post 타입과 유효한 ID를 확인하고 저장된 실제 작성자로 canonical을 만든다. 오래되거나
   다른 핸들은 기존 상세 route의 canonicalization을 따른다. 다른 객체 ID나 알 수 없는 경로를 Post로 취급하지 않는다.
2. **guest 조회.** BFF의 read-only query에서 core DB와 공통 visibility policy를 사용한다. 세션의 selected
   Profile이나 API resolver를 가져오지 않는다. 현재 `Posts.currentContentId`를 읽고, 순수 Repost일 때만
   조회 가능한 직접 Source로 대상을 바꾼다. Quote Source와 Reply Parent는 자체 Content를 대신하지 않는다.
3. **텍스트 projection.** 현재 Content와 같은 revision의 Mention 관계를 사용한다. 조회 가능한 Mention은
   `apps/api/src/profile/identity.ts`의 표시용 핸들 계약을 따라 표현하고, 관계 누락·조회 불가이면 기존
   `@알 수 없는 사용자`를 유지한다. 공통 formatter가 필요하면 transport-neutral 경계에 두고 다른 consumer의
   기존 의미를 보존한다. HTML strip이나 document JSON 직렬화로 Plain Text를 대신하지 않는다.
4. **이미지 projection.** 현재 document의 Media 순서를 유지하고 기존 Media 조회·Ready 조건을 적용한다.
   누락·불완전한 Media projection은 기존 all-or-unavailable 계약에 따라 기본 이미지로 대체한다. 이것만으로
   Post 자체를 unavailable로 바꾸지 않는다. 정책상 조회 불가와 표시 metadata 불완전을 구분한다.
   CW·Sensitive Media 경로에는 가려진 URL·Alt Text를 넣지 않는다. 기존 `og-default.png`를 재사용하고
   콘텐츠 이미지의 확인되지 않은 width·height는 생략한다. crawler 요청에서 새 원격 fetch는 수행하지 않는다.
5. **HTML 응답.** 빌드된 Expo HTML의 앱 bootstrap을 보존하면서 title·일반 description·OG·Twitter Card를
   단일 집합으로 생성한다. 반복 `og:image`의 속성을 각 이미지 바로 뒤에 묶고 Twitter 대표 이미지는 같은
   공개 후보를 사용한다. 사용자 문자열은 HTML text/attribute 문맥에 맞게 인코딩한다. 유효한 deployment
   Web origin을 사용하고 query·hash·API origin·native deep link를 canonical에서 제외한다.
6. **호환성과 최신성.** 기존 federation fallthrough 뒤에서 문서 요청을 처리하고 명시적인 ActivityPub 요청은
   HTML로 덮지 않는다. 동적 HTML에는 정적 index의 ETag·압축 byte·Content-Length를 재사용하지 않는다.
   초기에는 동적 응답에 `no-store`를 적용하는 단순한 방안을 우선 검토한다. 캐시를 쓰려면 현재 권한·Content·
   작성자·Media 변경과 표현별 격리를 실제 재검증으로 증명해야 한다. HEAD는 본문 없이 해당 표현의 헤더를 제공한다.
7. **실패 처리.** 잘못된 경로, 대상 없음·조회 불가, DB 오류와 이미지 불가를 구분한다. 일시적인 미리보기 실패는
   개인 정보가 없는 기본 앱 shell로 복구하고 내부 오류는 기존 관측 경계에 남긴다. 모든 경로를 성공 HTML로
   바꾸거나 다른 Post 정보로 대체하지 않는다. 기존 API·로그인·정적 자산 응답은 유지한다.

## Alternatives and Traps

- 클라이언트에서 태그만 바꾸면 JavaScript를 실행하지 않는 crawler가 읽을 수 없다.
- 사용자 세션을 그대로 사용하는 GraphQL 조회는 공유 메타데이터에 비공개 정보가 섞일 수 있다.
- `postContentDocumentToText`를 그대로 호출하면 조회 가능한 Mention도 모두 fallback으로 바뀐다.
- 기존 HTML 앞에 동적 태그를 추가하기만 하면 중복된 기본값이 선택될 수 있다.
- 이미지 합성 서비스와 외부 OG 수집 서비스는 이번 결과에 필요하지 않다. 기본 이미지의 1200×630을 모든
  콘텐츠 이미지에 적용하거나 서비스별 카드 제한을 추측하지 않는다.

## Risks / Limits

- Instance Domain Block은 사용자 선택에 따라 별도 범위다. 현재 guest 정책을 검증했다고 해서 최종 moderation 정책까지
  검증한 것으로 표현하지 않는다.
- `apps/web/src/server/app.test.ts`는 federation을 mock한다. 이 테스트만으로 실제 Fedify의 Accept 분기와
  인증을 검증했다고 할 수 없으므로 실제 경계 검증을 보완한다.
- 현재 Web CI unit job에는 DB가 없다. guest 정책 fixture 검증은 기존 isolated DB·E2E 경로에 연결하거나
  필요한 실행 구성을 추가해야 한다. 소스 문자열 검사를 실행 검증으로 대체하지 않는다.
- 배포의 Host/origin 처리, 외부 이미지 접근성과 Slack·카카오톡·X 카드는 아직 확인하지 않았다. 허용된
  공개 fixture와 테스트 공간이 확보되면 서비스별 결과를 기록한다. 외부 cache의 즉시 철회는 보장하지 않는다.
- 이 계획은 새 DB 모델이나 데이터 이행을 요구하지 않는다. 기존 공통 기본 HTML은 동적 미리보기 실패 시에도
  안전한 fallback으로 유지한다. 구체적인 배포·rollback 실행은 이번 Spec 세션에서 수행하지 않는다.

## Open Questions

없음. 파일 분리·HTML 조립 수단·캐시 구현은 위 제품 결과를 보존하는 범위에서 구현자가 선택한다.
