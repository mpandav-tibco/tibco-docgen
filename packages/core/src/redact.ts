import type { DocModel, PropertyDoc, SharedVarDoc } from './model';

// Field names that indicate sensitive credentials — redact regardless of value.
const SENSITIVE_KEY_RE = /password|passwd|api[_.-]?key|secret|token|credential|private[._-]?key|passphrase/i;

// Value patterns that are always sensitive — TIBCO substvar SECRET: prefix and encrypted marker.
const SENSITIVE_VAL_RE = /^SECRET:|^#!.+!$/;

export const REDACTED = '🔒 redacted';

function isSensitiveKey(key: string): boolean { return SENSITIVE_KEY_RE.test(key); }
function isSensitiveVal(v: unknown): boolean  { return v != null && SENSITIVE_VAL_RE.test(String(v)); }

function redactSettings(s?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!s) return s;
  return Object.fromEntries(
    Object.entries(s).map(([k, v]) => [k, isSensitiveKey(k) || isSensitiveVal(v) ? REDACTED : v]),
  );
}

function redactProp(p: PropertyDoc): PropertyDoc {
  return isSensitiveKey(p.name) || isSensitiveVal(p.value) ? { ...p, value: REDACTED } : p;
}

function redactSharedVar(v: SharedVarDoc): SharedVarDoc {
  return isSensitiveKey(v.name) || isSensitiveVal(v.value) ? { ...v, value: REDACTED } : v;
}

/**
 * Returns a shallow copy of the model with all sensitive values replaced by REDACTED.
 * Applied before any rendering so every output format (HTML, Markdown, JSON, PDF, MCP) is clean.
 */
export function redactModel(model: DocModel): DocModel {
  return {
    ...model,
    connections: model.connections.map(c => ({ ...c, settings: redactSettings(c.settings) })),
    properties:  model.properties.map(redactProp),
    triggers: model.triggers.map(t => ({
      ...t,
      settings: redactSettings(t.settings),
      handlers: t.handlers.map(h => ({
        ...h,
        settings: redactSettings(h.settings),
        input:    redactSettings(h.input as Record<string, unknown>) as Record<string, unknown> | undefined,
      })),
    })),
    flows: model.flows.map(f => ({
      ...f,
      activities: f.activities.map(a => ({ ...a, settings: redactSettings(a.settings) })),
    })),
    profileProperties: model.profileProperties
      ? Object.fromEntries(
          Object.entries(model.profileProperties).map(([p, props]) => [p, props.map(redactProp)]),
        )
      : undefined,
    moduleSharedVars: model.moduleSharedVars?.map(redactSharedVar),
    jobSharedVars:    model.jobSharedVars?.map(redactSharedVar),
    bw6SharedLibs: model.bw6SharedLibs?.map(lib => ({
      ...lib,
      connections: lib.connections.map(c => ({ ...c, settings: redactSettings(c.settings) })),
      properties:  lib.properties.map(redactProp),
      flows: lib.flows.map(f => ({
        ...f,
        activities: f.activities.map(a => ({ ...a, settings: redactSettings(a.settings) })),
      })),
    })),
  };
}
