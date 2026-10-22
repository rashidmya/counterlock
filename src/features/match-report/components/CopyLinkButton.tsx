import { useEffect, useState } from "react";
import { matchUrl } from "@/shared/site";
import { copyText } from "@/shared/utils/clipboard";

const COPIED_MS = 2500;

export function CopyLinkButton({
  matchId,
  accountId,
}: {
  matchId: number;
  accountId?: number;
}) {
  const url = matchUrl(matchId, accountId);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => setState("idle"), [url]);
  useEffect(() => {
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
        {state === "copied" ? "Link copied" : "Copy link"}
      </button>
      {state === "failed" && (
        <input
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
