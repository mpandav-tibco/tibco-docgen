# TIBCO DocGen

Generates **HTML, PDF, Markdown, and JSON** documentation for TIBCO **Flogo**, **BusinessWorks 6 / BWCE**, and **EMS** applications — including interactive flow diagrams, QA analysis, cross-reference maps, and AI/MCP integration.

---

## Quick Start

**Requirements:** Node.js ≥ 18

```bash
node tibco-docgen.js myapp.flogo
node tibco-docgen.js ./bw6-app/ -o ./docs --format all
node tibco-docgen.js myapp.application_1.0.0.ear
```

---

## CLI Reference

```
tibco-docgen <input> [options]

Options:
  -o, --output <dir>       Output directory  (default: ./docgen-out)
  -f, --format <fmt>       html | md | json | pdf | all  (default: all)
  -w, --watch              Re-generate on file change
  --no-open                Skip auto-open browser
  -h, --help / -v, --version

EMS Live Connection:
  --ems-rest <url>         Connect via EMS REST Proxy  (e.g. http://host:9000)
  --ems-admin <server>     Connect via tibemsadmin CLI  (e.g. tcp://host:7222)
  --ems-user <user>        Username  (default: admin)
  --ems-password <pw>      Password
  --ems-ignore-ssl         Skip TLS certificate validation
  --ems-name <name>        Display name for the instance

Confluence Export:
  --confluence-url <url>   Base URL  (e.g. https://myco.atlassian.net/wiki)
  --confluence-space <key> Space key
  --confluence-token <tok> API token (Cloud) or PAT (Data Center)
  --confluence-user <email> User email  (Cloud only)
  --confluence-parent <id> Parent page ID  (optional)

MCP Server (AI agent integration):
  --mcp                    Start MCP stdio server
```

### Supported inputs

| Input | Product |
|-------|---------|
| `myapp.flogo` | TIBCO Flogo |
| `myapp.application_1.0.0.ear` / `.zip` | BW6 / BWCE |
| `./bw6-project/` (contains `META-INF/MANIFEST.MF`) | BW6 / BWCE |
| `./ems-config/` (contains `tibemsd.conf`) | TIBCO EMS |
| `./apps/` (directory of mixed apps) | All of the above |

---

## Output Structure

Each format is written to its own subdirectory:

```
docgen-out/<app-name>/
├── html/                       Interactive HTML (opens in browser)
│   ├── index.html              Overview: stats + architecture diagram
│   ├── processes/              Per-process: diagram + activities + transitions
│   ├── resources.html          Shared resources (JDBC, EMS, REST, …)
│   ├── properties.html         Module properties / substitution variables
│   ├── schemas.html            XSD schemas
│   ├── qa.html                 QA analysis — violations by severity
│   └── …
├── markdown/                   Markdown + embedded SVG diagrams
│   ├── index.md
│   ├── arch-diagram.svg        Architecture diagram
│   └── processes/              Per-process SVG flow diagrams
├── json/
│   └── model.json              Full parsed model
└── pdf/
    └── <app-name>.pdf          Single PDF: cover page + TOC + all sections
```

For multi-app directories a workspace `index.html` is generated at the root.

---

## What Gets Generated

### HTML
- **Architecture diagram** — 3-column SVG showing triggers → processes → resources
- **Per-process flow diagrams** — palette-accurate TIBCO activity icons, transition labels, error paths
- **Palette-aware activity badges** — derived from the authoritative `activityTypeID` attribute
- **Substitution variable highlighting** — `%%VAR%%` badges, encrypted value lock icons
- **REST / SOAP service bindings** — parsed from `module.bwm` and shown as starters
- **Shared Libraries** — fully documented alongside the main app
- **Cross-reference map** — which process calls which, which resource used by which process
- **Substitution variable diff** — side-by-side comparison across all deployment profiles
- **QA report** — rule violations with severity, location, and fix message

### PDF
Single A4 document generated via headless Chrome/Edge (no server needed):
- Cover page with app metadata and statistics
- Table of contents with anchor links
- Architecture diagram scaled to page
- Per-process section with flow diagram, activities table, transitions table
- All other sections (resources, properties, schemas, QA)

> PDF requires **Google Chrome** or **Microsoft Edge** installed locally.

### Markdown
- Full documentation in `.md` files with relative SVG image links
- Architecture diagram and per-process flow diagrams written as `.svg` alongside the markdown

### Confluence Export
- Upserts pages into a Confluence space via REST API
- SVG diagrams uploaded as attachments and embedded with `ac:image` macros
- Supports Cloud (email + API token) and Data Center (PAT)

---

## QA Analysis

Static analysis runs on every app automatically.

| Product | Rules | Examples |
|---------|-------|---------|
| Flogo | 43 | Hardcoded credentials, circular flows, SQL injection via concat, missing descriptions |
| BW6 | 15 | No process starter, JDBC `SELECT *`, unlabeled transitions, unused shared resources |
| EMS | — | Config inventory only |

---

## AI / MCP Integration

```bash
node tibco-docgen.js --mcp   # starts MCP stdio server
```

Configure in `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "tibco-docgen": {
      "command": "node",
      "args": ["C:/path/to/tibco-docgen.js", "--mcp"]
    }
  }
}
```

| MCP Tool | Description |
|----------|-------------|
| `generate_docs` | Run full pipeline — returns `outputDir`, `htmlUrl`, log |
| `get_project_model` | Parse and return `DocModel` as JSON — no files written |

---

## VS Code Extension

Install `vscode-extension/tibco-docgen-*.vsix` via Extensions → `···` → *Install from VSIX*.

- Right-click any `.flogo`, `.ear`, `.zip`, or BW6 folder → **Generate DocGen Documentation**
- Command Palette: `DocGen: Generate Documentation`
- Keyboard: `Ctrl+Shift+D` when a `.flogo` file is active
- EMS live connection with saved credential store

---

## Building from Source

```bash
npm install
npm run dist      # compile + bundle → dist/tibco-docgen.js
bash test.sh      # integration test against all sample apps
```

### Monorepo layout

```
tibco-docgen/
├── packages/
│   ├── core/            DocModel types, HTML/Markdown/SVG/PDF renderers
│   ├── parser-bw6/      BW6/BWCE parser — dir, .ear, .zip + QA rules + SVG icons
│   ├── parser-flogo/    Flogo parser + 43 QA rules
│   └── parser-ems/      EMS config + live-connection parsers
├── cli/                 CLI, MCP server, PDF export, Confluence export, watch mode
├── vscode-extension/    VS Code extension
├── dist/                Built output: tibco-docgen.js, .tgz, .vsix
└── samples/             Sample apps used by test.sh
```

---

## Distributable Files

| File | Use |
|------|-----|
| `dist/tibco-docgen.js` | Single-file CLI — `node tibco-docgen.js` |
| `dist/tibco-docgen-1.0.0.tgz` | npm tarball — `npm install -g` |
| `vscode-extension/tibco-docgen-1.0.0.vsix` | VS Code extension |
