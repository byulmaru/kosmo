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
- Status: Active
- Context / Problem: API unit test도 `NODE_ENV=production`을 사용하고 개발 환경에 DSN이 남아 있을 수 있어 `NODE_ENV`나 DSN만으로 활성화하면 외부 event가 발생할 수 있다.
- Decision Outcome: runtime별 공개·비공개 enable flag, DSN, environment와 commit release가 모두 있는 배포 build/runtime에서만 SDK를 활성화한다.
- Alternatives Considered: `NODE_ENV=production` 단독 gate와 DSN 존재 단독 gate는 local/test 기본 비전송을 보장하지 못해 선택하지 않는다.
- Consequences: 배포 설정이 불완전하면 애플리케이션은 정상 실행하지만 Sentry 전송은 비활성화된다. 운영 검증 체크리스트가 누락을 검출해야 한다.
- Confirmation / Follow-up: 설정 조합별 초기화 단위 테스트와 배포 후 검증 event를 확인한다.

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

### Sentry 조직과 project topology는 배포 설정으로 둔다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-477
- Status: Active
- Context / Problem: 부모 이슈는 project 분리 방식을 OpenSpec에서 정밀화하되 저장소가 특정 Sentry 계정 slug에 결합될 필요는 없다.
- Decision Outcome: 조직·project slug와 runtime DSN은 배포 설정으로 주입한다. 하나의 project 또는 runtime별 project 모두 동일 release·environment/runtime 계약을 지키면 사용할 수 있다.
- Alternatives Considered: 저장소에 하나의 실제 slug를 고정하면 환경 이전과 project 분리를 코드 변경으로 만들고, project provisioning 자동화는 현재 운영 범위를 넓힌다.
- Consequences: 코드와 build는 topology에 독립적이며 운영자가 배포 환경에서 실제 값을 관리한다.
- Confirmation / Follow-up: 운영 문서에 필요한 변수와 project별 DSN 매핑을 기록한다.

### 환경에 독립적인 Sentry 설정은 Vault shared 경로에 둔다

- Decision Date: 2026-07-27
- Decision Class: User Choice
- Authority / Provenance: 사용자 결정, PROD-477
- Status: Active
- Context / Problem: GitHub repository variable과 secret, 환경별 Vault 경로에 Sentry 설정을 나누면 기존 Kosmo Vault가 하나의 source of truth가 되지 않는다. 현재 세 runtime은 환경마다 다른 Sentry project를 쓰지 않으므로 DSN도 환경 독립 값이다. 반면 `shared` 전체를 Pod로 동기화하면 업로드 token까지 불필요하게 노출한다.
- Decision Outcome: 공개 Web DSN, API·Web BFF DSN, Sentry 조직·project slug와 source map 업로드 token을 모두 `secret/kubernetes/kosmo/shared`에 둔다. GitHub Actions는 build에 필요한 값을 읽고, VaultStaticSecret transformation은 API·Web BFF DSN 두 개만 runtime Secret으로 추출한다.
- Alternatives Considered: GitHub repository variable/secret과 환경별 Vault 경로로 나누는 방식은 환경 독립 값의 출처를 분산하고, `shared` 전체를 Kubernetes Secret으로 복사하는 방식은 build token을 runtime에 노출하므로 선택하지 않는다.
- Consequences: 모든 환경 독립 Sentry 설정은 Vault에서 함께 회전하고 dev와 prod event 구분은 공용 `ENVIRONMENT`와 Web build의 `EXPO_PUBLIC_ENVIRONMENT`가 담당한다. 업로드 token과 build metadata는 Kubernetes Secret에 포함되지 않는다.
- Confirmation / Follow-up: Terraform plan에서 role과 최소 read policy를 확인하고 Helm render에서 runtime Secret이 DSN 두 개만 포함하는지, main build가 shared 값을 읽어 source map을 업로드하는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
