import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Picture } from "@/shared/ui/Picture";
import { playerPath } from "./paths";
import { readRemembered, writeRemembered } from "./remembered";
import { useSteamSearch } from "./useSteamSearch";

export function SteamSearch() {
  const navigate = useNavigate();
  const browsing = (useLocation().state as { browse?: boolean } | null)?.browse;
  const [text, setText] = useState("");
  const { results, loading, error, directId } = useSteamSearch(text);
  const searched = text.trim().length >= 2;
  const open = (id: number) => {
    if (!browsing || readRemembered() === null) writeRemembered(id);
    return playerPath(id);
  };
  return (
    <form
      className="web-search"
      onSubmit={(event) => {
        event.preventDefault();
        if (directId !== null) navigate(open(directId));
      }}
    >
      <label>
        Find your Steam account
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Steam name, SteamID64, account ID or profile link"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="web-search-results" aria-live="polite">
        {directId !== null && (
          <Link
            className="web-search-direct"
            to={playerPath(directId)}
            onClick={() => open(directId)}
          >
            Use this ID
            <small>Account {directId}</small>
          </Link>
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
                <Link
                  to={playerPath(profile.accountId)}
                  onClick={() => open(profile.accountId)}
                >
                  <Picture
                    className="profile-avatar small"
                    src={profile.avatar}
                    label={profile.name}
                  />
                  <span className="web-search-name">
                    {profile.name}
                    <small>Account {profile.accountId}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}
