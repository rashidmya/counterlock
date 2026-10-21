import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroGrid } from "@/features/heroes/components/HeroGrid";
import { PageTitle } from "@/shared/ui/PageTitle";
import { SectionHeader } from "@/shared/ui/SectionHeader";

const haze = {
  heroId: 13,
  name: "Haze",
  winRate: 0.533,
  pickRate: 0.635,
  tier: "A" as const,
};

describe("PageTitle", () => {
  it("renders eyebrow, h1 and ribbon", () => {
    const markup = renderToStaticMarkup(
      createElement(PageTitle, {
        eyebrow: "Deadlock stats & builds",
        title: "Know the match.",
        ribbon: "Make your move",
      }),
    );
    expect(markup).toContain(
      '<p class="eyebrow">Deadlock stats &amp; builds</p>',
    );
    expect(markup).toContain("<h1>Know the match.</h1>");
    expect(markup).toContain('class="ribbon"');
    expect(markup).toContain("Make your move");
    expect(markup).not.toContain("<header");
  });
});

describe("SectionHeader", () => {
  it("renders the rule and the action", () => {
    const markup = renderToStaticMarkup(
      createElement(SectionHeader, {
        title: "Top of the city",
        action: "Tier list →",
      }),
    );
    expect(markup).toContain('class="section-rule"');
    expect(markup).toContain("Tier list →");
  });
});

describe("HeroGrid", () => {
  it("tier variant shows tier letter and win · pick", () => {
    const markup = renderToStaticMarkup(
      createElement(HeroGrid, { cards: [haze] }),
    );
    expect(markup).toContain("tier-letter tier-A");
    expect(markup).toContain("53.3%");
    expect(markup).toContain("63.5% pick");
    expect(markup).toContain("haze_card.webp");
    expect(markup).toContain("haze_bg.webp");
  });

  it("roster variant shows role and win, no tier letter", () => {
    const markup = renderToStaticMarkup(
      createElement(HeroGrid, { cards: [haze], variant: "roster" }),
    );
    expect(markup).toContain("assassin");
    expect(markup).toContain("53.3%");
    expect(markup).not.toContain("tier-letter");
  });

  it("renders name and stat without images", () => {
    const markup = renderToStaticMarkup(
      createElement(HeroGrid, {
        cards: [{ heroId: -1, name: "Ghost", winRate: null, pickRate: null }],
      }),
    );
    expect(markup).toContain("Ghost");
    expect(markup).toContain("—");
  });
});
