type OverwolfClipboard = {
  overwolf?: { utils?: { placeOnClipboard?: (data: string) => void } };
};

/** Overwolf's clipboard in the desktop app (needs the "Clipboard" permission), the browser's elsewhere. */
export async function copyText(text: string): Promise<void> {
  const place = (globalThis as OverwolfClipboard).overwolf?.utils
    ?.placeOnClipboard;
  if (place) return place(text);
  if (!navigator.clipboard) throw new Error("Clipboard unavailable.");
  await navigator.clipboard.writeText(text);
}
