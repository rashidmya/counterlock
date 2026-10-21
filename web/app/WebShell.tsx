import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { LinkProvider } from "@/app/links";
import type { Route } from "@/app/navigation";
import { MyProfileLabel } from "@/features/profile/components/MyProfileLabel";
import { routeToPath } from "./paths";
import { useRememberedMe } from "./remembered";

const tabs = [
  { to: "/", label: "Home", end: true },
  { to: "/tier-list", label: "Tier list", end: false },
  { to: "/heroes", label: "Heroes", end: false },
  { to: "/items", label: "Items", end: false },
];

export function WebShell({ children }: { children?: React.ReactNode }) {
  const navigate = useNavigate();
  const { meId } = useRememberedMe();
  return (
    <div className="app web">
      <header>
        <Link className="brand" to="/">
          <span>
            Counter<b>lock</b>
          </span>
        </Link>
        <nav>
          <div className="tabs">
            {tabs.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end}>
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
        <Link
          className="my-profile"
          aria-label="My profile"
          to={routeToPath({ page: "profile", accountId: meId ?? undefined })}
        >
          <MyProfileLabel meId={meId} />
        </Link>
      </header>
      <LinkProvider
        value={{
          href: routeToPath,
          navigate: (route: Route) => navigate(routeToPath(route)),
        }}
      >
        <main className="page">{children ?? <Outlet />}</main>
      </LinkProvider>
      <footer>
        <span>
          Data from <a href="https://deadlock-api.com">Deadlock API</a>{" "}
          (community service). Deadlock and its game assets belong to Valve.
          Counterlock is not affiliated with Valve.
        </span>
        <Link to="/about">About</Link>
      </footer>
    </div>
  );
}
