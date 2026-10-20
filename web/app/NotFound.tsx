import { Link } from "react-router";

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
      <h1>{title}</h1>
      <p className="muted">{message}</p>
      <Link to={back.to}>{back.label}</Link>
    </section>
  );
}
