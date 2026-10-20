import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import { RankQueryProvider } from "./RankQuery";
import { WebShell } from "./WebShell";
import { NotFound } from "./NotFound";
import "./styles/web.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <RankQueryProvider>
      <WebShell>
        <Outlet />
      </WebShell>
    </RankQueryProvider>
  );
}

export function HydrateFallback() {
  return (
    <WebShell>
      <p className="muted web-loading">Loading…</p>
    </WebShell>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <WebShell>
      {missing ? (
        <NotFound />
      ) : (
        <section className="web-not-found">
          <h1>Something went wrong</h1>
          <p className="muted">Try reloading the page.</p>
        </section>
      )}
    </WebShell>
  );
}
