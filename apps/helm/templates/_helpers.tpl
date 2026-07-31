{{- define "kosmo.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kosmo.postgresName" -}}
{{- printf "%s-postgres" .Release.Name | trunc 63 | trimSuffix "-" -}}
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
