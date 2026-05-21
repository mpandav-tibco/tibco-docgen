/**
 * Minimal safe-HTML tagged template.
 *
 * Usage:
 *   html`<div class="${cls}">${userValue}</div>`  // userValue is auto-escaped
 *   html`<div>${safe(alreadyEscapedHtml)}</div>`  // safe() opts out of escaping
 *
 * Returns a SafeHtml instance whose .value is the raw HTML string.
 * Concatenate SafeHtml instances with safe() or join .value strings directly.
 */

export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string { return this.value; }
}

export function safe(v: string): SafeHtml {
  return new SafeHtml(v);
}

function esc(v: unknown): string {
  if (v instanceof SafeHtml) return v.value;
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function html(strings: TemplateStringsArray, ...vals: unknown[]): SafeHtml {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < vals.length) out += esc(vals[i]);
  }
  return new SafeHtml(out);
}
