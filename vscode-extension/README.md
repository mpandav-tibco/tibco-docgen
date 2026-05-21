# TIBCO DocGen

Generate **HTML, PDF, Markdown, and JSON** documentation for **TIBCO BusinessWorks 6 / BWCE**, **Flogo**, and **EMS** applications — directly from VS Code, with no CLI setup required.

The documentation engine is **bundled inside the extension**. Only requirement: **VS Code 1.85+**.

---

## Supported Inputs

| Input | Product |
|---|---|
| Folder with `META-INF/MANIFEST.MF` | BusinessWorks 6 / BWCE project |
| `.ear` / `.zip` archive | BW6 / BWCE deployed archive |
| `.flogo` file | TIBCO Flogo application |
| Folder with `tibemsd.conf` | EMS server config |

---

## How to Use

**Right-click** any supported app in the VS Code Explorer → **Generate DocGen Documentation**

Additional entry points:

| Method | Action |
|---|---|
| `Ctrl+Shift+D` (Mac: `Cmd+Shift+D`) | Generate docs from the active `.flogo` file |
| Editor title bar icon | Shown when a `.flogo` file is open |
| Command Palette | `DocGen: Generate Documentation` |
| Command Palette | `DocGen: Generate Docs for All Apps in Workspace` |
| Command Palette | `DocGen: Generate EMS Documentation (Live Server)` |
| Command Palette | `DocGen: Open Generated Docs` |
| Command Palette | `DocGen: Show Output Log` |

After generation, a notification offers **Open in Browser** or **Reveal in Explorer**.

---

## Output Structure

```
docgen-out/<app-name>/
├── html/                     Interactive HTML documentation (open in any browser)
│   ├── index.html            Overview, architecture diagram, summary stats
│   ├── processes/            Per-process: flow diagram, activities, transitions
│   ├── resources.html        Shared resources / connections
│   ├── properties.html       Module properties + per-profile overrides
│   ├── schemas.html          XSD schemas with parsed element declarations
│   ├── service-descriptors.html   WSDL / OpenAPI descriptors
│   ├── api-surface.html      REST / SOAP bindings and operations
│   ├── qa.html               QA violations by severity
│   ├── cross-refs.html       Process → resource and process → process dependencies
│   ├── substvar-diff.html    Side-by-side config profile comparison
│   └── shared-vars.html      Module and job shared variables
├── markdown/                 Markdown + embedded SVG diagrams
│   ├── index.md              Full app documentation in a single file
│   ├── arch-diagram.svg      Architecture diagram
│   └── processes/            Per-process flow diagram SVGs
├── json/
│   └── model.json            Complete parsed app model (machine-readable)
└── pdf/
    └── <app-name>.pdf        Cover page + TOC + all diagrams and tables
```

---

## Documentation Content

### BusinessWorks 6 / BWCE

#### Architecture Diagram
SVG diagram showing the relationship between process groups, process starters (triggers / REST bindings), and shared resources (JDBC, Kafka, EMS, HTTP connectors). Processes are grouped by their parent namespace — so a BWCE service with multiple HTTP operations (GET, POST, PUT, DELETE) is represented as a single process group, not individual operations.

#### Processes
- Processes are grouped by parent namespace (e.g., all operations under `com.example.Books` shown as one group)
- Per-group: sub-handler names, total activity count, total transition count
- Per-process flow diagram (SVG)
- Activity table: name, palette, type, fault handler flag, description
- Activity configuration details: property values, input field mappings (target → source expression), XSLT expressions
- Transition table: from → to, type (always / expression / error), condition expression
- Fault handler activities clearly marked

#### Shared Resources
- All connections (JDBC, Kafka, EMS, REST HTTP Connector, etc.)
- Per-resource: type, description, all configuration properties
- Substitution variables displayed with `${VAR}` notation

#### Schemas (XSD)
- All XSD schemas from the `Schemas/` directory
- Target namespace
- Parsed element declarations: name, type, required (minOccurs), repeating (maxOccurs)

#### Service Descriptors (WSDL / OpenAPI)
- Summary table: name, type, version, base path
- Per-descriptor detail: namespace, base path
  - **WSDL**: per-port-type operation table (Operation | Input | Output | Fault)
  - **OpenAPI / Swagger**: endpoint path listing

#### Module Properties & Config Profiles
- Default property values with type and description
- Per-profile override tables (one section per profile: `default`, `dev`, `prod`, etc.)
- Profile comparison (side-by-side substvar diff) in HTML

#### API Surface
- REST and SOAP service bindings
- Per-service: base path, binding type, operations (method + path + operation name)

#### Process Starters (Triggers)
- All triggers and REST bindings with the process they start

#### QA Analysis
- Static analysis based on [TIBCO BusinessWorks SonarQube Plugin](https://github.com/TIBCOSoftware/sonar-bw) rules
- Violations listed with: severity (error / warning / info), rule ID, location, message, detail
- Summary counts with color-coded badges

#### Cross-References
- Process → resources used
- Resource → processes that use it
- Process → sub-processes called
- Process → callers

#### Shared Libraries
- All referenced BW6 shared libraries with their processes, resources, schemas, and properties

#### Shared Variables
- Module-scoped and job-scoped shared variable declarations

---

### TIBCO Flogo

#### Flows
- Per-flow diagram (SVG) with activity icons resolved from the installed Flogo VS Code extension
- Activity table: name, type, palette badge, description
- Activity configuration: input mappings, property references, function calls
- Trigger configuration per flow

#### Connections
- All configured connections with type and settings

#### Application Properties
- All property declarations with default values

#### QA Analysis
- Static analysis based on [TIBCO Flogo Sonar Plugin](https://github.com/mpandav-tibco/flogo-sonar) rules (43 rules)

---

### EMS

- Queues, topics, and durable subscriber declarations
- Factory, bridge, and route configurations
- Connection and user configuration summary

---

## Output Formats

| Format | Description | PDF requirement |
|---|---|---|
| `html` | Interactive multi-page site with sidebar, search filter, collapsible sections | — |
| `pdf` | Single A4 document: cover page, table of contents, all diagrams and data | Chrome or Edge |
| `md` | Single Markdown file with embedded SVG diagrams | — |
| `json` | Full parsed `DocModel` as structured JSON | — |
| `all` (default) | All four formats generated together | Chrome or Edge (PDF skipped gracefully if absent) |

---

## EMS Live Connection

Command Palette → **DocGen: Generate EMS Documentation (Live Server)**

Two connection modes are supported:

| Mode | Connection string | Requires |
|---|---|---|
| REST Proxy | `http://host:9000` | `tibemsrestd` running |
| tibemsadmin CLI | `tcp://host:7222` | `tibemsadmin` binary on PATH |

Saved connections are stored in VS Code global state. Passwords are stored securely in the OS credential store via VS Code Secrets API.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `tibco-docgen.outputDirectory` | `""` | Output root directory. Empty = `docgen-out/` next to the input file/folder |
| `tibco-docgen.format` | `"all"` | Output format: `html` · `md` · `json` · `pdf` · `all` |
| `tibco-docgen.openAfterGenerate` | `true` | Auto-open the HTML report in the browser after generation |
| `tibco-docgen.cliPath` | `""` | Path to a custom `tibco-docgen.js`. Auto-detected from the extension if empty |
| `tibco-docgen.customExtensionsPath` | `""` | Directory of custom Flogo extensions for activity icon resolution |

---

## MCP Server — AI Agent Integration

The bundled CLI can be started as an **MCP (Model Context Protocol) stdio server**, allowing AI agents — Claude, Cursor, Windsurf, or any MCP-compatible host — to generate and query TIBCO app documentation on demand.

### Option A — VS Code 1.99+ (recommended)

Command Palette → **DocGen: Add MCP Server to VS Code (1.99+)**

Writes the server entry to `.vscode/mcp.json` in your workspace with the CLI path pre-filled:

```json
{
  "servers": {
    "tibco-docgen": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/extension/cli/tibco-docgen.js", "--mcp"]
    }
  }
}
```

### Option B — Claude Desktop / Cursor / Windsurf

Command Palette → **DocGen: Copy MCP Server Config to Clipboard**

Choose your AI host in the picker — the config JSON is copied with the correct absolute CLI path. Paste into:

| Host | Config location |
|---|---|
| Claude Desktop | `claude_desktop_config.json` → `mcpServers` |
| Cursor | `.cursor/mcp.json` |
| Windsurf / Continue | `.mcp.json` or IDE MCP settings |

### MCP Tools

| Tool | What it does |
|---|---|
| `generate_docs` | Run the full documentation pipeline — returns `outputDir`, `htmlUrl`, and log |
| `get_project_model` | Parse the app and return the full `DocModel` as JSON — no files written |

### Example prompts

- *"Generate documentation for the BW6 project at `./order-management`"*
- *"What processes does this Flogo app expose and what triggers start them?"*
- *"List all QA violations in this BW6 application"*
- *"What JDBC resources does this app use and which processes depend on them?"*

---

## Troubleshooting

**Generation fails** — run `DocGen: Show Output Log` from the Command Palette for the full error trace.

**PDF not generated** — PDF export requires **Google Chrome** or **Microsoft Edge**. When using `format: all`, PDF is skipped gracefully if no browser is found; other formats are still produced.

**Flogo activity icons missing** — install the **TIBCO Flogo** VS Code extension (`tibco.flogo`). Icons are resolved from it automatically.

**Docs seem stale** — the extension caches results per file modification time. Re-save the file or folder to force regeneration.

**EMS connection refused** — verify `tibemsrestd` is running (REST Proxy mode) or `tibemsadmin` is on your PATH (CLI mode).
