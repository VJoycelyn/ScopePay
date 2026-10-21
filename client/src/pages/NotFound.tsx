import { Logo } from "../components/scopepay/shared";

export function NotFound() {
  return (
    <div className="client-error">
      <Logo />
      <div>
        <h1>Page not found.</h1>
        <p>That ScopePay route does not exist.</p>
        <a href="/">Back to workspace</a>
      </div>
    </div>
  );
}
