export function Logo({ size = 40 }: { size?: number }) {
  const pts = Array.from({ length: 5 }, (_, k) => { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5; return [50 + 28.5 * Math.cos(a), 50 + 28.5 * Math.sin(a)]; });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="HEN logo" role="img">
      <circle cx="50" cy="50" r="46" fill="none" stroke="#ffb84c" strokeWidth="3.5" />
      {pts.map(([x, y], i) => { const [x2, y2] = pts[(i + 1) % 5]; return <line key={"r" + i} x1={x} y1={y} x2={x2} y2={y2} stroke="#ffb84c" strokeOpacity=".35" strokeWidth="1.2" />; })}
      {pts.map(([x, y], i) => <line key={"s" + i} x1={x} y1={y} x2="50" y2="50" stroke="#ffb84c" strokeWidth="2.2" />)}
      {pts.map(([x, y], i) => <circle key={"n" + i} cx={x} cy={y} r="5.5" fill="#f0f4ff" />)}
      <circle cx="50" cy="50" r="9" fill="#ffb84c" />
    </svg>
  );
}
