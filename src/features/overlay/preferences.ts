export const overlayPreferenceKey = (name: string) => `scout.overlay.${name}`;
export const overlayOpacityKey = "scout.overlay.opacity";
export const overlayPositionKey = (name: string) =>
  `scout.overlay.position.${name}`;
export function readOverlayOpacity() {
  return Math.max(
    35,
    Math.min(100, Number(localStorage.getItem(overlayOpacityKey) ?? 96) || 96),
  );
}
