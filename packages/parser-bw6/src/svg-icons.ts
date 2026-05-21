/**
 * High-quality SVG activity icons for TIBCO BW6 palettes.
 * Each icon is a 24×24 vector design that closely resembles the original TIBCO Studio icons.
 * All icons are distinct from one another across the full icon set.
 */

import { BW6_REAL_ICONS, BW6_CLASS_ICONS } from './svg-icons-real';

function svgUri(color: string, paths: string, extra = ''): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>` +
    paths + `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function filledSvgUri(color: string, paths: string): string {
  return svgUri(color, paths, `fill="${color}"`);
}

// Palette brand colors (match html-bw6.ts)
const G  = '#7c3aed';  // General Activities — violet
const JD = '#0f766e';  // JDBC — teal
const HT = '#c2410c';  // HTTP — orange
const JM = '#3730a3';  // JMS/EMS — indigo
const FL = '#15803d';  // File — green
const FT = '#1d4ed8';  // FTP — blue
const XL = '#6d28d9';  // XML — purple
const PA = '#1e40af';  // Parse — dark blue
const ML = '#be185d';  // Mail — rose
const TC = '#0e7490';  // TCP — cyan
const JV = '#b45309';  // Java — amber
const RS = '#dc2626';  // Rescue — red
const RJ = '#ea580c';  // REST JSON — orange-red
const UN = '#64748b';  // Unknown — slate
// Technology-specific palette colors
const KF = '#e83229';  // Kafka — Apache Kafka brand red
const EM = '#0087cd';  // TIBCO EMS — TIBCO brand blue (distinct from JMS indigo)
const SP = '#0070f3';  // SAP — SAP brand blue
const S3 = '#ff9900';  // AWS — AWS brand orange
const SL = '#00a1e0';  // Salesforce — Salesforce brand blue
const SN = '#62a420';  // ServiceNow — ServiceNow brand green
const AD = '#9333ea';  // ADB / TIBCO Data Plane — fuchsia

// ─── Icon definitions ──────────────────────────────────────────────────────────
// Keys = lowercased last segment of the Java class name.

export const BW6_SVG_ICONS: Record<string, string> = {

  // ── General Activities (violet) ───────────────────────────────────────────

  // Log / WriteToLog: document with horizontal lines — "writing text to a log"
  logactivity: svgUri(G,
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="8" y1="12" x2="16" y2="12"/>' +
    '<line x1="8" y1="16" x2="14" y2="16"/>'),

  writetoactivity: svgUri(G,
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="8" y1="12" x2="16" y2="12"/>' +
    '<line x1="8" y1="16" x2="14" y2="16"/>'),

  // Mapper / GeneralMapping: two columns of dots connected by crossing wires — "field mapping"
  mappingactivity: svgUri(G,
    '<circle cx="5" cy="7" r="1.5" fill="' + G + '" stroke="none"/>' +
    '<circle cx="5" cy="12" r="1.5" fill="' + G + '" stroke="none"/>' +
    '<circle cx="5" cy="17" r="1.5" fill="' + G + '" stroke="none"/>' +
    '<circle cx="19" cy="9" r="1.5" fill="' + G + '" stroke="none"/>' +
    '<circle cx="19" cy="15" r="1.5" fill="' + G + '" stroke="none"/>' +
    '<line x1="6.5" y1="7" x2="17.5" y2="9"/>' +
    '<line x1="6.5" y1="12" x2="17.5" y2="9"/>' +
    '<line x1="6.5" y1="17" x2="17.5" y2="15"/>' +
    '<line x1="6.5" y1="12" x2="17.5" y2="15"/>'),

  generalmappingactivity: svgUri(G,
    '<circle cx="5" cy="7" r="1.5" fill="' + G + '" stroke="none"/>' +
    '<circle cx="5" cy="12" r="1.5" fill="' + G + '" stroke="none"/>' +
    '<circle cx="5" cy="17" r="1.5" fill="' + G + '" stroke="none"/>' +
    '<circle cx="19" cy="9" r="1.5" fill="' + G + '" stroke="none"/>' +
    '<circle cx="19" cy="15" r="1.5" fill="' + G + '" stroke="none"/>' +
    '<line x1="6.5" y1="7" x2="17.5" y2="9"/>' +
    '<line x1="6.5" y1="12" x2="17.5" y2="9"/>' +
    '<line x1="6.5" y1="17" x2="17.5" y2="15"/>' +
    '<line x1="6.5" y1="12" x2="17.5" y2="15"/>'),

  // CallProcess: open process box with a smaller nested box inside — "calls a sub-process"
  callprocessactivity: svgUri(G,
    '<rect x="2" y="3" width="14" height="11" rx="2"/>' +
    '<rect x="8" y="10" width="14" height="11" rx="2" fill="white"/>' +
    '<line x1="13" y1="15" x2="18" y2="15"/>' +
    '<polyline points="15 13 18 15 15 17"/>'),

  // Sleep: crescent moon + Zzz dots — "pause execution"
  sleepactivity: svgUri(G,
    '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' +
    '<circle cx="16" cy="5" r="0.8" fill="' + G + '" stroke="none"/>' +
    '<circle cx="18" cy="3" r="0.8" fill="' + G + '" stroke="none"/>' +
    '<circle cx="20" cy="5" r="0.8" fill="' + G + '" stroke="none"/>'),

  // Assign: clipboard with a pencil — "assigns a value to a variable"
  assignactivity: svgUri(G,
    '<path d="M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1z"/>' +
    '<rect x="4" y="3" width="16" height="18" rx="2"/>' +
    '<path d="M10 14.5l5-5 1.5 1.5-5 5H10v-1.5z"/>' +
    '<line x1="14" y1="11" x2="15.5" y2="12.5"/>'),

  // Generate Error: filled warning triangle with "!" — "throws a fault"
  generateerroractivity: svgUri(G,
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke-width="1.5"/>' +
    '<line x1="12" y1="9" x2="12" y2="14"/>' +
    '<line x1="12" y1="17" x2="12.01" y2="17" stroke-width="3"/>'),

  // Catch: shield with checkmark — "catches a fault and handles it"
  catchactivity: svgUri(G,
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
    '<polyline points="9 12 11 14 15 10"/>'),

  // Rethrow: upward arrow from a circle — "re-throws the caught fault"
  rethrowactivity: svgUri(G,
    '<circle cx="12" cy="19" r="3"/>' +
    '<line x1="12" y1="16" x2="12" y2="7"/>' +
    '<polyline points="8 11 12 7 16 11"/>'),

  // GetSharedVariable: DB cylinder with arrow leaving — "reads a shared variable"
  getsharedvariableactivity: svgUri(G,
    '<ellipse cx="12" cy="5" rx="8" ry="3"/>' +
    '<path d="M4 5v14a8 3 0 0 0 16 0V5"/>' +
    '<line x1="8" y1="12" x2="4" y2="12"/>' +
    '<polyline points="6 10 4 12 6 14"/>'),

  // SetSharedVariable: DB cylinder with arrow entering — "writes a shared variable"
  setsharedvariableactivity: svgUri(G,
    '<ellipse cx="12" cy="5" rx="8" ry="3"/>' +
    '<path d="M4 5v14a8 3 0 0 0 16 0V5"/>' +
    '<line x1="16" y1="12" x2="20" y2="12"/>' +
    '<polyline points="18 10 20 12 18 14"/>'),

  // Timer Starter: clock with tick marks — "starts on a schedule"
  timerstarter: svgUri(G,
    '<circle cx="12" cy="12" r="9"/>' +
    '<polyline points="12 7 12 12 16 14"/>' +
    '<line x1="12" y1="3" x2="12" y2="5"/>' +
    '<line x1="21" y1="12" x2="19" y2="12"/>'),

  // OnStartup Starter: power button — "runs when the engine starts"
  onstartupstarter: svgUri(G,
    '<path d="M18.36 6.64A9 9 0 1 1 5.64 6.64"/>' +
    '<line x1="12" y1="2" x2="12" y2="12"/>'),

  // OnShutdown Starter: power off square — "runs when the engine stops"
  onshutdownstarter: svgUri(G,
    '<circle cx="12" cy="12" r="9"/>' +
    '<line x1="12" y1="7" x2="12" y2="12"/>' +
    '<path d="M9 10a5 5 0 1 0 6 0"/>'),

  // OnError Starter: lightning bolt in circle — "starts when an error occurs"
  onerrorstarter: svgUri(G,
    '<circle cx="12" cy="12" r="9"/>' +
    '<polygon points="13 7 8 13 12 13 11 17 16 11 12 11" fill="' + G + '" stroke="none"/>'),

  oneventtimeoutstarter: svgUri(G,
    '<circle cx="12" cy="12" r="9"/>' +
    '<polyline points="12 7 12 12 15 14"/>' +
    '<path d="M16 3l2 2M8 3L6 5"/>'),

  onnotificationtimeoutstarter: svgUri(G,
    '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
    '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
    '<line x1="12" y1="2" x2="12" y2="4" stroke-width="3"/>'),

  // Engine Command: gear with command line chevron inside — "sends a command to the engine"
  enginecommandactivity: svgUri(G,
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41"/>' +
    '<path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>'),

  // External Command: terminal ">" prompt — "runs an OS shell command"
  externalcommandactivity: svgUri(G,
    '<rect x="2" y="3" width="20" height="18" rx="2"/>' +
    '<line x1="2" y1="9" x2="22" y2="9"/>' +
    '<polyline points="6 13 9 16 6 19"/>' +
    '<line x1="11" y1="19" x2="16" y2="19"/>'),

  // Invoke: two overlapping circles with arrows — "invokes a business rule / sub-service"
  invokeactivity: svgUri(G,
    '<circle cx="8" cy="12" r="5"/>' +
    '<circle cx="16" cy="12" r="5"/>' +
    '<line x1="11" y1="10" x2="13" y2="10"/>' +
    '<polyline points="12 9 13 10 12 11"/>'),

  // Reply: curved return arrow — "sends a reply back to the caller"
  replyactivity: svgUri(G,
    '<polyline points="9 17 4 12 9 7"/>' +
    '<path d="M4 12h11a4 4 0 0 1 0 8H14"/>'),

  // Notify: bell — "sends a notification to a waiting process"
  notifyactivity: svgUri(G,
    '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
    '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),

  // Wait: hourglass — "waits for a notification or timeout"
  waitactivity: svgUri(G,
    '<path d="M5 22h14M5 2h14"/>' +
    '<path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"/>' +
    '<path d="M7 2v4.17a2 2 0 0 1 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>'),

  // Receive Event / Receive Notification: inbox tray with downward arrow
  receiveeventactivity: svgUri(G,
    '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>' +
    '<path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24A2 2 0 0 0 5.45 5.11z"/>'),

  receivenotificationstarter: svgUri(G,
    '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>' +
    '<path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24A2 2 0 0 0 5.45 5.11z"/>'),

  // Checkpoint: flag on a post — "saves state for recovery"
  checkpointactivity: svgUri(G,
    '<line x1="4" y1="3" x2="4" y2="21"/>' +
    '<path d="M4 5h12l-3 4 3 4H4V5z"/>'),

  // Label: price-tag label — "a named branch point"
  labelactivity: svgUri(G,
    '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>' +
    '<circle cx="7" cy="7" r="1.5" fill="' + G + '" stroke="none"/>'),

  // Inspector: magnifying glass — "inspects/validates a variable"
  inspectoractivity: svgUri(G,
    '<circle cx="11" cy="11" r="7"/>' +
    '<line x1="21" y1="21" x2="16.65" y2="16.65"/>'),

  // Confirm: checkmark in rounded box — "confirms / approves"
  confirmactivity: svgUri(G,
    '<rect x="3" y="3" width="18" height="18" rx="3"/>' +
    '<polyline points="8 12 11 15 16 9"/>'),

  // Custom Activity: star/sparkle — "a developer-defined custom activity"
  customactivityactivity: svgUri(G,
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),

  // ── JDBC (teal) ───────────────────────────────────────────────────────────

  // JDBC Query: table/grid with a magnifying glass — "reads rows from a table"
  jdbcqueryactivity: svgUri(JD,
    '<rect x="2" y="5" width="14" height="14" rx="1"/>' +
    '<line x1="2" y1="10" x2="16" y2="10"/>' +
    '<line x1="2" y1="15" x2="16" y2="15"/>' +
    '<line x1="7" y1="5" x2="7" y2="19"/>' +
    '<circle cx="19" cy="8" r="3"/>' +
    '<line x1="21.1" y1="10.1" x2="23" y2="12"/>'),

  // JDBC Update: table with a pencil — "inserts or updates rows"
  jdbcupdateactivity: svgUri(JD,
    '<rect x="2" y="5" width="13" height="14" rx="1"/>' +
    '<line x1="2" y1="10" x2="15" y2="10"/>' +
    '<line x1="2" y1="15" x2="15" y2="15"/>' +
    '<line x1="7" y1="5" x2="7" y2="19"/>' +
    '<path d="M18 3l3 3-7 7h-3v-3z"/>'),

  // JDBC Call Procedure: curly function brackets — "executes a stored procedure"
  jdbccallprocedureactivity: svgUri(JD,
    '<path d="M8 4H6a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2"/>' +
    '<path d="M16 4h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2"/>' +
    '<line x1="9" y1="12" x2="15" y2="12"/>'),

  // SQL Direct: terminal box with "SQL>" text representation
  sqldirectactivity: svgUri(JD,
    '<rect x="2" y="4" width="20" height="16" rx="2"/>' +
    '<polyline points="6 10 9 13 6 16"/>' +
    '<line x1="11" y1="16" x2="16" y2="16"/>'),

  // JDBC GetConnection: two plugs connecting — "acquires a JDBC connection"
  jdbcgetconnectionactivity: svgUri(JD,
    '<path d="M14 2L10 6H7a1 1 0 0 0-1 1v3l-3 3 3 3v3a1 1 0 0 0 1 1h3l4 4V2z"/>' +
    '<path d="M10 6l4 4"/>' +
    '<path d="M14 22l4-4h3a1 1 0 0 0 1-1v-3l3-3-3-3V5a1 1 0 0 0-1-1h-3L14 0"/>'),

  // ── HTTP (orange) ─────────────────────────────────────────────────────────

  // HTTP Receiver Starter: antenna tower with three concentric arcs — "receives HTTP requests"
  httpreceivestarter: svgUri(HT,
    '<line x1="12" y1="20" x2="12" y2="14"/>' +
    '<path d="M8.5 14a5 5 0 0 1 7 0"/>' +
    '<path d="M5 11a9 9 0 0 1 14 0"/>' +
    '<path d="M1.5 8a13.5 13.5 0 0 1 21 0"/>' +
    '<circle cx="12" cy="21" r="1" fill="' + HT + '" stroke="none"/>'),

  httpreceiverstarter: svgUri(HT,
    '<line x1="12" y1="20" x2="12" y2="14"/>' +
    '<path d="M8.5 14a5 5 0 0 1 7 0"/>' +
    '<path d="M5 11a9 9 0 0 1 14 0"/>' +
    '<path d="M1.5 8a13.5 13.5 0 0 1 21 0"/>' +
    '<circle cx="12" cy="21" r="1" fill="' + HT + '" stroke="none"/>'),

  // Send HTTP Request: globe with outgoing arrow — "calls an HTTP endpoint"
  sendhttprequestactivity: svgUri(HT,
    '<circle cx="10" cy="12" r="7"/>' +
    '<line x1="2" y1="12" x2="17" y2="12"/>' +
    '<path d="M10 5a12 12 0 0 1 3 7 12 12 0 0 1-3 7 12 12 0 0 1-3-7 12 12 0 0 1 3-7z"/>' +
    '<polyline points="18 8 22 8 22 12"/>'),

  // Send HTTP Response: globe with returning arrow — "sends an HTTP response"
  sendhttpresponseactivity: svgUri(HT,
    '<circle cx="14" cy="12" r="7"/>' +
    '<line x1="7" y1="12" x2="22" y2="12"/>' +
    '<path d="M14 5a12 12 0 0 1 3 7 12 12 0 0 1-3 7 12 12 0 0 1-3-7 12 12 0 0 1 3-7z"/>' +
    '<polyline points="6 8 2 8 2 12"/>'),

  // Wait For HTTP Request Signal: globe + clock badge — "waits for an async HTTP signal"
  waitforhttprequestsignal: svgUri(HT,
    '<circle cx="10" cy="10" r="7"/>' +
    '<line x1="2" y1="10" x2="17" y2="10"/>' +
    '<path d="M10 4a10 10 0 0 1 2.5 6"/>' +
    '<circle cx="19" cy="19" r="4"/>' +
    '<polyline points="19 17 19 19 21 20"/>'),

  // SSE Client Starter: streaming waves + downward arrow — "receives server-sent events"
  sseclientstarter: svgUri(HT,
    '<path d="M3 9a9 9 0 0 1 9-9 9 9 0 0 1 9 9"/>' +
    '<path d="M7 9a5 5 0 0 1 10 0"/>' +
    '<line x1="12" y1="12" x2="12" y2="20"/>' +
    '<polyline points="9 17 12 20 15 17"/>'),

  resthttpreceiveeventactivity: svgUri(HT,
    '<line x1="12" y1="20" x2="12" y2="14"/>' +
    '<path d="M8.5 14a5 5 0 0 1 7 0"/>' +
    '<path d="M5 11a9 9 0 0 1 14 0"/>' +
    '<circle cx="12" cy="21" r="1" fill="' + HT + '" stroke="none"/>'),

  resthttpsendreplyactivity: svgUri(HT,
    '<circle cx="14" cy="12" r="7"/>' +
    '<line x1="7" y1="12" x2="22" y2="12"/>' +
    '<path d="M14 5a12 12 0 0 1 3 7 12 12 0 0 1-3 7 12 12 0 0 1-3-7 12 12 0 0 1 3-7z"/>' +
    '<polyline points="6 8 2 8 2 12"/>'),

  resthttpclientactivity: svgUri(HT,
    '<circle cx="10" cy="12" r="7"/>' +
    '<line x1="2" y1="12" x2="17" y2="12"/>' +
    '<path d="M10 5a12 12 0 0 1 3 7 12 12 0 0 1-3 7 12 12 0 0 1-3-7 12 12 0 0 1 3-7z"/>' +
    '<polyline points="18 8 22 8 22 12"/>'),

  // ── JMS / EMS (indigo) ────────────────────────────────────────────────────

  // JMS Send / EMS Publish: envelope with rightward arrow — "publishes a message"
  jmssendactivity: svgUri(JM,
    '<rect x="2" y="5" width="16" height="13" rx="2"/>' +
    '<polyline points="2 5 10 12 18 5"/>' +
    '<polyline points="18 11 22 11"/>' +
    '<polyline points="20 9 22 11 20 13"/>'),

  emspublishactivity: svgUri(JM,
    '<rect x="2" y="5" width="16" height="13" rx="2"/>' +
    '<polyline points="2 5 10 12 18 5"/>' +
    '<polyline points="18 11 22 11"/>' +
    '<polyline points="20 9 22 11 20 13"/>'),

  emssendmessageactivity: svgUri(JM,
    '<rect x="2" y="5" width="16" height="13" rx="2"/>' +
    '<polyline points="2 5 10 12 18 5"/>' +
    '<polyline points="18 11 22 11"/>' +
    '<polyline points="20 9 22 11 20 13"/>'),

  // JMS Receive Starter: envelope with leftward arrow — "subscribes to receive messages"
  jmsreceivemessagestarter: svgUri(JM,
    '<rect x="6" y="5" width="16" height="13" rx="2"/>' +
    '<polyline points="6 5 14 12 22 5"/>' +
    '<polyline points="6 11 2 11"/>' +
    '<polyline points="4 9 2 11 4 13"/>'),

  emssubscriberstarter: svgUri(JM,
    '<rect x="6" y="5" width="16" height="13" rx="2"/>' +
    '<polyline points="6 5 14 12 22 5"/>' +
    '<polyline points="6 11 2 11"/>' +
    '<polyline points="4 9 2 11 4 13"/>'),

  emsreceivemessagestarter: svgUri(JM,
    '<rect x="6" y="5" width="16" height="13" rx="2"/>' +
    '<polyline points="6 5 14 12 22 5"/>' +
    '<polyline points="6 11 2 11"/>' +
    '<polyline points="4 9 2 11 4 13"/>'),

  // GetJMSQueueMessage: stacked envelopes with pick arrow — "gets a queued message"
  getjmsqueuemessageactivity: svgUri(JM,
    '<rect x="3" y="10" width="16" height="11" rx="2"/>' +
    '<polyline points="3 10 11 16 19 10"/>' +
    '<path d="M5 7h14M7 4h10"/>'),

  // ReplyToJMSMessage: envelope with reply arc — "replies to the sender"
  replytojmsmessageactivity: svgUri(JM,
    '<rect x="2" y="6" width="16" height="12" rx="2"/>' +
    '<polyline points="2 6 10 12 18 6"/>' +
    '<polyline points="9 15 6 12 9 9"/>'),

  emsreplyactivity: svgUri(JM,
    '<rect x="2" y="6" width="16" height="12" rx="2"/>' +
    '<polyline points="2 6 10 12 18 6"/>' +
    '<polyline points="9 15 6 12 9 9"/>'),

  // JMSRequestReply: two envelopes facing each other — "sends and waits for a reply"
  jmsrequestreplyactivity: svgUri(JM,
    '<rect x="2" y="3" width="11" height="8" rx="1"/>' +
    '<polyline points="2 3 7.5 7 13 3"/>' +
    '<rect x="11" y="13" width="11" height="8" rx="1"/>' +
    '<polyline points="11 13 16.5 17 22 13"/>' +
    '<line x1="7" y1="11" x2="7" y2="13"/>' +
    '<polyline points="5 12 7 14 9 12"/>'),

  emsrequestreplyactivity: svgUri(JM,
    '<rect x="2" y="3" width="11" height="8" rx="1"/>' +
    '<polyline points="2 3 7.5 7 13 3"/>' +
    '<rect x="11" y="13" width="11" height="8" rx="1"/>' +
    '<polyline points="11 13 16.5 17 22 13"/>' +
    '<line x1="7" y1="11" x2="7" y2="13"/>' +
    '<polyline points="5 12 7 14 9 12"/>'),

  // WaitForJMSMessageSignal: envelope + clock — "waits for a specific JMS message"
  waitforjmsmessagesignal: svgUri(JM,
    '<rect x="2" y="5" width="13" height="10" rx="2"/>' +
    '<polyline points="2 5 8.5 10 15 5"/>' +
    '<circle cx="18" cy="18" r="5"/>' +
    '<polyline points="18 15 18 18 20 19.5"/>'),

  // ── File (green) ──────────────────────────────────────────────────────────

  // ReadFile: document with upward arrow — "reads file contents"
  readfileactivity: svgUri(FL,
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="12" y1="13" x2="12" y2="19"/>' +
    '<polyline points="9 16 12 19 15 16"/>'),

  // WriteFile: document with downward arrow — "writes to a file"
  writefileactivity: svgUri(FL,
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="12" y1="19" x2="12" y2="13"/>' +
    '<polyline points="9 16 12 13 15 16"/>'),

  // CopyFile: two overlapping documents — "copies a file"
  copyfileactivity: svgUri(FL,
    '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),

  // CreateFile: document with a "+" — "creates a new file"
  createfileactivity: svgUri(FL,
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="12" y1="13" x2="12" y2="19"/>' +
    '<line x1="9" y1="16" x2="15" y2="16"/>'),

  // RemoveFile: document with an "×" — "deletes a file"
  removefileactivity: svgUri(FL,
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="10" y1="13" x2="14" y2="19"/>' +
    '<line x1="14" y1="13" x2="10" y2="19"/>'),

  // RenameFile: document with a rename/arrow loop — "renames a file"
  renamefileactivity: svgUri(FL,
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>' +
    '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/>'),

  // ListFiles: folder with list lines — "lists files in a directory"
  listfilesactivity: svgUri(FL,
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '<line x1="9" y1="14" x2="17" y2="14"/>' +
    '<line x1="9" y1="17" x2="14" y2="17"/>'),

  // FilePoller Starter: folder with eye/watcher — "polls for new/changed files"
  filepollerstarter: svgUri(FL,
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '<circle cx="13" cy="15" r="3"/>' +
    '<path d="M8 15a6 4 0 0 0 10 0 6 4 0 0 0-10 0z"/>'),

  // WaitForFileChange: document with clock badge — "waits for file system events"
  waitforfilechangesignal: svgUri(FL,
    '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9"/>' +
    '<circle cx="18" cy="8" r="5"/>' +
    '<polyline points="18 5.5 18 8 19.5 9.5"/>'),

  // ── FTP (blue) ────────────────────────────────────────────────────────────

  // FtpGet: server with downward arrow — "downloads a file from an FTP server"
  ftpgetactivity: svgUri(FT,
    '<rect x="2" y="2" width="20" height="7" rx="2"/>' +
    '<rect x="2" y="15" width="20" height="7" rx="2"/>' +
    '<circle cx="6" cy="5.5" r="1" fill="' + FT + '" stroke="none"/>' +
    '<circle cx="6" cy="18.5" r="1" fill="' + FT + '" stroke="none"/>' +
    '<line x1="12" y1="9" x2="12" y2="15"/>' +
    '<polyline points="9 12.5 12 15 15 12.5"/>'),

  // FtpPut: server with upward arrow — "uploads a file to an FTP server"
  ftpputactivity: svgUri(FT,
    '<rect x="2" y="2" width="20" height="7" rx="2"/>' +
    '<rect x="2" y="15" width="20" height="7" rx="2"/>' +
    '<circle cx="6" cy="5.5" r="1" fill="' + FT + '" stroke="none"/>' +
    '<circle cx="6" cy="18.5" r="1" fill="' + FT + '" stroke="none"/>' +
    '<line x1="12" y1="15" x2="12" y2="9"/>' +
    '<polyline points="9 11.5 12 9 15 11.5"/>'),

  // FtpDir: remote folder with listing lines — "lists remote directory"
  ftpdiractivity: svgUri(FT,
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '<line x1="9" y1="14" x2="17" y2="14"/>' +
    '<line x1="9" y1="17" x2="15" y2="17"/>'),

  // FtpDelete: remote folder with "×" — "deletes a remote file"
  ftpdeletefileactivity: svgUri(FT,
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '<line x1="10" y1="13" x2="16" y2="18"/>' +
    '<line x1="16" y1="13" x2="10" y2="18"/>'),

  ftpdeletfileactivity: svgUri(FT,
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '<line x1="10" y1="13" x2="16" y2="18"/>' +
    '<line x1="16" y1="13" x2="10" y2="18"/>'),

  // FtpRename: remote folder with pen — "renames a remote file"
  ftprenamefileactivity: svgUri(FT,
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '<path d="M11 17l3-3 1.5 1.5-3 3H11v-1.5z"/>'),

  // FtpMakeDir: remote folder with "+" — "creates a remote directory"
  ftpmakeremotedirectoryactivity: svgUri(FT,
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '<line x1="13" y1="12" x2="13" y2="18"/>' +
    '<line x1="10" y1="15" x2="16" y2="15"/>'),

  // FtpRemoveDir: remote folder with "−" — "removes a remote directory"
  ftpremoveremotedirectoryactivity: svgUri(FT,
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '<line x1="10" y1="15" x2="16" y2="15"/>'),

  ftpchangedefaultdirectoryactivity: svgUri(FT,
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '<polyline points="9 15 13 15 13 11"/>' +
    '<polyline points="11 13 13 11 15 13"/>'),

  ftpgetdefaultdirectoryactivity: svgUri(FT,
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' +
    '<circle cx="13" cy="15" r="3"/>'),

  ftpsystypeactivity: svgUri(FT,
    '<rect x="2" y="3" width="20" height="18" rx="2"/>' +
    '<line x1="2" y1="9" x2="22" y2="9"/>' +
    '<line x1="9" y1="21" x2="9" y2="9"/>'),

  // ── XML (violet) ──────────────────────────────────────────────────────────

  // ParseXML: "<>" brackets with incoming arrow — "parses XML text into a variable"
  parsexmlactivity: svgUri(XL,
    '<polyline points="7 9 4 12 7 15"/>' +
    '<polyline points="17 9 20 12 17 15"/>' +
    '<line x1="13" y1="12" x2="11" y2="12"/>' +
    '<polyline points="3 6 3 3 6 3"/>' +
    '<line x1="3" y1="3" x2="8" y2="8"/>'),

  // RenderXML: "<>" brackets with outgoing arrow — "serializes a variable to XML"
  renderxmlactivity: svgUri(XL,
    '<polyline points="7 9 4 12 7 15"/>' +
    '<polyline points="17 9 20 12 17 15"/>' +
    '<line x1="11" y1="12" x2="13" y2="12"/>' +
    '<polyline points="21 6 21 3 18 3"/>' +
    '<line x1="21" y1="3" x2="16" y2="8"/>'),

  // TransformXML: "<>" brackets with XSLT/transform arrows — "transforms XML with XSLT"
  transformxmlactivity: svgUri(XL,
    '<polyline points="7 9 4 12 7 15"/>' +
    '<polyline points="17 9 20 12 17 15"/>' +
    '<line x1="9" y1="10" x2="15" y2="10"/>' +
    '<polyline points="13 8 15 10 13 12"/>' +
    '<line x1="15" y1="14" x2="9" y2="14"/>' +
    '<polyline points="11 12 9 14 11 16"/>'),

  // ── Parse — custom data formats (dark blue) ───────────────────────────────

  // ParseData: three stacked bars with incoming arrow — "parses a data record"
  parsedataactivity: svgUri(PA,
    '<rect x="5" y="4" width="14" height="3" rx="1"/>' +
    '<rect x="5" y="10" width="14" height="3" rx="1"/>' +
    '<rect x="5" y="16" width="14" height="3" rx="1"/>' +
    '<line x1="2" y1="5.5" x2="5" y2="5.5"/>' +
    '<polyline points="3.5 4 5 5.5 3.5 7"/>'),

  // RenderData: three stacked bars with outgoing arrow — "renders data to a string"
  renderdataactivity: svgUri(PA,
    '<rect x="5" y="4" width="14" height="3" rx="1"/>' +
    '<rect x="5" y="10" width="14" height="3" rx="1"/>' +
    '<rect x="5" y="16" width="14" height="3" rx="1"/>' +
    '<line x1="19" y1="17.5" x2="22" y2="17.5"/>' +
    '<polyline points="20.5 16 22 17.5 20.5 19"/>'),

  // ── Mail (rose) ───────────────────────────────────────────────────────────

  // SendMail: envelope with paper-plane tail — "sends an email"
  sendmailactivity: svgUri(ML,
    '<path d="M22 2L11 13"/>' +
    '<path d="M22 2L15 22l-4-9-9-4 20-7z"/>'),

  // ReceiveMailStarter: envelope with incoming arrow — "triggers on received email"
  receivemailstarter: svgUri(ML,
    '<rect x="2" y="4" width="20" height="16" rx="2"/>' +
    '<polyline points="22 6 12 13 2 6"/>'),

  // ── TCP (cyan) ────────────────────────────────────────────────────────────

  // ReadTCPData: plug/socket with upward data arrow — "reads data from a TCP socket"
  readtcpdataactivity: svgUri(TC,
    '<path d="M5 9V5a2 2 0 0 1 4 0v4"/>' +
    '<path d="M15 9V5a2 2 0 0 1 4 0v4"/>' +
    '<path d="M4 9h16a1 1 0 0 1 1 1v4a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-4a1 1 0 0 1 1-1z"/>' +
    '<line x1="12" y1="14" x2="12" y2="20"/>' +
    '<polyline points="9 17 12 20 15 17"/>'),

  // WriteTCPData: plug/socket with downward data arrow — "sends data over a TCP socket"
  writetcpdataactivity: svgUri(TC,
    '<path d="M5 9V5a2 2 0 0 1 4 0v4"/>' +
    '<path d="M15 9V5a2 2 0 0 1 4 0v4"/>' +
    '<path d="M4 9h16a1 1 0 0 1 1 1v4a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-4a1 1 0 0 1 1-1z"/>' +
    '<line x1="12" y1="20" x2="12" y2="14"/>' +
    '<polyline points="9 17 12 14 15 17"/>'),

  // TCPReceiverStarter: antenna with signal arcs — "accepts incoming TCP connections"
  tcpreceivestarter: svgUri(TC,
    '<rect x="8" y="16" width="8" height="6" rx="1"/>' +
    '<line x1="12" y1="16" x2="12" y2="11"/>' +
    '<path d="M8.5 11a5 5 0 0 1 7 0"/>' +
    '<path d="M5.5 8a9 9 0 0 1 13 0"/>'),

  tcpreceiverstarter: svgUri(TC,
    '<rect x="8" y="16" width="8" height="6" rx="1"/>' +
    '<line x1="12" y1="16" x2="12" y2="11"/>' +
    '<path d="M8.5 11a5 5 0 0 1 7 0"/>' +
    '<path d="M5.5 8a9 9 0 0 1 13 0"/>'),

  // TCPOpenConnection: two open half-circles (plug not yet connected) — "opens a socket"
  tcpopenconnectionactivity: svgUri(TC,
    '<path d="M9 5l-5.5 5.5a4 4 0 0 0 5.5 5.5L14 11"/>' +
    '<path d="M15 19l5.5-5.5a4 4 0 0 0-5.5-5.5L10 13"/>'),

  // TCPCloseConnection: plug halves joined with line — "closes a socket"
  tcpcloseconnectionactivity: svgUri(TC,
    '<path d="M9 5l-5.5 5.5a4 4 0 0 0 5.5 5.5L14 11"/>' +
    '<path d="M15 19l5.5-5.5a4 4 0 0 0-5.5-5.5L10 13"/>' +
    '<line x1="9" y1="9" x2="15" y2="15"/>'),

  // WaitForTCPRequest: plug/socket + clock — "waits for a TCP signal"
  waitfortcprequestsignal: svgUri(TC,
    '<path d="M5 9V5a2 2 0 0 1 4 0v4"/>' +
    '<path d="M4 9h10a1 1 0 0 1 1 1v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3a1 1 0 0 1 1-1z"/>' +
    '<circle cx="19" cy="18" r="4"/>' +
    '<polyline points="19 16 19 18 21 19"/>'),

  // ── Java (amber) ──────────────────────────────────────────────────────────

  // JavaCode: curly braces {} — "executes inline Java code"
  javacodeactivity: svgUri(JV,
    '<path d="M10 3H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h4"/>' +
    '<path d="M14 3h4a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-4"/>'),

  // JavaMethod: method call "f( )" symbol — "calls a Java method"
  javamethodactivity: svgUri(JV,
    '<path d="M9 5h-2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-12a2 2 0 0 0-2-2h-2"/>' +
    '<rect x="9" y="3" width="6" height="4" rx="1"/>' +
    '<line x1="9" y1="12" x2="15" y2="12"/>' +
    '<line x1="9" y1="16" x2="12" y2="16"/>'),

  // JavaToXml: Java cup → XML tags — "converts a Java object to XML"
  javatoxmlactivity: svgUri(JV,
    '<path d="M6 2h7l2 5H6L6 2z"/>' +
    '<path d="M4 7a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2"/>' +
    '<line x1="14" y1="12" x2="18" y2="12"/>' +
    '<polyline points="16 10 18 12 16 14"/>' +
    '<polyline points="20 9 18 12 20 15"/>'),

  // XmlToJava: XML tags → Java cup — "converts XML to a Java object"
  xmltojavaactivity: svgUri(JV,
    '<polyline points="4 9 2 12 4 15"/>' +
    '<line x1="6" y1="12" x2="10" y2="12"/>' +
    '<polyline points="8 10 10 12 8 14"/>' +
    '<path d="M12 2h7l2 5H12L12 2z"/>' +
    '<path d="M10 7a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2"/>'),

  // JavaEventSourceStarter: lightning bolt in circle — "Java event source"
  javaeventstarter: svgUri(JV,
    '<circle cx="12" cy="12" r="9"/>' +
    '<polygon points="13 7 8 13 12 13 11 17 16 11 12 11" fill="' + JV + '" stroke="none"/>'),

  javaeventssourcestarter: svgUri(JV,
    '<circle cx="12" cy="12" r="9"/>' +
    '<polygon points="13 7 8 13 12 13 11 17 16 11 12 11" fill="' + JV + '" stroke="none"/>'),

  // ── Rescue (red) ──────────────────────────────────────────────────────────

  // RescueActivity: life-ring / lifebuoy — "rescue / error recovery zone"
  rescueactivity: svgUri(RS,
    '<circle cx="12" cy="12" r="9"/>' +
    '<circle cx="12" cy="12" r="4"/>' +
    '<line x1="5.6" y1="5.6" x2="8.5" y2="8.5"/>' +
    '<line x1="18.4" y1="5.6" x2="15.5" y2="8.5"/>' +
    '<line x1="5.6" y1="18.4" x2="8.5" y2="15.5"/>' +
    '<line x1="18.4" y1="18.4" x2="15.5" y2="15.5"/>'),

  // ── REST JSON (orange-red) ────────────────────────────────────────────────

  // InvokeRESTService: globe with circling API arrows — "calls a REST API"
  invokerestserviceactivity: svgUri(RJ,
    '<circle cx="12" cy="12" r="8"/>' +
    '<line x1="2" y1="12" x2="22" y2="12"/>' +
    '<path d="M12 4a16 16 0 0 1 4 8 16 16 0 0 1-4 8 16 16 0 0 1-4-8 16 16 0 0 1 4-8z"/>' +
    '<polyline points="19 8 22 8 22 11"/>'),

  // ParseJSON: curly braces with rightward arrow — "parses a JSON string"
  parsejsonactivity: svgUri(RJ,
    '<path d="M8 3H6a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2"/>' +
    '<path d="M16 3h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2"/>' +
    '<line x1="7" y1="12" x2="10" y2="12"/>' +
    '<polyline points="8.5 10 10 12 8.5 14"/>'),

  // RenderJSON: curly braces with leftward arrow — "renders data as JSON"
  renderjsonactivity: svgUri(RJ,
    '<path d="M8 3H6a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2"/>' +
    '<path d="M16 3h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2"/>' +
    '<line x1="17" y1="12" x2="14" y2="12"/>' +
    '<polyline points="15.5 10 14 12 15.5 14"/>'),

  // ── Kafka (red) — producer/consumer of partitioned log topics ───────────

  // Kafka Send: producer node → broker bus → 3 partition lines (publish to topic)
  kafkasendactivity: svgUri(KF,
    '<circle cx="4" cy="12" r="2.5"/>' +
    '<line x1="6.5" y1="12" x2="9" y2="12"/>' +
    '<polyline points="7.5 10 9.5 12 7.5 14"/>' +
    '<line x1="9" y1="6" x2="9" y2="18"/>' +
    '<line x1="9" y1="8" x2="22" y2="8"/>' +
    '<line x1="9" y1="12" x2="22" y2="12"/>' +
    '<line x1="9" y1="16" x2="22" y2="16"/>'),

  // Kafka Subscribe/Receive: 3 partition lines → broker bus → consumer node (consume from topic)
  kafkasubscribeactivity: svgUri(KF,
    '<line x1="2" y1="8" x2="15" y2="8"/>' +
    '<line x1="2" y1="12" x2="15" y2="12"/>' +
    '<line x1="2" y1="16" x2="15" y2="16"/>' +
    '<line x1="15" y1="6" x2="15" y2="18"/>' +
    '<line x1="15" y1="12" x2="17.5" y2="12"/>' +
    '<polyline points="16.5 10 18.5 12 16.5 14"/>' +
    '<circle cx="21" cy="12" r="2.5"/>'),

  kafkaconsumeractivity: svgUri(KF,
    '<line x1="2" y1="8" x2="15" y2="8"/>' +
    '<line x1="2" y1="12" x2="15" y2="12"/>' +
    '<line x1="2" y1="16" x2="15" y2="16"/>' +
    '<line x1="15" y1="6" x2="15" y2="18"/>' +
    '<line x1="15" y1="12" x2="17.5" y2="12"/>' +
    '<polyline points="16.5 10 18.5 12 16.5 14"/>' +
    '<circle cx="21" cy="12" r="2.5"/>'),

  // ── TIBCO EMS (TIBCO blue) — distinct from generic JMS indigo ───────────

  // EMS Send: envelope with broadcast fan on right (sending to multiple subscribers)
  emssendactivity: svgUri(EM,
    '<path d="M4 4h16c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>' +
    '<polyline points="2 6 12 12 22 6"/>' +
    '<line x1="18" y1="17" x2="21" y2="15"/>' +
    '<line x1="18" y1="19" x2="22" y2="19"/>' +
    '<line x1="18" y1="21" x2="21" y2="23"/>'),

  // EMS Receive: envelope with incoming arrow (subscribing to messages)
  emsreceiveactivity: svgUri(EM,
    '<path d="M4 4h16c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>' +
    '<polyline points="2 6 12 12 22 6"/>' +
    '<line x1="12" y1="18" x2="12" y2="23"/>' +
    '<polyline points="9 21 12 24 15 21"/>'),

  // ── SAP (SAP blue) — enterprise connector ─────────────────────────────────

  // SAP RFC/BAPI/iDoc: diamond (enterprise) with S-curve inside
  saprfcactivity: svgUri(SP,
    '<polygon points="12 2 22 12 12 22 2 12" stroke-width="1.5"/>' +
    '<path d="M9.5 9.5a2.5 2 0 1 1 5 0c0 2-5 2-5 4a2.5 2 0 1 0 5 0" stroke-width="2"/>'),

  sapbapiactivity: svgUri(SP,
    '<polygon points="12 2 22 12 12 22 2 12" stroke-width="1.5"/>' +
    '<path d="M9.5 9.5a2.5 2 0 1 1 5 0c0 2-5 2-5 4a2.5 2 0 1 0 5 0" stroke-width="2"/>'),

  sapidocactivity: svgUri(SP,
    '<polygon points="12 2 22 12 12 22 2 12" stroke-width="1.5"/>' +
    '<path d="M9.5 9.5a2.5 2 0 1 1 5 0c0 2-5 2-5 4a2.5 2 0 1 0 5 0" stroke-width="2"/>'),

  sapsendidocactivity: svgUri(SP,
    '<polygon points="12 2 22 12 12 22 2 12" stroke-width="1.5"/>' +
    '<path d="M9.5 9.5a2.5 2 0 1 1 5 0c0 2-5 2-5 4a2.5 2 0 1 0 5 0" stroke-width="2"/>'),

  // ── AWS / S3 (AWS orange) — cloud storage & functions ────────────────────

  // S3 Get: cloud with downward arrow (download from S3)
  s3getactivity: svgUri(S3,
    '<path d="M18 14.5a4.5 4.5 0 0 0-.8-8.9 6 6 0 1 0-11.4 4.4" stroke-width="1.5"/>' +
    '<rect x="8" y="14" width="8" height="7" rx="1" stroke-width="1.5"/>' +
    '<line x1="12" y1="9" x2="12" y2="14"/>' +
    '<polyline points="9 12 12 15 15 12"/>'),

  // S3 Put: cloud with upward arrow (upload to S3)
  s3putactivity: svgUri(S3,
    '<path d="M18 14.5a4.5 4.5 0 0 0-.8-8.9 6 6 0 1 0-11.4 4.4" stroke-width="1.5"/>' +
    '<rect x="8" y="14" width="8" height="7" rx="1" stroke-width="1.5"/>' +
    '<line x1="12" y1="19" x2="12" y2="14"/>' +
    '<polyline points="9 16 12 13 15 16"/>'),

  // S3 Delete: cloud with X (delete from S3)
  s3deleteactivity: svgUri(S3,
    '<path d="M18 12.5a4.5 4.5 0 0 0-.8-8.9 6 6 0 1 0-11.4 4.4" stroke-width="1.5"/>' +
    '<rect x="8" y="14" width="8" height="7" rx="1" stroke-width="1.5"/>' +
    '<line x1="10" y1="16" x2="14" y2="19"/>' +
    '<line x1="14" y1="16" x2="10" y2="19"/>'),

  // Lambda invoke: cloud with lightning bolt
  lambdainvokeactivity: svgUri(S3,
    '<path d="M18 14.5a4.5 4.5 0 0 0-.8-8.9 6 6 0 1 0-11.4 4.4" stroke-width="1.5"/>' +
    '<polyline points="13 10 11 15 13.5 15 11 20"/>'),

  // ── Salesforce (Salesforce blue) — CRM cloud ──────────────────────────────

  // Salesforce Query: cloud + magnifying glass
  salesforcequeryactivity: svgUri(SL,
    '<path d="M17 14a5.5 5.5 0 0 0-.6-9.8 6.5 6.5 0 1 0-11.3 5.8" stroke-width="1.5"/>' +
    '<circle cx="10" cy="17" r="3.5" stroke-width="1.5"/>' +
    '<line x1="12.5" y1="19.5" x2="15" y2="22"/>'),

  // Salesforce Create: cloud + plus sign
  salesforcecreateactivity: svgUri(SL,
    '<path d="M17 11a5.5 5.5 0 0 0-.6-9.8 6.5 6.5 0 1 0-11.3 5.8" stroke-width="1.5"/>' +
    '<circle cx="12" cy="18" r="4.5" stroke-width="1.5"/>' +
    '<line x1="12" y1="15.5" x2="12" y2="20.5"/>' +
    '<line x1="9.5" y1="18" x2="14.5" y2="18"/>'),

  // Salesforce Update: cloud + pencil
  salesforceupdateactivity: svgUri(SL,
    '<path d="M17 11a5.5 5.5 0 0 0-.6-9.8 6.5 6.5 0 1 0-11.3 5.8" stroke-width="1.5"/>' +
    '<path d="M8 19.5l7-7 3 3-7 7H8v-3z" stroke-width="1.5"/>' +
    '<line x1="13" y1="14" x2="16" y2="17"/>'),

  // Salesforce Delete: cloud + trash
  salesforceoperationactivity: svgUri(SL,
    '<path d="M17 11a5.5 5.5 0 0 0-.6-9.8 6.5 6.5 0 1 0-11.3 5.8" stroke-width="1.5"/>' +
    '<polyline points="9 16 9 22 15 22 15 16"/>' +
    '<line x1="7" y1="16" x2="17" y2="16"/>' +
    '<line x1="10" y1="14" x2="14" y2="14" stroke-width="1.5"/>'),

  // ── ServiceNow (ServiceNow green) — workflow / ITSM ──────────────────────

  // ServiceNow Create/Update/Query — gear with workflow indicator
  servicenowcreateactivity: svgUri(SN,
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12' +
    'M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke-width="1.5"/>'),

  servicenowupdateactivity: svgUri(SN,
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12' +
    'M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke-width="1.5"/>'),

  servicenowqueryactivity: svgUri(SN,
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12' +
    'M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke-width="1.5"/>'),

  servicenowoperationactivity: svgUri(SN,
    '<circle cx="12" cy="12" r="3"/>' +
    '<path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12' +
    'M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke-width="1.5"/>'),

  // ── ADB / TIBCO Data Plane (fuchsia) ─────────────────────────────────────

  // Data Requester / Merger / Poller: 3-node distributed cluster (data graph)
  datarequesteractivity: svgUri(AD,
    '<circle cx="12" cy="5" r="2.5"/>' +
    '<circle cx="5" cy="18" r="2.5"/>' +
    '<circle cx="19" cy="18" r="2.5"/>' +
    '<line x1="10.2" y1="7" x2="6.8" y2="16"/>' +
    '<line x1="13.8" y1="7" x2="17.2" y2="16"/>' +
    '<line x1="7.5" y1="18" x2="16.5" y2="18"/>'),

  datamergeractivity: svgUri(AD,
    '<circle cx="12" cy="5" r="2.5"/>' +
    '<circle cx="5" cy="18" r="2.5"/>' +
    '<circle cx="19" cy="18" r="2.5"/>' +
    '<line x1="10.2" y1="7" x2="6.8" y2="16"/>' +
    '<line x1="13.8" y1="7" x2="17.2" y2="16"/>' +
    '<line x1="7.5" y1="18" x2="16.5" y2="18"/>'),

  dataeventpolleractivity: svgUri(AD,
    '<circle cx="12" cy="5" r="2.5"/>' +
    '<circle cx="5" cy="18" r="2.5"/>' +
    '<circle cx="19" cy="18" r="2.5"/>' +
    '<line x1="10.2" y1="7" x2="6.8" y2="16"/>' +
    '<line x1="13.8" y1="7" x2="17.2" y2="16"/>' +
    '<line x1="7.5" y1="18" x2="16.5" y2="18"/>'),

  // ── Unknown / Fallback (slate) ────────────────────────────────────────────

  // Unknown activity: circuit board pattern — distinct "I don't know this" icon
  '__unknown__': svgUri(UN,
    '<rect x="9" y="9" width="6" height="6" rx="1"/>' +
    '<line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>' +
    '<line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>' +
    '<line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>' +
    '<line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>'),
};

// ─── Palette-level icon fallback ──────────────────────────────────────────────
// Maps palette name (middle segment of com.tibco.bw.palette.<name>.runtime.*)
// to a representative icon for any activity in that palette.

export const BW6_PALETTE_ICONS: Record<string, string> = {
  'kafka':       BW6_SVG_ICONS['kafkasendactivity']!,
  'sap':         BW6_SVG_ICONS['saprfcactivity']!,
  'salesforce':  BW6_SVG_ICONS['salesforcequeryactivity']!,
  'aws':         BW6_SVG_ICONS['s3getactivity']!,
  's3':          BW6_SVG_ICONS['s3getactivity']!,
  'servicenow':  BW6_SVG_ICONS['servicenowcreateactivity']!,
  'adbplugin':   BW6_SVG_ICONS['datarequesteractivity']!,
};

// ─── Name-based fallback for ActivityExtensionActivity ─────────────────────────
// When the Java class is a generic wrapper (ActivityExtensionActivity), we derive
// the icon from the human-readable activity name set in Studio.

function iconByName(name: string): string | undefined {
  const n = name.toLowerCase();
  // File palette
  if (/readfile|read.*file|file.*read/.test(n))    return BW6_SVG_ICONS['readfileactivity'];
  if (/writefile|write.*file|file.*write/.test(n)) return BW6_SVG_ICONS['writefileactivity'];
  if (/copyfile|copy.*file/.test(n))               return BW6_SVG_ICONS['copyfileactivity'];
  if (/createfile|create.*file/.test(n))           return BW6_SVG_ICONS['createfileactivity'];
  if (/removefile|deletefile|remove.*file|delete.*file/.test(n)) return BW6_SVG_ICONS['removefileactivity'];
  if (/renamefile|rename.*file/.test(n))           return BW6_SVG_ICONS['renamefileactivity'];
  if (/listfile|list.*file/.test(n))               return BW6_SVG_ICONS['listfilesactivity'];
  if (/filepoll|poll.*file/.test(n))               return BW6_SVG_ICONS['filepollerstarter'];
  // XML palette
  if (/parsexml|parse.*xml|xml.*parse/.test(n))   return BW6_SVG_ICONS['parsexmlactivity'];
  if (/renderxml|render.*xml|xml.*render/.test(n)) return BW6_SVG_ICONS['renderxmlactivity'];
  if (/transform.*xml|xslt/.test(n))              return BW6_SVG_ICONS['transformxmlactivity'];
  // JDBC palette
  if (/jdbcquery|jdbc.*query|query.*jdbc/.test(n)) return BW6_SVG_ICONS['jdbcqueryactivity'];
  if (/jdbcupdate|jdbc.*update/.test(n))           return BW6_SVG_ICONS['jdbcupdateactivity'];
  if (/jdbccall|storedproc/.test(n))               return BW6_SVG_ICONS['jdbccallprocedureactivity'];
  // HTTP / REST
  if (/sendhttprequest|http.*request|rest.*call/.test(n)) return BW6_SVG_ICONS['sendhttprequestactivity'];
  if (/sendhttpresponse|http.*response/.test(n))  return BW6_SVG_ICONS['sendhttpresponseactivity'];
  // JMS / EMS
  if (/send.*message|publish|jms.*send|ems.*send/.test(n)) return BW6_SVG_ICONS['jmssendactivity'];
  if (/receive.*message|subscribe/.test(n))       return BW6_SVG_ICONS['jmsreceivemessagestarter'];
  // Parse / Data formats
  if (/parsedata|parse.*data/.test(n))            return BW6_SVG_ICONS['parsedataactivity'];
  if (/renderdata|render.*data/.test(n))          return BW6_SVG_ICONS['renderdataactivity'];
  // Kafka
  if (/kafka.*send|publish.*kafka|kafka.*publish/.test(n)) return BW6_SVG_ICONS['kafkasendactivity'];
  if (/kafka/.test(n))                             return BW6_SVG_ICONS['kafkasubscribeactivity'];
  // SAP
  if (/sap.*rfc|sap.*bapi|sap.*idoc|sap.*call|sap.*send|bapi|rfc/.test(n)) return BW6_SVG_ICONS['saprfcactivity'];
  // Salesforce
  if (/salesforce|sfdc/.test(n))                  return BW6_SVG_ICONS['salesforcequeryactivity'];
  // ServiceNow
  if (/servicenow/.test(n))                        return BW6_SVG_ICONS['servicenowcreateactivity'];
  // AWS / S3
  if (/\bs3\b|bucket|aws/.test(n))                return BW6_SVG_ICONS['s3getactivity'];
  if (/lambda/.test(n))                            return BW6_SVG_ICONS['lambdainvokeactivity'];
  // General patterns
  if (/log|audit|write.*log/.test(n))             return BW6_SVG_ICONS['logactivity'];
  if (/map|mapping|transform/.test(n))            return BW6_SVG_ICONS['generalmappingactivity'];
  if (/callprocess|subprocess|call.*process/.test(n)) return BW6_SVG_ICONS['callprocessactivity'];
  if (/reply|return|respond/.test(n))             return BW6_SVG_ICONS['replyactivity'];
  if (/receive|getbooks|start|begin|trigger/.test(n)) return BW6_SVG_ICONS['receiveeventactivity'];
  return undefined;
}

/** Return the SVG/PNG data URI for an activity class reference, or undefined. */
export function getBW6SvgIcon(ref: string, activityName?: string, typeId?: string): string | undefined {
  // Tier 1: Real PNG by explicit activityTypeID
  if (typeId && BW6_REAL_ICONS[typeId]) return BW6_REAL_ICONS[typeId];

  const lastDot = ref.lastIndexOf('.');
  const className = (lastDot >= 0 ? ref.slice(lastDot + 1) : ref).toLowerCase();

  // Tier 2: Real PNG by Java eClassName. BW6_CLASS_ICONS is keyed by lowercase eClassName.
  // Some palettes include "Activity" in the eClassName (e.g. "jdbcqueryactivity"), others don't
  // (e.g. "log", "httpreceiver"). Try both the full className and with "activity" suffix stripped.
  const byClass = BW6_CLASS_ICONS[className]
               ?? BW6_CLASS_ICONS[className.replace(/activity$/, '')];
  if (byClass) return byClass;

  // Tier 3: Hand-crafted SVG by class name
  const direct = BW6_SVG_ICONS[className];
  if (direct) return direct;

  const palM = ref.match(/\.palette\.([^.]+)\./i);
  const paletteName = palM ? palM[1].toLowerCase() : undefined;

  // Tier 4: Palette-level real PNG (keyed as "__palette.<paletteName>")
  if (paletteName && BW6_REAL_ICONS[`__palette.${paletteName}`]) {
    return BW6_REAL_ICONS[`__palette.${paletteName}`];
  }

  // Tier 5: Hand-crafted palette SVG
  if (paletteName) {
    const palIcon = BW6_PALETTE_ICONS[paletteName];
    if (palIcon) return palIcon;
  }

  // Tier 6: Generic wrapper types — name-based lookup
  if ((className === 'activityextensionactivity' || className === 'extensionactivity') && activityName) {
    return iconByName(activityName);
  }

  return undefined;
}

/** Return the fallback "unknown activity" SVG icon. */
export function getBW6UnknownIcon(): string {
  return BW6_SVG_ICONS['__unknown__']!;
}
