## 1. Workspace Setup

- [x] 1.1 Add the NATS JavaScript client dependency with `pnpm` to the package that owns the shared queue module.
- [x] 1.2 Create the `apps/worker` workspace package with `dev`, `start`, and `lint:tsc` scripts.
- [x] 1.3 Add worker TypeScript configuration consistent with the existing API app.
- [x] 1.4 Export the new queue module from `@kosmo/core` without changing unrelated core exports.

## 2. Core Queue Module

- [x] 2.1 Implement queue configuration parsing for `NATS_URL`, stream name, consumer name, subject prefix, ack wait, max delivery, and worker concurrency.
- [x] 2.2 Implement NATS connection and JetStream client creation using `NATS_URL` as the only NATS authentication/configuration input.
- [x] 2.3 Implement job stream initialization for the configured job subject prefix.
- [x] 2.4 Define the standard job envelope schema with job id, job type, envelope version, payload, enqueue timestamp, and optional trace id.
- [x] 2.5 Implement a typed job registry with zod payload validation for enqueue and consume paths.
- [x] 2.6 Implement producer publish logic that waits for JetStream acknowledgement and uses job id as the duplicate detection id.
- [x] 2.7 Implement one durable consumer for the configured subject prefix and dispatch messages to registered handlers by job type.
- [x] 2.8 Implement retry handling for retryable failures using JetStream redelivery.
- [x] 2.9 Implement JetStream-centered terminal failure handling with structured logs for terminal failures, unknown job types, and unsupported envelope versions.
- [x] 2.10 Add the lightweight smoke job definition and handler contract.
- [x] 2.11 Apply default queue settings: subject prefix `kosmo.jobs`, stream `KOSMO_JOBS`, durable consumer `kosmo-worker`, ack wait `30s`, max delivery `5`, worker concurrency `4`.

## 3. Worker App

- [x] 3.1 Implement the worker process entrypoint that initializes queue configuration, stream, consumer, and handlers.
- [x] 3.2 Register the smoke job handler and log successful processing with the job id.
- [x] 3.3 Add graceful shutdown handling that drains or closes the NATS connection on process termination.
- [x] 3.4 Add `pnpm --filter @kosmo/worker smoke:enqueue` or equivalent worker package script that publishes the smoke job in a configured environment.

## 4. API Integration

- [x] 4.1 Add an API-side producer creation point that can be reused by future request handlers.
- [x] 4.2 Keep API startup working without `NATS_URL`, but ensure first producer initialization or enqueue use reports NATS configuration/publish failures clearly.
- [x] 4.3 Keep existing `/health` and `/graphql` behavior unchanged.

## 5. Deployment Configuration

- [x] 5.1 Add Helm values for `NATS_URL`, job stream/consumer names, retry limits, and worker concurrency.
- [x] 5.2 Add a worker rollout template that uses the same secret/env wiring pattern as existing apps.
- [x] 5.3 Add worker image command and replica configuration without changing existing API/web rollout behavior.

## 6. Verification

- [x] 6.1 Run TypeScript checking for `@kosmo/core`, `@kosmo/api`, and `@kosmo/worker` where scripts exist.
- [x] 6.2 Run the relevant ESLint and Prettier checks for the changed workspace files.
- [x] 6.3 With a local or configured NATS JetStream server, enqueue the smoke job and verify that the worker consumes and acknowledges it.
- [x] 6.4 Verify retry behavior with a deliberately failing handler and confirm terminal failures are visible through JetStream consumer state and worker structured logs.
