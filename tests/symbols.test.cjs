const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeVariables, resolveVariable } = require("../out/symbols.js");

function use(source, expression) {
  const marker = source.indexOf(expression);
  assert.notEqual(marker, -1, `missing test expression: ${expression}`);
  return marker + expression.indexOf("(") + 1;
}

test("variables declared in an if branch do not escape the branch", () => {
  const source = [
    "let outer = 1",
    "if true then",
    "  let inside = 2",
    "  print(inside)",
    "stop",
    "print(outer)",
    "print(inside)"
  ].join("\n");
  const analysis = analyzeVariables(source);

  assert.equal(resolveVariable(analysis, "inside", use(source, "print(inside)"))?.name, "inside");
  assert.equal(resolveVariable(analysis, "outer", use(source, "print(outer)"))?.name, "outer");
  const outsideUse = source.lastIndexOf("print(inside)");
  assert.equal(resolveVariable(analysis, "inside", outsideUse + "print(".length), undefined);
});

test("else branch declarations are isolated from both branches and outer scope", () => {
  const source = [
    "if true then",
    "  let left = 1",
    "else",
    "  let right = 2",
    "  print(right)",
    "stop",
    "print(left)",
    "print(right)"
  ].join("\n");
  const analysis = analyzeVariables(source);

  assert.equal(resolveVariable(analysis, "right", use(source, "print(right)"))?.name, "right");
  assert.equal(resolveVariable(analysis, "left", source.lastIndexOf("print(left)") + 6), undefined);
  assert.equal(resolveVariable(analysis, "right", source.lastIndexOf("print(right)") + 6), undefined);
});

test("for loop variables are visible in the loop body but not after it", () => {
  const source = [
    "for index = 1 to 3 do",
    "  let item = index",
    "  print(index)",
    "stop",
    "print(index)"
  ].join("\n");
  const analysis = analyzeVariables(source);

  assert.equal(resolveVariable(analysis, "index", use(source, "print(index)"))?.name, "index");
  assert.equal(resolveVariable(analysis, "item", source.indexOf("let item") + "let ".length)?.name, "item");
  assert.equal(resolveVariable(analysis, "index", source.lastIndexOf("print(index)") + 6), undefined);
});

test("function parameters and locals shadow outer variables only inside the function", () => {
  const source = [
    "let value = 1",
    "function example(value)",
    "  let local = 2",
    "  print(value)",
    "  print(local)",
    "stop",
    "print(value)",
    "print(local)"
  ].join("\n");
  const analysis = analyzeVariables(source);

  const parameterUse = use(source, "print(value)");
  assert.equal(resolveVariable(analysis, "value", parameterUse)?.kind, "parameter");
  assert.equal(resolveVariable(analysis, "local", use(source, "print(local)"))?.name, "local");
  const outerUse = source.lastIndexOf("print(value)");
  assert.equal(resolveVariable(analysis, "value", outerUse + 6)?.kind, "variable");
  assert.equal(resolveVariable(analysis, "local", source.lastIndexOf("print(local)") + 6), undefined);
});
