/**
 * Android 11+ : autoriser Fuel à voir / ouvrir Hubera Maps (schéma custom).
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const SCHEMES = ['hubera-maps', 'cloudity-maps'];

function ensureQueries(manifest) {
  if (!manifest.queries) manifest.queries = [];
  let block = manifest.queries.find((q) => q.intent);
  if (!block) {
    block = { intent: [] };
    manifest.queries.push(block);
  }
  if (!Array.isArray(block.intent)) block.intent = [block.intent].filter(Boolean);
  for (const scheme of SCHEMES) {
    const exists = block.intent.some(
      (it) =>
        it?.data?.some?.((d) => d.$?.['android:scheme'] === scheme) ||
        it?.data?.$?.['android:scheme'] === scheme
    );
    if (exists) continue;
    block.intent.push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      data: [{ $: { 'android:scheme': scheme } }],
    });
  }
  return manifest;
}

function withHuberaMapsQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults.manifest = ensureQueries(cfg.modResults.manifest);
    return cfg;
  });
}

module.exports = withHuberaMapsQueries;
