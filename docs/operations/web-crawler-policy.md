# Web crawler policy 운영 기록

이 문서는 `PROD-736`의 저장소 robots 정책과 Cloudflare edge 적용 경계를 기록한다. 저장소 파일은 크롤러가 자발적으로 따르는 경로 힌트이고, AI 학습·대량 수집을 실제로 차단하는 책임은 Cloudflare edge 정책에 있다.

## 기록 메타데이터

- 검토 기준일: 2026-08-27
- 변경 소유자: `PROD-736` 담당자 / 프로덕트 팀
- 저장소 source: `apps/app/public/robots.txt`
- BFF delivery: `apps/web/src/server/routes/static.ts`
- 실제 Cloudflare zone 적용 상태: 이 변경에서는 미확인
- 최종 composite production 검증: `PROD-731`의 sitemap 배포와 Cloudflare 적용 증거 이후 수행

## 책임 경계

| 영역                            | 책임                                          | 이 변경에서의 기준                                                                              |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Repository                      | 보호·내부 경로와 sitemap 지시어               | `User-agent: *` 아래 보호 경로만 `Disallow`하고 나머지는 기본 허용                              |
| Cloudflare Managed robots.txt   | 동적 AI content signal과 관리되는 크롤러 분류 | 동적 user-agent·detection 목록을 저장소에 복사하지 않음                                         |
| Cloudflare AI Crawl Control/WAF | AI 학습·대량 수집의 edge 차단과 관측          | Training 및 Search+Training은 차단하고 Search-only·사용자 요청은 학습 근거 없이는 차단하지 않음 |
| Origin/Fedify                   | ActivityPub 요청의 인증·서명·활동 검증        | edge 예외가 있어도 origin 검증을 생략하지 않음                                                  |
| `PROD-731`                      | 공개 `/sitemap.xml` 생성·배포·검색엔진 등록   | 이 변경은 sitemap 구현을 수정하지 않음                                                          |

## Repository 정책

`robots.txt`는 다음 보호 prefix를 제외한다.

```text
/bookmarks
/compose
/feedback
/follow-requests
/hashtags/
/local
/home
/notifications
/profile-edit
/search
/settings
/login
/logout
/graphql
/health
```

명시적으로 제외하지 않은 경로는 이 파일의 wildcard 그룹에서 허용된다. 따라서 Active·Normal 공개 Profile, Public Post의 canonical Web URL, 정적 asset, WebFinger, actor·object·collection·follow·personal/shared inbox를 repository robots가 차단하지 않는다. robots 지시어는 인증이나 애플리케이션 권한을 대신하지 않는다.

Sitemap 지시어는 다음 하나로 고정한다.

```text
Sitemap: https://kos.moe/sitemap.xml
```

해당 URL의 실제 XML 응답과 canonical URL 집합은 `PROD-731` 배포 뒤에만 완료 검증한다.

## 저장소 검증 기록

검토 기준일인 2026-08-27에 다음 저장소 범위 검증을 통과했다.

- `pnpm --filter @kosmo/web test:unit`: 38 tests passed
- 실제 실행한 production-like `apps/web/e2e/robots.e2e.ts`: 1 test passed
- `apps/web` TypeScript check: passed
- `apps/web/src/server/app.test.ts` ESLint: passed
- 변경한 TypeScript 테스트·운영 문서 Prettier check: passed
- `openspec validate define-web-crawler-policy --strict`: valid

이 결과는 Cloudflare live action이나 production composite 응답의 증거가 아니다. 해당 증거는 아래 Cloudflare 적용 및 완료 게이트에서 별도로 수집한다.

## Cloudflare 적용 변경 패킷

이 절은 실제 zone 설정을 주장하지 않는 적용 제약과 증거 양식이다. 현재 작업 세션에는 Cloudflare zone 편집 권한과 live rule 조회 결과가 없으므로 아래 값을 임의로 채우거나 완료 처리하지 않는다.

### 적용 전 baseline

운영자는 변경 직전에 다음을 read-only로 기록한다.

| 항목                                        | 기록값        |
| ------------------------------------------- | ------------- |
| Zone / hostname                             | 적용자가 기록 |
| 계정 권한·plan                              | 적용자가 기록 |
| AI crawler detection 방식                   | 적용자가 기록 |
| Managed robots.txt 상태와 현재 응답 segment | 적용자가 기록 |
| AI Crawl Control / WAF 현재 action          | 적용자가 기록 |
| 기존 custom rule ID·순서·expression         | 적용자가 기록 |
| Security Events·AI Crawl Control 관측 query | 적용자가 기록 |
| snapshot·rollback 식별자                    | 적용자가 기록 |

### 목표 동작

1. Cloudflare의 최신 분류와 Managed robots content signal을 사용한다. 저장소나 고정 WAF expression에 동적 user-agent 목록·detection ID를 복사하지 않는다.
2. Verified 또는 Cloudflare가 Training으로 분류한 AI crawler와 Search+Training 혼합 crawler는 AI crawler 차단 rule로 block한다.
3. Search-only crawler와 사용자 요청 crawler는 Training 증거가 없는 한 허용한다. 검색 노출을 유지해야 하므로 운영자가 이름만 보고 검색 crawler를 Training으로 승격하지 않는다.
4. ActivityPub 최소 예외는 AI crawler block rule 내부에서만 평가한다. 예외 후보는 canonical host `kos.moe`, 허용된 method, 실제 federation path, ActivityPub에 맞는 `Accept`·`Content-Type`/media type·content negotiation, 적용 가능한 federation signature 특성을 함께 확인해야 한다.
5. 예외는 `/.well-known/webfinger`, `/ap/actor/...`, `/ap/note/...`, `/ap/follow/...`, 관련 collection과 personal/shared inbox의 실제 federation 요청에만 한정한다. path 하나만 일치한다고 허용하지 않는다.
6. 다른 custom WAF rule, rate limit, bot protection, origin 인증·서명 검증을 우회하는 전역 skip은 추가하지 않는다. 식별되지 않거나 user-agent를 위조한 crawler에 대한 완전한 차단은 이 정책의 보장 범위가 아니다.

### 적용 후 evidence

운영자는 실제 적용한 rule ID, priority, expression, action, 적용자, 시각과 Security Events 결과를 이 문서의 변경 기록 또는 배포 evidence에 남긴다. 최소 검증 matrix는 다음과 같다.

| 요청 분류                | 기대 결과                                 | 확인 증거                                                      |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------- |
| Search-only              | allow                                     | edge response와 event 없음/허용 event                          |
| 사용자 요청              | allow                                     | edge response와 origin 도달                                    |
| Training                 | block                                     | block action과 Security Event                                  |
| Search+Training          | block                                     | block action과 Security Event                                  |
| 유효한 ActivityPub 요청  | AI rule에서만 최소 예외, 이후 origin 검증 | canonical host·method·path·media type·signature 및 origin 결과 |
| 잘못된 inbox origin/서명 | origin rejection                          | edge 예외가 broad bypass가 아님을 보여주는 response·log        |
| 보호 Web 경로            | repository `Disallow` 의미 확인           | `/robots.txt` body와 대표 경로 응답                            |

## Rollback

적용 전에 저장한 Managed robots 상태, AI action, rule ID·순서·expression, WAF와 rate limit 설정, observability query를 snapshot 기준으로 복원한다. 복원 뒤 다음을 다시 확인한다.

- `/robots.txt`가 HTTP 200이고 `text/plain`이며 SPA HTML이 아니다.
- 저장소 보호 prefix와 sitemap 지시어가 유지된다.
- Search-only·사용자 요청·Training·Search+Training 및 유효/무효 ActivityPub 대표 요청의 edge/origin 결과가 snapshot과 일치한다.
- Security Events와 AI Crawl Control 관측이 복원된 rule 상태를 반영한다.

## 공식 분류 근거

분류는 운영 시점의 공식 문서를 다시 확인한다. 아래 링크는 검토 기준일에 사용한 출처이며, agent 이름이나 detection 목록을 저장소 정책의 고정 목록으로 취급하지 않는다.

- [Cloudflare Managed robots.txt](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/): Managed segment와 origin `robots.txt`의 결합 경계
- [Cloudflare AI Crawl Control](https://developers.cloudflare.com/ai-crawl-control/): crawler 관측·정책·차단 기능
- [Cloudflare AI bot behavior 정책](https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/): Search, Agent, Training 및 혼합 목적 분류
- [Cloudflare verified bot reference](https://developers.cloudflare.com/ai-crawl-control/reference/bots/): 운영 시점 분류 확인용 동적 reference
- [OpenAI crawler 안내](https://developers.openai.com/api/docs/bots): Search, training, 사용자 요청 crawler의 목적 분리
- [Googlebot 안내](https://developers.google.com/search/docs/crawling-indexing/googlebot): Google Search crawler와 검증 방법
- [Anthropic crawler 안내](https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler): Claude crawler 목적별 구분
- [Amazonbot 안내](https://developer.amazon.com/amazonbot): Amazon 검색·사용자 요청·AI 모델 학습 crawler 구분
- [Applebot 안내](https://support.apple.com/en-ie/119829): Apple 검색 crawler와 별도 AI 학습 제어 근거

## 완료 게이트

이 문서와 저장소 테스트만으로 Cloudflare 3.x task를 완료 처리하지 않는다. 다음이 모두 실제 evidence로 남은 뒤에만 3.x와 composite 4.x를 갱신한다.

1. zone permission, plan/detection, Managed robots와 현재 rule baseline
2. Training·Search+Training block 및 Search-only·사용자 요청 allow 결과
3. AI rule 내부의 최소 ActivityPub exception과 다른 보안 rule 유지 결과
4. Security Events, rollback snapshot, production composite 응답
5. `PROD-731` 배포 후 canonical `/sitemap.xml` 검증
