require 'open3'
require 'yaml'

ROOT = File.expand_path('../..', __dir__)
REDIS_NAME = 'kosmo-redis'

def assert(condition, message)
  raise message unless condition
end

def assert_equal(expected, actual, message)
  assert(expected == actual, "#{message}: expected #{expected.inspect}, got #{actual.inspect}")
end

def render_chart(redis_enabled:)
  command = [
    'helm',
    'template',
    'kosmo',
    'apps/helm',
    '--namespace',
    'kosmo-dev',
    '--set',
    'env=dev',
  ]
  command.concat(['--set', 'redis.enabled=true']) if redis_enabled

  rendered, status = Open3.capture2e(*command, chdir: ROOT)
  assert(status.success?, "Helm failed rendering Redis enabled=#{redis_enabled}: #{rendered}")

  Psych.parse_stream(rendered).children.map do |document|
    stream = Psych::Nodes::Stream.new
    stream.children << document
    Psych.safe_load(stream.to_yaml)
  end.compact
end

def resource(resources, kind:, name:)
  resources.find do |document|
    document && document['kind'] == kind && document.dig('metadata', 'name') == name
  end
end

def app_container(resources, name:)
  app_resource = resources.find do |document|
    document && document.dig('metadata', 'name') == name && %w[Deployment Rollout].include?(document['kind'])
  end
  assert(app_resource, "Missing application workload #{name}")
  pod_spec = app_resource.dig('spec', 'template', 'spec')
  assert(!pod_spec.key?('initContainers'), "#{name} must not wait for Redis in an init container")
  assert(!pod_spec.key?('readinessGates'), "#{name} readiness must not depend on Redis")
  containers = pod_spec.fetch('containers')
  assert_equal(1, containers.length, "#{name} container count")
  containers.fetch(0)
end

def assert_env_from_vault(container, workload:)
  env_from = container.fetch('envFrom', [])
  assert(
    env_from.any? { |entry| entry.dig('secretRef', 'name') == 'env' },
    "#{workload} must retain its Vault env secret",
  )
end

def assert_http_probe(container, probe_name:, workload:)
  probe = container.fetch(probe_name)
  handlers = probe.keys & %w[exec grpc httpGet tcpSocket]
  assert_equal(['httpGet'], handlers, "#{workload} #{probe_name} must remain HTTP based")
end

disabled = render_chart(redis_enabled: false)
assert(!resource(disabled, kind: 'Deployment', name: REDIS_NAME), 'Redis must be disabled by default')
assert(!resource(disabled, kind: 'Service', name: REDIS_NAME), 'Redis Service must be disabled by default')

%w[kosmo-api kosmo-worker].each do |name|
  container = app_container(disabled, name: name)
  assert_env_from_vault(container, workload: name)
  assert(
    container.fetch('env', []).none? { |entry| entry['name'] == 'REDIS_URL' },
    "#{name} must not get a chart Redis URL while Redis is disabled",
  )
end

enabled = render_chart(redis_enabled: true)
deployment = resource(enabled, kind: 'Deployment', name: REDIS_NAME)
service = resource(enabled, kind: 'Service', name: REDIS_NAME)
assert(deployment, 'Redis Deployment must render when enabled')
assert(service, 'Redis Service must render when enabled')
assert_equal(1, deployment.dig('spec', 'replicas'), 'Redis replica count')
assert_equal('Recreate', deployment.dig('spec', 'strategy', 'type'), 'Redis rollout strategy')
assert_equal('ClusterIP', service.dig('spec', 'type'), 'Redis Service type')
assert_equal(6379, service.dig('spec', 'ports').fetch(0).fetch('port'), 'Redis Service port')

redis_pod = deployment.dig('spec', 'template', 'spec')
redis_container = redis_pod.fetch('containers').fetch(0)
redis_security_context = redis_container.fetch('securityContext')
assert_equal(999, redis_security_context.fetch('runAsUser'), 'Redis user ID')
assert_equal(1000, redis_security_context.fetch('runAsGroup'), 'Redis group ID')
assert_equal(true, redis_security_context.fetch('runAsNonRoot'), 'Redis must run as non-root')
redis_args = redis_container.fetch('args')
assert_equal(
  ['--save', '', '--appendonly', 'no'],
  redis_args.take(4),
  'Redis must keep persistence disabled',
)
assert_equal(
  ['--maxmemory-policy', 'allkeys-lru'],
  redis_args.last(2),
  'Redis must keep the configured eviction policy',
)
assert(!redis_pod.key?('volumes'), 'Redis must not have persistent volumes')
assert(!redis_container.key?('volumeMounts'), 'Redis must not mount persistent storage')

api = app_container(enabled, name: 'kosmo-api')
worker = app_container(enabled, name: 'kosmo-worker')

{
  'kosmo-api' => [api, '/health'],
  'kosmo-worker' => [worker, '/ready'],
}.each do |name, (container, readiness_path)|
  assert_env_from_vault(container, workload: name)
  redis_url = container.fetch('env').find { |entry| entry['name'] == 'REDIS_URL' }
  assert_equal('redis://kosmo-redis:6379', redis_url.fetch('value'), "#{name} Redis URL")
  assert_equal(
    readiness_path,
    container.dig('readinessProbe', 'httpGet', 'path'),
    "#{name} readiness must remain HTTP based",
  )
  %w[startupProbe livenessProbe readinessProbe].each do |probe_name|
    assert_http_probe(container, probe_name: probe_name, workload: name)
  end
end

puts 'Redis Helm behavior passed for disabled and enabled charts.'
