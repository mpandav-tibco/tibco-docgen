"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderFlowSVG = renderFlowSVG;
const ACTIVITY_W = 120;
const ACTIVITY_H = 60;
const ICON_SIZE = 24;
const PADDING = 60;
const TRIGGER_W = 130;
const TRIGGER_H = 60;
function activityColor(ref) {
    const r = ref.toLowerCase();
    if (r.includes('noop') || r.includes('start'))
        return { fill: '#e8f5e9', stroke: '#43a047', icon: '▶' };
    if (r.includes('log'))
        return { fill: '#e3f2fd', stroke: '#1976d2', icon: '📋' };
    if (r.includes('rest') || r.includes('http'))
        return { fill: '#fff3e0', stroke: '#f57c00', icon: '🌐' };
    if (r.includes('mapper') || r.includes('map'))
        return { fill: '#fce4ec', stroke: '#c62828', icon: '⇄' };
    if (r.includes('invoke') || r.includes('flow'))
        return { fill: '#ede7f6', stroke: '#6a1b9a', icon: '⚡' };
    if (r.includes('return') || r.includes('reply'))
        return { fill: '#fafafa', stroke: '#616161', icon: '↩' };
    if (r.includes('timer'))
        return { fill: '#fff8e1', stroke: '#f9a825', icon: '⏱' };
    if (r.includes('kafka'))
        return { fill: '#e8eaf6', stroke: '#3949ab', icon: '📨' };
    if (r.includes('jdbc') || r.includes('sql'))
        return { fill: '#e0f7fa', stroke: '#00838f', icon: '🗄' };
    if (r.includes('json') || r.includes('xml'))
        return { fill: '#f3e5f5', stroke: '#7b1fa2', icon: '{ }' };
    if (r.includes('graphql') || r.includes('gql'))
        return { fill: '#fce4ec', stroke: '#e91e8b', icon: '◈' };
    if (r.includes('llm') || r.includes('claude') || r.includes('openai'))
        return { fill: '#e8f5e9', stroke: '#2e7d32', icon: '🤖' };
    return { fill: '#f5f5f5', stroke: '#78909c', icon: '◻' };
}
function abbreviate(text, max = 14) {
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
}
function computeCanvasBounds(positions) {
    const xs = Object.values(positions).map(p => p.x);
    const ys = Object.values(positions).map(p => p.y);
    return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
    };
}
function arrowPath(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const cx1 = from.x + dx * 0.5;
    const cy1 = from.y;
    const cx2 = from.x + dx * 0.5;
    const cy2 = to.y;
    return `M ${from.x} ${from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${to.x} ${to.y}`;
}
function arrowHead(to, from) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const size = 8;
    const p1x = to.x - size * Math.cos(angle - Math.PI / 7);
    const p1y = to.y - size * Math.sin(angle - Math.PI / 7);
    const p2x = to.x - size * Math.cos(angle + Math.PI / 7);
    const p2y = to.y - size * Math.sin(angle + Math.PI / 7);
    return `M ${to.x} ${to.y} L ${p1x} ${p1y} L ${p2x} ${p2y} Z`;
}
function edgePoint(pos, target, w, h) {
    const cx = pos.x + w / 2;
    const cy = pos.y + h / 2;
    const tx = target.x + w / 2;
    const ty = target.y + h / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx === 0 && absDy === 0)
        return { x: cx, y: cy };
    if (absDx * h > absDy * w) {
        // exits left or right
        const ex = dx > 0 ? cx + w / 2 : cx - w / 2;
        const ey = cy + (dy / dx) * (ex - cx);
        return { x: ex, y: ey };
    }
    else {
        // exits top or bottom
        const ey = dy > 0 ? cy + h / 2 : cy - h / 2;
        const ex = cx + (dx / dy) * (ey - cy);
        return { x: ex, y: ey };
    }
}
function renderFlowSVG(flow) {
    const positions = flow.diagram.positions;
    const activities = flow.activities;
    const links = flow.links;
    if (Object.keys(positions).length === 0) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60">
      <rect width="300" height="60" fill="#f9f9f9" rx="4"/>
      <text x="150" y="35" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#777">No diagram data available</text>
    </svg>`;
    }
    const bounds = computeCanvasBounds(positions);
    const offsetX = -bounds.minX + PADDING;
    const offsetY = -bounds.minY + PADDING;
    const svgW = bounds.maxX - bounds.minX + ACTIVITY_W + PADDING * 2;
    const svgH = bounds.maxY - bounds.minY + ACTIVITY_H + PADDING * 2;
    const actMap = new Map(activities.map(a => [a.id, a]));
    const linksSvg = links.map(link => {
        const fromPos = positions[link.from];
        const toPos = positions[link.to];
        if (!fromPos || !toPos)
            return '';
        const fp = { x: fromPos.x + offsetX, y: fromPos.y + offsetY };
        const tp = { x: toPos.x + offsetX, y: toPos.y + offsetY };
        const isConditional = link.type === 'expression';
        const strokeColor = isConditional ? '#e65100' : '#90a4ae';
        const strokeDash = isConditional ? 'stroke-dasharray="6 3"' : '';
        const fromEdge = edgePoint(fp, tp, ACTIVITY_W, ACTIVITY_H);
        const toEdge = edgePoint(tp, fp, ACTIVITY_W, ACTIVITY_H);
        const path = arrowPath(fromEdge, toEdge);
        const head = arrowHead(toEdge, fromEdge);
        const midX = (fromEdge.x + toEdge.x) / 2;
        const midY = (fromEdge.y + toEdge.y) / 2 - 8;
        const labelText = isConditional ? abbreviate(link.condition || link.label || '', 20) : '';
        return `
    <path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="1.5" ${strokeDash}/>
    <path d="${head}" fill="${strokeColor}" stroke="none"/>
    ${labelText ? `<rect x="${midX - labelText.length * 3.2}" y="${midY - 10}" width="${labelText.length * 6.4 + 8}" height="16" rx="3" fill="white" stroke="${strokeColor}" stroke-width="0.8" opacity="0.92"/>
    <text x="${midX}" y="${midY + 2}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="${strokeColor}">${escXml(labelText)}</text>` : ''}`;
    }).join('\n');
    const activitiesSvg = activities.map(act => {
        const pos = positions[act.id];
        if (!pos)
            return '';
        const x = pos.x + offsetX;
        const y = pos.y + offsetY;
        const colors = activityColor(act.ref);
        const label = abbreviate(act.name, 16);
        const typeLabel = abbreviate(shortRef(act.ref), 14);
        return `
    <g class="activity" data-id="${escXml(act.id)}">
      <rect x="${x}" y="${y}" width="${ACTIVITY_W}" height="${ACTIVITY_H}"
            rx="6" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.5"
            filter="url(#shadow)"/>
      <text x="${x + ACTIVITY_W / 2}" y="${y + 14}" text-anchor="middle"
            font-family="sans-serif" font-size="10" fill="#555">${escXml(typeLabel)}</text>
      <line x1="${x + 8}" y1="${y + 20}" x2="${x + ACTIVITY_W - 8}" y2="${y + 20}"
            stroke="${colors.stroke}" stroke-width="0.5" opacity="0.5"/>
      <text x="${x + ACTIVITY_W / 2}" y="${y + 36}" text-anchor="middle"
            font-family="sans-serif" font-size="11" font-weight="600" fill="#333">${escXml(label)}</text>
    </g>`;
    }).join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#00000020"/>
    </filter>
  </defs>
  <rect width="${svgW}" height="${svgH}" fill="#fafbfc" rx="6"/>
  ${linksSvg}
  ${activitiesSvg}
</svg>`;
}
function shortRef(ref) {
    const parts = ref.replace(/^#/, '').split('/');
    return parts[parts.length - 1];
}
function escXml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
//# sourceMappingURL=flow-renderer.js.map