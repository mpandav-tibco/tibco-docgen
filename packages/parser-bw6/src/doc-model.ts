import * as fs from 'fs';
import * as path from 'path';
import { BW6ProcessDef, BW6Activity, BW6Transition } from './types';
import { FlowDoc, ActivityDoc, LinkDoc, TriggerDoc, TriggerHandler, SchemaDoc } from '@tibco-docgen/core';
import { layoutActivities, computeDiagram } from './layout';
import { findFiles } from './archive';

export function shortType(ref: string): string {
  // "com.tibco.bw.palette.jdbc.runtime.JDBCQueryActivity" → "JDBCQueryActivity"
  return ref.split('.').pop() ?? ref;
}

export function processToFlow(proc: BW6ProcessDef): FlowDoc {
  const activities: ActivityDoc[] = proc.activities.map(a => {
    const settings: Record<string, unknown> = { ...a.config };
    return {
      id:          a.name,
      name:        a.name,
      description: a.description ?? '',
      type:        shortType(a.type),
      ref:         a.type,
      typeId:      a.typeId,
      settings:    Object.keys(settings).length > 0 ? settings : undefined,
      input:       a.inputMappings && Object.keys(a.inputMappings).length > 0 ? a.inputMappings : undefined,
      output:      a.outputFields && a.outputFields.length > 0 ? a.outputFields : undefined,
    };
  });

  const links: LinkDoc[] = proc.transitions.map((t, i) => ({
    id:        i,
    from:      t.from,
    to:        t.to,
    type:      mapConditionType(t.conditionType),
    label:     t.label,
    condition: t.conditionExpression,
  }));

  return {
    id:          proc.name,
    // "Processes/GetOrder" → "GetOrder"  |  "kafkatopic_to_db.module.MP_KafkaReceiver" → "MP_KafkaReceiver"
    name:        proc.name.split(/[./\\]/).filter(Boolean).pop() ?? proc.name,
    description: proc.description ?? '',
    activities,
    links,
    diagram:     computeDiagram(proc.activities, proc.transitions),
    usedPalettes: proc.usedPalettes,
  };
}

export function mapConditionType(ct: string): 'label' | 'expression' | 'error' | 'default' {
  if (ct === 'expression')                    return 'expression';
  if (ct === 'error')                         return 'error';
  if (ct === 'otherwise' || ct === 'default') return 'default';
  return 'label'; // "always" and everything else
}

export function extractTriggers(processes: BW6ProcessDef[], appName: string): TriggerDoc[] {
  const triggers: TriggerDoc[] = [];
  for (const proc of processes) {
    const triggerAct = proc.activities.find(a => isTriggerActivity(a.type));
    if (!triggerAct) continue;
    const handler: TriggerHandler = {
      name:        path.basename(proc.name),
      description: proc.description,
      flowRef:     proc.name,
      settings:    Object.keys(triggerAct.config).length > 0 ? triggerAct.config : undefined,
    };
    triggers.push({
      id:          `${appName}/${triggerAct.name}`,
      name:        triggerAct.name,
      description: triggerAct.description ?? '',
      ref:         triggerAct.type,
      type:        shortType(triggerAct.type),
      settings:    Object.keys(triggerAct.config).length > 0 ? triggerAct.config : undefined,
      handlers:    [handler],
    });
  }
  return triggers;
}

export function isTriggerActivity(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t.includes('receiveeventsactivity') ||
    t.includes('restbindingactivity')   ||
    t.includes('httpreceive')           ||
    t.includes('timer')                 ||
    t.includes('emssubscrib')           ||
    t.includes('jmssubscrib')           ||
    t.includes('kafkaconsumer')         ||
    t.includes('kafkasubscrib')
  );
}

export function parseXsdSchemas(appDir: string): { name: string; type: string; value: string }[] {
  const schemasDir = path.join(appDir, 'Schemas');
  if (!fs.existsSync(schemasDir)) return [];
  return findFiles(schemasDir, '.xsd').map(f => ({
    name: path.basename(f),
    type: 'xsd',
    value: fs.readFileSync(f, 'utf8'),
  }));
}
