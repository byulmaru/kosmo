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

같은 Node 26.5.1 base와 Linux/ARM64 platform에서 2026-08-25에 다섯 final target을
빌드했다. Inspect size와 `docker save | gzip -1 -n`을 위 baseline과 같은 방식으로
측정했다.

| Runtime         |  Inspect size | Baseline 대비 | Compressed size | Baseline 대비 | Layers |
| --------------- | ------------: | ------------: | --------------: | ------------: | -----: |
| Web             | 234,813,490 B |        -61.1% |   233,362,980 B |        -61.1% |     11 |
| API             | 224,473,255 B |        -62.9% |   223,078,141 B |        -62.8% |     10 |
| Worker          | 256,556,592 B |        -57.5% |   254,879,238 B |        -57.5% |     11 |
| Fedify Consumer | 223,862,903 B |        -63.0% |   222,467,261 B |        -62.9% |     10 |
| Migration       | 216,006,633 B |        -64.3% |   214,590,803 B |        -64.2% |     10 |

모든 image는 UID/GID 10001의 고정 `node /app/server-dist/<runtime>/index.mjs`
entrypoint를 사용한다. Web만 Expo static/precompressed asset을, Migration만
version-controlled `drizzle/` SQL을 포함한다. Migration은 `node_modules` 없이
실행되고, Web/API/Fedify는 package-relative CSS/proto를 읽는 `jsdom`과
`@temporalio/client`만 명시적 runtime tree로 둔다. 모든 image에서 workspace
TypeScript source, `tsx`, server source map과 source-map reference가 제거됐다.

기존 runtime stage와 동일하게 final image 공통 base에서 Debian package update/upgrade를
수행한 뒤 측정했다.

Worker는 prebuilt Workflow bundle과 공통 asset runtime tree에
`@temporalio/worker` 1.22.0만 추가한다. `core-bridge`는
`aarch64-unknown-linux-gnu/index.node` 하나만 보존했으며 container에서 SDK와 bridge를
실제로 load했다. 격리 container smoke는 `/health` 200, Temporal 연결 전 `/ready`
503, startup SIGTERM exit 0을 확인했다.

Web container에서는 `/health`와 Expo static root가 모두 200임을 확인했다. API는
필수 configuration guard 뒤 실제 local-instance database query까지 실행됐고, API
unit 28개가 통과했다.

다섯 고정 JavaScript entrypoint는 빈 환경에서 실행해 Web/API/Worker/Fedify가
`TEMPORAL_ADDRESS is required`, Migration이 database configuration guard까지 도달함을
확인했다. 이는 artifact/container gate이며 dev rollout이나 production release 증거가
아니다. Helm과 CI/CD consumer는 아직 기존 single image를 유지한다.
