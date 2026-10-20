import { createContext, useContext } from "react";
import type { Navigate, Route } from "./navigation";

export interface LinkAdapter {
  navigate: Navigate;
  href?: (route: Route) => string;
}

const noNavigation: LinkAdapter = { navigate: () => undefined };
const LinkContext = createContext<LinkAdapter>(noNavigation);

export const LinkProvider = LinkContext.Provider;
export const useLinks = () => useContext(LinkContext);

export function LinkScope({
  navigate,
  children,
}: {
  navigate: Navigate;
  children: React.ReactNode;
}) {
  const links = useLinks();
  return <LinkProvider value={{ ...links, navigate }}>{children}</LinkProvider>;
}

export function RouteLink({
  route,
  className,
  title,
  "aria-label": ariaLabel,
  children,
}: {
  route: Route;
  className?: string;
  title?: string;
  "aria-label"?: string;
  children: React.ReactNode;
}) {
  const { navigate, href } = useLinks();
  const shared = { className, title, "aria-label": ariaLabel };
  if (!href)
    return (
      <button type="button" {...shared} onClick={() => navigate(route)}>
        {children}
      </button>
    );
  return (
    <a
      {...shared}
      href={href(route)}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigate(route);
      }}
    >
      {children}
    </a>
  );
}
