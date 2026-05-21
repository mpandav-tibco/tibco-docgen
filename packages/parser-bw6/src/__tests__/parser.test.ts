import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { parseBW6App, canParse } from '../index';

const SAMPLES = path.resolve(__dirname, '../../../../samples');
const bw6 = (name: string) => path.join(SAMPLES, name);

describe('canParse', () => {
  it('returns true for a BW6 app directory', () => {
    expect(canParse(bw6('order-management'))).toBe(true);
  });
  it('returns true for kafka-to-db', () => {
    expect(canParse(bw6('kafka-to-db'))).toBe(true);
  });
  it('returns false for a non-BW6 directory', () => {
    expect(canParse(path.resolve(__dirname, '../../../../../packages/core'))).toBe(false);
  });
});

describe('parseBW6App — order-management', () => {
  const model = parseBW6App(bw6('order-management'));

  it('has correct product type', () => expect(model.product).toBe('bw6'));
  it('has a non-empty app name', () => expect(model.app.name).toBeTruthy());
  it('has at least one process', () => expect(model.flows.length).toBeGreaterThan(0));
  it('every flow has at least one activity', () => {
    model.flows.forEach(f => expect(f.activities.length).toBeGreaterThan(0));
  });
  it('every flow has a diagram with positions', () => {
    model.flows.forEach(f => expect(Object.keys(f.diagram.positions).length).toBeGreaterThan(0));
  });
  it('has module properties', () => expect(model.properties.length).toBeGreaterThan(0));
  it('has no undefined activity refs', () => {
    model.flows.forEach(f =>
      f.activities.forEach(a => expect(a.ref).toBeTruthy()),
    );
  });
});

describe('parseBW6App — kafka-to-db', () => {
  const model = parseBW6App(bw6('kafka-to-db'));

  it('has a process', () => expect(model.flows.length).toBeGreaterThan(0));
  it('has at least one Kafka activity', () => {
    const allActivities = model.flows.flatMap(f => f.activities);
    const hasKafka = allActivities.some(a => a.ref.toLowerCase().includes('kafka'));
    expect(hasKafka).toBe(true);
  });
  it('has shared resources', () => expect(model.connections.length).toBeGreaterThan(0));
});

describe('parseBW6App — BookStore SOAP', () => {
  const soapDir = bw6('tibco-official/tibco.bw.sample.binding.soap.http.BookStore');
  const model = parseBW6App(soapDir);

  it('has REST/SOAP bindings', () => {
    expect((model.restBindings ?? []).length).toBeGreaterThan(0);
  });
  it('has processes', () => expect(model.flows.length).toBeGreaterThan(0));
});

describe('parseBW6App — bwceLib (shared module)', () => {
  const model = parseBW6App(bw6('bwceLib'));

  it('has product bw6', () => expect(model.product).toBe('bw6'));
  it('has flows or shared libs', () => {
    expect(model.flows.length + (model.bw6SharedLibs?.length ?? 0)).toBeGreaterThan(0);
  });
});

describe('ActivityDoc typeId field', () => {
  it('typeId is set directly on activity, not inside settings', () => {
    // Only tibco-official samples carry activityTypeID attribute
    const model = parseBW6App(bw6('tibco-official/tibco.bw.sample.binding.soap.http.BookStore'));
    const activitiesWithTypeId = model.flows
      .flatMap(f => f.activities)
      .filter(a => a.typeId);

    // At least some activities should have a typeId
    expect(activitiesWithTypeId.length).toBeGreaterThan(0);

    // typeId must NOT appear inside settings keys
    activitiesWithTypeId.forEach(a => {
      expect(Object.keys(a.settings ?? {})).not.toContain('_typeId');
    });
  });
});
