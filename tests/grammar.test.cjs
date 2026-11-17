const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const grammarPath = path.join(__dirname, "..", "syntaxes", "mongoose.tmLanguage.json");
const grammar = JSON.parse(fs.readFileSync(grammarPath, "utf8"));
const repository = grammar.repository;

function pattern(name) {
  const entry = repository[name];
  assert.ok(entry, `Missing grammar repository entry: ${name}`);
  return entry;
}

test("built-in functions use valid word-boundary regexes and are highlighted before calls", () => {
  const builtin = pattern("functions").patterns.find((entry) => entry.name === "support.function.builtin.mongoose");
  assert.ok(builtin, "Missing built-in function highlighting rule");
  const regex = new RegExp(builtin.match);

  for (const name of ["print", "length", "substring", "new_array", "push", "pop", "keys", "values", "has_key"]) {
    assert.equal(regex.test(`${name}(`), true, `${name} should be recognized as a built-in`);
    assert.equal(regex.test(`prefix_${name}(`), false, `${name} should not match inside another identifier`);
  }
});

test("keywords, literals, numbers and operators retain syntax highlighting rules", () => {
  const keywordRegex = new RegExp(pattern("keywords").match);
  assert.equal(keywordRegex.test("let"), true);
  assert.equal(keywordRegex.test("letter"), false);
  const constantRegexes = pattern("constants").patterns.map((entry) => new RegExp(entry.match));
  assert.equal(constantRegexes.some((regex) => regex.test("true")), true);
  assert.equal(constantRegexes.some((regex) => regex.test("nil")), true);
  assert.equal(new RegExp(pattern("numbers").match).test("123.45"), true);
  const operators = pattern("operators").match;
  for (const operator of ["//", "%", "\\^", "\\+", "=="]) {
    assert.ok(operators.includes(operator), `Missing operator token: ${operator}`);
  }
});

test("line comments distinguish start-of-line // comments from floor division", () => {
  const comments = pattern("comments").patterns;
  const slashComment = comments.find((entry) => entry.name === "comment.line.double-slash.mongoose");
  const hashComment = comments.find((entry) => entry.name === "comment.line.htag.mongoose");
  assert.ok(slashComment);
  assert.ok(hashComment);
  assert.equal(new RegExp(slashComment.match).test("// comment"), true);
  assert.equal(new RegExp(slashComment.match).test("  // comment"), true);
  assert.equal(new RegExp(slashComment.match).test("value // 2"), false);
  assert.equal(new RegExp(hashComment.match).test("# comment"), true);
});
