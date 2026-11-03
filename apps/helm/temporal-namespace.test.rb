require 'fileutils'
require 'json'
require 'open3'
require 'tmpdir'
require 'yaml'

ROOT = File.expand_path('../..', __dir__)
TEMPORAL_NAMESPACE_TEMPLATE = 'templates/temporal-namespace-job.yaml'
TEMPORAL_FRONTEND_ADDRESS = 'temporal-frontend.temporal.svc.cluster.local:7233'

def assert(condition, message)
  raise message unless condition
end

def assert_equal(expected, actual, message)
  assert(expected == actual, "#{message}: expected #{expected.inspect}, got #{actual.inspect}")
end

def render_temporal_namespace_job(environment:, namespace:)
  command = [
    'helm',
    'template',
    'kosmo',
    'apps/helm',
    '--show-only',
    TEMPORAL_NAMESPACE_TEMPLATE,
    '--namespace',
    namespace,
    '--set',
    "env=#{environment}",
  ]
  if environment == 'prod'
    command.concat(['--set', "imageDigest=sha256:#{'a' * 64}"])
  end

  rendered, status = Open3.capture2e(*command, chdir: ROOT)
  assert(status.success?, "Helm failed rendering #{environment}: #{rendered}")

  job = Psych.safe_load(rendered)
  assert_equal('Job', job.fetch('kind'), "#{environment} resource kind")

  container = job.fetch('spec').fetch('template').fetch('spec').fetch('containers').fetch(0)
  environment_variables = container.fetch('env').each_with_object({}) do |entry, result|
    result[entry.fetch('name')] = entry.fetch('value')
  end

  [container.fetch('command'), container.fetch('args'), environment_variables]
end

def install_fake_temporal(binary_directory)
  FileUtils.mkdir_p(binary_directory)
  temporal_path = File.join(binary_directory, 'temporal')
  File.write(
    temporal_path,
    <<~RUBY,
      #!/usr/bin/env ruby
      require 'json'

      File.open(ENV.fetch('TEMPORAL_CALLS_FILE'), 'a') do |file|
        file.puts(JSON.generate(ARGV))
      end

      case ARGV[0, 4]
      when ['operator', 'nexus', 'endpoint', 'create']
        exit Integer(ENV.fetch('FAKE_NEXUS_CREATE_EXIT_STATUS', '0'))
      when ['operator', 'nexus', 'endpoint', 'update']
        exit Integer(ENV.fetch('FAKE_NEXUS_UPDATE_EXIT_STATUS', '0'))
      else
        exit 0
      end
    RUBY
  )
  File.chmod(0o755, temporal_path)
end

def run_job(command:, args:, job_environment:, create_status:, update_status:)
  Dir.mktmpdir('kosmo-temporal-bootstrap-') do |directory|
    binary_directory = File.join(directory, 'bin')
    install_fake_temporal(binary_directory)

    calls_file = File.join(directory, 'temporal-calls.jsonl')
    environment = job_environment.merge(
      'PATH' => "#{binary_directory}:#{ENV.fetch('PATH')}",
      'TEMPORAL_CALLS_FILE' => calls_file,
      'FAKE_NEXUS_CREATE_EXIT_STATUS' => create_status.to_s,
      'FAKE_NEXUS_UPDATE_EXIT_STATUS' => update_status.to_s,
    )
    stdout, stderr, status = Open3.capture3(environment, *command, *args, chdir: ROOT)
    output = stdout + stderr
    calls =
      if File.exist?(calls_file)
        File.readlines(calls_file, chomp: true).map { |line| JSON.parse(line) }
      else
        []
      end

    [status, output, calls]
  end
end

def option_value(arguments, name, environment:)
  index = arguments.index(name)
  assert(index && index + 1 < arguments.length, "#{environment} missing #{name} in #{arguments.inspect}")
  arguments[index + 1]
end

def assert_endpoint_target(arguments, namespace:, environment:)
  assert_equal(
    namespace,
    option_value(arguments, '--target-namespace', environment: environment),
    "#{environment} target namespace",
  )
  assert_equal(
    "#{namespace}-media-upload",
    option_value(arguments, '--name', environment: environment),
    "#{environment} endpoint name",
  )
  assert_equal(
    'kosmo',
    option_value(arguments, '--target-task-queue', environment: environment),
    "#{environment} target task queue",
  )
  assert_equal(
    TEMPORAL_FRONTEND_ADDRESS,
    option_value(arguments, '--address', environment: environment),
    "#{environment} Temporal address",
  )
  assert(
    arguments.include?('--tls=false'),
    "#{environment} must use the existing plaintext in-cluster connection",
  )
  assert(arguments.include?('--disable-config-env'), "#{environment} must disable CLI environment config")
  assert(arguments.include?('--disable-config-file'), "#{environment} must disable CLI file config")
end

def endpoint_calls(calls)
  calls.select { |arguments| arguments[0, 3] == ['operator', 'nexus', 'endpoint'] }
end

def assert_scenario(command:, args:, job_environment:, namespace:, environment:, mode:)
  create_status = mode == :create ? 0 : 1
  update_status = mode == :failure ? 17 : 0
  status, output, calls = run_job(
    command: command,
    args: args,
    job_environment: job_environment,
    create_status: create_status,
    update_status: update_status,
  )
  expected_endpoint_actions = mode == :create ? ['create'] : ['create', 'update']
  calls_for_endpoint = endpoint_calls(calls)

  assert_equal(
    expected_endpoint_actions,
    calls_for_endpoint.map { |arguments| arguments.fetch(3) },
    "#{environment} #{mode} endpoint commands",
  )
  calls_for_endpoint.each do |arguments|
    assert_endpoint_target(arguments, namespace: namespace, environment: environment)
  end

  if mode == :failure
    assert(!status.success?, "#{environment} must fail when endpoint update fails")
    assert(
      !output.include?("Reconciled Temporal Nexus endpoint #{namespace}-media-upload."),
      "#{environment} must not report failed update as reconciled",
    )
  else
    assert(status.success?, "#{environment} #{mode} should succeed: #{output}")
  end
end

{
  'dev' => 'kosmo-dev',
  'prod' => 'kosmo-prod',
}.each do |environment, namespace|
  command, args, job_environment = render_temporal_namespace_job(environment: environment, namespace: namespace)

  [:create, :update, :failure].each do |mode|
    assert_scenario(
      command: command,
      args: args,
      job_environment: job_environment,
      namespace: namespace,
      environment: environment,
      mode: mode,
    )
  end
end

puts 'Temporal namespace Helm bootstrap behavior passed for dev and prod.'
