import * as vscode from 'vscode';

/**
 * Basic language server features using VS Code's built-in provider APIs.
 * Hover info, basic completions, and diagnostics from the cocapn agent.
 */
export class CocapnLanguageFeatures {
  private _serverUrl: string;
  private _diagnosticCollection: vscode.DiagnosticCollection;
  private _disposables: vscode.Disposable[] = [];

  constructor(serverUrl: string) {
    this._serverUrl = serverUrl;
    this._diagnosticCollection = vscode.languages.createDiagnosticCollection('cocapn');

    // Hover provider
    this._disposables.push(
      vscode.languages.registerHoverProvider(
        { scheme: 'file' },
        {
          provideHover: async (document, position) => {
            const range = document.getWordRangeAtPosition(position);
            if (!range) {
              return undefined;
            }
            const word = document.getText(range);
            const fileName = vscode.workspace.asRelativePath(document.uri);

            try {
              const resp = await fetch(`${this._serverUrl}/api/hover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word, file: fileName, line: position.line }),
                signal: AbortSignal.timeout(2000),
              });
              if (!resp.ok) {
                return undefined;
              }
              const data = await resp.json() as { explanation?: string };
              if (data.explanation) {
                return new vscode.Hover(
                  new vscode.MarkdownString(data.explanation),
                  range
                );
              }
            } catch {
              // Agent not available
            }
            return undefined;
          },
        }
      )
    );
  }

  /**
   * Set diagnostics for a document from agent suggestions.
   */
  public setDiagnostics(uri: vscode.Uri, suggestions: AgentSuggestion[]): void {
    const diagnostics: vscode.Diagnostic[] = [];

    for (const s of suggestions) {
      const range = s.range
        ? new vscode.Range(
            new vscode.Position(s.range.startLine, s.range.startChar || 0),
            new vscode.Position(s.range.endLine, s.range.endChar || 0)
          )
        : new vscode.Range(0, 0, 0, 0);

      const severity =
        s.severity === 'warning'
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Information;

      const diag = new vscodeDiagnostic(range, s.message, severity);
      diag.source = 'cocapn';
      diagnostics.push(diag);
    }

    this._diagnosticCollection.set(uri, diagnostics);
  }

  public clearDiagnostics(uri: vscode.Uri): void {
    this._diagnosticCollection.delete(uri);
  }

  public dispose(): void {
    this._diagnosticCollection.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}

// Use the VS Code Diagnostic constructor directly
const vscodeDiagnostic = vscode.Diagnostic;

export interface AgentSuggestion {
  message: string;
  severity?: 'info' | 'warning';
  range?: {
    startLine: number;
    startChar?: number;
    endLine: number;
    endChar?: number;
  };
}
