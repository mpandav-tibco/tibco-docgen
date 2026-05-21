export type ProductType = 'flogo' | 'bw5' | 'bw6' | 'ems';

export interface DocModel {
  product: ProductType;
  app: AppInfo;
  flows: FlowDoc[];
  triggers: TriggerDoc[];
  connections: ConnectionDoc[];
  properties: PropertyDoc[];
  schemas: SchemaDoc[];
  specs: SpecDoc[];
  bw6SharedLibs?: BW6SharedLibDoc[];
  /** BW6: per-profile substvar data — profile name → properties */
  profileProperties?: Record<string, PropertyDoc[]>;
  /** BW6: QA rule violation results */
  violations?: QAViolation[];
  /** BW6: cross-reference dependency map */
  crossRefs?: CrossRefDoc;
  /** Non-fatal parse warnings (missing files, skipped resources, etc.) */
  parseWarnings?: string[];
  /** BW6: REST service bindings from module.bwm */
  restBindings?: RestBindingDoc[];
  /** BW6: module-scoped and job-scoped shared variables */
  moduleSharedVars?: SharedVarDoc[];
  jobSharedVars?: SharedVarDoc[];
  generatedAt: string;
  generatedBy: string;
}

export interface BW6SharedLibDoc {
  id: string;
  name: string;
  version: string;
  description?: string;
  edition: string;
  sourceDir: string;
  palettes: string[];
  flows: FlowDoc[];
  connections: ConnectionDoc[];
  schemas: SchemaDoc[];
  properties: PropertyDoc[];
}

export interface SchemaDoc {
  name: string;
  type: string;
  value: string;
}

export interface SpecDoc {
  id: string;
  name: string;
  type: string;        // 'wsdl' | 'openapi' | 'swagger' | 'other'
  content: string;
  title?: string;      // API title extracted from content
  version?: string;    // API version
  basePath?: string;   // base URL path
  endpoints?: string[]; // list of operation paths
  // WSDL-specific parsed structure
  wsdlMessages?: WsdlMessage[];
  wsdlPortTypes?: WsdlPortType[];
  wsdlTargetNamespace?: string;
}

export interface AppInfo {
  name: string;
  description: string;
  version: string;
  sourceFile: string;
  appModel?: string;
  /** BW6: deployment target derived from TIBCO-BW-Edition */
  deploymentTarget?: 'container' | 'appspace';
  tags?: string[];
  imports?: string[];
}

export interface FlowDoc {
  id: string;
  name: string;
  description: string;
  activities: ActivityDoc[];
  links: LinkDoc[];
  diagram: FlowDiagram;
  metadata?: FlowMetadata;
  /** BW6: TIBCO plugin palette names used (jdbc, rest, ems, kafka…) — from namespace scan */
  usedPalettes?: string[];
}

export interface ActivityDoc {
  id: string;
  name: string;
  description: string;
  type: string;
  ref: string;
  typeId?: string;   // BW6: activityTypeID, e.g. "bw.generalactivities.sleep"
  settings?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: string[];  // top-level output field paths, e.g. ["fileInfo", "fileContent/textContent"]
}

export interface LinkDoc {
  id: number;
  from: string;
  to: string;
  type: 'label' | 'expression' | 'error' | 'default';
  label?: string;
  condition?: string;
}

export interface FlowDiagram {
  positions: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
}

export interface FlowMetadata {
  input: SchemaField[];
  output: SchemaField[];
}

export interface SchemaField {
  name: string;
  type: string;
  required?: boolean;
}

export interface TriggerDoc {
  id: string;
  name: string;
  description: string;
  ref: string;
  type: string;
  settings?: Record<string, unknown>;
  handlers: TriggerHandler[];
}

export interface TriggerHandler {
  name: string;
  description?: string;
  flowRef: string;
  settings?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface ConnectionDoc {
  id: string;
  name: string;
  description?: string;
  type: string;
  ref: string;
  settings?: Record<string, unknown>;
}

export interface PropertyDoc {
  name: string;
  type: string;
  value?: string;
  description?: string;
}

export interface QAViolation {
  severity: 'error' | 'warning' | 'info';
  ruleId: string;
  message: string;
  location: string;
  detail?: string;
}

export interface CrossRefDoc {
  processCallsProcess: Record<string, string[]>;
  processUsesResource: Record<string, string[]>;
  resourceUsedByProcess: Record<string, string[]>;
  processCalledBy: Record<string, string[]>;
}

export interface WsdlMessage {
  name: string;
  parts: Array<{ name: string; element?: string; type?: string }>;
}

export interface WsdlOperation {
  name: string;
  input?: string;
  output?: string;
  fault?: string;
}

export interface WsdlPortType {
  name: string;
  operations: WsdlOperation[];
}

export interface RestOperationDoc {
  method: string;        // GET | POST | PUT | DELETE | PATCH
  operationName: string; // e.g. "getbooks"
  nickname?: string;
  notes?: string;
}

export interface RestBindingDoc {
  serviceName: string;         // e.g. "books"
  path: string;                // e.g. "/books"
  basePath: string;            // e.g. "/"
  processName?: string;        // qualified process reference
  operations: RestOperationDoc[];
  bindingType?: 'rest' | 'soap'; // defaults to 'rest'
}

export interface SharedVarDoc {
  name: string;
  type: string;
  value?: string;
  description?: string;
  scope: 'module' | 'job';
}
