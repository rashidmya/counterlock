export const overlayPreferenceKey = (name: string) => `scout.overlay.${name}`;
export const overlayOpacityKey = "scout.overlay.opacity";
export const overlayPositionKey = (name: string) =>
  `scout.overlay.position.${name}`;
export function readOverlayOpacity() {
  try {
    const text = localStorage.getItem(overlayOpacityKey);
    const value = text?.trim() ? Number(text) : 96;
    return Number.isFinite(value) ? Math.max(35, Math.min(100, value)) : 96;
  } catch {
    return 96;
  }
}
export function readOverlayEnabled(name: string) {
  try {
    return localStorage.getItem(overlayPreferenceKey(name)) === "true";
  } catch {
    return false;
  }
}
