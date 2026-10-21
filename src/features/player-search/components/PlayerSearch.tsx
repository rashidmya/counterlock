import { useState } from "react";
import { RouteLink, useLinks } from "@/app/links";
import { Picture } from "@/shared/ui/Picture";
import { usePlayerSearch } from "../hooks/usePlayerSearch";

export function PlayerSearch({ label = "Find a player" }: { label?: string }) {
  const { navigate } = useLinks();
  const [text, setText] = useState("");
  const { results, loading, error, directId } = usePlayerSearch(text);
  const searched = text.trim().length >= 2;
  return (
    <form
      className="player-search"
      onSubmit={(event) => {
        event.preventDefault();
        if (directId === null) return;
        navigate({ page: "profile", accountId: directId });
      }}
    >
      <label>
        {label}
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Steam name, SteamID64, account ID or profile link"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="player-search-results" aria-live="polite">
        {directId !== null && (
          <RouteLink
            className="player-search-direct"
            route={{ page: "profile", accountId: directId }}
          >
            Use this ID
            <small>Account {directId}</small>
          </RouteLink>
        )}
        {loading && <p className="muted">Searching…</p>}
        {error && directId === null && (
          <p role="alert" className="notice warning">
            {error}
          </p>
        )}
        {searched &&
          !loading &&
          !error &&
          directId === null &&
          !results.length && (
            <p className="muted">No Deadlock players found with that name.</p>
          )}
        {!!results.length && (
          <ul>
            {results.map((profile) => (
              <li key={profile.accountId}>
                <RouteLink
                  route={{ page: "profile", accountId: profile.accountId }}
                >
                  <Picture
                    className="profile-avatar small"
                    src={profile.avatar}
                    label={profile.name}
                  />
                  <span className="player-search-name">
                    {profile.name}
                    <small>Account {profile.accountId}</small>
                  </span>
                </RouteLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}
