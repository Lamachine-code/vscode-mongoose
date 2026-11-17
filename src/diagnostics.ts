import * as vscode from "vscode";

export interface DiagnosticPosition {
  line: number;
  character: number;
}

export interface DiagnosticRange {
  start: DiagnosticPosition;
  end: DiagnosticPosition;
}

export type LanguageDiagnosticSeverity = "error" | "warning" | "information";

export interface LanguageDiagnostic {
  range: DiagnosticRange;
  message: string;
  severity: LanguageDiagnosticSeverity;
  source: string;
}

export interface DiagnosticRequest {
  source: string;
  extension: string;
}

export interface DiagnosticProviderResult {
  diagnostics: LanguageDiagnostic[];
  exitCode: number;
  output: string;
}

/**
 * Common contract for editor diagnostic backends.
 *
 * The current implementation delegates to mongoose_check. A future LSP-backed
 * provider can implement the same contract without changing VS Code wiring.
 */
export interface DiagnosticProvider {
  validate(request: DiagnosticRequest): Promise<DiagnosticProviderResult>;
}

export function toVscodeDiagnostics(
  items: LanguageDiagnostic[],
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  return items.map((item) => {
    const clamp = (value: number, minimum: number, maximum: number): number =>
      Math.max(minimum, Math.min(Math.trunc(value), maximum));

    const startLine = clamp(item.range.start.line, 0, document.lineCount - 1);
    const endLine = clamp(item.range.end.line, startLine, document.lineCount - 1);
    const startLineLength = document.lineAt(startLine).text.length;
    const endLineLength = document.lineAt(endLine).text.length;
    const startCharacter = clamp(item.range.start.character, 0, startLineLength);
    const endCharacter = endLine === startLine
      ? clamp(item.range.end.character, startCharacter, endLineLength)
      : clamp(item.range.end.character, 0, endLineLength);

    const range = new vscode.Range(
      new vscode.Position(startLine, startCharacter),
      new vscode.Position(endLine, endCharacter)
    );
    const severity = item.severity === "warning"
      ? vscode.DiagnosticSeverity.Warning
      : item.severity === "information"
        ? vscode.DiagnosticSeverity.Information
        : vscode.DiagnosticSeverity.Error;
    const diagnostic = new vscode.Diagnostic(range, item.message, severity);
    diagnostic.source = item.source;
    return diagnostic;
  });
}
