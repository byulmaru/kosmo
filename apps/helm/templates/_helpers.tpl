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

{{- define "kosmo.postgresCredentialClientCertificateIsConfigured" -}}
{{- $root := index . 0 -}}
{{- $role := index . 1 -}}
{{- $credentials := $root.Values.postgres.credentials | default dict -}}
{{- $config := get $credentials $role | default dict -}}
{{- $clientCertificate := get $config "clientCertificate" | default dict -}}
{{- if get $clientCertificate "enabled" | default false }}true{{- else }}false{{- end -}}
{{- end -}}

{{- define "kosmo.validatePostgresCredentials" -}}
{{- $root := . -}}
{{- $credentials := .Values.postgres.credentials | default dict -}}
{{- range $role := list "api" "fedify" "worker" -}}
{{- $config := get $credentials $role | default dict -}}
{{- $databaseUrl := get $config "databaseUrl" | default "" -}}
{{- $passwordSecret := get $config "passwordSecret" | default dict -}}
{{- $name := get $passwordSecret "name" | default "" | toString -}}
{{- $key := get $passwordSecret "key" | default "" | toString -}}
{{- $clientCertificate := get $config "clientCertificate" | default dict -}}
{{- $clientCertificateEnabled := get $clientCertificate "enabled" | default false -}}
{{- $configured := or (ne $databaseUrl "") (ne $name "") (ne $key "") -}}
{{- $complete := and (ne $databaseUrl "") (ne $name "") (ne $key "") -}}
{{- if $clientCertificateEnabled -}}
{{- if not (ne $databaseUrl "") -}}
{{- fail (printf "postgres.credentials.%s.clientCertificate requires databaseUrl" $role) -}}
{{- end -}}
{{- if or (ne $name "") (ne $key "") -}}
{{- fail (printf "postgres.credentials.%s.clientCertificate is mutually exclusive with passwordSecret" $role) -}}
{{- end -}}
{{- $certificatePrincipal := get (dict "api" "kosmo_api" "worker" "kosmo_worker") $role | default "" -}}
{{- if eq $certificatePrincipal "" -}}
{{- fail (printf "postgres.credentials.%s.clientCertificate is only supported for api or worker" $role) -}}
{{- end -}}
{{- $clusterService := printf "%s-rw" (include "kosmo.postgresName" $root) -}}
{{- $directClusterUrlPattern := printf "^postgres(?:ql)?://%s@%s(?:\\.[^/:@]+)*(?::[0-9]+)?/[^?]+(?:\\?.*)?$" $certificatePrincipal $clusterService -}}
{{- if not (regexMatch $directClusterUrlPattern $databaseUrl) -}}
{{- fail (printf "postgres.credentials.%s.clientCertificate.databaseUrl must be a direct cluster-rw PostgreSQL URL" $role) -}}
{{- end -}}
{{- else if and (eq $role "worker") $configured -}}
{{- fail "postgres.credentials.worker password selection is owned by PROD-715; use the existing fedify password selector until that cutover" -}}
{{- else if and $configured (not $complete) -}}
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
{{- if eq (include "kosmo.postgresCredentialClientCertificateIsConfigured" (list . "api") | trim) "true" -}}
{{- dig "api" "databaseUrl" "" (.Values.postgres.credentials | default dict) -}}
{{- else if eq (include "kosmo.postgresCredentialIsConfigured" (list . "api") | trim) "true" -}}
{{- dig "api" "databaseUrl" "" (.Values.postgres.credentials | default dict) -}}
{{- else -}}
{{- include "kosmo.databaseUrl" . -}}
{{- end -}}
{{- end -}}

{{- define "kosmo.workerDatabaseUrl" -}}
{{- dig "worker" "databaseUrl" "" (.Values.postgres.credentials | default dict) -}}
{{- end -}}

{{- define "kosmo.postgresRuntimeRoleName" -}}
{{- $root := index . 0 -}}
{{- $role := index . 1 -}}
{{- printf "%s-postgres-%s" ($root.Release.Name | trunc 47 | trimSuffix "-") $role -}}
{{- end -}}

{{- define "kosmo.postgresRuntimeClientCertificateSecretName" -}}
{{- $root := index . 0 -}}
{{- $role := index . 1 -}}
{{- printf "%s-client-cert" (include "kosmo.postgresRuntimeRoleName" (list $root $role)) -}}
{{- end -}}

{{- define "kosmo.postgresClusterCaSecretName" -}}
{{- printf "%s-ca" (include "kosmo.postgresName" .) -}}
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
