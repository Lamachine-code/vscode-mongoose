const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCheckerOutput, byteColumnToUtf16Character } = require("../out/checker.js");

test("parses the checker's current path:line:column diagnostic format", () => {
  const diagnostics = parseCheckerOutput(
    "/tmp/mongoose-check-a/source.snake:12:7: undefined identifier 'missing'"
  );

  assert.deepEqual(diagnostics, [{
    line: 12,
    column: 7,
    message: "undefined identifier 'missing'",
    severity: "error"
  }]);
});

test("parses explicit error, warning and note severities", () => {
  const diagnostics = parseCheckerOutput([
    "/tmp/source.mg:1:1: error: invalid syntax",
    "/tmp/source.mg:2:4: warning: unused value",
    "/tmp/source.mg:3:2: note: declared here"
  ].join("\n"));

  assert.deepEqual(diagnostics.map(({ severity, message }) => ({ severity, message })), [
    { severity: "error", message: "invalid syntax" },
    { severity: "warning", message: "unused value" },
    { severity: "information", message: "declared here" }
  ]);
});

test("supports Windows paths and CRLF output", () => {
  const diagnostics = parseCheckerOutput(
    "C:\\Users\\me\\Temp\\source.mg:8:3: error: unexpected token\r\n"
  );

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].line, 8);
  assert.equal(diagnostics[0].column, 3);
  assert.equal(diagnostics[0].message, "unexpected token");
});

test("ignores non-diagnostic output and invalid positions", () => {
  const diagnostics = parseCheckerOutput([
    "Mongoose checker 1.0",
    "/tmp/source.mg:0:1: invalid line",
    "/tmp/source.mg:2:0: invalid column",
    "/tmp/source.mg:2:3: valid diagnostic"
  ].join("\n"));

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].message, "valid diagnostic");
});

test("converts UTF-8 byte columns to VS Code UTF-16 character positions", () => {
  const line = 'let label = "é🐍"; missing';
  const prefix = line.slice(0, line.indexOf("missing"));
  const byteColumn = Buffer.byteLength(prefix, "utf8") + 1;

  assert.equal(
    byteColumnToUtf16Character(`first line\n${line}\`, 2, byteColumn),
    prefix.length
  );
});

test("keeps ASCII columns unchanged and clamps columns beyond the line", () => {
  assert.equal(byteColumnToUtf16Character("print(missing)", 1, 7), 6);
  assert.equal(byteColumnToUtf16Character("abc", 1, 99), 3);
  assert.equal(byteColumnToUtf16Character("abc", 0, 1), 0);
});
