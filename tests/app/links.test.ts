import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LinkProvider, RouteLink } from "@/app/links";
import type { Route } from "@/app/navigation";

const render = (href?: (route: Route) => string) =>
  renderToStaticMarkup(
    createElement(
      LinkProvider,
      { value: { navigate: () => undefined, href } },
      createElement(RouteLink, {
        route: { page: "heroes", heroId: 1 },
        className: "hero-card",
        title: "Open",
        "aria-label": "Open hero",
        children: "Haze",
      }),
    ),
  );

describe("RouteLink", () => {
  it("renders a button without an href adapter", () => {
    expect(render()).toBe(
      '<button type="button" class="hero-card" title="Open" aria-label="Open hero">Haze</button>',
    );
  });

  it("renders an anchor with the adapter href", () => {
    expect(render((route) => `/heroes/${route.heroId}`)).toBe(
      '<a class="hero-card" title="Open" aria-label="Open hero" href="/heroes/1">Haze</a>',
    );
  });
});
