require 'json'
require 'open3'
require 'tmpdir'
require 'yaml'

ROOT = File.expand_path('..', __dir__)
RUN_STEP =
  YAML.load_file(File.join(ROOT, '.github/workflows/production-release.yml'))
    .fetch('jobs').fetch('production_deploy').fetch('steps')
    .find { |step| step['name'] == 'Sync migration and production workloads' }
    &.fetch('run')

def assert(condition, message)
  raise message unless condition
end

def run_step(scenario)
  raise 'production release Bash step was not found' unless RUN_STEP

  Dir.mktmpdir('kosmo-production-release-') do |directory|
    binary_directory = File.join(directory, 'bin')
    Dir.mkdir(binary_directory)
    clock_file = File.join(directory, 'clock')
    state_file = File.join(directory, 'state')
    File.write(clock_file, '0')

    fake_command = File.join(binary_directory, 'command')
    File.write(fake_command, <<~'RUBY')
      #!/usr/bin/env ruby
      require 'json'

      command = File.basename($0)
      clock_file = ENV.fetch('CLOCK_FILE')
      clock = Integer(File.read(clock_file))
      set_clock = ->(value) { File.write(clock_file, value.to_s) }

      case command
      when 'date'
        puts clock
      when 'sleep'
        set_clock.call(clock + Integer(ARGV.fetch(0)))
      when 'argocd'
        command_index = ARGV.index('app')
        case command_index && ARGV[command_index + 1]
        when 'set', 'sync'
          exit 0
        when 'wait'
          case ENV.fetch('SCENARIO')
          when 'recover'
            if File.exist?(ENV.fetch('STATE_FILE'))
              exit 0
            end
            File.write(ENV.fetch('STATE_FILE'), 'degraded')
            set_clock.call(clock + 1)
            warn "FATAL: application 'kosmo-prod' health state has transitioned from Progressing to Degraded"
            exit 20
          when 'persistent'
            set_clock.call(clock + 600)
            warn "FATAL: application 'kosmo-prod' health state has transitioned from Progressing to Degraded"
            exit 20
          when 'unrelated'
            if File.exist?(ENV.fetch('STATE_FILE'))
              exit 0
            end
            File.write(ENV.fetch('STATE_FILE'), 'unrelated error')
            warn 'FATAL: application wait failed for an unrelated CLI error'
            exit 20
          end
        when 'get'
          puts JSON.generate(
            status: { sync: { revision: ENV.fetch('TARGET_SHA') } },
            spec: {
              source: {
                helm: {
                  parameters: [{ name: 'imageDigest', value: ENV.fetch('IMAGE_DIGEST') }],
                },
              },
            },
          )
          exit 0
        when 'get-resource'
          exit 42
        end
        exit 99
      end
    RUBY
    File.chmod(0o755, fake_command)
    %w[argocd date sleep].each do |command|
      File.symlink(fake_command, File.join(binary_directory, command))
    end

    environment = {
      'ARGOCD_SERVER' => 'argocd.example.invalid',
      'ARGOCD_AUTH_TOKEN' => 'test-token',
      'TARGET_SHA' => 'a' * 40,
      'IMAGE_DIGEST' => "sha256:#{'b' * 64}",
      'CLOCK_FILE' => clock_file,
      'STATE_FILE' => state_file,
      'SCENARIO' => scenario,
      'PATH' => "#{binary_directory}:#{ENV.fetch('PATH')}",
    }

    timed_out = false
    status = nil
    Open3.popen2e(
      environment,
      'bash', '--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', RUN_STEP,
      chdir: ROOT,
      pgroup: true,
    ) do |stdin, output, wait_thread|
      stdin.close
      output_thread = Thread.new { output.read }
      unless wait_thread.join(10)
        timed_out = true
        begin
          Process.kill('KILL', -wait_thread.pid)
        rescue Errno::ESRCH
          # The process group exited at the watchdog boundary.
        end
      end
      wait_thread.join
      output_thread.value
      status = wait_thread.value
    end
    assert(!timed_out, 'production release test exceeded its 10-second watchdog')

    { status: status, clock: Integer(File.read(clock_file)) }
  end
end

def test_temporary_health_degradation_recovers
  result = run_step('recover')
  assert(result[:status].success?, 'temporary health degradation should recover successfully')
end

def test_persistent_health_degradation_exhausts_the_600_second_budget
  result = run_step('persistent')
  assert(!result[:status].success?, 'persistent health degradation should fail')
  assert(result[:clock] == 600, 'persistent health degradation should consume the 600-second budget')
end

def test_unrelated_exit_20_is_not_retried_or_overwritten_by_diagnostic_failure
  result = run_step('unrelated')
  assert(result[:status].exitstatus == 20, 'unrelated CLI error should remain exit 20')
end

test_temporary_health_degradation_recovers
test_persistent_health_degradation_exhausts_the_600_second_budget
test_unrelated_exit_20_is_not_retried_or_overwritten_by_diagnostic_failure

puts 'Production release wait behavior passed.'
