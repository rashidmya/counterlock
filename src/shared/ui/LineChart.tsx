const WIDTH = 100;
const HEIGHT = 30;
const PAD = 2;

export function LineChart({
  values,
  average,
  label,
  color,
}: {
  values: number[];
  average?: number;
  label: string;
  color: string;
}) {
  if (values.length < 2) return <p className="muted">Not enough matches</p>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const y = (value: number) =>
    max === min
      ? HEIGHT / 2
      : HEIGHT -
        PAD -
        (Math.min(Math.max(value, min), max) - min) *
          ((HEIGHT - 2 * PAD) / (max - min));
  const points = values
    .map(
      (value, index) =>
        `${((index / (values.length - 1)) * WIDTH).toFixed(2)},${y(value).toFixed(2)}`,
    )
    .join(" ");
  return (
    <svg
      className="line-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {average !== undefined && Number.isFinite(average) && (
        <line
          x1={0}
          x2={WIDTH}
          y1={y(average)}
          y2={y(average)}
          stroke="#394148"
          strokeWidth={1}
          strokeDasharray="2"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        points={points}
      />
    </svg>
  );
}
