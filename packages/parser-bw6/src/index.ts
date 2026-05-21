import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';
import {
  DocModel, AppInfo, FlowDoc, ActivityDoc, LinkDoc,
  FlowDiagram, TriggerDoc, TriggerHandler, ConnectionDoc, PropertyDoc,
  BW6SharedLibDoc, SpecDoc, QAViolation, CrossRefDoc, WsdlMessage, WsdlPortType,
  RestBindingDoc, RestOperationDoc, SharedVarDoc,
} from '@tibco-docgen/core';
import { BW6ProcessDef, BW6Activity, BW6Transition, BW6AppManifest, BW6SubstVar, BW6SharedResource } from './types';

import { parseManifest } from './manifest';
import { parseBpelProcess } from './bpel';
import { parseProcessFile, extractConfig } from './process-file';
import { parseSubstVar, parseTibcoXml, parseProfileProperties, parseSharedVarFile, parseModuleBwm } from './substvar';
import { findSharedResources, parseServiceDescriptors } from './resources';
import { layoutActivities, computeDiagram } from './layout';
import { processToFlow, extractTriggers, parseXsdSchemas } from './doc-model';
import { findSharedLibs } from './shared-lib';
import { analyzeQA, analyzeCrossRefs } from './qa';
import { extractToTemp, cleanupTempDir, findFiles } from './archive';

export function parseBW6App(appDir: string): DocModel {
  const manifestPath = path.join(appDir, 'META-INF', 'MANIFEST.MF');
  const rawManifestContent = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : '';
  let manifest = rawManifestContent
    ? parseManifest(manifestPath)
    : { bundleName: path.basename(appDir), bundleSymbolicName: '', bundleVersion: '1.0.0', description: '', edition: 'BW', bwVersion: '', requireBundle: [], requiredModules: [], configProfiles: [], isSharedModule: false, msvPath: '', jsvPath: '', bwmPath: '', hasRequireCapability: false };

  const parentDir = path.dirname(appDir);

  // ── Application-project-as-input detection ──────────────────────────────────
  // If the input folder IS the application project (has TIBCO-BW-Application: in its
  // own MANIFEST.MF and no Processes/ dir), look for sibling MODULE folders instead.
  // This supports the common workspace layout:
  //   MyApp/           ← application project (META-INF only) ← user points here
  //   MyApp.module/    ← module project (has Processes/)
  const isAppProject = rawManifestContent.includes('TIBCO-BW-Application:')
    && !fs.existsSync(path.join(appDir, 'Processes'));
  if (isAppProject && fs.existsSync(parentDir)) {
    const tibcoXmlPath = path.join(appDir, 'META-INF', 'TIBCO.xml');
    const tibco = fs.existsSync(tibcoXmlPath) ? parseTibcoXml(tibcoXmlPath) : { modules: [], appModules: [], properties: [] };
    const appSymBase = manifest.bundleSymbolicName.toLowerCase();
    // Only match against type="application" modules — shared libs must not be used as the primary module
    const appModuleNames = new Set(tibco.appModules.map(m => m.toLowerCase()));
    for (const d of fs.readdirSync(parentDir)) {
      const candidate = path.join(parentDir, d);
      if (!fs.statSync(candidate).isDirectory()) continue;
      if (candidate === appDir) continue;
      const mf = path.join(candidate, 'META-INF', 'MANIFEST.MF');
      if (!fs.existsSync(mf)) continue;
      const mfContent = fs.readFileSync(mf, 'utf8');
      // Skip application projects; we want the module
      if (mfContent.includes('TIBCO-BW-Application:')) continue;
      if (!mfContent.includes('TIBCO-BW')) continue;
      const candidateMf = parseManifest(mf);
      const candidateSym = candidateMf.bundleSymbolicName.toLowerCase();
      const isMatch = candidateSym === appSymBase + '.module'
        || candidateSym.replace(/\.module$/i, '') === appSymBase
        || appModuleNames.has(candidateSym)
        || appModuleNames.has(candidateSym + '.module');
      if (isMatch) {
        // Switch: use the module dir for process discovery, app dir as the sibling app
        const savedAppDir = appDir;
        appDir = candidate;
        manifest = parseManifest(mf);
        // Apply app-level fields (bwVersion, edition, profiles) from the app project manifest
        const appMf = parseManifest(path.join(savedAppDir, 'META-INF', 'MANIFEST.MF'));
        if (appMf.bwVersion) manifest.bwVersion = appMf.bwVersion;
        if (appMf.edition !== 'BW') manifest.edition = appMf.edition;
        if (appMf.configProfiles.length > 0) manifest.configProfiles = appMf.configProfiles;
        // Pass the app dir to be found as siblingAppDir below
        // by temporarily setting it as a known sibling
        break;
      }
    }
  }

  // Find a sibling application project directory.
  // Detects both *.application-suffixed dirs (BW6 on-prem convention) and
  // any directory whose MANIFEST.MF contains TIBCO-BW-Application: (BWCE convention).
  let siblingAppDir: string | undefined;
  if (fs.existsSync(parentDir)) {
    // The module's base name (strip trailing .module / .Module suffix) for matching
    const moduleBase = manifest.bundleSymbolicName.replace(/\.module$/i, '').toLowerCase();
    for (const d of fs.readdirSync(parentDir)) {
      const candidate = path.join(parentDir, d);
      if (!fs.statSync(candidate).isDirectory()) continue;
      if (candidate === appDir) continue;
      const mf = path.join(candidate, 'META-INF', 'MANIFEST.MF');
      if (!fs.existsSync(mf)) continue;
      const mfContent = fs.readFileSync(mf, 'utf8');
      if (d.endsWith('.application') || mfContent.includes('TIBCO-BW-Application:')) {
        // Guard: only accept this as sibling app if its symbolic name relates to ours.
        // This prevents cross-contamination when multiple independent apps share a parent dir.
        const candidateMf = parseManifest(mf);
        const candidateBase = candidateMf.bundleSymbolicName.replace(/\.module$/i, '').toLowerCase();
        if (moduleBase && candidateBase && candidateBase !== moduleBase) continue;
        siblingAppDir = candidate;
        break;
      }
    }
  }
  if (siblingAppDir) {
    const appManifest = parseManifest(path.join(siblingAppDir, 'META-INF', 'MANIFEST.MF'));
    // Application-level manifest overrides: bwVersion, edition, config profiles
    if (appManifest.bwVersion) manifest.bwVersion = appManifest.bwVersion;
    if (appManifest.edition !== 'BW') manifest.edition = appManifest.edition;
    if (appManifest.configProfiles.length > 0) manifest.configProfiles = appManifest.configProfiles;
    // Scan application META-INF for all .substvar profile files
    const appMetaInf = path.join(siblingAppDir, 'META-INF');
    if (fs.existsSync(appMetaInf)) {
      const extraProfiles = fs.readdirSync(appMetaInf)
        .filter((f: string) => f.endsWith('.substvar'))
        .map((f: string) => path.basename(f, '.substvar'));
      manifest.configProfiles = [...new Set([...manifest.configProfiles, ...extraProfiles])];
    }
  }

  // Find all .bwp files in Processes/ (recursively)
  const processesDir = path.join(appDir, 'Processes');
  const bwpFiles = fs.existsSync(processesDir) ? findFiles(processesDir, '.bwp') : [];
  const parseWarnings: string[] = [];
  const processes: BW6ProcessDef[] = [];
  for (const f of bwpFiles) {
    try {
      processes.push(...parseProcessFile(f));
    } catch (e) {
      parseWarnings.push(`Skipped process ${path.relative(appDir, f)}: ${(e as Error).message}`);
    }
  }

  // Substitution variables → properties (default profile only, deduplicated by name)
  // Substitution variables: prefer the application project's default.substvar (has real values),
  // fall back to the module's own substvar.
  const appSubstVarCandidates = siblingAppDir
    ? findFiles(path.join(siblingAppDir, 'META-INF'), '.substvar').filter(f => path.basename(f) === 'default.substvar')
    : [];
  const moduleSubstVarCandidates = [
    ...findFiles(path.join(appDir, 'defaultVars'), '.substvar'),
    ...findFiles(path.join(appDir, 'defaultVars'), '.xml'),
    ...findFiles(path.join(appDir, 'META-INF'), '.substvar'),
  ];
  const primarySubstVar = appSubstVarCandidates[0] ?? moduleSubstVarCandidates[0];
  const substVars: BW6SubstVar[] = primarySubstVar ? parseSubstVar(primarySubstVar) : [];

  // Discover all config profile names from module META-INF .substvar files
  const metaInfProfiles = findFiles(path.join(appDir, 'META-INF'), '.substvar')
    .map(f => path.basename(f, '.substvar'));
  if (metaInfProfiles.length > 0) {
    manifest.configProfiles = [...new Set([...manifest.configProfiles, ...metaInfProfiles])];
  }

  // Parse TIBCO.xml from application project if present
  let tibcoModules: string[] = [];
  let tibcoProperties: BW6SubstVar[] = [];
  if (siblingAppDir) {
    const tibcoXmlPath = path.join(siblingAppDir, 'META-INF', 'TIBCO.xml');
    if (fs.existsSync(tibcoXmlPath)) {
      const tibco = parseTibcoXml(tibcoXmlPath);
      tibcoModules = tibco.modules;
      tibcoProperties = tibco.properties;
    }
  }

  // Merge properties: substVars (from default.substvar) take precedence; fill gaps from TIBCO.xml
  let finalProps = substVars;
  if (finalProps.length === 0 && tibcoProperties.length > 0) {
    finalProps = tibcoProperties;
  } else if (tibcoProperties.length > 0) {
    // Add TIBCO.xml props that aren't already present (substvar already provides real values)
    const existingNames = new Set(substVars.map(v => v.name));
    for (const tp of tibcoProperties) {
      if (!existingNames.has(tp.name)) finalProps = [...finalProps, tp];
    }
  }

  // Shared resources → connections
  const sharedResources = findSharedResources(appDir);

  // Discover SharedLib modules referenced in Require-Capability
  const bw6SharedLibs = findSharedLibs(appDir, manifest.requiredModules);

  // Service descriptors (WSDL / Swagger / OpenAPI)
  const serviceDescriptors = parseServiceDescriptors(appDir);

  // Per-profile substvar data (for per-profile property pages)
  const profileProperties = parseProfileProperties(appDir, siblingAppDir);

  // Build final connections array for QA + cross-ref analysis
  const connectionsForAnalysis = sharedResources.map(r => ({
    id: r.id, name: r.name, description: r.description,
    type: r.type, ref: r.ref,
    settings: Object.keys(r.settings).length > 0 ? r.settings : undefined,
  }));
  const finalPropsForQA = finalProps.map(v => ({
    name: v.name, type: v.type, value: v.value, description: v.description,
  }));

  // Resolve MSV/JSV/BWM paths: prefer MANIFEST.MF-declared paths, fall back to conventional defaults
  function resolveMetaInfPath(manifestRelPath: string, fallbackName: string): string {
    if (manifestRelPath) return path.join(appDir, manifestRelPath);
    return path.join(appDir, 'META-INF', fallbackName);
  }
  const msvPath = resolveMetaInfPath(manifest.msvPath, 'module.msv');
  const jsvPath = resolveMetaInfPath(manifest.jsvPath, 'module.jsv');
  const bwmPath = resolveMetaInfPath(manifest.bwmPath, 'module.bwm');

  const moduleSharedVars = fs.existsSync(msvPath) ? parseSharedVarFile(msvPath, 'module') : [];
  const jobSharedVars    = fs.existsSync(jsvPath) ? parseSharedVarFile(jsvPath, 'job')    : [];
  const restBindings     = fs.existsSync(bwmPath) ? parseModuleBwm(bwmPath) : [];

  // Deployment target: derived from TIBCO-BW-Edition
  const deploymentTarget: 'container' | 'appspace' | undefined =
    manifest.edition === 'BWCE' ? 'container' :
    manifest.edition === 'BWE'  ? 'appspace'  :
    // Fallback for older apps without TIBCO-BW-Edition: Require-Capability = BWCE style
    manifest.hasRequireCapability ? 'container' : undefined;

  // Build set of process names bound via service bindings (exempt from PROC-001)
  const serviceBindingProcessNames = new Set<string>(
    restBindings.flatMap(b => b.processName ? [
      b.processName,
      b.processName.split(/[./\\]/).filter(Boolean).pop() ?? b.processName,
    ] : []),
  );
  const crossRefs = analyzeCrossRefs(processes, connectionsForAnalysis);
  const violations = analyzeQA(
    processes, finalPropsForQA, manifest.requireBundle,
    serviceBindingProcessNames,
    crossRefs.processCalledBy,
    crossRefs.processCallsProcess,
    connectionsForAnalysis,
    crossRefs,
  );

  // Application display name: prefer sibling app project's Bundle-Name (cleaner, no "Module" suffix)
  let appDisplayName = manifest.bundleName || path.basename(appDir);
  if (siblingAppDir) {
    try {
      const appMf = parseManifest(path.join(siblingAppDir, 'META-INF', 'MANIFEST.MF'));
      if (appMf.bundleName) appDisplayName = appMf.bundleName;
    } catch { /* keep module name */ }
  }

  // Build tags: [edition, symbolicName, bwVersion, ...profiles prefixed with "profile:"]
  // Also include app project name and module list if available from TIBCO.xml
  const tags: string[] = [manifest.edition, manifest.bundleSymbolicName].filter(Boolean);
  if (manifest.bwVersion) tags.push(manifest.bwVersion);
  for (const p of manifest.configProfiles) tags.push(`profile:${p}`);
  if (tibcoModules.length > 0) {
    for (const m of tibcoModules) tags.push(`module:${m}`);
  }

  const appInfo: AppInfo = {
    name:             appDisplayName,
    description:      manifest.description,
    version:          manifest.bundleVersion,
    sourceFile:       path.basename(appDir),
    appModel:         'bw6',
    deploymentTarget,
    tags,
    imports:          manifest.requireBundle,
  };

  return {
    product:     'bw6',
    app:         appInfo,
    flows:       processes.map(p => processToFlow(p)),
    triggers:    extractTriggers(processes, manifest.bundleName),
    connections: sharedResources.map(r => ({
      id:          r.id,
      name:        r.name,
      description: r.description,
      type:        r.type,
      ref:         r.ref,
      settings:    Object.keys(r.settings).length > 0 ? r.settings : undefined,
    })),
    properties:  finalProps.map(v => ({
      name:        v.name,
      type:        v.type,
      value:       v.value,
      description: v.description,
    })),
    schemas:     parseXsdSchemas(appDir),
    specs:       serviceDescriptors,
    profileProperties: Object.keys(profileProperties).length > 0 ? profileProperties : undefined,
    bw6SharedLibs: bw6SharedLibs.length > 0 ? bw6SharedLibs : undefined,
    restBindings:      restBindings.length > 0 ? restBindings : undefined,
    moduleSharedVars:  moduleSharedVars.length > 0 ? moduleSharedVars : undefined,
    jobSharedVars:     jobSharedVars.length > 0 ? jobSharedVars : undefined,
    parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
    violations:  violations.length > 0 ? violations : undefined,
    crossRefs:   (Object.keys(crossRefs.processCallsProcess).length > 0 ||
                  Object.keys(crossRefs.processUsesResource).length > 0 ||
                  Object.keys(crossRefs.resourceUsedByProcess).length > 0)
                 ? crossRefs : undefined,
    generatedAt: new Date().toISOString(),
    generatedBy: os.userInfo().username,
  };
}

export function canParse(inputPath: string): boolean {
  try {
    const stat = fs.statSync(inputPath);
    // Accept .ear and .zip archives
    if (!stat.isDirectory()) {
      const ext = path.extname(inputPath).toLowerCase();
      return ext === '.ear' || ext === '.zip';
    }
    // Must have TIBCO-BW in MANIFEST.MF or have .bwp files
    const manifestPath = path.join(inputPath, 'META-INF', 'MANIFEST.MF');
    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf8');
      if (content.includes('TIBCO-BW')) return true;
    }
    const processesDir = path.join(inputPath, 'Processes');
    if (fs.existsSync(processesDir)) {
      return fs.readdirSync(processesDir).some((f: string) => f.endsWith('.bwp'));
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Parse a BW6 .ear file.
 *
 * EAR structure:
 *   META-INF/MANIFEST.MF       — application-level manifest (TIBCO-BW-Edition, etc.)
 *   META-INF/TIBCO.xml         — connection/property descriptors
 *   META-INF/default.substvar  — application-level substvars
 *   *.jar                      — module JARs (each is itself a ZIP with Processes/, Resources/, etc.)
 *
 * The main module JAR (without TIBCO-BW-SharedModule) is used as the primary appDir.
 * Shared-module JARs are treated as shared libraries.
 */
export function parseBW6Ear(earPath: string): DocModel {
  const earTmp = extractToTemp(earPath);
  try {
    // Extract each embedded JAR into its own subdirectory
    const jarFiles = findFiles(earTmp, '.jar');
    const moduleExtractions: Array<{ dir: string; isShared: boolean; bundleName: string }> = [];

    for (const jar of jarFiles) {
      const stem = path.basename(jar, path.extname(jar));
      const modDir = path.join(earTmp, '__modules', stem);
      fs.mkdirSync(modDir, { recursive: true });
      const innerZip = new AdmZip(jar);
      innerZip.extractAllTo(modDir, true);

      const mfPath = path.join(modDir, 'META-INF', 'MANIFEST.MF');
      const isShared = fs.existsSync(mfPath) && fs.readFileSync(mfPath, 'utf8').includes('TIBCO-BW-SharedModule');
      const bundleName = stem;
      moduleExtractions.push({ dir: modDir, isShared, bundleName });
    }

    // Identify main module (not shared)
    const mainMods = moduleExtractions.filter(m => !m.isShared);
    const sharedMods = moduleExtractions.filter(m => m.isShared);

    if (mainMods.length === 0) {
      // Fallback: treat earTmp itself as the app dir (flat EAR without inner JARs)
      return parseBW6App(earTmp);
    }

    // Merge: copy EAR-level META-INF files into the main module dir if missing
    const earMetaInf = path.join(earTmp, 'META-INF');
    const mainDir = mainMods[0].dir;
    const mainMetaInf = path.join(mainDir, 'META-INF');
    if (fs.existsSync(earMetaInf)) {
      for (const f of fs.readdirSync(earMetaInf)) {
        const dest = path.join(mainMetaInf, f);
        const src  = path.join(earMetaInf, f);
        // Only copy if it enriches (e.g. TIBCO.xml, EAR-level substvar not already present)
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
        }
      }
    }

    // Copy shared module dirs alongside the main dir so parseBW6App can find them
    for (const sm of sharedMods) {
      const dest = path.join(mainDir, '..', path.basename(sm.dir));
      if (!fs.existsSync(dest)) {
        fs.cpSync(sm.dir, dest, { recursive: true });
      }
    }

    const model = parseBW6App(mainDir);
    model.app.sourceFile = earPath;
    return model;
  } finally {
    cleanupTempDir(earTmp);
  }
}

/**
 * Parse a BW6 .zip export (a zipped project folder with the same structure as a flat BW6 app).
 */
export function parseBW6Zip(zipPath: string): DocModel {
  const tmpDir = extractToTemp(zipPath);
  try {
    const topDirs = fs.readdirSync(tmpDir)
      .map(e => path.join(tmpDir, e))
      .filter(e => fs.statSync(e).isDirectory());

    let appDir = tmpDir;
    if (topDirs.length === 1) {
      // Single top-level folder (common for git exports)
      appDir = topDirs[0];
    } else if (topDirs.length > 1) {
      // Multi-project ZIP: TIBCO Studio exports include both the module folder and
      // a sibling <name>.application folder. Find the module (has META-INF/MANIFEST.MF,
      // not the .application project). parseBW6App will auto-discover the .application
      // sibling from the shared parent directory (tmpDir).
      const moduleDir = topDirs.find(d =>
        !path.basename(d).endsWith('.application') &&
        fs.existsSync(path.join(d, 'META-INF', 'MANIFEST.MF'))
      );
      if (moduleDir) appDir = moduleDir;
    }

    const model = parseBW6App(appDir);
    model.app.sourceFile = zipPath;
    return model;
  } finally {
    cleanupTempDir(tmpDir);
  }
}

export { buildBW6IconRegistry, defaultBW6PluginsDirs } from './bw6-icons';
