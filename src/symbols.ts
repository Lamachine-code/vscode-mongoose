export interface VariableSymbol {
  name: string;
  offset: number;
  kind: "variable" | "parameter";
}

export interface VariableScope {
  start: number;
  end: number;
  parent?: VariableScope;
  parameters: VariableSymbol[];
  variables: VariableSymbol[];
}

export interface VariableAnalysis {
  root: VariableScope;
  scopes: VariableScope[];
}

type ConstructFrame = {
  kind: "function" | "if" | "while" | "for";
  parentDepth: number;
  branchScope?: VariableScope;
};

function createScope(parent: VariableScope | undefined, start: number, end: number): VariableScope {
  return { start, end, parent, parameters: [], variables: [] };
}

function scopeDepth(scope: VariableScope): number {
  let depth = 0;
  for (let current: VariableScope | undefined = scope; current; current = current.parent) depth++;
  return depth;
}

/**
 * Builds a lightweight lexical-scope model for editor navigation and completion.
 *
 * The compiler remains authoritative for parsing and semantic validation. This
 * scanner mirrors the language's block boundaries so editor features do not
 * leak declarations out of if/while/for/function bodies.
 */
export function analyzeVariables(source: string): VariableAnalysis {
  const masked = maskCommentsAndStrings(source);
  const root = createScope(undefined, 0, source.length);
  const scopes: VariableScope[] = [root];
  const activeScopes: VariableScope[] = [root];
  const constructs: ConstructFrame[] = [];
  let lineOffset = 0;

  const openScope = (parent: VariableScope, start: number): VariableScope => {
    const scope = createScope(parent, start, source.length);
    scopes.push(scope);
    return scope;
  };

  for (const line of masked.split("\n")) {
    const functionMatch = /^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/.exec(line);
    const ifMatch = /^\s*if\b.*\bthen\b/.test(line);
    const whileMatch = /^\s*while\b.*\bdo\b/.test(line);
    const forMatch = /^\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);

    if (functionMatch) {
      const parentDepth = activeScopes.length;
      const functionScope = openScope(activeScopes[activeScopes.length - 1], lineOffset + line.length + 1);
      const parameterText = functionMatch[2];
      const parameterOffset = lineOffset + line.indexOf(parameterText, functionMatch.index);
      const parameterPattern = /(?:^|,)\s*([A-Za-z_][A-Za-z0-9_]*)/g;
      let parameterMatch: RegExpExecArray | null;
      while ((parameterMatch = parameterPattern.exec(parameterText)) !== null) {
        functionScope.parameters.push({
          name: parameterMatch[1],
          offset: parameterOffset + parameterMatch.index + parameterMatch[0].lastIndexOf(parameterMatch[1]),
          kind: "parameter"
        });
      }

      activeScopes.push(functionScope);
      const bodyScope = openScope(functionScope, lineOffset + line.length + 1);
      activeScopes.push(bodyScope);
      constructs.push({ kind: "function", parentDepth });
    } else if (ifMatch) {
      const parentDepth = activeScopes.length;
      const branchScope = openScope(activeScopes[activeScopes.length - 1], lineOffset + line.length + 1);
      activeScopes.push(branchScope);
      constructs.push({ kind: "if", parentDepth, branchScope });
    } else if (whileMatch) {
      const parentDepth = activeScopes.length;
      const bodyScope = openScope(activeScopes[activeScopes.length - 1], lineOffset + line.length + 1);
      activeScopes.push(bodyScope);
      constructs.push({ kind: "while", parentDepth });
    } else if (forMatch) {
      const parentDepth = activeScopes.length;
      const loopScope = openScope(activeScopes[activeScopes.length - 1], lineOffset + line.length + 1);
      const name = forMatch[1];
      loopScope.variables.push({
        name,
        offset: lineOffset + forMatch.index + forMatch[0].lastIndexOf(name),
        kind: "variable"
      });
      activeScopes.push(loopScope);
      const bodyScope = openScope(loopScope, lineOffset + line.length + 1);
      activeScopes.push(bodyScope);
      constructs.push({ kind: "for", parentDepth });
    } else if (/^\s*else\b/.test(line)) {
      const frame = constructs[constructs.length - 1];
      if (frame?.kind === "if" && frame.branchScope) {
        frame.branchScope.end = lineOffset;
        activeScopes.length = frame.parentDepth;
        const elseScope = openScope(activeScopes[activeScopes.length - 1], lineOffset + line.length + 1);
        activeScopes.push(elseScope);
        frame.branchScope = elseScope;
      }
    }

    const currentScope = activeScopes[activeScopes.length - 1];
    const variablePattern = /\blet\s+([A-Za-z_][A-Za-z0-9_]*)/g;
    let variableMatch: RegExpExecArray | null;
    while ((variableMatch = variablePattern.exec(line)) !== null) {
      const name = variableMatch[1];
      currentScope.variables.push({
        name,
        offset: lineOffset + variableMatch.index + variableMatch[0].lastIndexOf(name),
        kind: "variable"
      });
    }

    if (/^\s*stop\b/.test(line)) {
      const frame = constructs.pop();
      if (frame) {
        for (let index = frame.parentDepth; index < activeScopes.length; index++) {
          activeScopes[index].end = lineOffset;
        }
        activeScopes.length = frame.parentDepth;
      }
    }

    lineOffset += line.length + 1;
  }

  return { root, scopes };
}

export function maskCommentsAndStrings(source: string): string {
  return source.replace(
    /"(?:\\.|[^"\\])*(?:"|$)|^[ \t]*\/\/[^\r\n]*|#[^\r\n]*/gm,
    (match) => match.replace(/[^\r\n]/g, " ")
  );
}

export function visibleVariables(analysis: VariableAnalysis, offset: number): VariableSymbol[] {
  const scope = analysis.scopes
    .filter((candidate) => candidate.start <= offset && offset <= candidate.end)
    .sort((left, right) => scopeDepth(right) - scopeDepth(left))[0];

  const visible: VariableSymbol[] = [];
  const seen = new Set<string>();
  let current: VariableScope | undefined = scope;

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

  return visible;
}

export function resolveVariable(
  analysis: VariableAnalysis,
  name: string,
  offset: number
): VariableSymbol | undefined {
  return visibleVariables(analysis, offset).find((symbol) => symbol.name === name);
}
