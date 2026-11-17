const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCheckerOutput } = require("../out/checker.js");

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
