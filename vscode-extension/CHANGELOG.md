# Changelog

## [1.0.0] — 2025-05-14

### Added
- **Generate Documentation** command for Flogo (`.flogo`), BW6/BWCE (`.ear`, `.zip`, folders), and EMS config directories
- **Explorer context menu** — right-click any TIBCO app file or folder to generate docs
- **Editor title bar icon** — book icon appears when a `.flogo` file is active
- **Keyboard shortcut** — `Ctrl+Shift+D` / `Cmd+Shift+D` on active `.flogo` files
- **Status bar item** — `$(book) DocGen` button visible when editing `.flogo` files
- **Workspace documentation** — `DocGen: Generate Docs for All Apps in Workspace` scans and documents all TIBCO apps in one run
- **Output channel** — full generation log in the `TIBCO DocGen` output panel
- **Progress notification** with cancellation support
- **Post-generation actions** — Open in Browser, Reveal in Explorer
- **Auto-detect CLI** — finds `tibco-docgen.js` from settings, workspace `node_modules`, or global npm
- **Settings**: `cliPath`, `outputDirectory`, `format`, `openAfterGenerate`, `customExtensionsPath`
