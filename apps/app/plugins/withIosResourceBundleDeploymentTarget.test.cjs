/* eslint-disable @typescript-eslint/no-require-imports -- CNG plugin smoke check is CommonJS. */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const plugin = require('./withIosResourceBundleDeploymentTarget');

const podfile = `post_install do |installer|
  react_native_post_install(
    installer,
    config[:reactNativePath],
    :mac_catalyst_enabled => false,
    :ccache_enabled => ccache_enabled?(podfile_properties),
  )
end
`;

async function applyPlugin(contents) {
  const config = plugin({ _internal: { isDebug: false } });
  const result = await config.mods.ios.podfile({
    modRequest: {},
    modResults: { contents },
  });
  return result.modResults.contents;
}

async function main() {
  const first = await applyPlugin(podfile);
  const second = await applyPlugin(first);
  assert.equal(second, first, 'post_install transform must be idempotent');

  const ruby = String.raw`require 'rubygems'

contents = ENV.fetch('KOSMO_PODFILE')

configuration = Struct.new(:build_settings, keyword_init: false)
bundle_target = Struct.new(:product_type, :build_configurations)
aggregate_target = Struct.new(:name)
project = Struct.new(:targets).new([
  aggregate_target.new('Aggregate'),
  bundle_target.new('com.apple.product-type.bundle', [configuration.new('IPHONEOS_DEPLOYMENT_TARGET' => '12.4')]),
  bundle_target.new('com.apple.product-type.bundle', [configuration.new('IPHONEOS_DEPLOYMENT_TARGET' => '17.0')]),
  bundle_target.new('com.apple.product-type.bundle', [configuration.new('IPHONEOS_DEPLOYMENT_TARGET' => '$(inherited)')]),
])

installer = Struct.new(:pods_project).new(project)
define_singleton_method(:post_install) { |&hook| hook.call(installer) }
def react_native_post_install(*); end
def ccache_enabled?(*); false; end
config = { reactNativePath: '' }
podfile_properties = {}
2.times { eval(contents, binding, 'generated Podfile', 1) }
values = project.targets.map do |target|
  target.respond_to?(:product_type) ? target.build_configurations.first.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] : nil
end
raise values.inspect unless values == [nil, '16.4', '17.0', '$(inherited)']
puts values.inspect
puts 'Ruby behavior check passed'
`;
  const result = spawnSync(process.env.KOSMO_RUBY ?? 'ruby', ['-'], {
    env: { ...process.env, KOSMO_PODFILE: second },
    input: ruby,
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  assert.equal(result.status, 0, 'generated Ruby behavior check failed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
