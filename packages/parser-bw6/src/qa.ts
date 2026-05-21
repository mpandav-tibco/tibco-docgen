import { DocModel, QAViolation, CrossRefDoc, ConnectionDoc } from '@tibco-docgen/core';
import { BW6ProcessDef } from './types';
import { PropertyDoc } from '@tibco-docgen/core';
import { isTriggerActivity } from './doc-model';

const IP_PATTERN = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
const GENERIC_ACT_NAMES = /^(Mapper|Log|Logger|Map|Mapping|Activity|Invoke|Reply|Receive|Mapper_\d+|Log_\d+|Activity_\d+|Invoke_\d+)$/i;
const CRED_PROP_NAMES = /password|secret|credential|apikey|api.key|token|passphrase/i;
const CONN_VAL_FIELDS = new Set(['url', 'host', 'endpoint', 'jdbcurl', 'serverurl', 'connectionurl']);
const HARDCODED_CONN_RE = /^(https?:\/\/|jdbc:|amqp:\/\/|ftp:\/\/|tcp:\/\/)/i;

export function analyzeQA(
  processes: BW6ProcessDef[],
  properties: PropertyDoc[],
  imports: string[],
  serviceBindingProcessNames: Set<string> = new Set(),
  processCalledBy: Record<string, string[]> = {},
  processCallsProcess: Record<string, string[]> = {},
  connections: ConnectionDoc[] = [],
  crossRefs?: CrossRefDoc,
): QAViolation[] {
  const violations: QAViolation[] = [];
  const processShortNames = new Set(processes.map(p => p.name.split(/[./\\]/).filter(Boolean).pop() ?? p.name));

  for (const proc of processes) {
    const procShort = proc.name.split(/[./\\]/).filter(Boolean).pop() ?? proc.name;

    // PROC-001: no trigger/starter — exempt sub-processes (called by others) and service-bound processes
    const hasTrigger = proc.activities.some(a => isTriggerActivity(a.type));
    const isBoundByService = serviceBindingProcessNames.has(proc.name) || serviceBindingProcessNames.has(procShort);
    const isCalledByOthers = (processCalledBy[procShort]?.length ?? 0) > 0;
    if (!hasTrigger && !isBoundByService && !isCalledByOthers && proc.activities.length > 0) {
      violations.push({
        severity: 'error', ruleId: 'PROC-001',
        message: `Process "${procShort}" has no Process Starter`,
        location: `Process: ${procShort}`,
        detail: 'Add an HTTP Receiver, Timer, EMS Subscriber, or other starter activity',
      });
    }

    // PROC-002: no description
    if (!proc.description?.trim()) {
      violations.push({
        severity: 'warning', ruleId: 'PROC-002',
        message: `Process "${procShort}" has no description`,
        location: `Process: ${procShort}`,
      });
    }

    // PROC-003: too many activities
    const bodyActs = proc.activities.filter(a => a.name !== 'Start' && a.name !== 'End');
    if (bodyActs.length > 20) {
      violations.push({
        severity: 'warning', ruleId: 'PROC-003',
        message: `Process "${procShort}" has ${bodyActs.length} activities (complexity > 20)`,
        location: `Process: ${procShort}`,
        detail: 'Consider breaking into smaller sub-processes',
      });
    }

    // NAMING-001: PascalCase convention
    if (procShort && !/^[A-Z]/.test(procShort)) {
      violations.push({
        severity: 'info', ruleId: 'NAMING-001',
        message: `Process "${procShort}" does not start with uppercase (PascalCase convention)`,
        location: `Process: ${procShort}`,
      });
    }

    for (const act of proc.activities) {
      const isStartEnd = act.name === 'Start' || act.name === 'End';

      // ACT-002: no description (non-trivial activities)
      if (!isStartEnd && !act.description?.trim()) {
        violations.push({
          severity: 'info', ruleId: 'ACT-002',
          message: `Activity "${act.name}" in "${procShort}" has no description`,
          location: `Activity: ${procShort} / ${act.name}`,
        });
      }

      // NAMING-002: generic default name
      if (!isStartEnd && GENERIC_ACT_NAMES.test(act.name)) {
        violations.push({
          severity: 'info', ruleId: 'NAMING-002',
          message: `Activity "${act.name}" in "${procShort}" uses a generic default name`,
          location: `Activity: ${procShort} / ${act.name}`,
          detail: 'Use descriptive names that indicate business purpose',
        });
      }

      // ACT-001: hardcoded connection URL in config
      for (const [key, val] of Object.entries(act.config)) {
        if (typeof val !== 'string' || !val) continue;
        const keyL = key.toLowerCase();
        if (CONN_VAL_FIELDS.has(keyL) || keyL.endsWith('url') || keyL.endsWith('host')) {
          if (!val.includes('%%{') && !val.includes('${') &&
              (HARDCODED_CONN_RE.test(val) || IP_PATTERN.test(val))) {
            violations.push({
              severity: 'error', ruleId: 'ACT-001',
              message: `Activity "${act.name}" has a hardcoded connection value for "${key}"`,
              location: `Activity: ${procShort} / ${act.name}`,
              detail: `"${val.slice(0, 60)}" — use a substitution variable %%{VAR_NAME}%%`,
            });
            break;
          }
        }
      }

      // XREF-001: Call Process targeting unknown process
      if (act.type.toLowerCase().includes('callprocess')) {
        const calledRaw = act.config['processName'] ?? act.config['process'] ?? act.config['calledProcessName'];
        if (calledRaw && typeof calledRaw === 'string') {
          const calledShort = calledRaw.split('/').pop() ?? calledRaw;
          if (!processShortNames.has(calledShort) && !processShortNames.has(calledRaw)) {
            violations.push({
              severity: 'warning', ruleId: 'XREF-001',
              message: `Process "${procShort}" calls "${calledShort}" which is not found in this project`,
              location: `Activity: ${procShort} / ${act.name}`,
              detail: 'May be in a SharedLib or external module',
            });
          }
        }
      }

      // SB-003: JDBC query uses SELECT * wildcard (sonar-bw: JDBCWildcards)
      if (!isStartEnd && (act.type.toLowerCase().includes('jdbc') || act.type.toLowerCase().includes('sql'))) {
        for (const [key, val] of Object.entries(act.config)) {
          if (typeof val !== 'string') continue;
          const keyL = key.toLowerCase();
          if (keyL.includes('statement') || keyL.includes('query') || keyL === 'sql') {
            if (/SELECT\s+\*/i.test(val)) {
              violations.push({
                severity: 'warning', ruleId: 'SB-003',
                message: `JDBC activity "${act.name}" in "${procShort}" uses SELECT *`,
                location: `Activity: ${procShort} / ${act.name}`,
                detail: 'Specify column names instead of wildcard — reduces data transfer and prevents schema breakage',
              });
              break;
            }
          }
        }
      }
    }

    // SB-001: Conditional transitions without a label (sonar-bw: TransitionLabels)
    for (const t of proc.transitions) {
      if (t.conditionType === 'expression' && !t.label?.trim()) {
        violations.push({
          severity: 'info', ruleId: 'SB-001',
          message: `Transition from "${t.from}" to "${t.to}" in "${procShort}" has no label`,
          location: `Transition: ${procShort} / ${t.from} → ${t.to}`,
          detail: 'Conditional transitions should have descriptive labels for readability',
        });
      }
    }

    // SB-002: Entry-point process with no exception handling (sonar-bw: ExceptionHandlingCheck)
    const isEntryPoint = hasTrigger || isBoundByService;
    if (isEntryPoint && proc.activities.length > 2) {
      const hasErrorTransition = proc.transitions.some(t => t.conditionType === 'error');
      const hasCatchActivity = proc.activities.some(a =>
        a.type.toLowerCase().includes('catch') || a.type.toLowerCase().includes('errorcatch') ||
        a.name.toLowerCase().startsWith('catch'),
      );
      if (!hasErrorTransition && !hasCatchActivity) {
        violations.push({
          severity: 'info', ruleId: 'SB-002',
          message: `Process "${procShort}" has no exception handler`,
          location: `Process: ${procShort}`,
          detail: 'Add error transitions or a catch group to handle unexpected failures gracefully',
        });
      }
    }

    // SB-004: xsl:choose in mapper without xsl:otherwise (sonar-bw: ChoiceWithNoOtherwise)
    if (proc.rawContent) {
      const chooseCount   = (proc.rawContent.match(/<xsl:choose/g)    ?? []).length;
      const otherwiseCount = (proc.rawContent.match(/<xsl:otherwise/g) ?? []).length;
      if (chooseCount > 0 && otherwiseCount < chooseCount) {
        violations.push({
          severity: 'warning', ruleId: 'SB-004',
          message: `Process "${procShort}" has xsl:choose block(s) without xsl:otherwise`,
          location: `Process: ${procShort}`,
          detail: 'Every xsl:choose should include an xsl:otherwise clause to handle unmatched cases',
        });
      }
    }

    // SB-005: Log activity in entry-point process (sonar-bw: LogSubprocess)
    if (isEntryPoint) {
      for (const a of proc.activities) {
        const typeL = a.type.toLowerCase();
        if (typeL === 'com.tibco.bw.palette.generalactivities.runtime.logactivity' ||
            (typeL.includes('generalactivities') && typeL.includes('log'))) {
          violations.push({
            severity: 'info', ruleId: 'SB-005',
            message: `Log activity "${a.name}" in entry-point process "${procShort}" should be in a subprocess`,
            location: `Activity: ${procShort} / ${a.name}`,
            detail: 'Centralise logging in reusable subprocesses for consistency and maintainability',
          });
        }
      }
    }

    // SB-006: Unneeded empty pass-through activity (sonar-bw: UnneededEmptyActivity)
    for (const a of proc.activities) {
      if (a.name === 'Start' || a.name === 'End') continue;
      const typeL = a.type.toLowerCase();
      if (!typeL.includes('empty') && !typeL.includes('bpwsempty')) continue;
      const incoming = proc.transitions.filter(t => t.to   === a.name);
      const outgoing = proc.transitions.filter(t => t.from === a.name);
      if (incoming.length === 1 && outgoing.length === 1 && incoming[0].conditionType !== 'error') {
        violations.push({
          severity: 'info', ruleId: 'SB-006',
          message: `Empty activity "${a.name}" in "${procShort}" is a no-op pass-through`,
          location: `Activity: ${procShort} / ${a.name}`,
          detail: 'Remove empty activities with exactly one input and one output transition — they add no logic',
        });
      }
    }

    // SB-008: tib:render-xml with pretty-print=true (sonar-bw: RenderXmlPrettyPrint)
    if (proc.rawContent && /tib:render-xml\s*\([^,)]+,[^,)]+,\s*true\(\)/i.test(proc.rawContent)) {
      violations.push({
        severity: 'info', ruleId: 'SB-008',
        message: `Process "${procShort}" uses tib:render-xml with pretty-print enabled`,
        location: `Process: ${procShort}`,
        detail: 'Remove true() from tib:render-xml — pretty-print adds whitespace overhead and hurts performance',
      });
    }

    // SB-009: Activity with multiple conditional outgoing transitions but no otherwise (sonar-bw: NoOtherwiseCheck)
    for (const a of proc.activities) {
      if (a.name === 'Start' || a.name === 'End') continue;
      const outgoing = proc.transitions.filter(t => t.from === a.name);
      if (outgoing.length < 2) continue;
      const expressionCount = outgoing.filter(t => t.conditionType === 'expression').length;
      const hasOtherwise = outgoing.some(t =>
        t.conditionType === 'otherwise' || t.conditionType === 'default' || t.conditionType === 'always',
      );
      if (expressionCount >= 2 && !hasOtherwise) {
        violations.push({
          severity: 'warning', ruleId: 'SB-009',
          message: `Activity "${a.name}" in "${procShort}" has ${expressionCount} conditional transitions but no otherwise/default`,
          location: `Activity: ${procShort} / ${a.name}`,
          detail: 'Add an otherwise transition to handle unmatched conditions and prevent process stalls',
        });
      }
    }
  }

  // SB-007: Shared resource not referenced by any process (sonar-bw: SharedResourcesNotUsed)
  for (const conn of connections) {
    const usedByProcs = crossRefs?.resourceUsedByProcess[conn.name] ?? [];
    if (usedByProcs.length === 0) {
      violations.push({
        severity: 'info', ruleId: 'SB-007',
        message: `Shared resource "${conn.name}" is not used by any process`,
        location: `Shared Resource: ${conn.name}`,
        detail: 'Remove unused shared resources to reduce maintenance overhead',
      });
    }
  }

  // Substvar / Module Property checks
  for (const prop of properties) {
    const val = prop.value ?? '';

    // SUBSTVAR-001: hardcoded IP
    if (IP_PATTERN.test(val)) {
      violations.push({
        severity: 'error', ruleId: 'SUBSTVAR-001',
        message: `Property "${prop.name}" contains a hardcoded IP address`,
        location: `Module Property: ${prop.name}`,
        detail: `Value: ${val}`,
      });
    }

    // SUBSTVAR-002: credential with plaintext value
    const isEncrypted = val.startsWith('#!');
    const isEmpty = !val.trim();
    if (CRED_PROP_NAMES.test(prop.name) && !isEncrypted && !isEmpty) {
      violations.push({
        severity: 'warning', ruleId: 'SUBSTVAR-002',
        message: `Property "${prop.name}" looks like a credential but has a plaintext value`,
        location: `Module Property: ${prop.name}`,
        detail: 'Use BW password encryption for credential properties',
      });
    }

    // SUBSTVAR-003: empty value (skip credential props — often intentionally blank)
    const isBwSystem = prop.name.startsWith('BW.');
    if (isEmpty && !CRED_PROP_NAMES.test(prop.name) && !isBwSystem) {
      violations.push({
        severity: 'warning', ruleId: 'SUBSTVAR-003',
        message: `Property "${prop.name}" has no default value`,
        location: `Module Property: ${prop.name}`,
        detail: 'Consider providing a sensible default for documentation and dev testing',
      });
    }
  }

  // SUBSTVAR-004: property defined but never referenced in any process config or XSLT
  const allActivityText = processes.flatMap(p => p.activities).map(a => {
    const cfgStr = JSON.stringify(a.config);
    const mapStr = JSON.stringify(a.inputMappings ?? {});
    return cfgStr + mapStr;
  }).join(' ');
  for (const prop of properties) {
    const isBwSystem = prop.name.startsWith('BW.');
    if (isBwSystem) continue;
    // Check if %%{PropName}%% or bw:getModuleProperty('/...PropName') appears anywhere
    const shortName = prop.name.split('/').pop() ?? prop.name;
    const isReferenced = allActivityText.includes(`%%{${prop.name}`) ||
                         allActivityText.includes(`%%{${shortName}`) ||
                         allActivityText.includes(prop.name);
    if (!isReferenced) {
      violations.push({
        severity: 'info', ruleId: 'SUBSTVAR-004',
        message: `Module property "${prop.name}" is defined but not referenced in any process`,
        location: `Module Property: ${prop.name}`,
        detail: 'May be unused or referenced only in shared resources / external config',
      });
    }
  }

  // PALETTE-001: palette imported but no activity from it used in any process
  const allActivityTypes = processes.flatMap(p => p.activities).map(a => a.type.toLowerCase());
  for (const imp of imports) {
    const palName = imp.split('.').find((_, i, arr) =>
      arr[i - 1] === 'palette' || arr[i - 1] === 'bw') ?? '';
    if (!palName || palName === 'palette') continue;
    const isUsed = allActivityTypes.some(t => t.includes(palName.toLowerCase()));
    if (!isUsed) {
      violations.push({
        severity: 'info', ruleId: 'PALETTE-001',
        message: `Palette "${palName}" is declared but no activity from it is used`,
        location: `Palette: ${imp}`,
        detail: 'Consider removing unused palette dependencies to reduce bundle size',
      });
    }
  }

  // PROC-006: circular call chain detection via DFS on processCallsProcess graph
  if (Object.keys(processCallsProcess).length > 0) {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const reportedCycleKeys = new Set<string>();

    const dfs = (node: string, stack: string[]): void => {
      if (inStack.has(node)) {
        const cycleStart = stack.indexOf(node);
        if (cycleStart !== -1) {
          const cycle = stack.slice(cycleStart);
          const key = [...cycle].sort().join('\0');
          if (!reportedCycleKeys.has(key)) {
            reportedCycleKeys.add(key);
            violations.push({
              severity: 'error', ruleId: 'PROC-006',
              message: `Circular call chain: ${[...cycle, node].join(' → ')}`,
              location: `Process: ${cycle[0]}`,
              detail: 'Circular process calls cause infinite loops at runtime',
            });
          }
        }
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      inStack.add(node);
      stack.push(node);
      for (const neighbor of processCallsProcess[node] ?? []) {
        dfs(neighbor, stack);
      }
      stack.pop();
      inStack.delete(node);
    };

    for (const node of Object.keys(processCallsProcess)) {
      if (!visited.has(node)) dfs(node, []);
    }
  }

  return violations;
}

// ─── Cross-Reference Analysis ─────────────────────────────────────────────────

const CONN_CONFIG_KEYS = ['connectionName', 'connection', 'jndiDataSourceId', 'datasource',
  'queueConnectionFactory', 'topicConnectionFactory', 'jmsConnection', 'kafkaConnection'];

export function analyzeCrossRefs(processes: BW6ProcessDef[], connections: ConnectionDoc[]): CrossRefDoc {
  const processCallsProcess: Record<string, string[]> = {};
  const processUsesResource: Record<string, string[]> = {};
  const resourceUsedByProcess: Record<string, string[]> = {};
  const processCalledBy: Record<string, string[]> = {};

  for (const proc of processes) {
    const procShort = proc.name.split('/').pop() ?? proc.name;
    const calledProcs: string[] = [];
    const usedRes: string[] = [];

    for (const act of proc.activities) {
      const typeL = act.type.toLowerCase();

      // Process → subprocess
      if (typeL.includes('callprocess')) {
        const calledRaw = act.config['processName'] ?? act.config['process'] ?? act.config['calledProcessName'];
        if (calledRaw && typeof calledRaw === 'string') {
          const calledShort = calledRaw.split('/').pop() ?? calledRaw;
          if (!calledProcs.includes(calledShort)) calledProcs.push(calledShort);
          if (!processCalledBy[calledShort]) processCalledBy[calledShort] = [];
          if (!processCalledBy[calledShort].includes(procShort)) processCalledBy[calledShort].push(procShort);
        }
      }

      // Process → resource (by connection config field)
      for (const key of CONN_CONFIG_KEYS) {
        const val = act.config[key];
        if (!val || typeof val !== 'string') continue;
        const matched = connections.find(c =>
          val.toLowerCase().includes(c.name.toLowerCase()) ||
          c.id.toLowerCase().includes(val.toLowerCase()));
        const resName = matched?.name ?? val.split('/').pop() ?? val;
        if (!usedRes.includes(resName)) usedRes.push(resName);
        if (!resourceUsedByProcess[resName]) resourceUsedByProcess[resName] = [];
        if (!resourceUsedByProcess[resName].includes(procShort)) resourceUsedByProcess[resName].push(procShort);
        break;
      }
    }

    if (calledProcs.length > 0) processCallsProcess[procShort] = calledProcs;
    if (usedRes.length > 0) processUsesResource[procShort] = usedRes;
  }

  return { processCallsProcess, processUsesResource, resourceUsedByProcess, processCalledBy };
}
