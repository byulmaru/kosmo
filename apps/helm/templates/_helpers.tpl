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
{{- $root := .root -}}
{{- if and $root.Values.postgresTls.enabled $root.Values.postgresTls.clientAuthEnabled -}}
{{- $identity := .workload -}}
{{- if or (eq .workload "api") (eq .workload "web") -}}
{{- $identity = "runtime" -}}
{{- end -}}
{{- $connection := index $root.Values.postgresTls $identity -}}
{{- printf "postgres://%s@%s-rw:5432/%s" (required (printf "postgresTls.%s.role is required when postgresTls is enabled" $identity) $connection.role) (include "kosmo.postgresName" $root) (required (printf "postgresTls.%s.database is required when postgresTls is enabled" $identity) $connection.database) -}}
{{- else -}}
{{- printf "postgres://kosmo:$(DATABASE_PASSWORD)@%s-rw:5432/kosmo" (include "kosmo.postgresName" $root) -}}
{{- end -}}
{{- end -}}

{{- define "kosmo.postgresClientTlsName" -}}
{{- printf "%s-%s-postgres-client" .root.Release.Name .workload | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "kosmo.postgresServerTlsName" -}}
{{- printf "%s-postgres-server" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
