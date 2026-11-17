import { execFile } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  DiagnosticProvider,
  DiagnosticProviderResult,
  LanguageDiagnostic
} from "./diagnostics";

export interface CheckerDiagnostic {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "information";
}

export interface CheckerResult {
  output: string;
  exitCode: number;
}

export function parseCheckerOutput(output: string): CheckerDiagnostic[] {
  const diagnostics: CheckerDiagnostic[] = [];

  for (const line of output.split(/\r?\n/)) {
    // The greedy path group also supports Windows drive letters (for example C:\\...).
    const match = /^(.*):(\d+):(\d+):\s*(?:(error|warning|note):\s*)?(.*)$/.exec(line);
    if (!match) continue;

    const lineNumber = Number(match[2]);
    const column = Number(match[3]);
    if (!Number.isSafeInteger(lineNumber) || !Number.isSafeInteger(column) ||
        lineNumber < 1 || column < 1) continue;

    const severity = match[4]?.toLowerCase();
    diagnostics.push({
      line: lineNumber,
      column,
      message: match[5].trim(),
      severity: severity === "warning" ? "warning" : severity === "note" ? "information" : "error"
    });
  }

  return diagnostics;
}

function describeExecutionError(error: Error & { code?: number | string }, output: string): Error {
  const details = output.trim();
  const suffix = details ? `\n${details}` : "";

  switch (error.code) {
    case "ENOENT":
      return new Error(`Cannot find mongoose_check executable. Check mongoose.checkerPath.\n${error.message}${suffix}`);
    case "EACCES":
    case "EPERM":
      return new Error(`Cannot execute mongoose_check. Check its permissions and mongoose.checkerPath.\n${error.message}${suffix}`);
    case "ERR_CHILD_PROCESS_STDIO_MAXBUFFER":
      return new Error(`mongoose_check produced more than the allowed output limit.\n${error.message}${suffix}`);
    default:
      return new Error(`Unable to run mongoose_check: ${error.message}${suffix}`);
  }
}

export async function runChecker(
  executable: string,
  source: string,
  extension: string
): Promise<CheckerResult> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mongoose-check-"));
  const file = path.join(directory, `source${extension}`);

  try {
    await writeFile(file, source, "utf8");
    return await new Promise<CheckerResult>((resolve, reject) => {
      execFile(executable, [file], {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        windowsHide: true
      }, (error, stdout, stderr) => {
        const output = [stdout, stderr].filter(Boolean).join("\n");
        if (error && typeof error.code !== "number") {
          reject(describeExecutionError(error, output));
          return;
        }

        resolve({ output, exitCode: error ? error.code as number : 0 });
      });
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function createCheckerDiagnosticProvider(executable: string): DiagnosticProvider {
  return {
    async validate(request): Promise<DiagnosticProviderResult> {
      const result = await runChecker(executable, request.source, request.extension);
      const diagnostics: LanguageDiagnostic[] = parseCheckerOutput(result.output).map((entry) => ({
        range: {
          start: { line: entry.line - 1, character: entry.column - 1 },
          // mongoose_check currently reports a start position, not a token span.
          // A one-character range is used until the checker exposes end positions.
          end: { line: entry.line - 1, character: entry.column }
        },
        message: entry.message,
        severity: entry.severity,
        source: "mongoose_check"
      }));

      return { diagnostics, exitCode: result.exitCode, output: result.output };
    }
  };
}
