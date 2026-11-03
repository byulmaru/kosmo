require 'fileutils'
require 'json'
require 'open3'
require 'tmpdir'
require 'yaml'

ROOT = File.expand_path('..', __dir__)
WORKFLOW_PATH = File.join(ROOT, '.github/workflows/production-release.yml')
WORKFLOW = YAML.load_file(WORKFLOW_PATH)
RUN_STEP =
  WORKFLOW.fetch('jobs').fetch('production_deploy').fetch('steps')
    .find { |step| step['name'] == 'Sync migration and production workloads' }
    &.fetch('run')
TARGET_SHA = 'a' * 40
IMAGE_DIGEST = "sha256:#{'b' * 64}"

def assert(condition, message)
  raise message unless condition
end

def assert_equal(expected, actual, message)
  assert(expected == actual, "#{message}: expected #{expected.inspect}, got #{actual.inspect}")
end

def assert_includes(actual, expected, message = "expected #{actual.inspect} to include #{expected.inspect}")
  assert(actual.include?(expected), "#{message}: missing #{expected.inspect}")
end

def assert_match(pattern, actual, message)
  assert(pattern.match?(actual), "#{message}: did not match #{pattern.inspect}")
end

def install_fake_commands(binary_directory)
  FileUtils.mkdir_p(binary_directory)
  {
    'argocd' => <<~'RUBY',
      #!/usr/bin/env ruby
      require 'json'

      calls_file = ENV.fetch('FAKE_ARGOCD_CALLS_FILE')
      File.open(calls_file, 'a') { |file| file.puts(JSON.generate(ARGV)) }
      app_index = ARGV.index('app')
      command = app_index && ARGV[app_index + 1]

      case command
      when 'set'
        exit Integer(ENV.fetch('FAKE_SET_STATUS', '0'))
      when 'sync'
        sync_status = Integer(ENV.fetch('FAKE_SYNC_STATUS', '0'))
        if sync_status.zero?
          date_file = ENV.fetch('FAKE_DATE_FILE')
          current = Integer(File.read(date_file))
          File.write(date_file, (current + Integer(ENV.fetch('FAKE_SYNC_ADVANCE_SECONDS', '0'))).to_s)
        end
        exit sync_status
      when 'wait'
        wait_count = File.readlines(calls_file).count do |line|
          arguments = JSON.parse(line)
          index = arguments.index('app')
          index && arguments[index + 1] == 'wait'
        end
        case ENV.fetch('FAKE_WAIT_MODE')
        when 'recover'
          if wait_count == 1
            warn "FATAL: application 'kosmo-prod' health state has transitioned from Progressing to Degraded"
            exit 20
          end
          exit 0
        when 'degraded'
          warn "FATAL: application 'kosmo-prod' health state has transitioned from Progressing to Degraded"
          exit 20
        when 'generic'
          warn 'FATAL: application wait failed without a health transition'
          exit 20
        else
          exit 0
        end
      when 'get'
        puts JSON.generate(
          status: { sync: { revision: ENV.fetch('FAKE_ACTUAL_REVISION') } },
          spec: {
            source: {
              helm: {
                parameters: [{ name: 'imageDigest', value: ENV.fetch('FAKE_ACTUAL_DIGEST') }],
              },
            },
          },
        )
      when 'get-resource'
        resource_status = Integer(ENV.fetch('FAKE_RESOURCE_STATUS', '0'))
        if resource_status != 0
          warn 'mock HPA resource lookup failed'
          exit resource_status
        end

        name_index = ARGV.index('--resource-name')
        name = name_index && ARGV[name_index + 1]
        puts JSON.generate(
          status: {
            conditions: [
              {
                type: 'AbleToScale',
                status: 'True',
                reason: 'SucceededGetScale',
                message: "#{name} can read its scale target",
              },
              {
                type: 'ScalingActive',
                status: 'False',
                reason: 'FailedGetResourceMetric',
                message: "#{name} cpu metric unavailable",
              },
            ],
          },
        )
      else
        warn "unexpected fake argocd command: #{ARGV.inspect}"
        exit 99
      end
    RUBY
    'date' => <<~'RUBY',
      #!/usr/bin/env ruby
      abort "unexpected fake date arguments: #{ARGV.inspect}" unless ARGV == ['+%s']

      path = ENV.fetch('FAKE_DATE_FILE')
      current = Integer(File.read(path))
      puts current
      File.write(path, (current + Integer(ENV.fetch('FAKE_DATE_STEP_SECONDS', '0'))).to_s)
    RUBY
    'sleep' => <<~'RUBY',
      #!/usr/bin/env ruby
      seconds = Integer(ARGV.fetch(0))
      File.open(ENV.fetch('FAKE_SLEEP_CALLS_FILE'), 'a') { |file| file.puts(seconds) }
      path = ENV.fetch('FAKE_DATE_FILE')
      current = Integer(File.read(path))
      File.write(path, (current + seconds).to_s)
    RUBY
    'timeout' => <<~'RUBY',
      #!/usr/bin/env ruby
      require 'json'

      duration = ARGV.shift
      command = ARGV
      File.open(ENV.fetch('FAKE_TIMEOUT_CALLS_FILE'), 'a') do |file|
        file.puts(JSON.generate([duration, *command]))
      end
      status = Integer(ENV.fetch('FAKE_TIMEOUT_STATUS', '0'))
      exit status unless status.zero?
      exec(*command)
    RUBY
  }.each do |name, source|
    path = File.join(binary_directory, name)
    File.write(path, source)
    File.chmod(0o755, path)
  end
end

def read_json_lines(path)
  return [] unless File.exist?(path)

  File.readlines(path, chomp: true).map { |line| JSON.parse(line) }
end

def app_command(arguments)
  index = arguments.index('app')
  index && arguments[index + 1]
end

def command_calls(calls, command)
  calls.select { |arguments| app_command(arguments) == command }
end

def option_value(arguments, name)
  index = arguments.index(name)
  assert(index && index + 1 < arguments.length, "missing #{name} in #{arguments.inspect}")
  arguments[index + 1]
end

def run_step(
  wait_mode: 'success',
  date_step_seconds: 0,
  sync_status: 0,
  actual_revision: TARGET_SHA,
  actual_digest: IMAGE_DIGEST,
  sync_advance_seconds: 0,
  timeout_status: 0
)
  assert(RUN_STEP, 'production release Bash run step was not found')

  Dir.mktmpdir('kosmo-production-release-') do |directory|
    binary_directory = File.join(directory, 'bin')
    install_fake_commands(binary_directory)

    calls_file = File.join(directory, 'argocd-calls.jsonl')
    timeout_calls_file = File.join(directory, 'timeout-calls.jsonl')
    sleep_calls_file = File.join(directory, 'sleep-calls.txt')
    date_file = File.join(directory, 'date.txt')
    File.write(date_file, '1000')

    environment = {
      'ARGOCD_SERVER' => 'argocd.example.invalid',
      'TARGET_SHA' => TARGET_SHA,
      'IMAGE_DIGEST' => IMAGE_DIGEST,
      'ARGOCD_AUTH_TOKEN' => 'test-token',
      'FAKE_ARGOCD_CALLS_FILE' => calls_file,
      'FAKE_ACTUAL_REVISION' => actual_revision,
      'FAKE_ACTUAL_DIGEST' => actual_digest,
      'FAKE_DATE_FILE' => date_file,
      'FAKE_DATE_STEP_SECONDS' => date_step_seconds.to_s,
      'FAKE_SLEEP_CALLS_FILE' => sleep_calls_file,
      'FAKE_TIMEOUT_CALLS_FILE' => timeout_calls_file,
      'FAKE_TIMEOUT_STATUS' => timeout_status.to_s,
      'FAKE_SYNC_STATUS' => sync_status.to_s,
      'FAKE_SYNC_ADVANCE_SECONDS' => sync_advance_seconds.to_s,
      'FAKE_WAIT_MODE' => wait_mode,
      'PATH' => "#{binary_directory}:#{ENV.fetch('PATH')}",
    }

    stdout, stderr, status = Open3.capture3(
      environment,
      'bash',
      '--noprofile',
      '--norc',
      '-e',
      '-o',
      'pipefail',
      '-c',
      RUN_STEP,
      chdir: ROOT,
    )

    {
      status: status,
      output: stdout + stderr,
      calls: read_json_lines(calls_file),
      timeout_calls: read_json_lines(timeout_calls_file),
      sleep_calls: File.exist?(sleep_calls_file) ? File.readlines(sleep_calls_file, chomp: true).map(&:to_i) : [],
    }
  end
end

def test_success_keeps_sync_and_revision_digest_checks
  result = run_step(sync_advance_seconds: 600)
  assert(result[:status].success?, "release step should succeed: #{result[:output]}")
  set_call = command_calls(result[:calls], 'set').fetch(0)
  sync_call = command_calls(result[:calls], 'sync').fetch(0)
  wait_call = command_calls(result[:calls], 'wait').fetch(0)

  assert_equal(TARGET_SHA, option_value(set_call, '--revision'), 'set revision')
  assert(set_call.include?("imageDigest=#{IMAGE_DIGEST}"), 'set must retain the image digest')
  assert_equal(TARGET_SHA, option_value(sync_call, '--revision'), 'sync revision')
  assert_equal('600', option_value(sync_call, '--timeout'), 'sync timeout')
  assert(sync_call.include?('--prune'), 'sync must retain pruning')
  assert_equal('600', option_value(wait_call, '--timeout'), 'initial health wait timeout')
  assert(command_calls(result[:calls], 'get-resource').empty?, 'success must skip HPA diagnostics')
  assert_equal(0, result[:timeout_calls].length, 'success must skip diagnostic timeouts')
end

def test_degraded_transition_retries_with_remaining_timeout
  result = run_step(wait_mode: 'recover')
  assert(result[:status].success?, "health wait should recover: #{result[:output]}")
  timeouts = command_calls(result[:calls], 'wait').map { |call| option_value(call, '--timeout').to_i }

  assert_equal(2, timeouts.length, 'degraded recovery wait attempts')
  assert(timeouts[1] < timeouts[0], "remaining timeout must decrease: #{timeouts.inspect}")
  assert_equal([5], result[:sleep_calls], 'retry delay')
  assert(command_calls(result[:calls], 'get-resource').empty?, 'recovered wait must skip HPA diagnostics')
end

def test_other_exit_20_fails_immediately_and_diagnostic_failure_preserves_status
  result = run_step(wait_mode: 'generic', timeout_status: 124)
  assert_equal(20, result[:status].exitstatus, 'generic exit 20 must remain the step failure')
  assert_equal(1, command_calls(result[:calls], 'wait').length, 'generic exit 20 wait count')
  assert_equal([], result[:sleep_calls], 'generic exit 20 must not retry')
  assert_equal(['15s', '15s'], result[:timeout_calls].map(&:first), 'bounded HPA diagnostic timeouts')
  assert(
    result[:timeout_calls].all? { |call| app_command(call.drop(1)) == 'get-resource' },
    'bounded timeouts must wrap HPA get-resource requests',
  )
  assert_includes(result[:output], 'Could not retrieve live HPA conditions for kosmo-api (exit 124)')
  assert_includes(result[:output], 'Could not retrieve live HPA conditions for kosmo-web (exit 124)')
end

def test_persistent_degraded_transition_expires_the_single_deadline_and_caps_sleep
  result = run_step(wait_mode: 'degraded', date_step_seconds: 98)
  assert_equal(1, result[:status].exitstatus, 'expired health wait must fail')
  assert_includes(result[:output], 'Argo CD health wait exceeded its 600-second deadline.')
  timeouts = command_calls(result[:calls], 'wait').map { |call| option_value(call, '--timeout').to_i }

  assert_equal([502, 301, 100], timeouts, 'remaining time across persistent degraded attempts')
  assert_equal([5, 5, 2], result[:sleep_calls], 'retry delays must be at most 5 seconds and capped by remaining time')
  assert_includes(result[:output], 'status=False')
  assert_includes(result[:output], 'reason=FailedGetResourceMetric')
  assert_includes(result[:output], 'message=kosmo-api cpu metric unavailable')
  assert_includes(result[:output], 'message=kosmo-web cpu metric unavailable')
end

def test_sync_failure_never_starts_the_health_wait
  result = run_step(sync_status: 42)
  assert_equal(42, result[:status].exitstatus, 'sync failure status')
  assert_equal(0, command_calls(result[:calls], 'wait').length, 'health wait after sync failure')
  assert_equal(0, command_calls(result[:calls], 'get').length, 'application check after sync failure')
  assert_equal(
    %w[kosmo-api kosmo-web],
    command_calls(result[:calls], 'get-resource').map { |call| option_value(call, '--resource-name') },
    'failure diagnostics must inspect both production HPAs',
  )
  command_calls(result[:calls], 'get-resource').each do |call|
    assert_equal('autoscaling', option_value(call, '--group'), 'HPA API group')
    assert_equal('HorizontalPodAutoscaler', option_value(call, '--kind'), 'HPA kind')
    assert_equal('json', option_value(call, '--output'), 'HPA diagnostic output')
  end
end

def test_revision_and_digest_mismatches_still_fail
  [
    ['revision', { actual_revision: 'c' * 40 }, /synced revision/],
    ['digest', { actual_digest: "sha256:#{'d' * 64}" }, /image digest/],
  ].each do |name, options, expected_message|
    result = run_step(**options)
    assert_equal(1, result[:status].exitstatus, "#{name} mismatch status")
    assert_match(expected_message, result[:output], "#{name} mismatch message")
    assert_equal(1, command_calls(result[:calls], 'wait').length, "#{name} mismatch wait count")
  end
end

[
  method(:test_success_keeps_sync_and_revision_digest_checks),
  method(:test_degraded_transition_retries_with_remaining_timeout),
  method(:test_other_exit_20_fails_immediately_and_diagnostic_failure_preserves_status),
  method(:test_persistent_degraded_transition_expires_the_single_deadline_and_caps_sleep),
  method(:test_sync_failure_never_starts_the_health_wait),
  method(:test_revision_and_digest_mismatches_still_fail),
].each(&:call)

puts 'Production release workflow behavior passed.'
