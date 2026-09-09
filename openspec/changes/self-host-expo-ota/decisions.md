## Context

이 결정 기록은 [proposal.md](./proposal.md), 세 capability spec과 [design.md](./design.md)의 authority를 분리해 기록한다. 현재 Linear contract와 handoff는 자체 호스팅 Expo OTA의 행동 결과, 구현 slice, static R2 endpoint/bucket을 정의한다. Vault secret의 실제 path·field와 release 실행 결과는 운영 evidence로 기록하며, 이 change에서 caller permission이나 새 auth 경계를 추가하지 않는다.

## Decision Records

### Repository boundary separates static delivery from Kosmo release workflow

- Decision Date: 2026-09-07
- Decision Class: User-approved Implementation Boundary
- Authority / Provenance: explicit user approval; `PROD-331`, `PROD-332`, `PROD-334`, `PROD-335`
- Status: Active
- Context / Problem: 조직 공용 static R2 delivery와 publisher source를 Kosmo application repository에 함께 두면 delivery와 client/release 권한 및 배포 책임이 섞이고, 어느 repository가 production configuration의 source of truth인지 모호해진다.
- Decision Outcome: public `byulmaru/expo-ota` repository가 조직 공용 static R2 endpoint 설정과 multipart publisher Action/reusable workflow를 소유한다. Kosmo repository는 Expo client, approved export와 publish/promotion 호출 workflow를 소유한다. 현재 handoff의 public base URL은 `https://expo-ota.byulmaru.co`, R2 bucket은 `expo-ota`다. static R2는 이미 서명된 object를 read-only로 제공하며 signing private key를 보유하지 않는다. publisher job은 signing private key를 Vault에서 읽는다.
- Alternatives Considered: Kosmo repository에 static R2 source를 추가하거나 delivery runtime에서 signing/publish까지 수행하는 방식은 repository와 권한 경계를 섞으므로 제외한다.
- Consequences: PROD-334 구현은 `byulmaru/expo-ota`에서 수행하고, PROD-333·PROD-335와 app/device evidence는 Kosmo에서 수행한다. 현재 endpoint/bucket 값은 해당 handoff와 운영 설정에서 대조하고 live response/object 결과를 evidence로 남긴다. Vault path·field는 publisher 운영 evidence로 기록하며 caller permission이나 새 auth 경계를 이 결정에서 추가하지 않는다.
- Confirmation / Follow-up: PROD-332 Gate evidence와 PROD-334/335 handoff에서 두 repository의 artifact와 read-only delivery/Vault signing boundary를 교차 확인한다.

### Canonical OTA identity is a project/platform/channel/runtime tuple

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-331`, `PROD-332`, `PROD-333`, `PROD-334`
- Status: Active
- Context / Problem: `runtimeVersion`만으로 update를 식별하면 서로 다른 앱 binary 또는 platform/channel이 잘못된 update를 받을 수 있다.
- Decision Outcome: OTA identity는 project `kosmo-native`, platform `ios|android`, OTA channel `staging|production`, 그리고 binary `runtimeVersion`의 tuple로 취급한다. namespace는 URL 또는 trusted routing value로 전달하며 runtimeVersion 단독 식별을 금지한다.
- Alternatives Considered: runtimeVersion만 사용하거나 Native public-config `dev|prod`를 OTA channel로 재사용하는 방식은 현재 Linear contract가 금지하는 혼동과 cross-project 선택을 만들므로 제외한다.
- Consequences: client, static R2 delivery, release pipeline, device evidence는 같은 tuple을 기록해야 한다. 실제 route 문자열은 이 결정이 고정하지 않는다.
- Confirmation / Follow-up: PROD-333~335 implementation evidence와 PROD-336 cross-slice 검증에서 tuple을 대조한다.

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

### OTA channel and Native public-config channel remain separate

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-331`, `PROD-332`, `PROD-333`, `PROD-336`
- Status: Active
- Context / Problem: 앱의 Native public-config `dev|prod`는 API·OIDC·Web origin 선택이고 OTA `staging|production`은 update rollout 선택이다. 두 축을 합치면 staging update가 dev backend로 연결될 수 있다.
- Decision Outcome: release binary는 두 OTA channel 모두 Native public-config `prod`를 사용하고, OTA channel은 update service 조회에만 사용한다.
- Alternatives Considered: `staging` OTA를 Native `dev` config에 연결하는 방식은 현재 issue contract와 release binary 운영 경계를 깨므로 제외한다.
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
- Decision Outcome: static R2 asset과 multipart manifest를 complete-release gate로 검증한다. content-addressed asset bytes는 immutable로 유지하고, 모든 referenced asset의 upload/read-back 검증이 끝난 뒤에만 fixed tuple `manifest.json` object를 새 signed release record로 교체한다. staging promotion은 같은 approved export bytes와 그 provenance에서 검증된 asset을 재사용하되 production channel용 새 multipart manifest/release record를 만든다. recovery도 새 release metadata를 가진 검증된 known-good multipart manifest로 reissue한다.
- Alternatives Considered: manifest object를 먼저 변경하거나 published asset을 덮어써서 빠르게 rollback하는 방식은 client별 partial state를 만들 수 있으므로 제외한다.
- Consequences: release pipeline은 complete-release gate, immutable asset content identity, channel-specific multipart manifest identity, known-good reissue evidence를 제공해야 한다. fixed manifest object는 현재 release를 가리키는 serving record이며, 그 교체는 complete signed release로 제한한다.
- Confirmation / Follow-up: PROD-335 publish/promotion/recovery 결과와 PROD-336 실기기 recovery 증거를 연결한다.

### Static R2 serving does not hold signing private keys or publishing credentials

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-331`, `PROD-332`, `PROD-334`, `PROD-335`
- Status: Active
- Context / Problem: static R2 origin이 private signing key나 release credential을 가지면 object serving compromise가 임의 update 발행으로 이어질 수 있다.
- Decision Outcome: static R2는 이미 서명된 multipart manifest와 immutable asset bytes만 제공한다. 서명·publish는 publisher job의 책임이며 signing private key는 Vault에서 job 실행 중에만 읽는다. public certificate는 native seed binary에 bundle하고 client가 update 적용 전에 서명을 검증한다.
- Alternatives Considered: delivery origin에서 서명·publish 또는 요청별 manifest verification을 수행하는 방식은 static serving과 release publisher의 권한 경계를 합치므로 제외한다.
- Consequences: static R2에는 signing private key나 publishing credential을 배포하지 않는다. Vault private-key read와 configured role/path evidence는 publisher 운영 결과로 확인하며, 이 결정에서 caller permission이나 새 auth 체계를 추가하지 않는다.
- Confirmation / Follow-up: PROD-334 static object inspection과 PROD-335 publisher credential-boundary evidence를 검토한다.

### OTA signing certificate has a bounded validity and rotation policy

- Decision Date: 2026-09-10
- Decision Class: User-approved Credential Boundary
- Authority / Provenance: explicit user approval; `PROD-333`, `PROD-335`
- Status: Active
- Context / Problem: OTA publisher는 signing private key와 client trust material을 같은 release lifecycle에서 관리해야 하며, 초기 key/certificate provision 결과와 이후 rotation 경계를 추적해야 한다.
- Decision Outcome: OTA signing certificate의 validity는 1년으로 하고 6개월마다 rotation한다. `2026-09` 초기 signing private key는 Vault KV v2의 `secret/data/expo-ota/signing/kosmo-native/2026-09` 경로에 `private_key` field로 등록되었고 version 1이다. public certificate는 `apps/app/certs/certificate.pem`에 두고 Android/iOS native seed binary에 bundle한다. 현재 certificate validity window는 `2026-09-10`부터 `2027-09-10`까지(KST)이며 첫 rotation 예정일은 `2027-03-10`이다.
- Alternatives Considered: signing private key를 GitHub repository/environment secret 또는 static R2에 두는 방식은 승인된 Vault credential boundary와 client/server trust 분리를 깨므로 제외한다.
- Consequences: PROD-333 task 2.1의 client bootstrap/build metadata와 public certificate source evidence는 연결되었지만 seed binary 배포 및 device proof는 아직 남아 있다. rotation마다 새 certificate를 포함한 새 runtime·Store binary를 배포하고, 구 runtime은 구 certificate를 계속 사용하며 dual trust를 추가하지 않는다. PROD-335는 Vault private-key read와 1년/6개월 rotation evidence를 기록한다.
- Confirmation / Follow-up: 초기 key/certificate provision과 client config evidence는 2026-09-10 KST에 기록되었다. publisher private-key read, signed release, 새 runtime·Store binary, 구 runtime certificate 유지 및 실기기 결과는 아직 확인해야 한다.

### 2026-09-09 handoff revision

- Authority / Provenance: explicit user approval and current PROD-333/335 handoff.
- This revision preserves the 2026-09-07 tuple, static delivery, complete-release, and seed-path decisions while recording the public `byulmaru/expo-ota` handoff, current endpoint/bucket inputs, and the Vault private-key boundary.
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
- Decision Outcome: PROD-332는 shared change의 OpenSpec Gate와 구현 handoff를 소유한다. PROD-333은 client/bootstrap와 seed binary, PROD-334는 static R2 delivery, PROD-335는 publish/promotion/recovery, PROD-336은 실기기 검증·운영 runbook·최종 cross-slice consistency와 archive를 소유한다. PROD-331은 archive와 하위 결과가 연결된 뒤 parent completion을 판단한다.
- Alternatives Considered: OpenSpec artifacts만 PROD-332의 완료 결과로 보거나 parent PROD-331이 archive를 자동 소유하는 방식은 implementation evidence와 통합 검증 책임을 분리하지 못하므로 제외한다.
- Consequences: tasks는 각 issue의 Deliverable·Guardrails·Verification을 구분하고, archive task는 PROD-336에만 둔다.
- Confirmation / Follow-up: explicit user approval로 OpenSpec Gate를 통과한 뒤 각 issue PR/evidence를 연결한다.

## Operational Evidence

- 현재 static R2 endpoint `https://expo-ota.byulmaru.co`와 bucket `expo-ota`가 configured host/object와 일치하고 positive multipart response를 제공하는지 기록한다.
- publisher가 사용하는 Vault secret path·role·fixed field와 private-key read 결과를 기록한다. caller permission이나 새 auth 경계를 추가 결정하지 않는다.
- 초기 OTA key/certificate provision은 Vault path·field·version과 public certificate validity evidence로 기록되었다. rotation마다 새 certificate·runtime·Store binary를 배포하고, 구 runtime은 구 certificate를 유지함을 기록한다.
- PROD-886/PROD-876 seed binary의 OTA channel 선택 input과 evidence 보존 위치를 기록한다.
- PROD-336의 archive 승인자와 cross-slice evidence retention 기간을 기록한다.

## Superseded Decisions

- 없음.
