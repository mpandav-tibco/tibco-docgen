export type ProductType = 'flogo' | 'bw5' | 'bw6' | 'ems';
export interface DocModel {
    product: ProductType;
    app: AppInfo;
    flows: FlowDoc[];
    triggers: TriggerDoc[];
    connections: ConnectionDoc[];
    properties: PropertyDoc[];
    generatedAt: string;
}
export interface AppInfo {
    name: string;
    description: string;
    version: string;
    sourceFile: string;
    appModel?: string;
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
}
export interface ActivityDoc {
    id: string;
    name: string;
    description: string;
    type: string;
    ref: string;
    settings?: Record<string, unknown>;
    inputSchema?: string;
    outputSchema?: string;
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
    positions: Record<string, {
        x: number;
        y: number;
    }>;
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
//# sourceMappingURL=model.d.ts.map