export interface FlogoApp {
  name: string;
  description?: string;
  version: string;
  type: string;
  appModel?: string;
  tags?: string[];
  imports?: string[];
  triggers?: FlogoTrigger[];
  resources?: FlogoResource[];
  properties?: FlogoProperty[];
  connections?: Record<string, FlogoConnection>;
  schemas?: Record<string, FlogoAppSchema>;
  specs?: Record<string, FlogoAppSpec>;
  contrib?: string;
  metadata?: { endpoints?: unknown[]; flogoVersion?: string };
}

export interface FlogoTrigger {
  ref: string;
  name: string;
  description?: string;
  id: string;
  settings?: Record<string, unknown>;
  handlers: FlogoHandler[];
}

export interface FlogoHandler {
  name: string;
  description?: string;
  settings?: Record<string, unknown>;
  action: {
    ref: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    settings?: { flowURI?: string; [key: string]: unknown };
  };
}

export interface FlogoResource {
  id: string;
  data: FlogoResourceData;
}

export interface FlogoResourceData {
  name: string;
  description?: string;
  links?: FlogoLink[];
  tasks?: FlogoTask[];
  fe_metadata?: string;
  metadata?: {
    input?: FlogoSchemaField[];
    output?: FlogoSchemaField[];
    fe_metadata?: unknown;
  };
  errorHandler?: {
    tasks?: FlogoTask[];
    links?: FlogoLink[];
  };
}

export interface FlogoTask {
  id: string;
  name: string;
  description?: string;
  activity: {
    ref: string;
    settings?: Record<string, unknown>;
    input?: Record<string, unknown>;
    schemas?: Record<string, unknown>;
  };
}

export interface FlogoLink {
  id: number;
  from: string;
  to: string;
  type: string;
  label?: string;
  value?: string;
}

export interface FlogoProperty {
  name: string;
  type: string;
  value?: unknown;
  description?: string;
}

export interface FlogoConnection {
  id: string;
  name?: string;
  description?: string;
  ref: string;
  settings?: Record<string, unknown>;
}

export interface FlogoSchemaField {
  name: string;
  type: string;
  required?: boolean;
  schema?: string | { type: string; value: string };
}

export interface FlogoAppSchema {
  type: string;
  value: string;
  fe_metadata?: string;
}

export interface FlogoAppSpec {
  id: string;
  name: string;
  type: string;
  content: string;
}
