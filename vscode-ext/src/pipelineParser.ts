import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface AssetNode {
  id: string;
  path: string;
  desc: string;
  type: string; // 'source_data' | 'generated'
}

export interface ScriptNode {
  id: string;        // auto-generated: "script_<outputAssetId>"
  script: string;    // full path to script
  inputIds: string[];  // asset IDs this script reads
  outputId: string;    // asset ID this script produces
}

export interface PipelineData {
  name: string;
  description: string;
  workdir: string;
  pythonVenv: string;
  assets: AssetNode[];
  scripts: ScriptNode[];
}

export function parsePipelineFile(filePath: string): PipelineData {
  const content = fs.readFileSync(filePath, 'utf-8');
  const doc = yaml.load(content) as Record<string, unknown>;

  const globals = (doc.globals as Record<string, unknown>) || {};
  const workdir = (globals.work_dir as string) || (doc.workdir as string) || '';
  const pythonVenv = (globals.python_venv as string) || '';
  const pipelineName = (doc.name as string) || '';
  const pipelineDesc = (doc.description as string) || '';

  const rawAssets = (doc.assets as Record<string, Record<string, unknown>>) || {};

  const assets: AssetNode[] = [];
  const scripts: ScriptNode[] = [];

  for (const [id, val] of Object.entries(rawAssets)) {
    const assetPath = (val.path as string) || '';
    const hasGenerator = !!val.generated_by;

    assets.push({
      id,
      path: assetPath && workdir && !path.isAbsolute(assetPath)
        ? path.join(workdir, assetPath) : assetPath,
      desc: (val.desc as string) || '',
      type: (val.type as string) || (hasGenerator ? 'generated' : 'source_data'),
    });

    if (hasGenerator) {
      const gen = val.generated_by as Record<string, unknown>;
      const scriptPath = (gen.script as string) || '';
      scripts.push({
        id: `script_${id}`,
        script: scriptPath && workdir && !path.isAbsolute(scriptPath)
          ? path.join(workdir, scriptPath) : scriptPath,
        inputIds: (gen.inputs as string[]) || [],
        outputId: id,
      });
    }
  }

  return { name: pipelineName, description: pipelineDesc, workdir, pythonVenv, assets, scripts };
}

/**
 * Compute column depth for each asset based on dependency chains.
 * Source assets (no generator) get depth 0.
 * Each generated asset = max(input depths) + 1.
 * Script nodes are placed between inputs and output (not a separate column).
 */
export function computeAssetDepths(data: PipelineData): Map<string, number> {
  const depthMap = new Map<string, number>();
  // Build: assetId -> scriptNode that generates it
  const generatorMap = new Map<string, ScriptNode>();
  for (const s of data.scripts) {
    generatorMap.set(s.outputId, s);
  }

  function getDepth(assetId: string, visited: Set<string>): number {
    if (depthMap.has(assetId)) { return depthMap.get(assetId)!; }
    if (visited.has(assetId)) { return 0; }
    visited.add(assetId);

    const gen = generatorMap.get(assetId);
    if (!gen || gen.inputIds.length === 0) {
      depthMap.set(assetId, 0);
      return 0;
    }
    const maxInput = Math.max(...gen.inputIds.map((id) => getDepth(id, visited)));
    const depth = maxInput + 1;
    depthMap.set(assetId, depth);
    return depth;
  }

  for (const a of data.assets) {
    getDepth(a.id, new Set());
  }
  return depthMap;
}
