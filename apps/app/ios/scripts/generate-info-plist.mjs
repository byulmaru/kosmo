import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const sourcePath = 'Kosmo/Info.plist';
const outputPath = 'build/Info.plist';
const origin = process.env.PUBLIC_ORIGIN ?? '';

const escapeXml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const atsForHttpOrigin = (origin) => {
  const host = new URL(origin).hostname;

  return `
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSExceptionDomains</key>
		<dict>
			<key>${escapeXml(host)}</key>
			<dict>
				<key>NSExceptionAllowsInsecureHTTPLoads</key>
				<true/>
			</dict>
		</dict>
	</dict>`;
};

let plist = readFileSync(sourcePath, 'utf8');

if (origin.startsWith('http://')) {
  plist = plist.replace(
    '\n\t<key>UIApplicationSceneManifest</key>',
    `${atsForHttpOrigin(origin)}\n\t<key>UIApplicationSceneManifest</key>`,
  );
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, plist);
