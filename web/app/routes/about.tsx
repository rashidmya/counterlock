import { PageTitle } from "@/shared/ui/PageTitle";
import { PageMeta } from "../seo";

export default function AboutRoute() {
  return (
    <section className="web-about">
      <PageMeta
        title="About | Counterlock"
        description="What Counterlock is, where its Deadlock data comes from, and what the site stores and sends."
        path="/about"
      />
      <PageTitle title="About" />
      <h2>What Counterlock is</h2>
      <p>
        Counterlock shows Deadlock hero tier lists, builds, counters and item
        stats, and lets you look up a player's public profile. It is also an
        Overwolf overlay app for use during matches; this website is the browser
        version.
      </p>
      <h2>Data and assets</h2>
      <p>
        Statistics come from <a href="https://deadlock-api.com">Deadlock API</a>
        , a community service. Deadlock and its game assets, including hero and
        item art, belong to Valve. Counterlock is not affiliated with Valve.
      </p>
      <h2>Privacy</h2>
      <p>
        If you pick your Steam account, it is remembered only in this browser
        (in <code>localStorage</code>). Use "Switch account" to clear it.
        Nothing about it is kept on a Counterlock server, because there isn't
        one.
      </p>
      <p>
        Searches and player IDs you enter are sent to Deadlock API to fetch
        public stats. Fonts load from Google Fonts, and hero and item images and
        Steam avatars load from the Deadlock API asset CDN and Steam, so those
        services can see your IP address.
      </p>
      <p>
        Counterlock uses no analytics, cookies or accounts, so there is no
        cookie banner.
      </p>
    </section>
  );
}
