import * as vscode from 'vscode';
import { PipelinePanel } from './webviewProvider';

export function activate(context: vscode.ExtensionContext) {
  // Command: pick a .pipline file via dialog
  context.subscriptions.push(
    vscode.commands.registerCommand('pipeline.open', async () => {
      const files = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Pipeline files': ['pipline'] },
        openLabel: 'Open Pipeline',
      });
      if (files && files.length > 0) {
        new PipelinePanel(context.extensionUri, files[0].fsPath);
      }
    })
  );

  // Command: open current active .pipline file, or from explorer context menu
  context.subscriptions.push(
    vscode.commands.registerCommand('pipeline.openActive', (uri?: vscode.Uri) => {
      const filePath = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!filePath || !filePath.endsWith('.pipline')) {
        vscode.window.showErrorMessage('No .pipline file selected or active.');
        return;
      }
      new PipelinePanel(context.extensionUri, filePath);
    })
  );
}

export function deactivate() {}
