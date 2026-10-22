import { useEffect, useRef, useState } from "react";
import { matchUrl } from "@/shared/site";
import { copyText } from "@/shared/utils/clipboard";

const COPIED_MS = 2500;

/** `accountId` 0 is a player without a public account: the link opens the whole match. */
export function CopyLinkButton({
  matchId,
  accountId,
}: {
  matchId: number;
  accountId?: number;
}) {
  const url = matchUrl(matchId, accountId);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => setState("idle"), [url]);
  useEffect(() => {
    if (state === "failed") field.current?.focus();
    if (state !== "copied") return;
    const timer = setTimeout(() => setState("idle"), COPIED_MS);
    return () => clearTimeout(timer);
  }, [state]);
  return (
    <span className="copy-link">
      <button
        type="button"
        className="profile-action"
        onClick={() =>
          copyText(url).then(
            () => setState("copied"),
            () => setState("failed"),
          )
        }
      >
        {state === "copied"
          ? "Link copied"
          : accountId === 0
            ? "Copy match link"
            : "Copy link"}
      </button>
      <span
        role="status"
        className={state === "failed" ? "copy-link-note" : "visually-hidden"}
      >
        {state === "copied"
          ? "Link copied to the clipboard."
          : state === "failed"
            ? "Couldn't copy the link. Copy it from here:"
            : ""}
      </span>
      {state === "failed" && (
        <input
          ref={field}
          className="copy-link-fallback"
          aria-label="Match link"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </span>
  );
}
