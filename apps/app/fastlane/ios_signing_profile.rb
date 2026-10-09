module KosmoIOSSigningProfile
  HOST_BUNDLE_IDENTIFIER = 'moe.kos'
  EXTENSION_BUNDLE_IDENTIFIER = 'moe.kos.push-content'
  HOST_TARGET = 'Kosmo'
  EXTENSION_TARGET = 'KosmoPushContent'

  TEAM_ID_PATTERN = /\A[A-Za-z0-9]{10}\z/
  UUID_PATTERN = /\A[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}\z/

  module_function

  def validate_profile(profile, bundle_identifier:, label:)
    unless profile.is_a?(Hash)
      raise ArgumentError, "#{label} provisioning profile is invalid."
    end

    team_id = Array(profile['TeamIdentifier']).first.to_s
    uuid = profile['UUID'].to_s
    name = profile['Name'].to_s
    entitlements = profile['Entitlements'].is_a?(Hash) ? profile['Entitlements'] : {}
    application_identifier = entitlements['application-identifier'].to_s

    unless team_id.match?(TEAM_ID_PATTERN)
      raise ArgumentError, "#{label} provisioning profile has an invalid Team ID."
    end
    unless uuid.match?(UUID_PATTERN)
      raise ArgumentError, "#{label} provisioning profile has an invalid UUID."
    end
    if name.empty?
      raise ArgumentError, "#{label} provisioning profile has no name."
    end
    unless application_identifier == "#{team_id}.#{bundle_identifier}"
      raise ArgumentError, "#{label} provisioning profile targets the wrong bundle ID."
    end
    if profile.key?('ProvisionedDevices')
      raise ArgumentError, "An Ad Hoc provisioning profile was supplied for #{label}."
    end
    if profile['ProvisionsAllDevices'] == true
      raise ArgumentError, "A universal provisioning profile was supplied for #{label}."
    end
    if entitlements['get-task-allow'] == true
      raise ArgumentError, "A development provisioning profile was supplied for #{label}."
    end

    {
      bundle_identifier: bundle_identifier,
      name: name,
      team_id: team_id,
      uuid: uuid,
    }
  end

  def validate_pair(host_profile:, extension_profile:)
    host = validate_profile(
      host_profile,
      bundle_identifier: HOST_BUNDLE_IDENTIFIER,
      label: 'Host',
    )
    extension = validate_profile(
      extension_profile,
      bundle_identifier: EXTENSION_BUNDLE_IDENTIFIER,
      label: 'Content extension',
    )
    unless host[:team_id] == extension[:team_id]
      raise ArgumentError, 'Host and content extension provisioning profiles use different Team IDs.'
    end

    { host: host, extension: extension }
  end

  def target_profiles(profile_pair)
    {
      HOST_TARGET => profile_pair.fetch(:host),
      EXTENSION_TARGET => profile_pair.fetch(:extension),
    }
  end

  def export_provisioning_profiles(profile_pair)
    {
      HOST_BUNDLE_IDENTIFIER => profile_pair.fetch(:host).fetch(:uuid),
      EXTENSION_BUNDLE_IDENTIFIER => profile_pair.fetch(:extension).fetch(:uuid),
    }
  end

  def installed_profile_paths(profiles_path, profile_pair)
    export_provisioning_profiles(profile_pair).values.map do |uuid|
      File.join(profiles_path, "#{uuid}.mobileprovision")
    end
  end
end
