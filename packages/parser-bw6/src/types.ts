export interface BW6ProcessDef {
  name: string;           // e.g., "Processes/GetOrder"
  description?: string;
  startName?: string;
  activities: BW6Activity[];
  transitions: BW6Transition[];
  /** TIBCO plugin palette names detected via namespace scan (jdbc, rest, ems, kafka…) */
  usedPalettes?: string[];
  /** Raw .bwp file content for pattern-based checks (xsl:choose, tib:render-xml, etc.) */
  rawContent?: string;
}

export interface BW6Activity {
  name: string;           // value of @name attribute
  type: string;           // Java class name, e.g., "com.tibco.bw.palette.jdbc.runtime.JDBCQueryActivity"
  resourceType?: string;
  description?: string;
  config: Record<string, unknown>;
  inputMappings?: Record<string, unknown>; // target → source XPath/expression from XSLT inputBindings
  outputFields?: string[];  // top-level output field paths from bpws:variables + tibex:Types XSD
  typeId?: string;          // activityTypeID from BWActivity, e.g. "bw.generalactivities.sleep"
}

export interface BW6Transition {
  from: string;
  to: string;
  conditionType: string;  // "always" | "expression" | "error" | "otherwise"
  conditionExpression?: string;
  label?: string;
}

export interface BW6AppManifest {
  bundleName: string;
  bundleSymbolicName: string;
  bundleVersion: string;
  description: string;
  edition: string;           // TIBCO-BW-Edition: "BW" | "BWCE" | "BWE" | "BWCF"
  bwVersion: string;         // TIBCO-BW-Version: e.g. "6.12.0 V23 2025-08-20"
  requireBundle: string[];   // from Require-Bundle or Require-Capability
  requiredModules: string[]; // com.tibco.bw.module names from Require-Capability
  configProfiles: string[];  // substvar profile file basenames
  isSharedModule: boolean;   // true if TIBCO-BW-SharedModule is set
  // Paths declared in MANIFEST.MF for key module files
  msvPath: string;           // TIBCO-BW-ModuleSharedVariables (relative path)
  jsvPath: string;           // TIBCO-BW-JobSharedVariables (relative path)
  bwmPath: string;           // TIBCO-BW-ApplicationModule (relative path)
  hasRequireCapability: boolean; // true if Require-Capability present (BWCE signal)
}

export interface BW6SubstVar {
  name: string;
  type: string;
  value: string;
  description?: string;
}

export interface BW6SharedResource {
  id: string;
  name: string;
  description?: string;
  type: string;           // short type name, e.g., "JDBCConnectionResource"
  ref: string;            // full XML root element name
  settings: Record<string, unknown>;
}
