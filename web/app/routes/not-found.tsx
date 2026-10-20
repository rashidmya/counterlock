import { Link } from "react-router";

export default function NotFound() {
  return (
    <section className="web-not-found">
      <h1>Page not found</h1>
      <p className="muted">That page doesn't exist on Counterlock.</p>
      <Link to="/">Back to Counterlock</Link>
    </section>
  );
}
