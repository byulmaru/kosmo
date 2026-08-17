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

{{- define "kosmo.fedifyQueueResourceName" -}}
{{- printf "%s-postgres-fedify-queue" (.Release.Name | trunc 41 | trimSuffix "-") -}}
{{- end -}}

{{- define "kosmo.workerDatabasePasswordSecretName" -}}
{{- printf "%s-postgres-worker" (.Release.Name | trunc 47 | trimSuffix "-") -}}
{{- end -}}

{{- define "kosmo.runtimeDatabasePasswordSecretName" -}}
{{- printf "%s-postgres-runtime" (.Release.Name | trunc 46 | trimSuffix "-") -}}
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
