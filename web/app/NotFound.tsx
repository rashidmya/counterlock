import { Link } from "react-router";
import { PageTitle } from "@/shared/ui/PageTitle";

export function NotFound({
  title = "Page not found",
  message = "That page doesn't exist on Counterlock.",
  back = { to: "/", label: "Back to Counterlock" },
}: {
  title?: string;
  message?: string;
  back?: { to: string; label: string };
}) {
  return (
    <section className="web-not-found">
      <title>Not found | Counterlock</title>
      <PageTitle title={title} />
      <p className="muted">{message}</p>
      <Link to={back.to}>{back.label}</Link>
    </section>
  );
}
