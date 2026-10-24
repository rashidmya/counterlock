import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/** Preserve native scrolling; advertise it only when content actually overflows. */
export function HorizontalScroll({
  label,
  className,
  style,
  children,
}: {
  label: string;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const node = viewport.current;
    const inner = content.current;
    if (!node || !inner) return;
    const measure = () => setOverflows(node.scrollWidth > node.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="horizontal-scroll">
      <div
        ref={viewport}
        className={className}
        style={style}
        role={overflows ? "region" : undefined}
        aria-label={overflows ? label : undefined}
        aria-describedby={overflows ? hintId : undefined}
        tabIndex={overflows ? 0 : -1}
      >
        <div ref={content} className="horizontal-scroll-content">
          {children}
        </div>
      </div>
      {overflows && (
        <p id={hintId} className="scroll-hint">
          Scroll horizontally for more columns.
        </p>
      )}
    </div>
  );
}
