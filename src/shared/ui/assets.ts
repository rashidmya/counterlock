export const assetUrl = (path: string) =>
  (import.meta.env.VITE_ASSET_BASE ?? "../") + path.replace(/^\.?\//, "");
