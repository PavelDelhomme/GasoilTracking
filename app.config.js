/**
 * Expo config dynamique — variantes APP_FLAVOR.
 * Conservé à côté de app.json (métadonnées version / plugins de base).
 */
'use strict';

const { resolveFlavor } = require('./lib/appFlavors');

module.exports = ({ config }) => {
  const base = config || {};
  const flavor = resolveFlavor(process.env.APP_FLAVOR);

  return {
    ...base,
    name: flavor.name,
    slug: base.slug || 'gasoil-tracking',
    scheme: flavor.scheme,
    ios: {
      ...(base.ios || {}),
      bundleIdentifier: flavor.iosBundle,
    },
    android: {
      ...(base.android || {}),
      package: flavor.androidPackage,
    },
    extra: {
      ...(base.extra || {}),
      appFlavor: flavor.key,
      flavorShortName: flavor.shortName,
      flavorLabel: flavor.roleLabel,
      flavorAccent: flavor.accentHint,
      defaultLoginEmail: flavor.defaultLoginEmail,
      followsProdOta: flavor.followsProdOta,
      // Simu GPS trajet (tests labo) — jamais sur prod utilisateurs
      enableGpsSimulator: ['preprod', 'dev', 'feat', 'qa'].includes(flavor.key),
    },
  };
};
