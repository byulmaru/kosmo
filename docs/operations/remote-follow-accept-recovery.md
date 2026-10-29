# 승인된 원격 Follow의 Accept 복구 준비

이 runbook의 `prepare-follow-accept-payload.ts`는 검토용 ActivityPub `Accept` payload만 만들며, 데이터베이스 변경이나 실제 전달은 하지 않습니다. 별도의 resend CLI는 현재 승인된 관계 행을 다시 확인한 뒤 queue에 전달을 넘깁니다. 현재 관계만으로 원본 요청 경로나 상대 서버의 수신 여부를 알 수 없으므로, 현재 팔로우 정책이나 `profile_follow` 행 수를 누락 건수로 간주하지 않습니다. 이 절차는 Temporal Workflow를 reset/replay/retry하지 않습니다.

## 후보 확인

각 현재 원격→로컬 `profile_follow` 쌍의 Temporal Workflow ID는 `profile-follow-pair:<followerProfileId>:<followeeProfileId>`입니다. Workflow history에서 다음을 모두 확인합니다.

1. `profileFollowPairUpdate` 이력이 `FOLLOW`와 `ACTIVITYPUB`이고 결과가 `PENDING`인 경우, 결과의 `profileFollowRequestId`가 뒤이은 `APPROVE`와 `LOCAL` 입력의 `expectedRowId`와 같은지 확인합니다.
2. 최초 pair workflow가 `APPROVE`와 `LOCAL`로 시작한 bootstrap 이력도 승인 근거가 될 수 있습니다. `loadPendingFollowRequestIdActivity`에 전달된 pair와 `expectedRowId`, activity 결과의 request ID, APPROVE 결과의 `profileFollowRequestId`를 대조합니다. 두 경로 모두 승인 결과가 `ACCEPTED`이고 `profileFollowId`와 directed pair가 현재 DB 행과 일치해야 합니다.
3. `remoteProfileLookupWorkflow` history에서 원본 `Follow`의 `receipt.activityUri`, `actorUri`, `contextOrigin`, `receivedAt`을 확인합니다. 이 history와 pair workflow 사이에는 공통 상관관계 ID가 없으므로 actor와 시간 근접만으로 원본 ID를 검증하지 않습니다. 연결이 직접 증명되지 않거나 후보가 여러 개면 `ambiguous`로 남기되, 이는 best-effort 후보를 자동 제외하지 않습니다. 명시적으로 확보한 후보 ID가 있고 현재 승인된 정확한 관계 행, remote actor, local object와 모두 맞으면 `reviewRequired: true` 검토 후보로 만들 수 있습니다.
4. 후보 URI가 있으면 정확한 공개 `activityUri` 하나만 ActivityPub `Accept` 헤더로 조회해 object의 `id`, `type`, `actor`, `object`를 확인합니다. 404나 접근 제한은 원본을 확인할 수 없다는 뜻으로 기록하고, 인증이나 다른 URI로 우회하지 않습니다. 응답이 없어도 명시적인 후보 ID와 현재 관계의 정확한 actor/object가 맞으면 검토용 후보로 남길 수 있지만, 출처가 검증된 것으로 취급하지 않습니다.

Temporal history는 namespace 보존 기간 안에서만 조회할 수 있습니다. 보존 기간 밖이라 조회되지 않는 Workflow는 승인 누락으로 단정하지 말고 `확인 불가`로 기록합니다. 현재 관계 행만으로 과거 PENDING, APPROVE 또는 상대 서버의 `Accept` 수신 여부를 추정하지 않습니다. 원본 Follow ID를 찾을 수 없으면 request UUID나 생성 시각으로 ID를 만들지 않습니다. W3C ActivityPub는 일시적 activity를 제외한 서버 간 객체에 ID를 요구하고, W3C ActivityPub Primer는 Follow를 actor/object 쌍으로 식별할 수 있으며 모르는 ID를 새로 만들어 넣지 말라고 안내합니다. ID가 없을 때 `Accept.object`에 `type`, `actor`, `object`만 담는 수용 여부는 상대 구현별로 확인해야 합니다.

재전송은 모든 ActivityPub 서버에서 중복 안전하다고 가정하지 않습니다. 2026-10-23 확인한 Planet NodeInfo는 Mastodon 4.6.9를 표시했고, 그 버전의 Accept 처리 코드는 object ID로 pending FollowRequest를 찾은 뒤, embedded Follow의 actor/object 쌍으로도 pending 요청을 찾습니다. 승인 후 FollowRequest를 삭제하므로 동일 쌍에 새 pending 요청이 생기지 않았다면 같은 Accept의 반복 처리는 보통 no-op입니다. 다만 그 사이 같은 쌍의 새 요청이 생기면 actor/object fallback이 새 요청을 승인할 수 있습니다. 이 동작은 확인한 Planet 버전의 구현 근거이며 다른 서버에 일반화하지 않습니다. 복구 후보는 현재 승인된 정확한 관계 행과 sender/recipient actor pairing을 재확인하고, 상대 소프트웨어가 ID 포함 또는 ID 없는 Follow 처리에 적합한지 확인해야 합니다. 출처가 모호하거나 ID가 없던 두 과거 승인 건은 ID를 만들지 않는 ID-less Accept 검토 후보일 뿐이며, 상대 구현에 따라 효과가 불확실합니다.

현재 `profile_follow_request` 행은 아직 승인되지 않은 요청이므로 이미 승인된 관계의 누락 Accept 후보와 구분합니다. 정상 승인 경로에서는 기존 generation guard를 유지합니다. 저장된 inbound `Follow` envelope가 있으면 원래 ID와 `published`를 보존하고, envelope가 없으면 승인된 정확한 pair의 actor/object만 담은 ID 없는 Follow를 Accept.object로 사용합니다. 없는 ID나 `published`를 request UUID 또는 생성 시각에서 만들지 않습니다. 이 fallback을 수신 서버가 처리하는지는 구현별로 다르므로, 이 runbook의 이미 승인된 관계 backfill과 pending request 승인을 혼동하지 않습니다.

## Read-only history 조회

운영 Postgres에서 관계 정보를 확인할 때는 운영 namespace의 Postgres pod에서 제한된 runtime role과 read-only transaction을 사용합니다. 필요한 관계 ID, 두 profile ID, remote actor/inbox, local canonical origin만 조회합니다.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL ROLE kosmo_runtime;
SET LOCAL statement_timeout = '30s';

SELECT f.id, f.follower_profile_id, f.followee_profile_id, f.created_at,
       actor.uri, actor.inbox_uri, actor.shared_inbox_uri,
       local_instance.canonical_origin
FROM profile_follow AS f
JOIN profile AS follower ON follower.id = f.follower_profile_id
JOIN instance AS remote_instance ON remote_instance.id = follower.instance_id
JOIN profile AS followee ON followee.id = f.followee_profile_id
JOIN instance AS local_instance ON local_instance.id = followee.instance_id
LEFT JOIN activitypub_actor AS actor ON actor.profile_id = follower.id
WHERE remote_instance.kind = 'ACTIVITYPUB'
  AND local_instance.kind = 'LOCAL';

COMMIT;
```

현재 승인 대기 요청은 개별 행을 덤프하지 말고 remote→local 방향의 집계만 확인합니다. 아래 30일 기준은 현재 운영 Temporal namespace 보존 기간에 맞춥니다.

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL ROLE kosmo_runtime;
SET LOCAL statement_timeout = '30s';

SELECT count(*) AS request_count,
       count(*) FILTER (
         WHERE follower.state = 'ACTIVE'
           AND remote_instance.state = 'ACTIVE'
           AND followee.state = 'ACTIVE'
           AND local_instance.state = 'ACTIVE'
       ) AS active_request_count,
       min(request.created_at) AS earliest_created_at,
       max(request.created_at) AS latest_created_at,
       count(*) FILTER (WHERE request.created_at >= now() - interval '30 days') AS within_retention,
       count(*) FILTER (WHERE request.created_at < now() - interval '30 days') AS before_retention
FROM profile_follow_request AS request
JOIN profile AS follower ON follower.id = request.follower_profile_id
JOIN instance AS remote_instance ON remote_instance.id = follower.instance_id
JOIN profile AS followee ON followee.id = request.followee_profile_id
JOIN instance AS local_instance ON local_instance.id = followee.instance_id
WHERE remote_instance.kind = 'ACTIVITYPUB'
  AND local_instance.kind = 'LOCAL';

COMMIT;
```

DB 조회 결과를 근거로 각 쌍의 Workflow history를 확인합니다. Workflow UI/API는 조회 용도로만 사용하고 Workflow Update를 실행하지 않습니다. 후보가 모호하거나 원본 ID가 없어도 현재 승인된 정확한 관계 행, remote actor와 local object, sender/recipient pairing, 상대 구현 지원이 모두 맞으면 `reviewRequired: true` best-effort artifact로 검토할 수 있습니다. 이는 출처가 검증된 manifest나 발송 승인이 아닙니다. 실제 전달 직전에 같은 `profile_follow` ID와 directed pair가 여전히 현재 활성 관계인지 다시 확인합니다.

## 검토용 payload 준비

`packages/fedify/scripts/prepare-follow-accept-payload.ts`는 검토가 필요한 단일 후보 JSON을 표준 입력으로 받아 실제 `sendAcceptFollowActivity` helper로 `Accept`를 구성합니다. helper의 `sendActivity`를 캡처 stub으로 바꿔 Activity를 저장하므로 실제 네트워크 요청은 하지 않습니다. 입력에는 현재 관계 ID와 쌍, Follow actor/object, 원격 actor/inbox, local canonical origin, `reviewRequired: true`가 필요합니다. Follow ID는 알고 있을 때만 넣으며, 모를 때는 새 ID를 만들지 않고 `Accept.object`에 actor/object만 담습니다. 스크립트는 profile ID와 URL scheme을 검사하고 Follow의 actor가 저장된 원격 actor와, object가 profile ID와 canonical origin에서 계산한 local actor와 정확히 일치하는지 확인합니다.

```sh
pnpm --filter @kosmo/fedify exec tsx scripts/prepare-follow-accept-payload.ts < candidate.json > accept-candidate.json
```

출력 파일은 `reviewRequired: true`인 후보 artifact이며, 검증된 복구 manifest나 발송 명령이 아닙니다. workflow/receipt history의 근거, 현재 관계 행, sender/recipient pairing, 상대 구현 지원을 별도로 검토합니다. 상대 서버가 Planet/Mastodon 4.6.9인 경우 중복 Accept는 대체로 이미 승인된 요청에서 no-op이지만, 같은 pair의 새 pending 요청이 생겼다면 그 요청을 승인할 수 있습니다.

## 최종 승인 후 queue 전달

최종 발송 승인을 받은 뒤에만 별도 CLI `packages/fedify/scripts/resend-approved-follow-accept.ts`를 호출합니다. 이 CLI에는 dry-run이나 preflight 옵션이 없으며, 실행하면 현재 승인된 정확한 관계 행을 다시 확인한 뒤 실제 Fedify queue에 전달합니다. 입력은 후보 artifact가 아니라 다음 세 ID만 담은 strict JSON입니다. 값을 실제 현재 행의 ID로 바꿉니다.

```json
{
  "profileFollowId": "<current-row-id>",
  "followerProfileId": "<remote-profile-id>",
  "followeeProfileId": "<local-profile-id>"
}
```

기존 승인된 port-forward의 로컬 포트를 `LOCAL_PORT`에 지정하고 아래 명령을 실행합니다. Vault가 운영 환경 변수를 주입하며, Postgres와 queue 연결은 해당 로컬 포트를 경유합니다.

```sh
node scripts/vault-run.mjs --env prod -- node --input-type=module -e '
import { spawnSync } from "node:child_process";
const port = process.argv[1];
const queueUrl = new URL(process.env.FEDIFY_QUEUE_DATABASE_URL);
queueUrl.hostname = "127.0.0.1";
queueUrl.port = port;
const env = {
  ...process.env,
  PGHOST: "127.0.0.1",
  PGPORT: port,
  FEDIFY_QUEUE_DATABASE_URL: queueUrl.href,
};
delete env.PGREADHOST;
delete env.PGREADPORT;
const child = spawnSync("./packages/fedify/node_modules/.bin/tsx", ["packages/fedify/scripts/resend-approved-follow-accept.ts"], { env, stdio: "inherit" });
if (child.error) throw child.error;
process.exit(child.status ?? 1);
' "$LOCAL_PORT" <<'JSON'
{"profileFollowId":"<current-row-id>","followerProfileId":"<remote-profile-id>","followeeProfileId":"<local-profile-id>"}
JSON
```

`status: queued`는 queue 전달을 뜻할 뿐 원격 HTTP 전송이나 상대 서버의 Accept 확인을 뜻하지 않습니다. 이 명령은 검토나 preflight 중 실행하지 않습니다.

참고: [ActivityPub §3.1, §7.5–7.6](https://www.w3.org/TR/activitypub/), [ActivityPub Primer: referring to activities](https://www.w3.org/wiki/ActivityPub/Primer/Referring_to_activities), [Planet NodeInfo](https://planet.moe/nodeinfo/2.0), [Mastodon 4.6.9 Accept handler](https://github.com/mastodon/mastodon/blob/v4.6.9/app/lib/activitypub/activity/accept.rb), [activity lookup](https://github.com/mastodon/mastodon/blob/v4.6.9/app/lib/activitypub/activity.rb), [FollowRequest authorization](https://github.com/mastodon/mastodon/blob/v4.6.9/app/models/follow_request.rb).
