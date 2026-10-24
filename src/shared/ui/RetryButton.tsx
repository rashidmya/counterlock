/** Retry notices disappear as loading begins. Leave focus at a stable,
 * meaningful place nearby, separate from the live loading announcement. */
export function RetryButton({
  onRetry,
  className,
  focusTarget = "h1, h2, h3",
}: {
  onRetry(): void;
  className?: string;
  // A stable control can be more useful than a heading, e.g. a profile tab.
  focusTarget?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        let scope = event.currentTarget.parentElement;
        while (scope) {
          const target = [
            ...scope.querySelectorAll<HTMLElement>(focusTarget),
          ].find((element) => element.getClientRects().length > 0);
          if (target) {
            if (!target.hasAttribute("tabindex") && target.tabIndex < 0)
              target.tabIndex = -1;
            target.focus({ preventScroll: true });
            break;
          }
          scope = scope.parentElement;
        }
        onRetry();
      }}
    >
      Retry
    </button>
  );
}
