{{- define "kosmo.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kosmo.postgresName" -}}
{{- printf "%s-postgres" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kosmo.postgresPoolerName" -}}
{{- printf "%s-pooler-rw" (include "kosmo.postgresName" . | trunc 53 | trimSuffix "-") -}}
{{- end -}}

{{- define "kosmo.postgresTailscaleName" -}}
{{- printf "%s-postgres-ts" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kosmo.postgresTailscaleHostname" -}}
{{- printf "%s-%s-postgres" .Release.Name .Values.env | lower | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kosmo.databaseUrl" -}}
{{- printf "postgres://kosmo:$(DATABASE_PASSWORD)@%s-rw:5432/kosmo" (include "kosmo.postgresName" .) -}}
{{- end -}}

{{- define "kosmo.postgresPoolerDatabaseUrl" -}}
{{- printf "postgres://kosmo:$(DATABASE_PASSWORD)@%s:5432/kosmo" (include "kosmo.postgresPoolerName" .) -}}
{{- end -}}

{{- define "kosmo.fedifyQueueResourceName" -}}
{{- printf "%s-postgres-fedify-queue" (.Release.Name | trunc 41 | trimSuffix "-") -}}
{{- end -}}

{{- define "kosmo.validatePostgresCredentials" -}}
{{- $credentials := .Values.postgres.credentials | default dict -}}
{{- $api := get $credentials "api" | default dict -}}
{{- $apiDatabaseUrl := get $api "databaseUrl" | default "" | toString -}}
{{- $apiPasswordSecret := get $api "passwordSecret" | default dict -}}
{{- $apiName := get $apiPasswordSecret "name" | default "" | toString -}}
{{- $apiKey := get $apiPasswordSecret "key" | default "" | toString -}}
{{- if and (or (ne $apiDatabaseUrl "") (ne $apiName "") (ne $apiKey "")) (or (eq $apiDatabaseUrl "") (eq $apiName "") (eq $apiKey "")) -}}
{{- fail "postgres.credentials.api requires databaseUrl, passwordSecret.name, and passwordSecret.key together" -}}
{{- end -}}
{{- end -}}

{{- define "kosmo.apiDatabaseIsConfigured" -}}
{{- $config := dig "api" dict (.Values.postgres.credentials | default dict) -}}
{{- $databaseUrl := get $config "databaseUrl" | default "" | toString -}}
{{- $passwordSecret := get $config "passwordSecret" | default dict -}}
{{- $name := get $passwordSecret "name" | default "" | toString -}}
{{- $key := get $passwordSecret "key" | default "" | toString -}}
{{- if and (ne $databaseUrl "") (ne $name "") (ne $key "") -}}true{{- else -}}false{{- end -}}
{{- end -}}

{{- define "kosmo.apiDatabaseUrl" -}}
{{- if eq (include "kosmo.apiDatabaseIsConfigured" . | trim) "true" -}}
{{- dig "api" "databaseUrl" "" (.Values.postgres.credentials | default dict) -}}
{{- else -}}
{{- include "kosmo.databaseUrl" . -}}
{{- end -}}
{{- end -}}

{{- define "kosmo.apiPoolerDatabaseUrl" -}}
{{- if eq (include "kosmo.apiDatabaseIsConfigured" . | trim) "true" -}}
{{- $databaseUrl := dig "api" "databaseUrl" "" (.Values.postgres.credentials | default dict) | toString -}}
{{- $parsed := urlParse $databaseUrl -}}
{{- $scheme := get $parsed "scheme" | default "" | toString -}}
{{- $host := get $parsed "host" | default "" | toString -}}
{{- if and (ne $scheme "postgres") (ne $scheme "postgresql") -}}
{{- fail "postgres.credentials.api.databaseUrl must use the postgres or postgresql scheme" -}}
{{- end -}}
{{- if eq $host "" -}}
{{- fail "postgres.credentials.api.databaseUrl must include a host" -}}
{{- end -}}
{{- $schemePrefix := regexFind "^[^:]+://" $databaseUrl | default "" -}}
{{- $authorityAndSuffix := trimPrefix $schemePrefix $databaseUrl -}}
{{- $authority := regexFind "^[^/?#]*" $authorityAndSuffix | default "" -}}
{{- $userinfo := regexFind "^.*@" $authority | default "" -}}
{{- $rawHost := trimPrefix $userinfo $authority -}}
{{- if or (eq $schemePrefix "") (eq $rawHost "") (ne $rawHost $host) -}}
{{- fail "postgres.credentials.api.databaseUrl must have a parseable authority" -}}
{{- end -}}
{{- $suffix := trimPrefix $authority $authorityAndSuffix -}}
{{- printf "%s%s%s:5432%s" $schemePrefix $userinfo (include "kosmo.postgresPoolerName" .) $suffix -}}
{{- else -}}
{{- include "kosmo.postgresPoolerDatabaseUrl" . -}}
{{- end -}}
{{- end -}}

{{- define "kosmo.apiDatabasePasswordSecretName" -}}
{{- if eq (include "kosmo.apiDatabaseIsConfigured" . | trim) "true" -}}
{{- dig "api" "passwordSecret" "name" "" (.Values.postgres.credentials | default dict) -}}
{{- else -}}
{{- printf "%s-app" (include "kosmo.postgresName" .) -}}
{{- end -}}
{{- end -}}

{{- define "kosmo.apiDatabasePasswordSecretKey" -}}
{{- if eq (include "kosmo.apiDatabaseIsConfigured" . | trim) "true" -}}
{{- dig "api" "passwordSecret" "key" "" (.Values.postgres.credentials | default dict) | quote -}}
{{- else -}}
password
{{- end -}}
{{- end -}}

{{- define "kosmo.workerDatabasePasswordSecretName" -}}
{{- printf "%s-postgres-worker" (.Release.Name | trunc 47 | trimSuffix "-") -}}
{{- end -}}

{{- define "kosmo.imageRef" -}}
{{- if eq .Values.env "prod" -}}
{{- if not (regexMatch "^sha256:[0-9a-f]{64}$" .Values.imageDigest) -}}
{{- fail "imageDigest must be a sha256 digest when env=prod" -}}
{{- end -}}
{{- end -}}
{{- if .Values.imageDigest -}}
{{- printf "%s@%s" .Values.image .Values.imageDigest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image .Values.version -}}
{{- end -}}
{{- end -}}

{{- define "kosmo.temporalAdminToolsImageRef" -}}
{{- if not (regexMatch "^sha256:[0-9a-f]{64}$" .Values.temporal.adminTools.digest) -}}
{{- fail "temporal.adminTools.digest must be a sha256 digest" -}}
{{- end -}}
{{- printf "%s@%s" .Values.temporal.adminTools.image .Values.temporal.adminTools.digest -}}
{{- end -}}

{{- define "kosmo.temporalNamespaceName" -}}
{{- $name := get .Values.temporal.namespace.names .Values.env | default "" -}}
{{- if not $name -}}
{{- fail (printf "temporal.namespace.names.%s is required" .Values.env) -}}
{{- end -}}
{{- $name -}}
{{- end -}}

{{- define "kosmo.temporalNamespaceRetention" -}}
{{- $retention := get .Values.temporal.namespace.retentions .Values.env | default "" -}}
{{- if not $retention -}}
{{- fail (printf "temporal.namespace.retentions.%s is required" .Values.env) -}}
{{- end -}}
{{- $retention -}}
{{- end -}}
