## Context

이 결정 기록은 [proposal.md](./proposal.md), 세 capability spec과 [design.md](./design.md)의 authority를 분리해 기록한다. 현재 Linear contract와 handoff는 자체 호스팅 Expo OTA의 행동 결과, 구현 slice, static R2 endpoint/bucket을 정의한다. Vault secret의 실제 path·field와 release 실행 결과는 Kosmo caller의 운영 evidence로 기록하며, common publisher는 caller-provided reusable workflow secret `signing_private_key`만 받아 signing storage path·field·provider·backend를 결정하거나 직접 조회하지 않는다. Vault 보관값을 reusable workflow input으로 연결하는 방법은 아직 검증되지 않았다.

## Decision Records

### Repository boundary separates static delivery from Kosmo release workflow

- Decision Date: 2026-09-07
- Decision Class: User-approved Implementation Boundary
- Authority / Provenance: explicit user approval; `PROD-331`, `PROD-332`, `PROD-334`, `PROD-335`
- Status: Active
- Context / Problem: 조직 공용 static R2 delivery와 publisher source를 Kosmo application repository에 함께 두면 delivery와 client/release 권한 및 배포 책임이 섞이고, 어느 repository가 production configuration의 source of truth인지 모호해진다.
- Decision Outcome: public `byulmaru/expo-ota` repository가 조직 공용 static R2 endpoint 설정과 multipart publisher Action/reusable workflow를 소유한다. Kosmo repository는 Expo client, approved export와 channel별 publish handoff workflow를 소유한다. 현재 handoff의 public base URL은 `https://expo-ota.byulmaru.co`, R2 bucket은 `expo-ota`다. static R2는 이미 서명된 object를 read-only로 제공하며 signing private key를 보유하지 않는다. signing private key는 Vault에 보관하고 Kosmo caller는 reusable publisher workflow의 caller secret `signing_private_key`를 제공한다. Vault 보관값을 reusable workflow input으로 연결하는 방법은 미검증 운영 연결로 남기며, publisher는 signing storage path·field·provider·backend를 고정하거나 직접 조회하지 않는다. promotion/recovery orchestration은 보류한다.
- Alternatives Considered: Kosmo repository에 static R2 source를 추가하거나 delivery runtime에서 signing/publish까지 수행하는 방식은 repository와 권한 경계를 섞으므로 제외한다.
- Consequences: PROD-334 구현은 `byulmaru/expo-ota`에서 수행하고, PROD-333·PROD-335와 app/device evidence는 Kosmo에서 수행한다. 현재 endpoint/bucket 값은 해당 handoff와 운영 설정에서 대조하고 live response/object 결과를 evidence로 남긴다. Vault path·field·role, private-key read와 reusable workflow caller secret `signing_private_key` 연결은 Kosmo caller 운영 evidence로 기록하며, common publisher는 전달된 입력만 사용하고 signing storage를 고정하지 않는다.
- Confirmation / Follow-up: PROD-332 Gate evidence와 PROD-334/335 handoff에서 두 repository의 artifact와 read-only delivery/Vault signing boundary를 교차 확인한다.

### Canonical OTA identity is a project/platform/channel/runtime tuple

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-331`, `PROD-332`, `PROD-333`, `PROD-334`
- Status: Superseded by the 2026-09-10 deploy-channel ownership decision
- Context / Problem: `runtimeVersion`만으로 update를 식별하면 서로 다른 앱 binary 또는 platform/channel이 잘못된 update를 받을 수 있다.
- Decision Outcome: OTA identity는 project `kosmo-native`, platform `ios|android`, 안전한 단일 path segment 형식의 OTA channel, 그리고 binary `runtimeVersion`의 tuple로 취급한다. namespace는 URL 또는 trusted routing value로 전달하며 runtimeVersion 단독 식별을 금지한다. 이 기록에서 당시 사용한 channel 값 `staging|production`은 아래 2026-09-10 deploy-channel ownership decision의 논리 mapping `dev|prod`로 대체한다. client와 publisher는 channel 이름 목록을 제한하지 않는다.
- Alternatives Considered: runtimeVersion만 사용하거나 Native public-config channel을 별도 tuple 값 없이 재사용하는 방식은 cross-project 선택과 namespace 혼동을 만들므로 제외한다. slash·empty·`.`·`..`를 허용하는 방식은 path traversal 또는 모호한 경로를 만들므로 제외한다. 현재 deploy mapping과 channel 형식은 아래의 최신 사용자 정정을 따른다.
- Consequences: client, static R2 delivery, release pipeline, device evidence는 같은 tuple을 기록해야 한다. 실제 route 문자열은 이 결정이 고정하지 않는다.
- Confirmation / Follow-up: 현재 `dev|prod` tuple은 PROD-333~335 implementation evidence와 PROD-336 cross-slice 검증에서 대조한다. 실제 route 문자열은 이 결정이 고정하지 않는다.

### Deploy workflow owns OTA channel selection

- Decision Date: 2026-09-10
- Decision Class: User-approved Deployment Boundary
- Authority / Provenance: explicit user correction recorded at the top of `PROD-333` and `PROD-335`
- Status: Active
- Context / Problem: native-store-distribution의 binary upload 단계에 OTA channel 선택을 추가하면 Store distribution과 OTA publication의 책임이 섞이고, 기존 Deploy Dev/Production의 source SHA와 approval boundary를 우회한다.
- Decision Outcome: 기존 Deploy Dev 실행은 Docker Build `workflow_run.head_sha`를 approved source로 사용해 논리적으로 OTA `dev` channel에 발행하고, Deploy Production 실행은 canonical production preflight의 approved target SHA와 기존 `prod` Environment 승인을 사용해 논리적으로 OTA `prod` channel에 발행한다. OTA identity는 project `kosmo-native`, platform `ios|android`, 안전한 단일 path segment channel, runtimeVersion tuple이다. `dev`/`prod`는 deploy mapping이며 client·publisher가 허용하는 channel 이름의 목록이 아니다.
- Alternatives Considered: native-store-distribution의 manual `ota_channel` input을 유지하거나 Store binary upload에서 OTA publish를 수행하는 방식은 사용자 정정과 기존 deployment ownership에 어긋나므로 제외한다. channel 값을 `dev`/`prod` enum으로 제한하는 방식은 generic publisher/client contract를 불필요하게 좁히므로 제외한다. 기존 `staging|production` manual promotion flow는 이 결정에 맞춰 외부 publisher와 함께 별도로 정렬한다.
- Consequences: native-store-distribution은 OTA-enabled binary upload만 수행하고 channel을 수동 선택하지 않는다. Native bootstrap은 binary가 소비할 channel을 `prod`로 고정하고 runtime-qualified URL을 계속 생성한다. Native public-config `dev|prod`는 기존 앱 설정 책임으로 유지하며 OTA channel input이 이를 자동 변경하지 않는다. Promotion/recovery는 이 구현에서 보류한다.
- Confirmation / Follow-up: Deploy Dev/Production workflow source SHA·approval evidence와 `byulmaru/expo-ota` publisher의 generic safe channel segment 계약을 교차 확인한다. 외부 publisher channel format 변경과 live release/device evidence는 아직 남은 작업이다. promotion/recovery 재개 조건은 후속 운영 결정으로 남긴다.

### Promotion and recovery are deferred from the current implementation

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: explicit user scope correction recorded for `PROD-333` and `PROD-335`; `PROD-331`, `PROD-332`
- Status: Active
- Context / Problem: 현재 구현은 Deploy Dev/Production의 channel ownership과 Store binary consumer channel을 정렬하는 데 집중하며, publisher enum 변경과 실기기·운영 evidence가 아직 별도 경계에 있다. promotion/recovery를 함께 구현하면 현재 승인된 slice를 넓히고 검증되지 않은 운영 계약을 active requirement로 만들게 된다.
- Decision Outcome: active OpenSpec scope는 Deploy Dev의 논리 `dev` mapping, Deploy Production의 논리 `prod` mapping, 안전한 단일 path segment generic channel handoff, Store binary의 고정 `prod` consumer channel, 그리고 이에 필요한 client/build metadata와 direct publish handoff로 제한한다. release promotion과 known-good recovery reissue는 보류/held 상태로 남기고, 이 보류를 위해 별도 issue를 만들지 않는다. 기존 promotion/recovery 계약은 design·proposal의 장기 맥락으로만 보존한다.
- Alternatives Considered: 현재 slice에서 promotion/recovery까지 구현하는 방식은 publisher의 외부 channel format 및 운영 evidence가 준비되지 않아 검증 경계를 넘으므로 제외한다. channel 이름을 `dev`/`prod`로만 제한하는 방식은 사용자가 승인한 generic channel contract를 훼손하므로 제외한다. 해당 내용을 삭제하면 나중에 재개할 때 필요한 장기 계약이 사라지므로 deferred context로 보존한다.
- Consequences: active requirements와 task checkboxes는 channel handoff, client compatibility, fallback, binary metadata에 집중한다. promotion/recovery evidence와 archive gate는 재개 전까지 요구하지 않는다.
- Confirmation / Follow-up: 외부 publisher가 generic safe channel segment contract를 제공하고 운영 owner가 재개를 승인할 때 deferred contract와 task를 다시 활성화한다.

### ExpoConfigVersions are excluded from the compatibility fingerprint

- Decision Date: 2026-09-10
- Decision Class: Derived Build Contract
- Authority / Provenance: Expo SDK 56 `@expo/fingerprint` `SourceSkips.ExpoConfigVersions`, `apps/app/fingerprint.config.js`, `PROD-333`
- Status: Active
- Context / Problem: store build metadata can change between Android and iOS builds even when the JavaScript/assets and native compatibility contract are unchanged. Including that metadata in `runtimeVersion` would make build/export runtime values diverge unnecessarily.
- Decision Outcome: use the official `ExpoConfigVersions` source skip. It excludes `version`, `android.versionCode`, and `ios.buildNumber` from the compatibility fingerprint. SDK and dependency sources, tracked native sources, and the bundled OTA certificate remain fingerprint inputs, so changes to those inputs still produce a new runtime and require the corresponding native binary path.
- Alternatives Considered: hard-coding a prior runtime or excluding the whole Expo config would hide real SDK, dependency, native, or certificate changes and is therefore excluded.
- Consequences: release builds may increment app version, Android versionCode, or iOS buildNumber without changing the OTA runtime. Each build and export must still resolve the runtime through the same `fingerprint.config.js` inputs before publishing the project/platform/channel/runtime tuple; the pipeline must not derive runtime identity from store build metadata.
- Confirmation / Follow-up: SDK 56 runtime resolution, native prebuild output, and `createUpdatesResources.js` fingerprint output were checked against the same configuration. Android and iOS resolver/helper values matched, while SDK/dependency/native/certificate source mutations changed the runtime as expected. PROD-333 retains the exact build/export evidence.

### OTA channel and Native public-config channel remain separate (superseded channel values)

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-331`, `PROD-332`, `PROD-333`, `PROD-336`
- Status: Superseded by the 2026-09-10 deploy-channel ownership decision
- Context / Problem: 앱의 Native public-config `dev|prod`는 API·OIDC·Web origin 선택이고 당시 OTA `staging|production`은 update rollout 선택이었다. 두 축의 책임을 합치면 OTA update가 잘못된 backend로 연결될 수 있다.
- Decision Outcome: channel 값과 발행 owner는 최신 deploy-channel decision으로 대체한다. 두 축의 설정 책임은 여전히 분리하고, release binary는 Native public-config `prod`를 사용한다.
- Alternatives Considered: OTA channel input으로 Native public-config를 자동 변경하는 방식은 release binary 운영 경계를 깨므로 제외한다.
- Consequences: `apps/app/src/config/public.ts` 선택과 `expo-updates` channel/bootstrap 설정을 독립적으로 검증해야 한다.
- Confirmation / Follow-up: PROD-333 build config 및 PROD-336 Android/iOS seed binary evidence에서 public-config와 OTA channel을 각각 기록한다.

### OTA payload is limited to compatible JavaScript and assets

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-331`, `PROD-332`, `PROD-333`, `PROD-335`
- Status: Active
- Context / Problem: native module·SDK가 필요한 변경을 OTA로 보내면 binary가 존재하지 않는 native API를 호출할 수 있다.
- Decision Outcome: OTA는 matching runtime의 JavaScript와 asset만 전달한다. native code/module/SDK 변경은 새 Android/iOS store binary의 책임이다.
- Alternatives Considered: native compatibility를 runtimeVersion 외 별도 임의 규칙으로 추정하거나 OTA로 native change를 배포하는 방식은 current contract의 safety boundary가 아니므로 제외한다.
- Consequences: release pipeline은 native requirement를 가진 artifact를 OTA publish 대상에서 제외하고 새 seed/store binary handoff로 돌려보내야 한다. client는 runtime·namespace·signature·hash 계약으로 호환 update만 적용한다.
- Confirmation / Follow-up: PROD-333 runtime/namespace/signature/hash compatibility rejection과 PROD-335 artifact/runtime validation, PROD-336 device evidence로 확인한다. Native requirement artifact의 store-binary 분류는 PROD-335가 소유한다.

### Complete release is the only fixed-manifest target

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-331`, `PROD-332`, `PROD-334`, `PROD-335`, `PROD-336`
- Status: Active
- Context / Problem: partial upload 또는 mutable asset URL은 fixed tuple manifest가 존재하지 않는 파일이나 서로 다른 bytes를 가리키게 한다.
- Decision Outcome: static R2 asset과 multipart manifest를 complete-release gate로 검증한다. content-addressed asset bytes는 immutable로 유지하고, 모든 referenced asset의 upload/read-back 검증이 끝난 뒤에만 fixed tuple `manifest.json` object를 새 signed release record로 교체한다. Deploy workflow는 논리적으로 선택한 `dev` 또는 `prod` mapping을 generic safe channel segment로 전달한다. Promotion/recovery invariants는 장기 계약으로 보존하되 현재 구현에서는 보류한다.
- Alternatives Considered: manifest object를 먼저 변경하거나 published asset을 덮어써서 빠르게 rollback하는 방식은 client별 partial state를 만들 수 있으므로 제외한다.
- Consequences: release pipeline은 complete-release gate, immutable asset content identity, channel-specific multipart manifest identity evidence를 제공해야 한다. fixed manifest object는 현재 release를 가리키는 serving record이며, 그 교체는 complete signed release로 제한한다. Native Store binary upload은 이 release publication과 별도다.
- Confirmation / Follow-up: PROD-335 deploy publish 결과와 PROD-336 실기기 fallback 증거를 연결한다. promotion/recovery 결과는 보류 해제 후 연결한다.

### Static R2 serving does not hold signing private keys or publishing credentials

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-331`, `PROD-332`, `PROD-334`, `PROD-335`
- Status: Active
- Context / Problem: static R2 origin이 private signing key나 release credential을 가지면 object serving compromise가 임의 update 발행으로 이어질 수 있다.
- Decision Outcome: static R2는 이미 서명된 multipart manifest와 immutable asset bytes만 제공한다. 서명·publish는 publisher job의 책임이며 reusable workflow의 caller secret `signing_private_key`는 Kosmo caller가 제공한다. Vault 보관값을 reusable workflow input으로 연결하는 방법은 미검증 운영 연결로 남고, publisher는 signing storage 경로나 provider를 직접 조회하지 않는다. public certificate는 native seed binary에 bundle하고 client가 update 적용 전에 서명을 검증한다.
- Alternatives Considered: delivery origin에서 서명·publish 또는 요청별 manifest verification을 수행하는 방식은 static serving과 release publisher의 권한 경계를 합치므로 제외한다.
- Consequences: static R2에는 signing private key나 publishing credential을 배포하지 않는다. Kosmo caller의 Vault 보관/read evidence와 reusable workflow caller secret `signing_private_key` 연결 결과는 release 운영에서 확인할 미검증 항목이며, common publisher는 전달된 input만 사용한다.
- Confirmation / Follow-up: PROD-334 static object inspection과 PROD-335 publisher credential-boundary evidence를 검토한다.

### OTA signing certificate has a bounded validity and rotation policy

- Decision Date: 2026-09-10
- Decision Class: User-approved Credential Boundary
- Authority / Provenance: explicit user approval; `PROD-333`, `PROD-335`
- Status: Active
- Context / Problem: OTA publisher는 signing private key와 client trust material을 같은 release lifecycle에서 관리해야 하며, 초기 key/certificate provision 결과와 이후 rotation 경계를 추적해야 한다.
- Decision Outcome: OTA signing certificate의 validity는 1년으로 하고 6개월마다 rotation한다. `2026-09` 초기 signing private key는 Vault KV v2의 `secret/data/expo-ota/signing/kosmo-native/2026-09` 경로에 `private_key` field로 등록된 것으로 기록되었고 version 1이다. 이 path·field는 caller 운영 설정이며 common publisher contract가 고정하지 않는다. reusable workflow의 caller secret `signing_private_key`는 Kosmo caller가 제공하고, Vault 보관값을 해당 input으로 연결하는 방법은 미검증 운영 연결로 남긴다. public certificate는 `apps/app/certs/certificate.pem`에 두고 Android/iOS native seed binary에 bundle한다. 현재 certificate validity window는 `2026-09-10`부터 `2027-09-10`까지(KST)이며 첫 rotation 예정일은 `2027-03-10`이다.
- Alternatives Considered: signing private key를 GitHub repository/environment secret 또는 static R2에 두는 방식은 승인된 Vault credential boundary와 client/server trust 분리를 깨므로 제외한다.
- Consequences: PROD-333 task 2.1의 client bootstrap/build metadata와 public certificate source evidence는 연결되었지만 seed binary 배포 및 device proof는 아직 남아 있다. rotation마다 새 certificate를 포함한 새 runtime·Store binary를 배포하고, 구 runtime은 구 certificate를 계속 사용하며 dual trust를 추가하지 않는다. PROD-335는 caller-provided reusable workflow secret `signing_private_key`, Vault 보관값 연결과 1년/6개월 rotation evidence를 기록하며, 해당 연결은 아직 검증되지 않았다.
- Confirmation / Follow-up: 초기 key/certificate provision과 client config evidence는 2026-09-10 KST에 기록되었다. caller private-key read, reusable workflow input linkage, signed release, 새 runtime·Store binary, 구 runtime certificate 유지 및 실기기 결과는 아직 확인해야 한다.

### 2026-09-09 handoff revision

- Authority / Provenance: explicit user approval and current PROD-333/335 handoff.
- This revision preserves the 2026-09-07 static delivery, complete-release, and seed-path decisions while recording the public `byulmaru/expo-ota` handoff, current endpoint/bucket inputs, and the caller-owned Vault private-key boundary. The 2026-09-10 deploy-channel ownership decision supersedes the earlier `staging|production` channel values. Promotion/recovery remain deferred from the current implementation.
- Rotation is represented by a new certificate, runtime, and Store binary; an existing runtime keeps its existing certificate, and dual trust is outside this change. The endpoint/bucket and publisher results are operational evidence, not new upstream or caller-identity gates.

### 2026-09-10 initial OTA credential provision evidence

- `2026-09` private key registration completed in Vault KV v2 at `secret/data/expo-ota/signing/kosmo-native/2026-09`, field `private_key`, version 1. The private key material is not stored in this repository or in this change.
- Public certificate source is `apps/app/certs/certificate.pem`; its recorded validity is `2026-09-10` through `2027-09-10` (KST), with the first six-month rotation scheduled for `2027-03-10`.
- PROD-333 task 2.1 is complete for the client bootstrap/build metadata implementation. Compatible update, rejection/offline/fallback proof (2.2), and new PROD-886/PROD-876 seed binary build/distribution evidence (2.3) remain incomplete.

### Current Android seed path is PROD-886; PROD-285 is historical context

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-331`, `PROD-332`, `PROD-333`, `PROD-336`, completed `PROD-886`, completed `PROD-876`
- Status: Active
- Context / Problem: 일부 legacy issue text가 과거 Google Play Internal 경로 `PROD-285`를 가리키지만 현재 Android seed binary는 Google Play Alpha/private testing `PROD-886`이고 iOS는 TestFlight `PROD-876`이다.
- Decision Outcome: 현재 OTA-enabled Android seed binary와 device evidence는 PROD-886을 사용하고, PROD-285는 historical path로만 언급한다. iOS는 PROD-876을 사용한다.
- Alternatives Considered: PROD-285를 current Android seed path로 재사용하는 방식은 completed current workflow와 evidence를 잘못 연결하므로 제외한다.
- Consequences: PROD-333 workflow handoff와 PROD-336 device matrix에 PROD-886/PROD-876을 기록하고, stale PROD-285 dependency/blocker를 current prerequisite로 만들지 않는다.
- Confirmation / Follow-up: upstream consistency patch가 완료되었고 PROD-331~336 최신 본문·relations를 다시 읽어 current authority와 일치함을 확인했다. 현재 구현 scope와 evidence는 PROD-886/PROD-876 기준이다.

### Shared OpenSpec ownership follows the implementation handoff

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-331`, `PROD-332`, `PROD-333`, `PROD-334`, `PROD-335`, `PROD-336`
- Status: Active
- Context / Problem: OpenSpec 작성만 완료하면 spec-only orphan이 되고, parent issue가 자동으로 final archive owner가 된다고 추론하면 실제 cross-slice 결과가 사라진다.
- Decision Outcome: PROD-332는 shared change의 OpenSpec Gate와 구현 handoff를 소유한다. PROD-333은 client/bootstrap와 seed binary, PROD-334는 static R2 delivery, PROD-335는 deploy publish handoff, PROD-336은 실기기 검증·운영 runbook·최종 cross-slice consistency와 archive를 소유한다. promotion/recovery는 보류하며, PROD-331은 archive와 하위 결과가 연결된 뒤 parent completion을 판단한다.
- Alternatives Considered: OpenSpec artifacts만 PROD-332의 완료 결과로 보거나 parent PROD-331이 archive를 자동 소유하는 방식은 implementation evidence와 통합 검증 책임을 분리하지 못하므로 제외한다.
- Consequences: tasks는 각 issue의 Deliverable·Guardrails·Verification을 구분하고, archive task는 PROD-336에만 둔다.
- Confirmation / Follow-up: explicit user approval로 OpenSpec Gate를 통과한 뒤 각 issue PR/evidence를 연결한다.

## Operational Evidence

- 현재 static R2 endpoint `https://expo-ota.byulmaru.co`와 bucket `expo-ota`가 configured host/object와 일치하고 positive multipart response를 제공하는지 기록한다.
- Kosmo caller가 사용하는 Vault secret path·role·fixed field와 private-key read, reusable workflow caller secret `signing_private_key` input linkage 결과를 기록한다. Vault 보관값을 workflow input으로 연결하는 방법과 실제 handoff는 미검증 상태이며, common publisher는 해당 signing storage/provider를 고정하지 않는다.
- 초기 OTA key/certificate provision은 Vault path·field·version과 public certificate validity evidence로 기록되었다. rotation마다 새 certificate·runtime·Store binary를 배포하고, 구 runtime은 구 certificate를 유지함을 기록한다.
- PROD-886/PROD-876 seed binary의 고정 OTA consumer channel `prod`와 evidence 보존 위치를 기록한다.
- PROD-336의 archive 승인자와 cross-slice evidence retention 기간을 기록한다.

## Remaining Decisions

- release promotion과 known-good recovery reissue는 현재 구현에서 보류/held 상태다. 외부 publisher의 generic safe channel segment contract와 운영 evidence가 준비되고 owner가 재개를 승인할 때 장기 계약과 task를 다시 활성화한다. 이 보류를 위해 별도 issue를 만들지 않는다.

## Superseded Decisions

- 2026-09-07 `Canonical OTA identity is a project/platform/channel/runtime tuple`의 channel 값 `staging|production`은 2026-09-10 deploy-channel ownership decision으로 대체되었다.
- 2026-09-07 `OTA channel and Native public-config channel remain separate`의 channel 값과 발행 owner는 2026-09-10 deploy-channel ownership decision으로 대체되었다. 설정 책임 분리와 release binary의 Native public-config `prod`는 계속 유효하다.
