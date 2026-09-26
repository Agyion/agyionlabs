export const ORBITAL_BACKDROP_IMPORT = 'app/components/app/OrbitalBackdrop.tsx -> ../../../../shared/space-scene';

// Only the immutable output copied into /_next/static is eligible for warming.
const staticAsset = /^static\/(?:chunks\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/[A-Za-z0-9_.-]+\.js|chunks\/[A-Za-z0-9_.-]+\.js|css\/[A-Za-z0-9_.-]+\.css)$/;

export function buildAppAssetManifest(appBuild, loadable) {
  const required = [
    ['/layout', appBuild?.pages?.['/layout']],
    ['/app/page', appBuild?.pages?.['/app/page']],
    [ORBITAL_BACKDROP_IMPORT, loadable?.[ORBITAL_BACKDROP_IMPORT]?.files],
  ];
  const files = new Set();
  for (const [entry, assets] of required) {
    if (!Array.isArray(assets) || assets.length === 0) throw new Error(`Missing app asset manifest entry: ${entry}`);
    for (const asset of assets) {
      if (typeof asset !== 'string' || !staticAsset.test(asset) || asset.split('/').some(segment => segment === '.' || segment === '..')) {
        throw new Error(`Invalid immutable app asset in ${entry}: ${String(asset)}`);
      }
      files.add(asset);
    }
  }
  if (files.size > 48) throw new Error('App asset manifest exceeds the warming limit');
  return {
    version: 1,
    assets: [...files].map(file => ({ href: `/_next/${file}`, as: file.endsWith('.css') ? 'style' : 'script' })),
  };
}
