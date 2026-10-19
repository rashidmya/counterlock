import { useState } from "react";
import { accountId } from "@/features/match/utils/game";
import { Icon } from "@/shared/ui/Icon";

export function ProfileEmpty({
  onSubmit,
}: {
  onSubmit(accountId: number): void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <section className="profile-empty">
      <Icon name="eye" />
      <h1>Play a match with Counterlock open and your profile appears here</h1>
      <p className="muted">
        Or enter a Steam ID to view a profile now. SteamID64, account ID and
        [U:1:n] all work.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const id = accountId(value);
          if (id) onSubmit(id);
          else setError("Enter a valid SteamID64, account ID or [U:1:n].");
        }}
      >
        <label>
          Steam ID
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError("");
            }}
            placeholder="SteamID64 or account ID"
            required
          />
        </label>
        <button className="primary">
          View profile
          <Icon name="arrow" />
        </button>
      </form>
      {error && (
        <p role="alert" className="notice warning">
          {error}
        </p>
      )}
    </section>
  );
}
