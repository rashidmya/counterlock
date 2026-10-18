import { useState } from "react";

export function Picture({
  src,
  label,
  className = "",
}: {
  src?: string;
  label: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img
      className={className}
      src={src}
      alt=""
      onError={() => setFailed(true)}
    />
  ) : (
    <span className={`${className} placeholder`} aria-label={label}>
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}
