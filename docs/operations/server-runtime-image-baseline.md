# Server runtime image baseline

PROD-831의 runtime image 분리 전 비교 기준이다. 2026-08-25에 commit
`b3998ca473ba45c148c1e7ca15ded587fe195f4e`의 기존 `Dockerfile`을
`docker buildx build --platform linux/arm64 --load`로 빌드했다.

## Image

| 항목                                         |                                                                        값 |
| -------------------------------------------- | ------------------------------------------------------------------------: |
| Image                                        |                                         `kosmo-runtime-baseline:prod-831` |
| OCI digest                                   | `sha256:924b891fe73bba0098ac3ad795e8307d545732e6a78238040e9acee8ce57d395` |
| Platform                                     |                                                             `linux/arm64` |
| Docker inspect size                          |                                                         604,325,627 bytes |
| `docker save \| gzip -1 -n` size             |                                                         599,958,769 bytes |
| RootFS layers                                |                                                                        27 |
| `/app` apparent size                         |                                                                   533 MiB |
| `/app/node_modules` apparent size            |                                                                   506 MiB |
| Expo Web static artifact                     |                                                                    20 MiB |
| TypeScript source files                      |                                                                     9,987 |
| `@temporalio/core-bridge@1.22.0`             |                                                                   156 MiB |
| `core-bridge` files across platform releases |                                                                       595 |

Build 단계는 1,293개 package를 설치했고 runtime production install은 306개
package를 설치했다. 가장 큰 application layer는 모든 runtime의 공용 production
dependency tree이며 `docker history`의 가상 크기는 2 GB로 표시된다. Content-addressed
layer deduplication 때문에 이 값은 image inspect size와 직접 합산하지 않는다.

## Runtime commands

기존 image는 non-root `app` 사용자로 실행되지만 하나의 dispatcher와 `tsx`에 다섯
runtime이 모두 의존한다.

| Command        | 실행 경로                                             |
| -------------- | ----------------------------------------------------- |
| `web`          | `node --import tsx apps/web/src/server/index.ts`      |
| `api`          | `node --import tsx apps/api/src/index.ts`             |
| `worker`       | `node --import tsx apps/worker/src/index.ts`          |
| `fedify-queue` | `node --import tsx apps/fedify-consumer/src/index.ts` |
| `migrate`      | `node --import tsx packages/core/db/migrate.ts`       |

각 workspace runtime에 `tsx` 실행 파일과 package가 존재한다. 새 image gate는 같은
platform에서 각 image가 고정 JavaScript entrypoint로 실행되는지, 허용된 asset 외
TypeScript source와 `tsx`가 없는지, 그리고 inspect/archive 크기와 주요 layer가 이
baseline보다 작은지를 확인한다.

각 command를 빈 환경에서 8초 제한으로 실행한 smoke에서는 Web/API/Worker/Fedify가
모두 TypeScript graph를 load한 뒤 `TEMPORAL_ADDRESS is required`로 종료했고,
Migration은 `DATABASE_URL` 또는 PostgreSQL 환경이 필요하다는 검증 오류로 종료했다.
따라서 이는 service health 증거가 아니라 기존 entry graph가 `tsx`로 시작되고 필수
configuration guard까지 도달한다는 baseline이다.

## Split image artifact gate

Literal single-file과 generated runtime manifest 설계의 기존 측정치는 package별 bundler
patch와 중복 dependency contract에 의존해 폐기했다. 현재 설계는 다섯 runtime의
workspace-owned code만 JavaScript artifact로 bundle하고, third-party package는 각
workspace manifest와 root lockfile에서 생성한 production dependency tree로 제공한다.
`runtime-package.json`은 생성하지 않으며 모든 final image에서 TypeScript source와 `tsx`를
제외한다. Worker는 추가로 prebuilt Workflow bundle과 target Linux/ARM64 native bridge를
사용한다.

현재 pull request CI는 Docker target을 build하지 않으며 main 전용 Docker workflow도 아직
기존 single image contract를 사용한다. 따라서 새 설계의 다섯 Linux/ARM64 image에 대한
compressed/uncompressed size, layer, external import resolution, boot/health와 asset 검증은
완료 증거가 아니다. 이 표와 결과는 artifact gate를 실제 CI 또는 승인된 build runner에서
다시 수행한 뒤에만 기록한다. 그 전에는 Helm·CI/CD consumer 전환을 시작하지 않는다.
