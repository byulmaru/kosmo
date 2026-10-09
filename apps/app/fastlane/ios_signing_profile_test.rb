require_relative 'ios_signing_profile'

def assert(condition, message)
  raise message unless condition
end

def assert_equal(expected, actual, message)
  assert(expected == actual, "#{message}: expected #{expected.inspect}, got #{actual.inspect}")
end

def assert_raises(message)
  yield
  raise "#{message}: expected ArgumentError"
rescue ArgumentError
  true
end

def profile(team_id:, bundle_identifier:, name: 'App Store Distribution', extras: {})
  {
    'Entitlements' => {
      'application-identifier' => "#{team_id}.#{bundle_identifier}",
      'get-task-allow' => false,
    },
    'Name' => name,
    'TeamIdentifier' => [team_id],
    'UUID' => '01234567-89ab-cdef-0123-456789abcdef',
  }.merge(extras)
end

host = profile(team_id: 'TEAM123456', bundle_identifier: KosmoIOSSigningProfile::HOST_BUNDLE_IDENTIFIER)
extension = profile(
  team_id: 'TEAM123456',
  bundle_identifier: KosmoIOSSigningProfile::EXTENSION_BUNDLE_IDENTIFIER,
  name: 'Push Content Distribution',
  extras: { 'UUID' => 'fedcba98-7654-3210-fedc-ba9876543210' },
)
pair = KosmoIOSSigningProfile.validate_pair(host_profile: host, extension_profile: extension)

assert_equal(
  {
    'moe.kos' => '01234567-89ab-cdef-0123-456789abcdef',
    'moe.kos.push-content' => 'fedcba98-7654-3210-fedc-ba9876543210',
  },
  KosmoIOSSigningProfile.export_provisioning_profiles(pair),
  'export map',
)
assert_equal(
  %w[Kosmo KosmoPushContent],
  KosmoIOSSigningProfile.target_profiles(pair).keys,
  'target map',
)
assert_equal(
  [
    '/tmp/profiles/01234567-89ab-cdef-0123-456789abcdef.mobileprovision',
    '/tmp/profiles/fedcba98-7654-3210-fedc-ba9876543210.mobileprovision',
  ],
  KosmoIOSSigningProfile.installed_profile_paths('/tmp/profiles', pair),
  'profile install cleanup paths',
)

assert_raises('different Team IDs') do
  KosmoIOSSigningProfile.validate_pair(
    host_profile: host,
    extension_profile: profile(
      team_id: 'TEAM654321',
      bundle_identifier: KosmoIOSSigningProfile::EXTENSION_BUNDLE_IDENTIFIER,
    ),
  )
end

assert_raises('missing extension profile') do
  KosmoIOSSigningProfile.validate_pair(host_profile: host, extension_profile: nil)
end

[
  profile(
    team_id: 'TEAM123456',
    bundle_identifier: KosmoIOSSigningProfile::EXTENSION_BUNDLE_IDENTIFIER,
    extras: { 'ProvisionedDevices' => ['device'] },
  ),
  profile(
    team_id: 'TEAM123456',
    bundle_identifier: KosmoIOSSigningProfile::EXTENSION_BUNDLE_IDENTIFIER,
    extras: { 'ProvisionsAllDevices' => true },
  ),
  profile(
    team_id: 'TEAM123456',
    bundle_identifier: KosmoIOSSigningProfile::EXTENSION_BUNDLE_IDENTIFIER,
    extras: {
      'Entitlements' => {
        'application-identifier' => "TEAM123456.#{KosmoIOSSigningProfile::EXTENSION_BUNDLE_IDENTIFIER}",
        'get-task-allow' => true,
      },
    },
  ),
].each do |invalid_profile|
  assert_raises('non-App-Store extension profile') do
    KosmoIOSSigningProfile.validate_pair(host_profile: host, extension_profile: invalid_profile)
  end
end

[
  profile(
    team_id: 'TEAM123456',
    bundle_identifier: KosmoIOSSigningProfile::HOST_BUNDLE_IDENTIFIER,
    extras: { 'ProvisionedDevices' => ['device'] },
  ),
  profile(
    team_id: 'TEAM123456',
    bundle_identifier: KosmoIOSSigningProfile::HOST_BUNDLE_IDENTIFIER,
    extras: { 'ProvisionsAllDevices' => true },
  ),
  profile(
    team_id: 'TEAM123456',
    bundle_identifier: KosmoIOSSigningProfile::HOST_BUNDLE_IDENTIFIER,
    extras: {
      'Entitlements' => {
        'application-identifier' => "TEAM123456.#{KosmoIOSSigningProfile::HOST_BUNDLE_IDENTIFIER}",
        'get-task-allow' => true,
      },
    },
  ),
].each do |invalid_profile|
  assert_raises('non-App-Store host profile') do
    KosmoIOSSigningProfile.validate_pair(host_profile: invalid_profile, extension_profile: extension)
  end
end

assert_raises('wrong extension App ID') do
  KosmoIOSSigningProfile.validate_pair(
    host_profile: host,
    extension_profile: profile(
      team_id: 'TEAM123456',
      bundle_identifier: 'moe.other-extension',
    ),
  )
end

assert_raises('extension profile without name') do
  KosmoIOSSigningProfile.validate_pair(
    host_profile: host,
    extension_profile: profile(
      team_id: 'TEAM123456',
      bundle_identifier: KosmoIOSSigningProfile::EXTENSION_BUNDLE_IDENTIFIER,
      name: '',
    ),
  )
end

assert_raises('extension profile with invalid UUID') do
  KosmoIOSSigningProfile.validate_pair(
    host_profile: host,
    extension_profile: profile(
      team_id: 'TEAM123456',
      bundle_identifier: KosmoIOSSigningProfile::EXTENSION_BUNDLE_IDENTIFIER,
      extras: { 'UUID' => 'not-a-uuid' },
    ),
  )
end

puts 'iOS signing profile behavior checks passed'
