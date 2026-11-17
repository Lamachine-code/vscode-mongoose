export interface VariableSymbol {
  name: string;
  offset: number;
  kind: "variable" | "parameter";
}

export interface FunctionScope {
  start: number;
  end: number;
  parent?: FunctionScope;
  parameters: VariableSymbol[];
  variables: VariableSymbol[];
}

export interface VariableAnalysis {
  globals: VariableSymbol[];
  functions: FunctionScope[];
}

export function maskCommentsAndStrings(source: string): string {
  return source.replace(
    /"(?:\\.|[^"\\])*(?:"|$)|^[ \t]*\/\/[^\r\n]*|#[^\r\n]*/gm,
    (match) => match.replace(/[^\r\n]/g, " ")
  );
}

export function analyzeVariables(source: string): VariableAnalysis {
  const masked = maskCommentsAndStrings(source);
  const globals: VariableSymbol[] = [];
  const functions: FunctionScope[] = [];
  const blocks: Array<FunctionScope | undefined> = [];
  let lineOffset = 0;

  for (const line of masked.split("\n")) {
    const functionMatch = /^\s*function\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/.exec(line);
    if (functionMatch) {
      let parent: FunctionScope | undefined;
      for (let index = blocks.length - 1; index >= 0; index--) {
        if (blocks[index]) {
          parent = blocks[index];
          break;
        }
      }

      const scope: FunctionScope = {
        start: lineOffset,
        end: source.length,
        parent,
        parameters: [],
        variables: []
      };
      const parameterText = functionMatch[1];
      const parameterOffset = lineOffset + line.indexOf(parameterText, functionMatch.index);
      const parameterPattern = /(?:^|,)\s*([A-Za-z_][A-Za-z0-9_]*)/g;
      let parameterMatch: RegExpExecArray | null;
      while ((parameterMatch = parameterPattern.exec(parameterText)) !== null) {
        scope.parameters.push({
          name: parameterMatch[1],
          offset: parameterOffset + parameterMatch.index + parameterMatch[0].lastIndexOf(parameterMatch[1]),
          kind: "parameter"
        });
      }

      functions.push(scope);
      blocks.push(scope);
    } else if (/^\s*(?:if\b.*\bthen|while\b.*\bdo|for\b.*\bdo)\b/.test(line)) {
      blocks.push(undefined);
    }

    let currentFunction: FunctionScope | undefined;
    for (let index = blocks.length - 1; index >= 0; index--) {
      if (blocks[index]) {
        currentFunction = blocks[index];
        break;
      }
    }

    const variablePattern = /\blet\s+([A-Za-z_][A-Za-z0-9_]*)/g;
    let variableMatch: RegExpExecArray | null;
    while ((variableMatch = variablePattern.exec(line)) !== null) {
      const symbol: VariableSymbol = {
        name: variableMatch[1],
        offset: lineOffset + variableMatch.index + variableMatch[0].lastIndexOf(variableMatch[1]),
        kind: "variable"
      };
      (currentFunction ? currentFunction.variables : globals).push(symbol);
    }

    if (/^\s*stop\b/.test(line)) {
      const closed = blocks.pop();
      if (closed) closed.end = lineOffset;
    }

    lineOffset += line.length + 1;
  }

  return { globals, functions };
}

export function visibleVariables(analysis: VariableAnalysis, offset: number): VariableSymbol[] {
  const scope = analysis.functions
    .filter((candidate) => candidate.start <= offset && offset <= candidate.end)
    .sort((left, right) => right.start - left.start)[0];
  const visible: VariableSymbol[] = [];
  const seen = new Set<string>();
  let current: FunctionScope | undefined = scope;
  while (current) {
    const declarations = [...current.parameters, ...current.variables]
      .filter((symbol) => symbol.offset <= offset)
      .sort((left, right) => right.offset - left.offset);
    for (const declaration of declarations) {
      if (seen.has(declaration.name)) continue;
      seen.add(declaration.name);
      visible.push(declaration);
    }
    current = current.parent;
  }

  const globals = analysis.globals
    .filter((symbol) => symbol.offset <= offset)
    .sort((left, right) => right.offset - left.offset);
  for (const declaration of globals) {
    if (seen.has(declaration.name)) continue;
    seen.add(declaration.name);
    visible.push(declaration);
  }

  return visible;
}

export function resolveVariable(
  analysis: VariableAnalysis,
  name: string,
  offset: number
): VariableSymbol | undefined {
  return visibleVariables(analysis, offset).find((symbol) => symbol.name === name);
}
