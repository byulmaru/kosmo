{{- define "kosmo.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kosmo.postgresName" -}}
{{- printf "%s-postgres" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kosmo.postgresPoolerName" -}}
{{- printf "%s-pooler-rw" (include "kosmo.postgresName" .) | trunc 63 | trimSuffix "-" -}}
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

{{- define "kosmo.validatePostgresCredentials" -}}
{{- $credentials := .Values.postgres.credentials | default dict -}}
{{- range $role := list "api" "fedify" -}}
{{- $config := get $credentials $role | default dict -}}
{{- $databaseUrl := get $config "databaseUrl" | default "" -}}
{{- $passwordSecret := get $config "passwordSecret" | default dict -}}
{{- $name := get $passwordSecret "name" | default "" | toString -}}
{{- $key := get $passwordSecret "key" | default "" | toString -}}
{{- $configured := or (ne $databaseUrl "") (ne $name "") (ne $key "") -}}
{{- $complete := and (ne $databaseUrl "") (ne $name "") (ne $key "") -}}
{{- if and $configured (not $complete) -}}
{{- fail (printf "postgres.credentials.%s requires databaseUrl, passwordSecret.name, and passwordSecret.key together" $role) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "kosmo.postgresCredentialIsConfigured" -}}
{{- $root := index . 0 -}}
{{- $role := index . 1 -}}
{{- $credentials := $root.Values.postgres.credentials | default dict -}}
{{- $config := get $credentials $role | default dict -}}
{{- $databaseUrl := get $config "databaseUrl" | default "" | toString -}}
{{- $passwordSecret := get $config "passwordSecret" | default dict -}}
{{- $name := get $passwordSecret "name" | default "" | toString -}}
{{- $key := get $passwordSecret "key" | default "" | toString -}}
{{- if and (ne $databaseUrl "") (ne $name "") (ne $key "") -}}true{{- else -}}false{{- end -}}
{{- end -}}

{{- define "kosmo.apiDatabaseUrl" -}}
{{- if eq (include "kosmo.postgresCredentialIsConfigured" (list . "api") | trim) "true" -}}
{{- dig "api" "databaseUrl" "" (.Values.postgres.credentials | default dict) -}}
{{- else -}}
{{- include "kosmo.databaseUrl" . -}}
{{- end -}}
{{- end -}}

{{- define "kosmo.apiDatabasePasswordSecretName" -}}
{{- if eq (include "kosmo.postgresCredentialIsConfigured" (list . "api") | trim) "true" -}}
{{- dig "api" "passwordSecret" "name" "" (.Values.postgres.credentials | default dict) -}}
{{- else -}}
{{- printf "%s-app" (include "kosmo.postgresName" .) -}}
{{- end -}}
{{- end -}}

{{- define "kosmo.apiDatabasePasswordSecretKey" -}}
{{- if eq (include "kosmo.postgresCredentialIsConfigured" (list . "api") | trim) "true" -}}
{{- dig "api" "passwordSecret" "key" "" (.Values.postgres.credentials | default dict) | quote -}}
{{- else -}}
password
{{- end -}}
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
