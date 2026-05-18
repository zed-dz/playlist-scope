import React, { useMemo } from 'react';

// Highlight matches inline for search snippets.
export function highlightMatches(text, query) {
  if (!query || !text) return text;
  const parts = [];
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  let lastIdx = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    parts.push(<mark key={match.index}>{match[0]}</mark>);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

// Inline markdown → HTML string. Used inside dangerouslySetInnerHTML.
export function inlineMd(s) {
  if (!s) return '';
  let html = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/(^|[\s(])(https?:\/\/[^\s<)"']+)/g, (full, prefix, url) => `${prefix}<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  return html;
}

// Full markdown doc → JSX tree. Block-level parser: splits on blank lines,
// then identifies each block as heading / list / table / quote / paragraph.
export function renderMarkdown(md) {
  if (!md) return null;
  const text = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawBlocks = text.split(/\n\s*\n/);
  const out = [];
  let key = 0;

  const renderListItems = (items, ordered = false) => {
    const Tag = ordered ? 'ol' : 'ul';
    return React.createElement(Tag, { key: key++ },
      items.map((it, j) => (
        <li key={j} dangerouslySetInnerHTML={{__html: inlineMd(it.trim().replace(/^[-*]\s+|^\d+\.\s+/, ''))}} />
      ))
    );
  };

  for (const raw of rawBlocks) {
    const block = raw.trim();
    if (!block) continue;
    const lines = block.split('\n');
    const first = lines[0];

    if (first.match(/^#{1,4}\s/)) {
      const level = first.match(/^(#+)/)[1].length;
      const Tag = `h${Math.min(level, 4)}`;
      const headText = first.replace(/^#+\s/, '');
      out.push(React.createElement(Tag, { key: key++ }, headText));
      if (lines.length > 1) {
        const rest = lines.slice(1);
        if (rest.every(l => !l.trim() || l.trim().startsWith('- ') || l.trim().startsWith('* '))) {
          out.push(renderListItems(rest.filter(l => l.trim())));
        } else if (rest.every(l => !l.trim() || /^\d+\.\s/.test(l.trim()))) {
          out.push(renderListItems(rest.filter(l => l.trim()), true));
        } else {
          out.push(<p key={key++} dangerouslySetInnerHTML={{__html: inlineMd(rest.join(' '))}} />);
        }
      }
      continue;
    }

    if (/^---+\s*$/.test(first) && lines.length === 1) { out.push(<hr key={key++} />); continue; }

    if (first.startsWith('>')) {
      const quoteText = lines.map(l => l.replace(/^>\s?/, '')).join(' ');
      out.push(<blockquote key={key++} dangerouslySetInnerHTML={{__html: inlineMd(quoteText)}} />);
      continue;
    }

    if (first.startsWith('|') && first.includes('|', 1)) {
      const rows = lines.filter(l => l.startsWith('|')).map(r => r.split('|').slice(1, -1).map(c => c.trim()));
      if (rows.length >= 2) {
        const [head, , ...body] = rows;
        out.push(
          <table key={key++}>
            <thead><tr>{head.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
            <tbody>{body.map((row, j) => (
              <tr key={j}>{row.map((c, k) => <td key={k} dangerouslySetInnerHTML={{__html: inlineMd(c)}} />)}</tr>
            ))}</tbody>
          </table>
        );
        continue;
      }
    }

    if (lines.every(l => l.trim().startsWith('- ') || l.trim().startsWith('* '))) {
      out.push(renderListItems(lines));
      continue;
    }
    if (lines.every(l => /^\d+\.\s/.test(l.trim()))) {
      out.push(renderListItems(lines, true));
      continue;
    }

    out.push(<p key={key++} dangerouslySetInnerHTML={{__html: inlineMd(lines.join(' '))}} />);
  }
  return out;
}

// Mindmap parser - nested-bullet markdown → tree.
export function parseMindmapMd(md) {
  const lines = (md || '').split('\n');
  const root = { label: 'Mindmap', children: [] };
  const stack = [{ node: root, depth: -1 }];
  let title = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    if (/^#{1,3}\s+/.test(line) && !title) {
      title = line.replace(/^#+\s+/, '').trim();
      root.label = title;
      continue;
    }
    const m = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (!m) continue;
    const indent = m[1].replace(/\t/g, '  ').length;
    const depth = Math.floor(indent / 2);
    const label = m[2].replace(/[*_`]/g, '').trim();
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    const node = { label, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, depth });
  }
  return root;
}

export function MindmapSVG({ markdown }) {
  const tree = useMemo(() => parseMindmapMd(markdown), [markdown]);

  const layout = useMemo(() => {
    const COL_W = 240;
    const ROW_H = 32;
    let yCursor = 0;
    function assign(node, depth) {
      node.x = depth * COL_W;
      if (node.children.length === 0) {
        node.y = yCursor * ROW_H;
        yCursor++;
        return node.y;
      }
      const childYs = node.children.map(c => assign(c, depth + 1));
      node.y = (childYs[0] + childYs[childYs.length - 1]) / 2;
      return node.y;
    }
    assign(tree, 0);
    return { rowCount: yCursor };
  }, [tree]);

  const nodes = [];
  const edges = [];
  function walk(node, parent = null) {
    nodes.push(node);
    if (parent) edges.push({ from: parent, to: node });
    node.children.forEach(c => walk(c, node));
  }
  walk(tree);

  if (nodes.length <= 1) {
    return <div className="text-sm text-text-2">No mindmap structure detected. The report may need to be regenerated as a nested-bullet outline.</div>;
  }

  const maxDepth = Math.max(...nodes.map(n => Math.floor(n.x / 240)));
  const width = (maxDepth + 1) * 240 + 80;
  const height = Math.max(layout.rowCount * 32 + 60, 200);
  const depthColors = ['var(--accent-bright)', 'var(--accent)', 'var(--info)', 'var(--text-1)', 'var(--text-2)'];

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh' }}>
      <svg width={width} height={height} style={{ minWidth: '100%', fontFamily: 'Geist, sans-serif' }}>
        {edges.map((e, i) => {
          const x1 = e.from.x + 200, y1 = e.from.y + 30;
          const x2 = e.to.x + 8, y2 = e.to.y + 30;
          const mx = (x1 + x2) / 2;
          return (
            <path key={i}
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  stroke="var(--border-strong)" strokeWidth="1.5" fill="none" opacity="0.6" />
          );
        })}
        {nodes.map((n, i) => {
          const depth = Math.floor(n.x / 240);
          const c = depthColors[Math.min(depth, depthColors.length - 1)];
          return (
            <g key={i} transform={`translate(${n.x}, ${n.y + 14})`}>
              <rect x="0" y="0" width="220" height="32" rx="6" fill="var(--bg-1)" stroke={c} strokeWidth="1" opacity="0.85" />
              <text x="10" y="20" fontSize={depth === 0 ? "13" : "12"}
                    fontWeight={depth === 0 ? "600" : "400"}
                    fill={depth === 0 ? c : 'var(--text-0)'}
                    style={depth === 0 ? { fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 15 } : {}}>
                {n.label.length > 32 ? n.label.slice(0, 30) + '…' : n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
