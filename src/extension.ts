import * as path from "path";
import * as vscode from "vscode";
import { createCheckerDiagnosticProvider } from "./checker";
import { toVscodeDiagnostics } from "./diagnostics";
import { analyzeVariables, maskCommentsAndStrings, resolveVariable, visibleVariables } from "./symbols";

const KEYWORDS = [
  "let", "function", "return", "if", "then", "else", "stop",
  "while", "do", "for", "to", "break", "continue", "and", "or", "not"
];

const BUILTINS: Array<{ name: string; signature: string; detail: string }> = [
  { name: "print", signature: "print(value)", detail: "Write a value to the program output." },
  { name: "length", signature: "length(value)", detail: "Return the number of UTF-8 code points in a string, elements in an array, or distinct keys in a dictionary." },
  { name: "substring", signature: "substring(string, start, length)", detail: "Extract a range of UTF-8 code points from a string using zero-based indices." },
  { name: "new_array", signature: "new_array()", detail: "Create an empty array." },
  { name: "push", signature: "push(array, value)", detail: "Append a value to an array and return its new length." },
  { name: "pop", signature: "pop(array)", detail: "Remove and return the last array element, or nil when the array is empty." },
  { name: "keys", signature: "keys(dictionary)", detail: "Return an array of dictionary keys in insertion order." },
  { name: "values", signature: "values(dictionary)", detail: "Return an array of dictionary values in insertion order." },
  { name: "has_key", signature: "has_key(dictionary, key)", detail: "Return whether a dictionary contains the given string key." }
];

function findDeclarationOffsets(source: string, keyword: "let" | "function", name: string): number[] {
  const declarations = keyword === "let"
    ? /\blet\s+([A-Za-z_][A-Za-z0-9_]*)/g
    : /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  const offsets: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = declarations.exec(source)) !== null) {
    if (match[1] === name) offsets.push(match.index + match[0].lastIndexOf(name));
  }

  return offsets;
}

function createDefinitionLink(
  origin: vscode.Range,
  document: vscode.TextDocument,
  offset: number,
  name: string
): vscode.LocationLink {
  const target = new vscode.Range(document.positionAt(offset), document.positionAt(offset + name.length));
  return {
    originSelectionRange: origin,
    targetUri: document.uri,
    targetRange: target,
    targetSelectionRange: target
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("mongoose");
  const checkerOutput = vscode.window.createOutputChannel("Mongoose Checker");
  const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const validationIds = new Map<string, number>();
  let checkerFailureShown = false;

  const reportCheckerFailure = (message: string): void => {
    checkerOutput.appendLine(message);
    checkerOutput.show(true);
    if (!checkerFailureShown) {
      checkerFailureShown = true;
      void vscode.window.showErrorMessage("Mongoose checker failed. See the Mongoose Checker output for details.");
    }
  };

  const validateDocument = async (document: vscode.TextDocument, validationId: number): Promise<void> => {
    const key = document.uri.toString();
    const version = document.version;
    const checkerPath = vscode.workspace.getConfiguration("mongoose", document.uri)
      .get<string>("checkerPath", "mongoose_check").trim();

    if (!checkerPath) {
      diagnostics.delete(document.uri);
      reportCheckerFailure("Set mongoose.checkerPath to the Mongoose checker executable.");
      return;
    }

    const extension = path.extname(document.uri.fsPath);
    const sourceExtension = extension === ".snake" || extension === ".mg" ? extension : ".mg";

    try {
      const provider = createCheckerDiagnosticProvider(checkerPath);
      const result = await provider.validate({
        source: document.getText(),
        extension: sourceExtension
      });
      if (validationIds.get(key) !== validationId || document.version !== version) return;

      const editorDiagnostics = toVscodeDiagnostics(result.diagnostics, document);
      diagnostics.set(document.uri, editorDiagnostics);
      checkerFailureShown = false;
      if (result.exitCode !== 0 && result.diagnostics.length === 0) {
        reportCheckerFailure(`mongoose_check exited with code ${result.exitCode}.${result.output ? `\n${result.output}` : ""}`);
      } else if (result.output.trim() && result.diagnostics.length === 0) {
        checkerOutput.appendLine(result.output.trim());
      }
    } catch (error) {
      if (validationIds.get(key) !== validationId) return;
      diagnostics.delete(document.uri);
      reportCheckerFailure(error instanceof Error ? error.message : String(error));
    }
  };

  const scheduleValidation = (document: vscode.TextDocument): void => {
    if (document.languageId !== "mongoose") return;
    const key = document.uri.toString();
    const timer = validationTimers.get(key);
    if (timer) clearTimeout(timer);

    const validationId = (validationIds.get(key) ?? 0) + 1;
    validationIds.set(key, validationId);
    validationTimers.set(key, setTimeout(() => {
      validationTimers.delete(key);
      void validateDocument(document, validationId);
    }, 300));
  };

  const selector: vscode.DocumentSelector = [
    { language: "mongoose", scheme: "file" },
    { language: "mongoose", scheme: "untitled" }
  ];

  const completionProvider = vscode.languages.registerCompletionItemProvider(
    selector,
    {
      provideCompletionItems(document, position) {
        const suggestions: vscode.CompletionItem[] = [];
        const suggestBuiltins = vscode.workspace.getConfiguration("mongoose")
          .get<boolean>("suggestBuiltins", true);

        for (const keyword of KEYWORDS) {
          const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
          item.detail = "Mongoose keyword";
          suggestions.push(item);
        }

        for (const literal of ["true", "false", "nil"]) {
          const item = new vscode.CompletionItem(literal, vscode.CompletionItemKind.Constant);
          item.detail = "Mongoose literal";
          suggestions.push(item);
        }

        if (suggestBuiltins) {
          for (const builtin of BUILTINS) {
            const item = new vscode.CompletionItem(builtin.name, vscode.CompletionItemKind.Function);
            item.detail = builtin.signature;
            item.documentation = new vscode.MarkdownString(builtin.detail);
            item.insertText = new vscode.SnippetString(`${builtin.name}($1)`);
            item.command = { command: "editor.action.triggerParameterHints", title: "Show parameter hints" };
            suggestions.push(item);
          }
        }

        const source = maskCommentsAndStrings(document.getText());
        const analysis = analyzeVariables(document.getText());
        const offset = document.offsetAt(position);
        for (const symbol of visibleVariables(analysis, offset)) {
          const item = new vscode.CompletionItem(symbol.name, vscode.CompletionItemKind.Variable);
          item.detail = symbol.kind === "parameter"
            ? "Function parameter"
            : "Variable visible in this scope";
          suggestions.push(item);
        }

        const declaredFunctions = /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
        const functionNames = new Set<string>();
        let match: RegExpExecArray | null;
        while ((match = declaredFunctions.exec(source)) !== null) {
          if (functionNames.has(match[1])) continue;
          functionNames.add(match[1]);

          const item = new vscode.CompletionItem(match[1], vscode.CompletionItemKind.Function);
          item.detail = "Function declared in this file";
          item.insertText = new vscode.SnippetString(`${match[1]}($0)`);
          suggestions.push(item);
        }

        return suggestions;
      }
    },
    ".", "(", " "
  );

  const hoverProvider = vscode.languages.registerHoverProvider(selector, {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
      if (!range) return undefined;
      const word = document.getText(range);
      const builtin = BUILTINS.find((entry) => entry.name === word);
      if (builtin) {
        const markdown = new vscode.MarkdownString();
        markdown.appendCodeblock(builtin.signature, "mongoose");
        markdown.appendMarkdown(builtin.detail);
        return new vscode.Hover(markdown, range);
      }
      if (KEYWORDS.includes(word)) {
        return new vscode.Hover(new vscode.MarkdownString(`**Mongoose keyword** \`${word}\``), range);
      }
      if (["true", "false", "nil"].includes(word)) {
        return new vscode.Hover(new vscode.MarkdownString(`**Mongoose literal** \`${word}\``), range);
      }
      return undefined;
    }
  });

  const definitionProvider = vscode.languages.registerDefinitionProvider(selector, {
    async provideDefinition(document, position, token) {
      const origin = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
      if (!origin) return undefined;

      const name = document.getText(origin);
      if (KEYWORDS.includes(name) || ["true", "false", "nil"].includes(name) ||
          BUILTINS.some((builtin) => builtin.name === name)) {
        return undefined;
      }

      const source = maskCommentsAndStrings(document.getText());
      const analysis = analyzeVariables(document.getText());
      const useOffset = document.offsetAt(origin.start);
      const variable = resolveVariable(analysis, name, useOffset);
      if (variable) {
        return [createDefinitionLink(origin, document, variable.offset, name)];
      }

      const localFunctionOffsets = findDeclarationOffsets(source, "function", name);
      if (localFunctionOffsets.length > 0) {
        return localFunctionOffsets.map((offset) => createDefinitionLink(origin, document, offset, name));
      }

      const uris = await vscode.workspace.findFiles("**/*.{snake,mg}", "**/{node_modules,.git}/**");
      const links: vscode.LocationLink[] = [];
      for (const uri of uris) {
        if (token.isCancellationRequested) return undefined;
        if (uri.toString() === document.uri.toString()) continue;

        const candidate = await vscode.workspace.openTextDocument(uri);
        const candidateSource = maskCommentsAndStrings(candidate.getText());
        const offsets = findDeclarationOffsets(candidateSource, "function", name);
        links.push(...offsets.map((offset) => createDefinitionLink(origin, candidate, offset, name)));
      }

      return links.length > 0 ? links : undefined;
    }
  });

  const runFileCommand = vscode.commands.registerCommand("mongoose.runFile", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "mongoose") {
      void vscode.window.showErrorMessage("Open a Mongoose file (.snake or .mg) before running it.");
      return;
    }

    const document = editor.document;
    if (document.isUntitled) {
      void vscode.window.showErrorMessage("Save the Mongoose file before running it.");
      return;
    }
    if (document.isDirty && !(await document.save())) return;

    const interpreterPath = vscode.workspace.getConfiguration("mongoose", document.uri)
      .get<string>("interpreterPath", "").trim();
    if (!interpreterPath) {
      void vscode.window.showErrorMessage(
        "Set mongoose.interpreterPath to the path of your Mongoose interpreter."
      );
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const cwd = workspaceFolder?.uri.fsPath ?? path.dirname(document.uri.fsPath);
    const filePath = document.uri.fsPath;

    // Reuses the “Mongoose” terminal if it is already open; otherwise, creates a new one
    let terminal = vscode.window.terminals.find((t) => t.name === "Mongoose");
    if (!terminal) {
      terminal = vscode.window.createTerminal({
        name: "Mongoose",
        cwd
      });
    }

    terminal.show();

    // In Windows (PowerShell), the ‘&’ operator is required if the path is enclosed in quotation marks
    const command = process.platform === "win32"
      ? `& "${interpreterPath}" "${filePath}"`
      : `"${interpreterPath}" "${filePath}"`;

    terminal.sendText(command);
  });

  context.subscriptions.push(
    diagnostics,
    checkerOutput,
    completionProvider,
    hoverProvider,
    definitionProvider,
    runFileCommand,
    vscode.workspace.onDidOpenTextDocument(scheduleValidation),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleValidation(event.document)),
    vscode.workspace.onDidSaveTextDocument(scheduleValidation),
    vscode.workspace.onDidCloseTextDocument((document) => {
      const key = document.uri.toString();
      const timer = validationTimers.get(key);
      if (timer) clearTimeout(timer);
      validationTimers.delete(key);
      validationIds.set(key, (validationIds.get(key) ?? 0) + 1);
      diagnostics.delete(document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      for (const document of vscode.workspace.textDocuments) {
        if (event.affectsConfiguration("mongoose.checkerPath", document.uri)) {
          scheduleValidation(document);
        }
      }
    })
  );
  for (const document of vscode.workspace.textDocuments) scheduleValidation(document);
}

export function deactivate(): void {
  // No resources to dispose manually.
}
