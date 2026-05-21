import * as fs from 'fs';
import * as path from 'path';
import { DocModel } from '../model';
import { BW6IconRegistry } from '../bw6-icons';
import { setIconRegistry } from './bw6/icon-registry';
import { buildFlowTriggerMap, safeId } from './bw6/helpers';
import { renderBW6Index } from './bw6/overview';
import { renderBW6ProcessesList, renderBW6ProcessPage, renderBW6GroupedProcessPage, groupFlowsByParent } from './bw6/process-page';
import {
  renderBW6ResourcesPage,
  renderBW6PropertiesPage,
  renderBW6PalettesPage,
  renderBW6SchemasPage,
  renderBW6SharedVarsPage,
} from './bw6/resources-page';
import {
  renderBW6ApiSurfacePage,
  renderBW6QAPage,
  renderBW6CrossRefsPage,
  renderBW6SubstVarDiffPage,
  renderBW6ServiceDescriptorsPage,
  renderBW6ProfilePropertiesPage,
} from './bw6/api-page';
import {
  renderSharedLibIndex,
  renderSharedLibProcessPage,
  renderSharedLibResourcesPage,
  renderSharedLibSchemasPage,
  renderSharedLibPropertiesPage,
} from './bw6/shared-lib-page';
import { page } from './bw6/page-shell';

export function renderBW6HTML(model: DocModel, outputDir: string, options?: { bw6Icons?: BW6IconRegistry }): void {
  setIconRegistry(options?.bw6Icons);

  const write = (name: string, content: string) =>
    fs.writeFileSync(path.join(outputDir, name), content, 'utf8');

  const processesDir = path.join(outputDir, 'processes');
  if (!fs.existsSync(processesDir)) fs.mkdirSync(processesDir, { recursive: true });

  const triggerMap = buildFlowTriggerMap(model);

  write('index.html', page(model, 'index', renderBW6Index(model)));
  write('processes.html', page(model, 'processes', renderBW6ProcessesList(model)));
  write('resources.html', page(model, 'resources', renderBW6ResourcesPage(model)));
  write('properties.html', page(model, 'properties', renderBW6PropertiesPage(model)));
  write('palettes.html', page(model, 'palettes', renderBW6PalettesPage(model)));
  write('schemas.html', page(model, 'schemas', renderBW6SchemasPage(model)));
  write('service-descriptors.html', page(model, 'service-descriptors', renderBW6ServiceDescriptorsPage(model)));
  write('qa.html', page(model, 'qa', renderBW6QAPage(model)));
  write('cross-refs.html', page(model, 'cross-refs', renderBW6CrossRefsPage(model)));

  const profileNames = Object.keys(model.profileProperties ?? {});
  if (profileNames.length >= 2) {
    write('substvar-diff.html', page(model, 'substvar-diff', renderBW6SubstVarDiffPage(model)));
  }
  if ((model.moduleSharedVars?.length ?? 0) + (model.jobSharedVars?.length ?? 0) > 0) {
    write('shared-vars.html', page(model, 'shared-vars', renderBW6SharedVarsPage(model)));
  }
  if ((model.restBindings?.length ?? 0) > 0) {
    write('api-surface.html', page(model, 'api-surface', renderBW6ApiSurfacePage(model)));
  }

  // Per-profile property pages
  for (const [profileName, props] of Object.entries(model.profileProperties ?? {})) {
    if (props.length > 0) {
      write(
        `properties-${profileName}.html`,
        page(model, `properties-${profileName}`, renderBW6ProfilePropertiesPage(model, profileName)),
      );
    }
  }

  for (const [key, flows] of groupFlowsByParent(model.flows)) {
    const filename = `${safeId(key)}.html`;
    const isGrouped = flows.length > 1 || flows[0].id !== key;
    const content = isGrouped
      ? renderBW6GroupedProcessPage(model, flows, triggerMap)
      : renderBW6ProcessPage(model, flows[0], triggerMap);
    const html = page(model, `processes/${safeId(key)}`, content, '../');
    fs.writeFileSync(path.join(processesDir, filename), html, 'utf8');
  }

  // Generate SharedLib pages
  for (const lib of model.bw6SharedLibs ?? []) {
    const libId = safeId(lib.id);
    const libDir = path.join(outputDir, 'sharedlibs', libId);
    const libProcessesDir = path.join(libDir, 'processes');
    fs.mkdirSync(libProcessesDir, { recursive: true });

    // Index page for this SharedLib (2 levels deep → pathPrefix = '../../')
    fs.writeFileSync(path.join(libDir, 'index.html'),
      page(model, `sharedlibs/${libId}/index`, renderSharedLibIndex(lib), '../../'), 'utf8');

    // Resources, Schemas, Properties
    if (lib.connections.length > 0) {
      fs.writeFileSync(path.join(libDir, 'resources.html'),
        page(model, `sharedlibs/${libId}/resources`, renderSharedLibResourcesPage(lib), '../../'), 'utf8');
    }
    if (lib.schemas.length > 0) {
      fs.writeFileSync(path.join(libDir, 'schemas.html'),
        page(model, `sharedlibs/${libId}/schemas`, renderSharedLibSchemasPage(lib), '../../'), 'utf8');
    }
    if (lib.properties.length > 0) {
      fs.writeFileSync(path.join(libDir, 'properties.html'),
        page(model, `sharedlibs/${libId}/properties`, renderSharedLibPropertiesPage(lib), '../../'), 'utf8');
    }

    // Per-process pages (3 levels deep → pathPrefix = '../../../')
    for (const flow of lib.flows) {
      const pId = safeId(flow.id);
      const content = renderSharedLibProcessPage(model, lib, flow);
      const html = page(model, `sharedlibs/${libId}/processes/${pId}`, content, '../../../');
      fs.writeFileSync(path.join(libProcessesDir, `${pId}.html`), html, 'utf8');
    }
  }

  setIconRegistry(undefined);
}
