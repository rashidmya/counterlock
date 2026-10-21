import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { LinkProvider } from "@/app/links";
import type { Route } from "@/app/navigation";
import { assetUrl } from "@/shared/ui/assets";
import { routeToPath } from "./paths";

const tabs = [
  { to: "/", label: "Home", end: true },
  { to: "/tier-list", label: "Tier list", end: false },
  { to: "/heroes", label: "Heroes", end: false },
  { to: "/items", label: "Items", end: false },
];

export function WebShell({ children }: { children?: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="app web">
      <header>
        <Link className="brand" to="/">
          <img src={assetUrl("icon.svg")} alt="" />
          <div>
            COUNTER<b>LOCK</b>
            <small>KNOW THE MATCH. MAKE YOUR MOVE.</small>
          </div>
        </Link>
      </header>
      <nav>
        <div className="tabs">
          {tabs.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end}>
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
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
