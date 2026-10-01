/* eslint-disable @typescript-eslint/no-require-imports -- Expo loads config plugins as CommonJS. */
const { createRequire } = require('node:module');
const { withPodfile } = require('expo/config-plugins');

const { mergeContents } = createRequire(require.resolve('expo/config-plugins'))(
  '@expo/config-plugins/build/utils/generateCode',
);

const TAG = 'kosmo-ios-resource-bundle-deployment-target';
// Expo SDK 56's iOS minimum is 16.4. Resource bundle targets do not inherit
// the app target from React Native's post-install hook, so they need this
// narrowly scoped correction before Xcode 27 builds the Pods project.
const MINIMUM_IOS_DEPLOYMENT_TARGET = '16.4';

const RESOURCE_BUNDLE_TARGET_PATCH = `
    minimum_ios_deployment_target = Gem::Version.new('${MINIMUM_IOS_DEPLOYMENT_TARGET}')
    installer.pods_project.targets.each do |target|
      next unless target.respond_to?(:product_type)
      next unless target.product_type == 'com.apple.product-type.bundle'

      target.build_configurations.each do |configuration|
        current = configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        next if current.nil? || current.empty? || current == '$(inherited)'

        begin
          current_version = Gem::Version.new(current.to_s)
        rescue ArgumentError
          next
        end

        next unless current_version < minimum_ios_deployment_target

        configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum_ios_deployment_target.to_s
      end
    end
`;

function withIosResourceBundleDeploymentTarget(config) {
  return withPodfile(config, (podfileConfig) => {
    const result = mergeContents({
      src: podfileConfig.modResults.contents,
      newSrc: RESOURCE_BUNDLE_TARGET_PATCH,
      tag: TAG,
      anchor: /^\s*:ccache_enabled => ccache_enabled\?\(podfile_properties\),$/,
      offset: 2,
      comment: '#',
    });

    podfileConfig.modResults.contents = result.contents;
    return podfileConfig;
  });
}

module.exports = withIosResourceBundleDeploymentTarget;
