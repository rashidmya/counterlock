import type { ReactNode } from "react";

export function Ribbon({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`ribbon ${className}`.trim()}>{children}</span>;
}

export function PageTitle({
  title,
  eyebrow,
  ribbon,
}: {
  title: string;
  eyebrow?: string;
  ribbon?: ReactNode;
}) {
  return (
    <div className="page-title">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {ribbon && <Ribbon>{ribbon}</Ribbon>}
    </div>
  );
}
