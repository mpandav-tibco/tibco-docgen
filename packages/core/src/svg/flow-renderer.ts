import { FlowDoc, ActivityDoc, LinkDoc, FlowDiagram } from '../model';
import { FlogoIconRegistry } from '../flogo-icons';
import { BW6IconRegistry } from '../bw6-icons';

const ACTIVITY_W = 130;
const ACTIVITY_H = 84;
const ICON_AREA_H = 44;  // colored top strip height
const ICON_SIZE = 32;
const PADDING = 70;
const TRIGGER_W = 130;
const TRIGGER_H = 84;

interface Point { x: number; y: number; }

function activityColor(ref: string): { fill: string; stroke: string; icon: string } {
  const r = ref.toLowerCase();
  if (r.includes('noop') || r.includes('start'))        return { fill: '#e8f5e9', stroke: '#43a047', icon: '▶' };
  if (r.includes('log'))                                 return { fill: '#e3f2fd', stroke: '#1976d2', icon: '📋' };
  if (r.includes('rest') || r.includes('http'))         return { fill: '#fff3e0', stroke: '#f57c00', icon: '🌐' };
  if (r.includes('mapper') || r.includes('map'))        return { fill: '#fce4ec', stroke: '#c62828', icon: '⇄' };
  if (r.includes('invoke') || r.includes('flow') || r.includes('callprocess'))  return { fill: '#ede7f6', stroke: '#6a1b9a', icon: '⚡' };
  if (r.includes('return') || r.includes('reply') || r.includes('api.end') || r.includes('sendreply')) return { fill: '#fafafa', stroke: '#616161', icon: '↩' };
  if (r.includes('timer'))                              return { fill: '#fff8e1', stroke: '#f9a825', icon: '⏱' };
  if (r.includes('kafka') || r.includes('ems') || r.includes('jms') || r.includes('amqp')) return { fill: '#e8eaf6', stroke: '#3949ab', icon: '📨' };
  if (r.includes('jdbc') || r.includes('sql'))         return { fill: '#e0f7fa', stroke: '#00838f', icon: '🗄' };
  if (r.includes('json') || r.includes('xml'))         return { fill: '#f3e5f5', stroke: '#7b1fa2', icon: '{ }' };
  if (r.includes('graphql') || r.includes('gql'))      return { fill: '#fce4ec', stroke: '#e91e8b', icon: '◈' };
  if (r.includes('llm') || r.includes('claude') || r.includes('openai')) return { fill: '#e8f5e9', stroke: '#2e7d32', icon: '🤖' };
  return { fill: '#f5f5f5', stroke: '#78909c', icon: '◻' };
}

function abbreviate(text: string, max = 14): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function computeCanvasBounds(
  positions: Record<string, { x: number; y: number }>
): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = Object.values(positions).map(p => p.x);
  const ys = Object.values(positions).map(p => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function arrowPath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cx1 = from.x + dx * 0.5;
  const cy1 = from.y;
  const cx2 = from.x + dx * 0.5;
  const cy2 = to.y;
  return `M ${from.x} ${from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${to.x} ${to.y}`;
}

function arrowHead(to: Point, from: Point): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = 8;
  const p1x = to.x - size * Math.cos(angle - Math.PI / 7);
  const p1y = to.y - size * Math.sin(angle - Math.PI / 7);
  const p2x = to.x - size * Math.cos(angle + Math.PI / 7);
  const p2y = to.y - size * Math.sin(angle + Math.PI / 7);
  return `M ${to.x} ${to.y} L ${p1x} ${p1y} L ${p2x} ${p2y} Z`;
}

function edgePoint(pos: Point, target: Point, w: number, h: number): Point {
  const cx = pos.x + w / 2;
  const cy = pos.y + h / 2;
  const tx = target.x + w / 2;
  const ty = target.y + h / 2;

  const dx = tx - cx;
  const dy = ty - cy;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx === 0 && absDy === 0) return { x: cx, y: cy };

  if (absDx * h > absDy * w) {
    // exits left or right
    const ex = dx > 0 ? cx + w / 2 : cx - w / 2;
    const ey = cy + (dy / dx) * (ex - cx);
    return { x: ex, y: ey };
  } else {
    // exits top or bottom
    const ey = dy > 0 ? cy + h / 2 : cy - h / 2;
    const ex = cx + (dx / dy) * (ey - cy);
    return { x: ex, y: ey };
  }
}

export function renderFlowSVG(flow: FlowDoc, options?: { activityLinks?: boolean; iconRegistry?: FlogoIconRegistry }): string {
  const positions = flow.diagram.positions;
  const activities: ActivityDoc[] = flow.activities;
  const links: LinkDoc[] = flow.links;

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
    if (!fromPos || !toPos) return '';

    const fp: Point = { x: fromPos.x + offsetX, y: fromPos.y + offsetY };
    const tp: Point = { x: toPos.x + offsetX, y: toPos.y + offsetY };

    const isConditional = link.type === 'expression';
    const isError       = link.type === 'error';
    const strokeColor   = isError ? '#dc2626' : isConditional ? '#e65100' : '#90a4ae';
    const strokeDash    = isError ? 'stroke-dasharray="4 2"' : isConditional ? 'stroke-dasharray="6 3"' : '';

    const fromEdge = edgePoint(fp, tp, ACTIVITY_W, ACTIVITY_H);
    const toEdge = edgePoint(tp, fp, ACTIVITY_W, ACTIVITY_H);

    const pathD = arrowPath(fromEdge, toEdge);
    const head = arrowHead(toEdge, fromEdge);

    const midX = (fromEdge.x + toEdge.x) / 2;
    const midY = (fromEdge.y + toEdge.y) / 2 - 8;
    // Show label/condition for any transition that has one (not just conditionals)
    const labelText = abbreviate(link.condition || link.label || (isError ? 'error' : ''), 20);

    const tipType = isError ? 'error' : isConditional ? 'conditional' : 'normal';
    const tipLabel = escXml(link.label || '');
    const tipCond  = escXml(link.condition || '');
    const tipFrom  = escXml(link.from);
    const tipTo    = escXml(link.to);

    return `
    <g class="flow-link" style="cursor:pointer;" data-type="${tipType}" data-label="${tipLabel}" data-condition="${tipCond}" data-from="${tipFrom}" data-to="${tipTo}">
      <path d="${pathD}" fill="none" stroke="transparent" stroke-width="12"/>
      <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="1.5" ${strokeDash}/>
      <path d="${head}" fill="${strokeColor}" stroke="none"/>
      ${labelText ? `<rect x="${midX - labelText.length * 3.2}" y="${midY - 10}" width="${labelText.length * 6.4 + 8}" height="16" rx="3" fill="white" stroke="${strokeColor}" stroke-width="0.8" opacity="0.92"/>
      <text x="${midX}" y="${midY + 2}" text-anchor="middle" font-family="sans-serif" font-size="9" fill="${strokeColor}">${escXml(labelText)}</text>` : ''}
    </g>`;
  }).join('\n');

  const activitiesSvg = activities.map(act => {
    const pos = positions[act.id];
    if (!pos) return '';
    const x = pos.x + offsetX;
    const y = pos.y + offsetY;
    const colors = activityColor(act.ref);
    const label = abbreviate(act.name, 16);
    const typeLabel = abbreviate(shortRef(act.ref), 12);
    const linkAnchor = `#activity-${act.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const iconDataURI = options?.iconRegistry?.get(act.ref);

    const dataAttrs = `data-id="${escXml(act.id)}" data-name="${escXml(act.name)}" data-type="${escXml(shortRef(act.ref))}" data-ref="${escXml(act.ref)}" data-desc="${escXml(act.description ?? '')}"`;

    // Two-zone card: colored icon strip on top, white name area on bottom
    const icx = x + ACTIVITY_W / 2;
    const iconEl = iconDataURI
      ? `<image href="${iconDataURI}" x="${icx - ICON_SIZE / 2}" y="${y + (ICON_AREA_H - ICON_SIZE) / 2}"
               width="${ICON_SIZE}" height="${ICON_SIZE}" preserveAspectRatio="xMidYMid meet"/>`
      : `<text x="${icx}" y="${y + ICON_AREA_H / 2 + 6}" text-anchor="middle"
               font-family="sans-serif" font-size="22" fill="${colors.stroke}">${escXml(colors.icon)}</text>`;

    const inner = `
      <rect x="${x}" y="${y}" width="${ACTIVITY_W}" height="${ACTIVITY_H}"
            rx="7" fill="white" stroke="${colors.stroke}" stroke-width="1.5"
            filter="url(#shadow)"/>
      <rect x="${x}" y="${y}" width="${ACTIVITY_W}" height="${ICON_AREA_H}"
            rx="7" fill="${colors.fill}" stroke="none"/>
      <rect x="${x}" y="${y + ICON_AREA_H - 4}" width="${ACTIVITY_W}" height="8"
            fill="${colors.fill}" stroke="none"/>
      <line x1="${x}" y1="${y + ICON_AREA_H}" x2="${x + ACTIVITY_W}" y2="${y + ICON_AREA_H}"
            stroke="${colors.stroke}" stroke-width="0.8" opacity="0.35"/>
      ${iconEl}
      <text x="${icx}" y="${y + ICON_AREA_H + 15}" text-anchor="middle"
            font-family="'Segoe UI',sans-serif" font-size="11" font-weight="700" fill="#1a202c">${escXml(label)}</text>
      <text x="${icx}" y="${y + ICON_AREA_H + 29}" text-anchor="middle"
            font-family="'Segoe UI',sans-serif" font-size="9.5" fill="#64748b">${escXml(typeLabel)}</text>`;

    if (options?.activityLinks) {
      return `
    <a href="${escXml(linkAnchor)}" style="cursor:pointer;" title="${escXml(act.name)}">
      <g class="activity" ${dataAttrs}>${inner}
      </g>
    </a>`;
    }
    return `
    <g class="activity" style="cursor:default;" ${dataAttrs}>${inner}
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

// ─── BW6-style circle diagram renderer ───────────────────────────────────────

const BW6_NODE_R  = 26;   // activity circle radius
const BW6_TITLE_H = 24;   // process title bar height
const BW6_LABEL_OFFSET = 16; // gap between circle bottom and name
const BW6_TYPE_H  = 13;   // height of the type label below name

interface BW6NodeStyle { bg: string; abbrev: string; }

function bw6NodeStyle(ref: string, name: string): BW6NodeStyle {
  const r = (ref + ' ' + name).toLowerCase();
  if ((r.includes('start') && !r.includes('starter') && !r.includes('startcounter')) ||
       r.includes('noop'))                            return { bg: '#16a34a', abbrev: '▶' };
  if ((r.includes('.end') || name.toLowerCase() === 'end') && !r.includes('endpoint'))
                                                      return { bg: '#64748b', abbrev: '■' };
  if (r.includes('timer') || r.includes('sleep'))    return { bg: '#d97706', abbrev: 'TMR' };
  if (r.includes('kafkaconsumer') || r.includes('kafkasubscrib'))
                                                      return { bg: '#1d4ed8', abbrev: 'KSub' };
  if (r.includes('kafkasend') || r.includes('kafkaproduc'))
                                                      return { bg: '#1e40af', abbrev: 'KPub' };
  if (r.includes('kafka'))                           return { bg: '#2563eb', abbrev: 'KFK' };
  if (r.includes('datamerger'))                      return { bg: '#059669', abbrev: 'DM' };
  if (r.includes('datarequester'))                   return { bg: '#059669', abbrev: 'DR' };
  if (r.includes('dataeventpoller') || r.includes('datapoller'))
                                                      return { bg: '#059669', abbrev: 'DP' };
  if (r.includes('jdbcquery'))                       return { bg: '#0d9488', abbrev: 'QRY' };
  if (r.includes('jdbcupdate') || r.includes('jdbcinsert') || r.includes('jdbccall'))
                                                      return { bg: '#0f766e', abbrev: 'UPD' };
  if (r.includes('jdbc') || r.includes('sql') || r.includes('database'))
                                                      return { bg: '#0d9488', abbrev: 'DB' };
  if (r.includes('sharedvariable') || r.includes('getvariable') || r.includes('setvariable'))
                                                      return { bg: '#0891b2', abbrev: 'VAR' };
  if (r.includes('log'))                             return { bg: '#3b82f6', abbrev: 'LOG' };
  if (r.includes('mapper') || r.includes('datamapper') || r.includes('generalmapping') ||
      r.includes('map') || r.includes('assign'))    return { bg: '#db2777', abbrev: 'MAP' };
  if (r.includes('callprocess') || r.includes('subprocess'))
                                                      return { bg: '#7c3aed', abbrev: 'CP' };
  if (r.includes('throw') || r.includes('fault'))   return { bg: '#dc2626', abbrev: 'ERR' };
  if (r.includes('receiveevents') || r.includes('httpreceive') || r.includes('restbinding'))
                                                      return { bg: '#ea580c', abbrev: 'RCV' };
  if (r.includes('rest') || r.includes('http'))      return { bg: '#f97316', abbrev: 'REST' };
  if (r.includes('ems') || r.includes('jms'))        return { bg: '#4f46e5', abbrev: 'EMS' };
  if (r.includes('enginecommand') || r.includes('engine'))
                                                      return { bg: '#6b7280', abbrev: 'ENG' };
  if (r.includes('invoke') || r.includes('reply') || r.includes('receive'))
                                                      return { bg: '#6d28d9', abbrev: 'SVC' };
  return { bg: '#475569', abbrev: 'ACT' };
}

export function renderBW6FlowSVG(flow: FlowDoc, options?: {
  activityLinks?: boolean;
  iconRegistry?: BW6IconRegistry;
  /** Returns a URL for a callProcess activity, or null to fall back to #anchor */
  linkResolver?: (act: ActivityDoc) => string | null;
}): string {
  const positions = flow.diagram.positions;
  const activities: ActivityDoc[] = flow.activities;
  const links: LinkDoc[] = flow.links;

  if (Object.keys(positions).length === 0 || activities.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80">
      <rect width="320" height="80" fill="#f9fafb" rx="6"/>
      <text x="160" y="45" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#94a3b8">No diagram available</text>
    </svg>`;
  }

  // ── Fault handler detection ────────────────────────────────────────────────
  // An activity is a fault handler if:
  //   (a) it is the direct target of an error link, OR
  //   (b) ALL of its incoming links come from fault handler activities
  // Activities reachable from BOTH main and fault paths (e.g. a shared End node)
  // are NOT classified as fault handlers.
  const faultIds = new Set<string>();
  for (const l of links) {
    if (l.type === 'error') faultIds.add(l.to);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of links) {
      if (faultIds.has(l.from) && !faultIds.has(l.to)) {
        const allIncomingAreFault = links
          .filter(ll => ll.to === l.to)
          .every(ll => faultIds.has(ll.from));
        if (allIncomingAreFault) {
          faultIds.add(l.to);
          changed = true;
        }
      }
    }
  }

  // ── Stacked layout: push fault activities below the main flow ────────────────
  // Minimum canvas-unit gap from the bottom of the main flow slot row to the
  // top of the fault section. Accounts for activity height + labels + visual gap.
  const FAULT_SECTION_GAP = 150;
  const mainPosEntries = Object.entries(positions).filter(([id]) => !faultIds.has(id) && positions[id]);
  const faultPosEntries = Object.entries(positions).filter(([id]) => faultIds.has(id) && positions[id]);
  let adjustedPositions: Record<string, { x: number; y: number }> = positions;
  if (faultIds.size > 0 && mainPosEntries.length > 0 && faultPosEntries.length > 0) {
    const mainMaxY = Math.max(...mainPosEntries.map(([, p]) => p.y));
    const faultMinY = Math.min(...faultPosEntries.map(([, p]) => p.y));
    const yShift = (mainMaxY + FAULT_SECTION_GAP) - faultMinY;
    if (yShift > 5) {
      adjustedPositions = { ...positions };
      for (const [id, pos] of faultPosEntries) {
        adjustedPositions[id] = { x: pos.x, y: pos.y + yShift };
      }
    }
  }

  const bounds = computeCanvasBounds(adjustedPositions);
  const offsetX = -bounds.minX + PADDING;
  const offsetY = -bounds.minY + PADDING + BW6_TITLE_H;

  const svgW = bounds.maxX - bounds.minX + ACTIVITY_W + PADDING * 2;
  const svgH = bounds.maxY - bounds.minY + ACTIVITY_H + PADDING * 2 + BW6_TITLE_H
             + BW6_LABEL_OFFSET + BW6_TYPE_H + 4;

  // Helper: center of activity slot
  function cx(pos: {x: number; y: number}) { return pos.x + offsetX + ACTIVITY_W / 2; }
  function cy(pos: {x: number; y: number}) { return pos.y + offsetY + ACTIVITY_H / 2; }

  // ── Fault handler swimlane box ─────────────────────────────────────────────
  const FAULT_PAD = 18;
  const FAULT_LABEL_H = 20;
  let faultSwimlane = '';
  if (faultIds.size > 0) {
    const faultPositions = [...faultIds].map(id => adjustedPositions[id]).filter(Boolean);
    if (faultPositions.length > 0) {
      const minFx = Math.min(...faultPositions.map(p => p.x)) + offsetX - FAULT_PAD;
      const maxFx = Math.max(...faultPositions.map(p => p.x)) + offsetX + ACTIVITY_W + FAULT_PAD;
      const minFy = Math.min(...faultPositions.map(p => p.y)) + offsetY - FAULT_LABEL_H;
      const maxFy = Math.max(...faultPositions.map(p => p.y)) + offsetY + ACTIVITY_H + BW6_LABEL_OFFSET + BW6_TYPE_H + FAULT_PAD;
      const fw = maxFx - minFx;
      const fh = maxFy - minFy;
      faultSwimlane = `
    <rect x="${minFx}" y="${minFy}" width="${fw}" height="${fh}"
          rx="6" fill="#fee2e2" stroke="#ef4444" stroke-width="1.2" stroke-dasharray="5,3" opacity="0.55"/>
    <rect x="${minFx}" y="${minFy}" width="${fw}" height="${FAULT_LABEL_H}"
          rx="6" fill="#ef4444" opacity="0.12"/>
    <rect x="${minFx}" y="${minFy + FAULT_LABEL_H - 4}" width="${fw}" height="4"
          fill="#ef4444" opacity="0.10"/>
    <text x="${minFx + 6}" y="${minFy + 13}"
          font-family="'Segoe UI','Arial',sans-serif" font-size="9" font-weight="600"
          fill="#dc2626">⚠ Exception Handler</text>`;
    }
  }

  // ── Links ──────────────────────────────────────────────────────────────────
  const linksSvg = links.map(link => {
    const fromPos = adjustedPositions[link.from];
    const toPos   = adjustedPositions[link.to];
    if (!fromPos || !toPos) return '';

    const fcx = cx(fromPos), fcy = cy(fromPos);
    const tcx = cx(toPos),   tcy = cy(toPos);

    const isError       = link.type === 'error';
    const isConditional = link.type === 'expression';
    const isDefault     = link.type === 'default';
    const color = isError ? '#ef4444' : isConditional ? '#f97316' : isDefault ? '#8b5cf6' : '#94a3b8';
    const dash  = isError ? '5,3'     : isConditional ? '7,4'    : isDefault ? '4,3'    : '';
    const markerId = isError ? 'err' : isConditional ? 'cond' : isDefault ? 'dflt' : 'def';

    const dx = tcx - fcx, dy = tcy - fcy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const fx = fcx + (dx / dist) * BW6_NODE_R;
    const fy = fcy + (dy / dist) * BW6_NODE_R;
    const tx = tcx - (dx / dist) * (BW6_NODE_R + 4);
    const ty = tcy - (dy / dist) * (BW6_NODE_R + 4);

    const rawLabel = link.condition || link.label || (isError ? 'error' : isDefault ? 'otherwise' : '');
    const labelText = abbreviate(rawLabel, 22);
    const midX = (fx + tx) / 2;
    const midY = (fy + ty) / 2 - 8;

    const tipType = isError ? 'error' : isConditional ? 'conditional' : isDefault ? 'default' : 'normal';
    const fullCondition = escXml(link.condition || link.label || '');

    const labelSvg = labelText
      ? `<title>${fullCondition || escXml(labelText)}</title>
      <rect x="${midX - labelText.length * 3.2}" y="${midY - 10}"
            width="${labelText.length * 6.4 + 8}" height="15"
            rx="3" fill="white" stroke="${color}" stroke-width="0.7" opacity="0.93"/>
      <text x="${midX}" y="${midY + 2}" text-anchor="middle"
            font-family="'Segoe UI',sans-serif" font-size="9" fill="${color}">${escXml(labelText)}</text>`
      : '';

    return `
    <g class="flow-link" style="cursor:pointer;"
       data-type="${tipType}" data-label="${escXml(link.label || '')}"
       data-condition="${escXml(link.condition || '')}"
       data-from="${escXml(link.from)}" data-to="${escXml(link.to)}">
      <line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="transparent" stroke-width="10"/>
      <line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}"
            stroke="${color}" stroke-width="1.5" ${dash ? `stroke-dasharray="${dash}"` : ''}
            marker-end="url(#bw6arr-${markerId})"/>
      ${labelSvg}
    </g>`;
  }).join('\n');

  // ── Nodes ──────────────────────────────────────────────────────────────────
  const nodesSvg = activities.map(act => {
    const pos = adjustedPositions[act.id];
    if (!pos) return '';

    const ncx = cx(pos);
    const ncy = cy(pos);
    const style = bw6NodeStyle(act.ref, act.name);
    const label = abbreviate(act.name, 13);
    const typeLabel = abbreviate(shortRef(act.ref), 12);
    const abbrevFontSize = style.abbrev.length <= 2 ? 15 : style.abbrev.length === 3 ? 11 : 9;

    // Resolve link: cross-module callProcess links take priority over anchor links
    const resolvedUrl = options?.linkResolver?.(act) ?? null;
    const isCallProcess = resolvedUrl !== null;
    const linkAnchor = resolvedUrl ?? `#activity-${act.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const dataAttrs = `data-id="${escXml(act.id)}" data-name="${escXml(act.name)}" `
      + `data-type="${escXml(shortRef(act.ref))}" data-ref="${escXml(act.ref)}" `
      + `data-desc="${escXml(act.description ?? '')}"`;

    // Draw a small badge on callProcess nodes that link cross-module
    const crossModuleBadge = isCallProcess
      ? `<circle cx="${ncx + BW6_NODE_R - 5}" cy="${ncy - BW6_NODE_R + 5}" r="7" fill="#7c3aed" stroke="white" stroke-width="1.5"/>
         <text x="${ncx + BW6_NODE_R - 5}" y="${ncy - BW6_NODE_R + 5}" text-anchor="middle" dominant-baseline="middle"
               font-family="'Segoe UI','Arial',sans-serif" font-size="8" font-weight="700" fill="white">↗</text>`
      : '';

    const iconDataURI = options?.iconRegistry
      ? (options.iconRegistry.get(act.ref, act.name, act.typeId) ?? options.iconRegistry.unknownIcon)
      : undefined;
    // Icon fills the colored circle with a 2px ring: white inner circle r=BW6_NODE_R-2, icon covers most of it
    const iconR = BW6_NODE_R - 2;   // 24 — white circle radius (2px ring of color shows)
    const iconHalf = BW6_NODE_R - 4; // 22 — half the icon dimensions (44×44 px total)
    const iconEl = iconDataURI
      ? `<circle cx="${ncx}" cy="${ncy}" r="${iconR}" fill="white"/>
         <image href="${iconDataURI}" x="${ncx - iconHalf}" y="${ncy - iconHalf}"
                width="${iconHalf * 2}" height="${iconHalf * 2}"
                preserveAspectRatio="xMidYMid meet"/>`
      : `<text x="${ncx}" y="${ncy + 1}" text-anchor="middle" dominant-baseline="middle"
               font-family="'Segoe UI','Arial',sans-serif"
               font-size="${abbrevFontSize}" font-weight="700" fill="white">${escXml(style.abbrev)}</text>`;

    const inner = `
      <circle cx="${ncx}" cy="${ncy}" r="${BW6_NODE_R + 3}" fill="white" filter="url(#bw6shadow)" opacity="0.7"/>
      <circle cx="${ncx}" cy="${ncy}" r="${BW6_NODE_R}" fill="${style.bg}"/>
      ${iconEl}
      <text x="${ncx}" y="${ncy + BW6_NODE_R + BW6_LABEL_OFFSET}" text-anchor="middle"
            font-family="'Segoe UI','Arial',sans-serif"
            font-size="11" font-weight="600" fill="#1d4ed8">${escXml(label)}</text>
      <text x="${ncx}" y="${ncy + BW6_NODE_R + BW6_LABEL_OFFSET + BW6_TYPE_H}" text-anchor="middle"
            font-family="'Segoe UI','Arial',sans-serif"
            font-size="9" fill="#94a3b8">${escXml(typeLabel)}</text>
      ${crossModuleBadge}`;

    if (options?.activityLinks || resolvedUrl) {
      const title = isCallProcess
        ? `${act.name} → ${act.settings?.processRef ?? 'called process'}`
        : act.name;
      return `
    <a href="${escXml(linkAnchor)}" title="${escXml(title)}">
      <g class="activity" ${dataAttrs} data-cross-module="${isCallProcess}" style="cursor:pointer;">${inner}</g>
    </a>`;
    }
    return `<g class="activity" ${dataAttrs} style="cursor:pointer;">${inner}</g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg"
       width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
  <defs>
    <filter id="bw6shadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="1" dy="2" stdDeviation="3" flood-color="#00000022"/>
    </filter>
    <marker id="bw6arr-def" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,1 L0,7 L8,4 z" fill="#94a3b8"/>
    </marker>
    <marker id="bw6arr-err" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,1 L0,7 L8,4 z" fill="#ef4444"/>
    </marker>
    <marker id="bw6arr-cond" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,1 L0,7 L8,4 z" fill="#f97316"/>
    </marker>
    <marker id="bw6arr-dflt" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
      <path d="M0,1 L0,7 L8,4 z" fill="#8b5cf6"/>
    </marker>
  </defs>
  <!-- Canvas background -->
  <rect width="${svgW}" height="${svgH}" fill="#ffffff" rx="8" stroke="#e5e7eb" stroke-width="1"/>
  <!-- Title bar -->
  <rect x="0" y="0" width="${svgW}" height="${BW6_TITLE_H}" fill="#f8fafc" rx="7"/>
  <rect x="0" y="${BW6_TITLE_H - 1}" width="${svgW}" height="2" fill="#e5e7eb"/>
  <text x="${svgW / 2}" y="${BW6_TITLE_H / 2 + 4}" text-anchor="middle"
        font-family="'Cascadia Code',Consolas,monospace" font-size="11" fill="#64748b">${escXml(flow.name)}</text>
  <!-- Exception Handler swimlane (behind links and nodes) -->
  ${faultSwimlane}
  <!-- Links -->
  ${linksSvg}
  <!-- Nodes (above links) -->
  ${nodesSvg}
</svg>`;
}

function shortRef(ref: string): string {
  // Flogo: slash-separated "#github.com/.../subflow" → "subflow"
  if (ref.includes('/')) return ref.replace(/^#/, '').split('/').pop() ?? ref;
  // BW6: Java class name "com.tibco.bw.palette.jdbc.runtime.JDBCQueryActivity" → "JDBCQuery"
  if (ref.includes('.')) return (ref.split('.').pop() ?? ref).replace(/Activity$/, '');
  return ref;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
