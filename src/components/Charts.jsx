// BarChart used by Briefing, Links, Tools tabs.
// Accepts Array<[label, value]> or object { label: value } and renders as accent-amber filled bars.
export function BarChart({ data, max, onItemClick }) {
  const entries = Array.isArray(data) ? data : Object.entries(data);
  const maxVal = max || Math.max(...entries.map(e => e[1]), 1);
  return (
    <div className="space-y-1">
      {entries.map(([key, val]) => (
        <div key={key}
             className={`bar-row ${onItemClick ? 'cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded' : ''}`}
             onClick={onItemClick ? () => onItemClick(key) : undefined}>
          <div className="text-sm truncate text-text-1">{key}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(val / maxVal) * 100}%` }} />
          </div>
          <div className="num text-xs text-right text-text-2">{val}</div>
        </div>
      ))}
    </div>
  );
}
