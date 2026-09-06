/**
 * Signing release via credentials/keystore.properties (builds gradle locaux).
 * Sur EAS (cloud ou --local / CI), EAS injecte le keystore : on n’y touche pas.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER_START = '// gasoil-release-signing-start';
const MARKER_END = '// gasoil-release-signing-end';

function isEasOrCiBuild() {
  return (
    process.env.EAS_BUILD === 'true' ||
    process.env.CI === 'true' ||
    Boolean(process.env.EAS_BUILD_PROFILE) ||
    Boolean(process.env.EAS_BUILD_RUNNER)
  );
}

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (isEasOrCiBuild()) {
      return cfg;
    }

    let contents = cfg.modResults.contents;

    contents = contents.replace(
      new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}\\n?`, 'g'),
      ''
    );

    const propsBlock = `${MARKER_START}
    def gasoilKeystorePropsFile = rootProject.file("../credentials/keystore.properties")
    def gasoilHasLocalKeystore = gasoilKeystorePropsFile.exists()
    def gasoilKeystoreProps = new Properties()
    if (gasoilHasLocalKeystore) {
        gasoilKeystoreProps.load(new FileInputStream(gasoilKeystorePropsFile))
    }
    ${MARKER_END}
`;

    if (!contents.includes('gasoilKeystorePropsFile')) {
      contents = contents.replace(
        /(\n\s*)signingConfigs\s*\{/,
        `\n${propsBlock}$1signingConfigs {`
      );
    }

    if (!contents.includes("keyAlias gasoilKeystoreProps['keyAlias']")) {
      contents = contents.replace(
        /signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\}/,
        (match) =>
          `${match}
        release {
            if (gasoilHasLocalKeystore) {
                storeFile rootProject.file("../credentials/" + gasoilKeystoreProps['storeFile'])
                storePassword gasoilKeystoreProps['storePassword']
                keyAlias gasoilKeystoreProps['keyAlias']
                keyPassword gasoilKeystoreProps['keyPassword']
            }
        }`
      );
    }

    contents = contents.replace(
      /release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/,
      (match) =>
        match.replace(
          'signingConfig signingConfigs.debug',
          'signingConfig signingConfigs.release'
        )
    );

    if (
      /release\s*\{/.test(contents) &&
      !/release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.release/.test(contents)
    ) {
      contents = contents.replace(
        /(release\s*\{\s*\n)/,
        '$1            signingConfig signingConfigs.release\n'
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = withReleaseSigning;
