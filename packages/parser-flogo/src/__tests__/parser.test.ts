import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { parseFlogoFile, canParse } from '../index';

const SAMPLES = path.resolve(__dirname, '../../../../samples');

describe('canParse', () => {
  it('returns true for a .flogo file', () => {
    expect(canParse(path.join(SAMPLES, 'telemetry-api.flogo'))).toBe(true);
  });
  it('returns false for a directory', () => {
    expect(canParse(path.join(SAMPLES, 'order-management'))).toBe(false);
  });
  it('returns false for a non-.flogo file extension', () => {
    expect(canParse(path.join(SAMPLES, 'telemetry-api.flogo').replace('.flogo', '.json'))).toBe(false);
  });
});

describe('parseFlogoFile — telemetry-api', () => {
  const model = parseFlogoFile(path.join(SAMPLES, 'telemetry-api.flogo'));

  it('has correct product type', () => expect(model.product).toBe('flogo'));
  it('has a non-empty app name', () => expect(model.app.name).toBeTruthy());
  it('has at least one flow', () => expect(model.flows.length).toBeGreaterThan(0));
  it('has at least one trigger', () => expect(model.triggers.length).toBeGreaterThan(0));
  it('every flow has a diagram', () => {
    model.flows.forEach(f => {
      expect(f.diagram).toBeTruthy();
      expect(f.diagram.width).toBeGreaterThan(0);
    });
  });
  it('every flow has activities', () => {
    model.flows.forEach(f => expect(f.activities.length).toBeGreaterThan(0));
  });
  it('every activity has a ref', () => {
    model.flows.flatMap(f => f.activities).forEach(a => expect(a.ref).toBeTruthy());
  });
  it('generatedAt is a valid ISO date string', () => {
    expect(() => new Date(model.generatedAt).toISOString()).not.toThrow();
  });
});
