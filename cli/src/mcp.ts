import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

import { parseBW6App, parseBW6Ear, parseBW6Zip, canParse as canParseBW6 } from '@tibco-docgen/parser-bw6';
import { parseFlogoFile, canParse as canParseFlogo } from '@tibco-docgen/parser-flogo';
import { parseEMSConfig, canParse as canParseEMS } from '@tibco-docgen/parser-ems';
import { generateDocs } from './index';

// ─── Tool schemas ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'generate_docs',
    description:
      'Generate documentation for a TIBCO application (BW6, Flogo, or EMS). ' +
      'Accepts a BW6 app directory, .flogo file, EMS config directory, or a .ear/.zip archive. ' +
      'Produces HTML output and returns the output path plus an app summary.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project_dir: {
          type: 'string',
          description:
            'Absolute path to the TIBCO project: a BW6 app directory, .flogo file, ' +
            'EMS config directory, or a .ear/.zip archive.',
        },
        output_dir: {
          type: 'string',
          description: 'Output directory. Defaults to <project_dir>/docgen-out.',
        },
        format: {
          type: 'string',
          enum: ['html', 'md', 'json', 'all'],
          description: 'Output format. Default: html.',
        },
      },
      required: ['project_dir'],
    },
  },
  {
    name: 'get_project_model',
    description:
      'Parse a TIBCO application and return its documentation model as structured JSON ' +
      'without writing any files. Returns app metadata, processes with activities and transitions, ' +
      'shared resources, module properties, schemas, and QA violations. ' +
      'Use this to query or analyze the application structure programmatically.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project_dir: {
          type: 'string',
          description:
            'Absolute path to the TIBCO project: a BW6 app directory, .flogo file, ' +
            'EMS config directory, or a .ear/.zip archive.',
        },
      },
      required: ['project_dir'],
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], isError };
}

function parseProject(projectDir: string) {
  if (!fs.existsSync(projectDir)) {
    throw new Error(`Path not found: ${projectDir}`);
  }
  const stat = fs.statSync(projectDir);
  if (stat.isFile()) {
    if (canParseFlogo(projectDir)) return parseFlogoFile(projectDir);
    if (canParseBW6(projectDir)) {
      const ext = path.extname(projectDir).toLowerCase();
      return ext === '.ear' ? parseBW6Ear(projectDir) : parseBW6Zip(projectDir);
    }
    throw new Error(`Unsupported file type: ${path.extname(projectDir)}`);
  }
  if (canParseEMS(projectDir))  return parseEMSConfig(projectDir);
  if (canParseBW6(projectDir))  return parseBW6App(projectDir);
  const flogoFiles = fs.readdirSync(projectDir).filter(f => f.endsWith('.flogo'));
  if (flogoFiles.length > 0) return parseFlogoFile(path.join(projectDir, flogoFiles[0]));
  throw new Error('No supported TIBCO project found in the given path');
}

function modelSummary(model: Record<string, unknown>) {
  return {
    product:         model['product'],
    appName:         (model['app'] as Record<string, unknown>)?.['name'],
    appVersion:      (model['app'] as Record<string, unknown>)?.['version'],
    processCount:    (model['flows'] as unknown[])?.length ?? 0,
    triggerCount:    (model['triggers'] as unknown[])?.length ?? 0,
    connectionCount: (model['connections'] as unknown[])?.length ?? 0,
    propertyCount:   (model['properties'] as unknown[])?.length ?? 0,
    schemaCount:     (model['schemas'] as unknown[])?.length ?? 0,
    violations:      (model['violations'] as unknown[])?.length ?? 0,
    parseWarnings:   model['parseWarnings'],
  };
}

// ─── MCP server ───────────────────────────────────────────────────────────────

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'tibco-docgen', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const a = (args ?? {}) as Record<string, unknown>;

    if (name === 'generate_docs') {
      const projectDir = String(a['project_dir'] ?? '').trim();
      if (!projectDir) return textResult('project_dir is required', true);

      const outputDir = a['output_dir']
        ? String(a['output_dir'])
        : path.join(projectDir, 'docgen-out');

      const fmt = String(a['format'] ?? 'html');
      const format = (['html', 'md', 'json', 'all'].includes(fmt)
        ? fmt : 'html') as 'html' | 'md' | 'json' | 'all';

      const logLines: string[] = [];
      let result;
      try {
        result = await generateDocs(projectDir, outputDir, format, (m) => logLines.push(m));
      } catch (err) {
        return textResult(`Error generating docs: ${(err as Error).message}`, true);
      }
      if (!result.success) {
        return textResult(`Generation failed: ${result.error ?? 'unknown error'}`, true);
      }
      const htmlUrl = `file://${result.outputDir.replace(/\\/g, '/')}/index.html`;
      return textResult(JSON.stringify({ success: true, outputDir: result.outputDir, htmlUrl, format, log: logLines.join('').trim() }, null, 2));
    }

    if (name === 'get_project_model') {
      const projectDir = String(a['project_dir'] ?? '').trim();
      if (!projectDir) return textResult('project_dir is required', true);
      let model;
      try {
        model = parseProject(projectDir);
      } catch (err) {
        return textResult(`Error parsing project: ${(err as Error).message}`, true);
      }
      const raw = model as unknown as Record<string, unknown>;
      return textResult(JSON.stringify({ summary: modelSummary(raw), model }, null, 2));
    }

    return textResult(`Unknown tool: ${name}`, true);
  });

  process.stderr.write('tibco-docgen MCP server running on stdio\n');
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
