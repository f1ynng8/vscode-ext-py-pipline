import * as vscode from 'vscode';
import * as path from 'path';
import { parsePipelineFile, computeAssetDepths } from './pipelineParser';

const TERMINAL_NAME = 'Pipeline Runner';

export class PipelinePanel {
  private panel: vscode.WebviewPanel;
  private filePath: string;
  private extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri, filePath: string) {
    this.extensionUri = extensionUri;
    this.filePath = filePath;

    this.panel = vscode.window.createWebviewPanel(
      'pipelineView',
      `Pipeline: ${path.basename(filePath)}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        retainContextWhenHidden: true,
      }
    );

    this.panel.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));
    this.update();
  }

  private update() {
    const data = parsePipelineFile(this.filePath);
    const depthMap = computeAssetDepths(data);

    const assetsWithDepth = data.assets.map((a) => ({
      ...a,
      depth: depthMap.get(a.id) || 0,
    }));

    this.panel.webview.html = this.getHtml({
      name: data.name,
      description: data.description,
      workdir: data.workdir,
      pythonVenv: data.pythonVenv,
      assets: assetsWithDepth,
      scripts: data.scripts,
    });
  }

  private getOrCreateTerminal(workdir: string): vscode.Terminal {
    const existing = vscode.window.terminals.find((t) => t.name === TERMINAL_NAME);
    if (existing) { return existing; }
    return vscode.window.createTerminal({ name: TERMINAL_NAME, cwd: workdir });
  }

  private handleMessage(msg: { type: string; script?: string; file?: string }) {
    const data = parsePipelineFile(this.filePath);
    const workdir = data.workdir || path.dirname(this.filePath);
    const pythonVenv = data.pythonVenv;

    switch (msg.type) {
      case 'runScript': {
        if (!msg.script) { return; }
        const terminal = this.getOrCreateTerminal(workdir);
        terminal.show();
        if (pythonVenv) {
          const activatePath = path.join(pythonVenv, 'bin', 'activate');
          terminal.sendText(
            `if [ "$VIRTUAL_ENV" != "${pythonVenv}" ]; then source "${activatePath}"; fi`
          );
        }
        terminal.sendText(`python3 ${msg.script}`);
        break;
      }
      case 'openFile': {
        if (!msg.file) { return; }
        const resolvedPath = path.isAbsolute(msg.file)
          ? msg.file
          : path.resolve(workdir, msg.file);
        const uri = vscode.Uri.file(resolvedPath);
        vscode.workspace.openTextDocument(uri).then(
          (doc) => vscode.window.showTextDocument(doc),
          () => vscode.window.showErrorMessage(`Cannot open file: ${resolvedPath}`)
        );
        break;
      }
      case 'refresh': {
        this.update();
        break;
      }
    }
  }

  private getHtml(pipelineData: Record<string, unknown>): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'style.css')
    );
    const nonce = getNonce();

    // Escape </ to prevent HTML parser from closing the script tag prematurely
    const safeJson = JSON.stringify(pipelineData).replace(/<\//g, '<\\/');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>Pipeline View</title>
</head>
<body>
  <div id="toolbar">
    <button id="refreshBtn" title="Refresh">&#x21bb; Refresh</button>
    <span id="pipeline-title"></span>
  </div>
  <div id="canvas-container">
    <svg id="connections"></svg>
    <div id="nodes-container"></div>
  </div>
  <script nonce="${nonce}">
    var pipelineData = ${safeJson};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
