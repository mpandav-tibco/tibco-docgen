import { BW6Activity, BW6Transition } from './types';
import { FlowDiagram } from '@tibco-docgen/core';

const ACTIVITY_W = 120;
const ACTIVITY_H = 60;
const H_GAP = 60;
const V_GAP = 30;

export function layoutActivities(
  activities: BW6Activity[],
  transitions: BW6Transition[],
): Record<string, { x: number; y: number }> {
  if (activities.length === 0) return {};

  const names = activities.map(a => a.name);
  const outgoing = new Map<string, string[]>(names.map(n => [n, []]));
  const incoming = new Map<string, string[]>(names.map(n => [n, []]));

  for (const t of transitions) {
    if (outgoing.has(t.from)) outgoing.get(t.from)!.push(t.to);
    if (incoming.has(t.to))   incoming.get(t.to)!.push(t.from);
  }

  const roots = names.filter(n => (incoming.get(n)?.length ?? 0) === 0);
  const startNode = roots.find(n => n === 'Start') ?? roots[0] ?? names[0];

  const level = new Map<string, number>();
  const queue: string[] = [startNode];
  level.set(startNode, 0);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curLevel = level.get(cur)!;
    for (const next of (outgoing.get(cur) ?? [])) {
      if (!level.has(next)) {
        level.set(next, curLevel + 1);
        queue.push(next);
      }
    }
  }

  let maxLevel = level.size > 0 ? Math.max(...level.values()) : 0;
  for (const n of names) {
    if (!level.has(n)) level.set(n, ++maxLevel);
  }

  const byLevel = new Map<number, string[]>();
  for (const [n, l] of level) {
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(n);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  for (const [l, ns] of byLevel) {
    ns.forEach((n, i) => {
      positions[n] = {
        x: l * (ACTIVITY_W + H_GAP),
        y: i * (ACTIVITY_H + V_GAP),
      };
    });
  }
  return positions;
}

export function computeDiagram(activities: BW6Activity[], transitions: BW6Transition[]): FlowDiagram {
  const positions = layoutActivities(activities, transitions);
  if (Object.keys(positions).length === 0) {
    return { positions: {}, width: 400, height: 120 };
  }
  const xs = Object.values(positions).map(p => p.x);
  const ys = Object.values(positions).map(p => p.y);
  const width  = Math.max(...xs) - Math.min(...xs) + ACTIVITY_W + 60 * 2;
  const height = Math.max(...ys) - Math.min(...ys) + ACTIVITY_H + 60 * 2;
  return { positions, width, height };
}
