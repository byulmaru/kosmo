# Local Post 콘텐츠 재처리 운영

이 절차는 운영자가 지정한 기존 활성 Local Post의 현재 Post Content에 저장 document 기반 콘텐츠 처리 규칙을 적용한다.
현재 구현은 본문 Hashtag를 발견하고 Hashtag 관계를 정합화한다. 원문 입력을 따로 저장하지 않으므로 재처리는 전체 작성
parser를 다시 실행하지 않으며 Mention을 재발견·resolve하거나 Remote source를 가져오지 않는다. 원본 revision은 유지하고
처리 결과나 관계가 바뀔 때만 새 revision을 current로 전환한다. 재처리는 ActivityPub `Update(Note)` delivery나
notification을 발생시키지 않으며, 이후 Local ActivityPub Note 조회는 current revision을 사용한다.

`reprocessLocalPostContentsWorkflow`는 필수 `postIds` 배열에 든 Post ID만 처리하며 다른 Post를 찾거나 추가하지 않는다.
빈 배열은 no-op이다. Post Content ID는 Workflow input에 필요하지 않다. 각 Activity input에는 `postId`와 `dryRun`만
들어가며 Activity는 각 시도의 transaction 안에서 당시 current Post Content를 읽는다. 따라서 이후 시도는 당시의 current
content를 처리하고, 같은 content와 관계가 이미 반영됐으면 `unchanged`가 된다. Activity는 활성 Local Post만 처리한다.

대상은 최대 50개씩 순차 처리한다. Continue-As-New는 남은 Post ID와 누적 `counts`를 이어받으며 Workflow 결과에는
`counts`만 포함한다. `dryRun` 생략 또는 `true`가 기본값이고 database state를 바꾸지 않는다.

실행 전 대상 Temporal namespace에서 최신 Worker가 `kosmo` task queue를 polling하고 `reprocessLocalPostContentsWorkflow`를 등록했는지 확인한다.

## Dry-run

운영자가 지정한 Post ID 목록으로 dry-run을 실행한다.

```sh
temporal workflow start \
  --type reprocessLocalPostContentsWorkflow \
  --task-queue kosmo \
  --input '{"postIds":["<post-uuid-1>","<post-uuid-2>"],"dryRun":true}'
```

CLI가 반환한 Workflow ID로 결과를 확인한다. `--workflow-id`를 생략하면 Temporal Service가 unique ID를 만든다.

```sh
temporal workflow result --workflow-id YourWorkflowId
```

`YourWorkflowId`를 `start` 명령이 반환한 Workflow ID로 바꾼다. Dry-run 결과의 `counts`는 변경이 필요한 Post를
`wouldUpdate`, 이미 반영된 Post를 `unchanged`, 처리할 수 없는 Post를 `skipped`로 집계한다. 집계는 실행 결과의
요약이며 감사 원장으로 사용하지 않는다.

## 적용

Dry-run 결과와 대상 namespace를 검토한 다음 같은 `postIds` 배열을 `dryRun:false`로 실행한다.

```sh
temporal workflow start \
  --type reprocessLocalPostContentsWorkflow \
  --task-queue kosmo \
  --input '{"postIds":["<post-uuid-1>","<post-uuid-2>"],"dryRun":false}'
```

current pointer가 transaction 중 바뀌면 transaction은 rollback되고 Activity 결과는 `skipped`가 된다. 이 상태는
자동 재시도를 일으키지 않으므로 Workflow history의 Post ID와 결과를 확인한 뒤 필요하면 새 Workflow를 시작한다.
Apply 결과는 `updated`, `unchanged`, `skipped` 상태별로 확인한다. 새 revision의 `post_content.created_at`은 재처리
시각이며 source revision은 삭제하지 않으므로 저장 공간이 늘어난다. Post의 `post.created_at`, author, visibility와
처리 대상이 아닌 관계는 변경되지 않는다.

## 재시도와 종료 확인

Temporal Activity 오류는 retry 정책에 따라 재시도한다. Workflow가 실패 상태로 끝나면 Temporal Web의 해당 Workflow
history에서 실패한 Activity와 원인을 확인한다. Continue-As-New는 남은 Post ID와 누적 `counts`를 이어받는다. `skipped`가
남으면 Activity 결과와 Post의 활성 Local eligibility를 확인한 뒤 필요에 따라 새 Workflow를 실행한다. 상태별 집계는
Workflow가 관찰한 Activity 결과의 요약이지 transaction commit 수를 증명하는 감사 기록은 아니다.

Apply가 완료되면 같은 `postIds`로 dry-run 결과를 다시 확인한다. `counts.wouldUpdate`가 `0`이면 그 실행 시점에 처리할
document나 관계의 차이가 없는 것이다.

Workflow input과 운영 기록에는 Post ID와 `counts`만 사용한다. 본문, Mention 표시 문자열, Hashtag 이름 등 사용자 콘텐츠를
Workflow input, 운영 메모나 로그에 넣지 않는다.
