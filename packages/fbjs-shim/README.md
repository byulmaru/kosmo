# fbjs compatibility surface

`react-native-web@0.21.2`, `react-relay@21.0.1`, and
`relay-runtime@21.0.1` import only `fbjs/lib/areEqual`, `fbjs/lib/invariant`,
and `fbjs/lib/warning`. This private package provides those audited CommonJS
modules so the client does not install fbjs' otherwise unused
`ua-parser-js` legacy dependency.

Re-audit the imports before changing `react-native-web`; remove this package
when upstream no longer depends on fbjs.
