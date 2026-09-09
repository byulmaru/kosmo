module.exports = {
  extraSources: [
    {
      type: 'file',
      filePath: 'certs/certificate.pem',
      reasons: ['otaCodeSigningCertificate'],
    },
  ],
  sourceSkips: ['ExpoConfigVersions'],
};
