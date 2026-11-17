import { execFile } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";

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
    const match = /^(.*):(\d+):(\d+):\s*(?:(error|warning|note):\s*)?(.*)$/i.exec(line);
    if (!match) continue;

    const lineNumber = Number(match[2]);
    const column = Number(match[3]);
    if (lineNumber < 1 || column < 1) continue;

    const severity = match[4]?.toLowerCase();
    diagnostics.push({
      line: lineNumber,
      column,
      message: match[5],
      severity: severity === "warning" ? "warning" : severity === "note" ? "information" : "error"
    });
  }

  return diagnostics;
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
          reject(new Error(`${error.message}${output ? `\n${output}` : ""}`));
          return;
        }

        resolve({ output, exitCode: error ? error.code as number : 0 });
      });
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
