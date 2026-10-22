type OverwolfClipboard = {
  overwolf?: { utils?: { placeOnClipboard?: (data: string) => void } };
};

/** Overwolf's clipboard in the desktop app (needs the "Clipboard" permission), the browser's elsewhere. */
export async function copyText(text: string): Promise<void> {
  const utils = (globalThis as OverwolfClipboard).overwolf?.utils;
  if (utils?.placeOnClipboard) return utils.placeOnClipboard(text);
  if (!navigator.clipboard) throw new Error("Clipboard unavailable.");
  await navigator.clipboard.writeText(text);
}
