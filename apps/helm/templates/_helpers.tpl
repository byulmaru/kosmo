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
{{- if $root.Values.postgresTls.enabled -}}
{{- $connection := index $root.Values.postgresTls .workload -}}
{{- printf "postgres://%s@%s-rw:5432/%s" (required (printf "postgresTls.%s.role is required when postgresTls is enabled" .workload) $connection.role) (include "kosmo.postgresName" $root) (required (printf "postgresTls.%s.database is required when postgresTls is enabled" .workload) $connection.database) -}}
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
