"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderMarkdown = renderMarkdown;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function esc(s) {
    return String(s).replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function shortRef(ref) {
    return ref.replace(/^#/, '').split('/').pop() ?? ref;
}
function renderFlowMd(flow) {
    const actTable = [
        '| ID | Name | Type | Description |',
        '|---|---|---|---|',
        ...flow.activities.map(a => `| \`${esc(a.id)}\` | ${esc(a.name)} | \`${esc(shortRef(a.ref))}\` | ${esc(a.description || '—')} |`),
    ].join('\n');
    const linkTable = [
        '| From | To | Type | Condition |',
        '|---|---|---|---|',
        ...flow.links.map(l => `| \`${esc(l.from)}\` | \`${esc(l.to)}\` | ${l.type} | ${esc(l.condition || '—')} |`),
    ].join('\n');
    const inputTable = flow.metadata?.input?.length
        ? [
            '| Name | Type | Required |',
            '|---|---|---|',
            ...flow.metadata.input.map(f => `| ${esc(f.name)} | \`${esc(f.type)}\` | ${f.required ? 'Yes' : 'No'} |`),
        ].join('\n')
        : '';
    const outputTable = flow.metadata?.output?.length
        ? [
            '| Name | Type |',
            '|---|---|',
            ...flow.metadata.output.map(f => `| ${esc(f.name)} | \`${esc(f.type)}\` |`),
        ].join('\n')
        : '';
    return `### ${flow.name}

${flow.description ? `> ${flow.description}\n` : ''}
**Flow ID:** \`${flow.id}\`
**Activities:** ${flow.activities.length} | **Transitions:** ${flow.links.length}

${inputTable ? `#### Input Parameters\n\n${inputTable}\n` : ''}
${outputTable ? `#### Output Parameters\n\n${outputTable}\n` : ''}

#### Activities

${actTable}

#### Transitions

${linkTable}

---
`;
}
function renderMarkdown(model, outputDir) {
    const { app, flows, triggers, connections, properties } = model;
    const lines = [
        `# ${app.name}`,
        '',
        app.description ? `> ${app.description}\n` : '',
        `**Version:** ${app.version}  `,
        app.appModel ? `**App Model:** ${app.appModel}  ` : '',
        `**Product:** ${model.product}  `,
        `**Generated:** ${new Date(model.generatedAt).toLocaleString()}  `,
        '',
        '---',
        '',
        '## Summary',
        '',
        `| Metric | Count |`,
        `|---|---|`,
        `| Flows | ${flows.length} |`,
        `| Triggers | ${triggers.length} |`,
        `| Connections | ${connections.length} |`,
        `| Properties | ${properties.length} |`,
        `| Total Activities | ${flows.reduce((n, f) => n + f.activities.length, 0)} |`,
        '',
        '---',
        '',
        '## Triggers',
        '',
    ];
    if (triggers.length) {
        lines.push('| Trigger | Type | Handler | Flow |');
        lines.push('|---|---|---|---|');
        for (const t of triggers) {
            for (const h of t.handlers) {
                lines.push(`| ${esc(t.name)} | \`${esc(shortRef(t.ref))}\` | ${esc(h.name)} | ${esc(h.flowRef)} |`);
            }
        }
        lines.push('');
    }
    else {
        lines.push('_No triggers defined._\n');
    }
    lines.push('---', '', '## Flows', '');
    for (const flow of flows) {
        lines.push(renderFlowMd(flow));
    }
    if (connections.length) {
        lines.push('---', '', '## Connections', '');
        lines.push('| Name | Type | Ref |');
        lines.push('|---|---|---|');
        for (const c of connections) {
            lines.push(`| ${esc(c.name)} | ${esc(c.type)} | \`${esc(c.ref)}\` |`);
        }
        lines.push('');
    }
    if (properties.length) {
        lines.push('---', '', '## App Properties', '');
        lines.push('| Name | Type | Value |');
        lines.push('|---|---|---|');
        for (const p of properties) {
            lines.push(`| ${esc(p.name)} | \`${esc(p.type)}\` | ${p.value !== undefined ? `\`${esc(String(p.value))}\`` : '—'} |`);
        }
        lines.push('');
    }
    if (app.imports?.length) {
        lines.push('---', '', '## Imports', '');
        for (const i of app.imports) {
            lines.push(`- \`${i}\``);
        }
    }
    fs.writeFileSync(path.join(outputDir, 'index.md'), lines.join('\n'), 'utf8');
}
//# sourceMappingURL=markdown.js.map