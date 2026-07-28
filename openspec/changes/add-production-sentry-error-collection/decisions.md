## Context

이 기록은 PROD-477의 통합 오류 수집 계약과 구현 자식 PROD-484·PROD-493의 서버/Web 범위를 현재 Hono, Yoga, Expo Router, Docker, GitHub Actions와 Helm/Vault 구조에 적용한 선택을 정리한다.

## Decision Records

### Android·iOS는 Web 관측 조합에서 제외한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: PROD-477, PROD-483, PROD-493
- Status: Active
- Context / Problem: 공용 Expo source에 Web 수집을 추가하면 native runtime에도 같은 import와 초기화가 도달할 수 있다.
- Decision Outcome: Web platform의 오류 경계 조합만 Sentry browser client를 import·초기화하며 Android·iOS에는 Sentry 관측 구현을 추가하지 않는다.
- Alternatives Considered: 공용 `@sentry/react-native` 초기화는 Backlog인 PROD-483의 SDK·native crash·debug symbol 범위를 선행하므로 선택하지 않는다.
- Consequences: 공용 오류 경계의 UI·retry 구현은 공유하지만 Sentry capture callback은 Web 전용 조합만 소유한다.
- Confirmation / Follow-up: Web bundle에는 SDK가 포함되고 native bundle에는 Sentry 관측 module import가 없는지 검증한다.

### SDK event를 beforeSend 정제 없이 전달한다

- Decision Date: 2026-07-27
- Decision Class: User Choice
- Authority / Provenance: 사용자 결정, PROD-477, PROD-484, PROD-493
- Status: Active
- Context / Problem: event allowlist와 redaction은 오류 message와 SDK 진단 정보를 손실시켜 실제 오류 추적을 어렵게 한다.
- Decision Outcome: API, Web BFF와 Web browser 모두 `beforeSend`를 두지 않고 Sentry SDK가 만든 event 전체를 그대로 전송한다. 자동 breadcrumb, Web session tracking과 기본 PII 전송은 계속 비활성화한다.
- Alternatives Considered: exception만 보존하고 top-level request, user, extra와 contexts를 제거하는 방식은 진단 정보를 임의로 누락하므로 선택하지 않는다.
- Consequences: 오류 message와 SDK 진단 정보는 온전히 유지되지만 request metadata, context 또는 사용자 콘텐츠가 event에 포함될 수 있다.
- Confirmation / Follow-up: server/browser 설정 테스트에서 `beforeSend`가 없고 배포 후 실제 event의 진단 정보가 누락되지 않는지 확인한다.

### 명시적 배포 enable과 완전한 metadata가 있어야 전송한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-477, PROD-484, PROD-493
- Status: Superseded
- Context / Problem: API unit test도 `NODE_ENV=production`을 사용하고 개발 환경에 DSN이 남아 있을 수 있어 `NODE_ENV`나 DSN만으로 활성화하면 외부 event가 발생할 수 있다.
- Decision Outcome: runtime별 공개·비공개 enable flag, DSN, environment와 commit release가 모두 있는 배포 build/runtime에서만 SDK를 활성화한다.
- Alternatives Considered: `NODE_ENV=production` 단독 gate와 DSN 존재 단독 gate는 local/test 기본 비전송을 보장하지 못해 선택하지 않는다.
- Consequences: 배포 설정이 불완전하면 애플리케이션은 정상 실행하지만 Sentry 전송은 비활성화된다. 운영 검증 체크리스트가 누락을 검출해야 한다.
- Confirmation / Follow-up: 설정 조합별 초기화 단위 테스트와 배포 후 검증 event를 확인한다.

### 완전한 배포 metadata가 있으면 Sentry를 활성화한다

- Decision Date: 2026-07-28
- Decision Class: User Choice
- Authority / Provenance: 사용자 결정, PROD-477
- Status: Active
- Context / Problem: 별도 enable flag는 Linear 요구사항이나 사용자 결정에 없었는데 로컬·테스트 기본 비전송을 구현하는 과정에서 kill switch와 rollback 계약으로 잘못 확장됐다.
- Decision Outcome: API, Web BFF와 Web browser는 별도 enable flag를 사용하지 않는다. DSN, environment와 commit release가 모두 있으면 Sentry를 활성화하며 로컬·테스트에는 이 배포 metadata를 기본 주입하지 않는다.
- Alternatives Considered: runtime별 enable flag와 운영 kill switch는 Sentry를 임의로 끌 필요가 없고 요구사항에도 없으므로 선택하지 않는다.
- Consequences: 배포 metadata가 완전한 runtime은 항상 오류를 전송한다. 로컬·테스트 기본 비전송은 별도 flag가 아니라 배포 metadata 부재로 보장한다.
- Confirmation / Follow-up: 설정 조합별 단위 테스트에서 metadata가 완전하면 활성화되고 하나라도 없으면 비활성화되는지 확인한다.

### 커밋 기반 release를 모든 runtime과 artifact에 공유한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: PROD-477, PROD-484, PROD-493
- Status: Active
- Context / Problem: server image와 Expo Web bundle이 다른 release 문자열을 사용하면 하나의 배포 회귀와 source map을 함께 추적할 수 없다.
- Decision Outcome: Git commit SHA에서 만든 하나의 release 문자열을 API, Web BFF, Web browser event와 해당 source map artifact에 사용하고 runtime은 tag로 구분한다.
- Alternatives Considered: package version은 현재 모두 `0.0.x`이고 배포 commit을 유일하게 식별하지 못한다. runtime별 release는 통합 추적을 분리하므로 선택하지 않는다.
- Consequences: 같은 commit의 세 runtime 오류와 artifact가 하나의 release로 묶인다.
- Confirmation / Follow-up: image build artifact와 세 검증 event의 release 일치를 확인한다.

### Source map 업로드 token은 BuildKit secret에서만 소비한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-477, PROD-484, PROD-493
- Status: Active
- Context / Problem: Docker ARG·ENV와 일반 build log를 통한 token 전달은 image history나 로그에 자격 증명을 남길 수 있다.
- Decision Outcome: 업로드 token은 GitHub Actions가 BuildKit secret mount로만 전달하고 업로드 과정이 끝난 뒤 source map과 공개 bundle의 map 참조를 runtime image에서 제거한다.
- Alternatives Considered: Docker build arg, image runtime secret과 repository 설정 파일은 token 노출 또는 배포 후 불필요한 보유를 만들므로 선택하지 않는다.
- Consequences: 인증된 CI build만 artifact를 업로드하며 로컬 build는 secret 없이 외부 업로드를 건너뛴다.
- Confirmation / Follow-up: Docker history, runtime image, Web 정적 asset과 build log에서 token·map 부재를 확인한다.

### 세 runtime은 Sentry project 하나를 공유한다

- Decision Date: 2026-07-28
- Decision Class: User Choice
- Authority / Provenance: 사용자 결정, PROD-477
- Status: Active
- Context / Problem: API, Web BFF와 Web browser는 같은 repository, image, 담당 팀과 commit release를 사용하며 현재 오류량과 runtime별 운영 정책이 확인되지 않았다. Runtime별 project를 미리 분리하면 DSN, alert, filter와 source map 설정만 중복된다.
- Decision Outcome: 세 runtime은 배포 설정으로 주입한 Sentry project 하나와 DSN 하나를 공유하고 `api`, `web-bff`, `web` runtime tag로 구분한다.
- Alternatives Considered: runtime별 project와 DSN은 alert, rate limit, filter와 접근 권한을 독립적으로 운영할 수 있지만 현재 필요한 격리 근거가 없어 선택하지 않는다.
- Consequences: project-level 설정과 alert는 세 runtime에 공통 적용된다. Runtime별 소유권, 알림, rate limit 또는 접근 권한 분리가 필요해지면 project topology와 배포 변수 계약을 다시 변경해야 한다.
- Confirmation / Follow-up: build가 공용 `SENTRY_PROJECT`와 `SENTRY_DSN`을 사용하고 server runtime이 공용 `SENTRY_DSN`을 주입받으며, 세 검증 event가 같은 project에서 runtime tag로 구분되는지 확인한다.

### 환경에 독립적인 Sentry 설정은 Vault에서 읽어 image build에 주입한다

- Decision Date: 2026-07-28
- Decision Class: User Choice
- Authority / Provenance: 사용자 결정, PROD-477
- Status: Active
- Context / Problem: GitHub repository variable과 secret, 환경별 Vault 경로에 Sentry 설정을 나누면 기존 Kosmo Vault가 하나의 source of truth가 되지 않는다. 다만 Expo 공개 변수, source map 업로드 자격 증명과 서버 runtime DSN은 수명과 노출 경계가 다르다.
- Decision Outcome: 공용 `SENTRY_DSN`, `SENTRY_PROJECT`, Sentry 조직 slug와 source map 업로드 token을 `secret/kubernetes/kosmo/shared`에 둔다. GitHub Actions는 image build 때 Vault Sentry 객체 전체를 임시 env 파일 하나로 만들고 `sentry_config` BuildKit secret으로 전달한다. Artifact build 단계는 DSN을 `EXPO_PUBLIC_SENTRY_DSN`으로 Web bundle에만 남기고 조직·project slug와 upload token은 source map upload에만 소비한다. API와 Web BFF는 Vault Secrets Operator가 shared의 `SENTRY_DSN`만 변환한 `sentry-runtime` Kubernetes Secret을 배포 시 주입한다.
- Alternatives Considered: Vault 키를 GitHub environment와 Docker build arg에 하나씩 전달하는 방식은 키 목록과 전달 경로를 반복한다. DSN을 server image 파일로 복사하는 방식은 build/runtime 경계를 섞고 DSN 회전마다 image 재빌드를 요구한다. Vault 객체 전체를 runtime Kubernetes Secret에 복사하는 방식은 upload token까지 pod에 배포하므로 선택하지 않는다.
- Consequences: 새 Vault build 키가 추가돼도 workflow의 build arg 목록은 늘어나지 않는다. BuildKit secret 내용은 cache key가 아니므로 설정 회전을 반영하기 위해 Sentry artifact build stage는 cache를 사용하지 않는다. Web DSN 변경은 새 image build·배포가 필요하지만 server DSN은 Vault Secrets Operator가 갱신한다. Upload token과 조직·project slug는 runtime image와 pod에 포함되지 않는다.
- Confirmation / Follow-up: Docker build가 secret env 파일 하나만 받고 final image에는 Vault 값이 남지 않는지, Helm render의 `sentry-runtime` Secret에는 `SENTRY_DSN`만 있는지, branch와 release tag build가 shared 값을 읽어 source map을 업로드하는지 확인한다.

### 기능 branch Docker build도 Vault shared를 읽는다

- Decision Date: 2026-07-27
- Decision Class: User Choice
- Authority / Provenance: 사용자 결정, PROD-477
- Status: Active
- Context / Problem: 수동 feature branch Docker build는 `branch-*`와 `sha-*` image를 발행하도록 지원하지만, main에만 묶인 Vault dev role 때문에 Sentry build 설정을 읽는 단계에서 실패한다.
- Decision Outcome: `byulmaru/kosmo`의 모든 branch GitHub OIDC subject가 `kosmo-build-dev` role을 사용해 `secret/kubernetes/kosmo/shared`를 읽도록 허용한다. 정식 SemVer tag는 기존처럼 `kosmo-build-prod` role을 사용한다.
- Alternatives Considered: feature branch에서 Sentry 업로드를 비활성화하거나 main만 shared를 읽게 유지하는 방식은 수동 branch image가 production build와 같은 artifact 검증을 수행하지 못하므로 선택하지 않는다.
- Consequences: feature branch도 dev environment source map을 업로드할 수 있다. Vault policy는 정확한 shared 경로의 read-only 권한과 짧은 token TTL을 유지하지만, repository에서 branch workflow를 실행할 수 있는 주체는 shared의 source map 업로드 token을 build 중 사용할 수 있다.
- Confirmation / Follow-up: Terraform plan에서 branch subject glob과 exact-path read policy를 확인하고 workflow ref matrix에서 branch는 dev, 정식 SemVer tag는 prod, 그 밖의 tag는 거부되는지 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `명시적 배포 enable과 완전한 metadata가 있어야 전송한다`: 별도 enable·kill switch는 상위 요구사항에 없던 구현 가정이므로 2026-07-28 사용자 결정으로 폐기했다.
