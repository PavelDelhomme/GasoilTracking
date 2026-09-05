/**
 * Force le signing release via credentials/keystore.properties (keystore EAS).
 * Empêche de republier un APK signé debug (incompatible avec les installs EAS existantes).
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER_START = '// gasoil-release-signing-start';
const MARKER_END = '// gasoil-release-signing-end';

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Retirer un éventuel bloc déjà injecté
    contents = contents.replace(
      new RegExp(`${MARKER_START}[\\s\\S]*?${MARKER_END}\\n?`, 'g'),
      ''
    );

    const propsBlock = `${MARKER_START}
    def gasoilKeystorePropsFile = rootProject.file("../credentials/keystore.properties")
    if (!gasoilKeystorePropsFile.exists()) {
        throw new GradleException("credentials/keystore.properties manquant — refuse debug signing")
    }
    def gasoilKeystoreProps = new Properties()
    gasoilKeystoreProps.load(new FileInputStream(gasoilKeystorePropsFile))
    ${MARKER_END}
`;

    // Injecter les props avant signingConfigs
    if (!contents.includes('gasoilKeystorePropsFile')) {
      contents = contents.replace(
        /(\n\s*)signingConfigs\s*\{/,
        `\n${propsBlock}$1signingConfigs {`
      );
    }

    // Ajouter signingConfigs.release si absent
    if (!contents.includes("keyAlias gasoilKeystoreProps['keyAlias']")) {
      contents = contents.replace(
        /signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s*\}/,
        (match) =>
          `${match}
        release {
            storeFile rootProject.file("../credentials/" + gasoilKeystoreProps['storeFile'])
            storePassword gasoilKeystoreProps['storePassword']
            keyAlias gasoilKeystoreProps['keyAlias']
            keyPassword gasoilKeystoreProps['keyPassword']
        }`
      );
    }

    // release doit utiliser signingConfigs.release (jamais debug)
    contents = contents.replace(
      /release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.debug/,
      (match) => match.replace(
        'signingConfig signingConfigs.debug',
        'signingConfig signingConfigs.release'
      )
    );

    // Si release n'a plus de signingConfig (commentaire), forcer release
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
