# Mongoose Language Support for VS Code

VS Code language support for the **Mongoose** programming language.

## Features

- TextMate syntax highlighting for `.snake` source files and optional `.mg` files.
- `#` line comments and context-sensitive `//` (line comment at the start of a line, floor division inside expressions), double-quoted strings, numbers, booleans and `nil`.
- Highlighting for Mongoose control-flow and declaration keywords.
- Lightweight IntelliSense: keyword/literal suggestions, built-in and locally declared function completions, and variables and function parameters visible in the current scope.
- Hover documentation for language keywords, literals and built-in functions.
- Go to Definition for visible variables and function parameters, plus functions in the workspace.
- Live syntax and semantic diagnostics from `mongoose_check`, mapped to the exact line and column reported by the checker and shown in the editor and Problems panel.
- Run the active `.snake` or `.mg` file with the configured Mongoose interpreter.
- Built-in function completions and hover documentation for `print`, `length`, `substring`, `new_array`, `push`, `pop`, `keys`, `values` and `has_key`.
- Snippets for variables, functions, conditions, loops, array literals, dictionary literals and operations.
- No external language server or Mongoose runtime is required for editor features; running files requires the Mongoose interpreter.

The current built-ins include `length` for strings, arrays and dictionaries; `push` and `pop` for arrays; and `keys`, `values` and `has_key` for dictionaries. Dictionary keys and values preserve insertion order. Arrays and dictionaries are reference values and support nested indexing.

## File extensions

The extension registers both `.snake` and `.mg`. The existing Mongoose project uses `.snake`; `.mg` is provided as a convenient optional alias.

## Icons

The extension includes a Mongoose logo and a **Seti + Mongoose** file icon theme. It preserves the Seti icons and adds a Mongoose icon for `.snake` and `.mg` files. To show them, select **Seti + Mongoose** in VS Code via **Preferences: File Icon Theme**. VS Code allows only one active file icon theme at a time, so the combined theme must be selected instead of the original Seti theme.

## Run a Mongoose file

Set `mongoose.interpreterPath` in VS Code Settings to the path of your Mongoose interpreter. It defaults to `mongoose`, which must be available on `PATH`; otherwise, set it to the full executable path. Open a saved `.snake` or `.mg` file and run **Mongoose: Run Current File** from the Command Palette (`Ctrl+Shift+P`) or the editor title. The program runs in the integrated terminal, using the file's workspace folder (or its containing folder when it is outside a workspace) as its working directory. This runs programs but does not provide debugger or breakpoint support.

## Diagnostics

The extension runs `mongoose_check` on the current Mongoose document after edits and when it is opened or saved. The default `mongoose.checkerPath` value is `mongoose_check`, so it is found automatically if it is on `PATH`; otherwise, set that setting to the full executable path. Diagnostics update as you type and are also listed in VS Code's **Problems** panel. If the checker cannot be started or returns unrecognized output, actionable details are shown in the **Mongoose Checker** output channel. The diagnostic backend is isolated behind a provider interface, allowing a future LSP-backed implementation without changing the editor integration.

## Requirements

- Visual Studio Code 1.85 or newer
- Node.js and npm (for development/building)

## Run in development mode

1. Clone this repository or open this folder in VS Code.
2. Install dependencies:

   ```bash
   npm install
   ```
3. Compile the extension:

   ```bash
   npm run compile
   ```
4. Run the symbol-scope regression tests:

   ```bash
   npm test
   ```
5. Press **F5** in VS Code. A new Extension Development Host window opens.
6. Create or open a `.snake` (or `.mg`) file and try the syntax highlighting, completions and snippets.

Use `Ctrl+Space` to trigger completions. Type a snippet prefix such as `ifelse`, `while`, `for`, `function` or `newarray`, then press `Tab`.

## Package as a VSIX

Install dependencies, then run:

```bash
npm run package
```

This runs `vsce package` and creates a `.vsix` file in the project directory. Install it with:

```bash
code --install-extension mongoose-language-support-0.1.0.vsix
```

## Project layout

```text
.
├── package.json
├── tsconfig.json
├── language-configuration.json
├── assets/
│   └── mongoose-logo.png
├── syntaxes/
│   └── mongoose.tmLanguage.json
├── snippets/
│   └── mongoose.json
├── tests/
│   └── symbols.test.cjs
├── themes/
│   └── mongoose-icon-theme.json
└── src/
    ├── checker.ts
    ├── extension.ts
    └── symbols.ts
```

## Current scope and limitations

This is a lightweight editor integration, not a full Language Server Protocol implementation. Completions and variable navigation model lexical scopes for top-level declarations, function parameters and locals, `if`/ `else` branches, and `while`/ `for` bodies, including variable shadowing. This editor-side scope model is intentionally lightweight; `mongoose_check` remains authoritative for parsing and semantic validation. Function navigation searches `.snake` and `.mg` files in the workspace. The extension does not implement a full parser or type checker; syntax and semantic diagnostics are provided by the separately installed `mongoose_check` executable.

The grammar follows the current frontend grammar documented in [`Mongoose/docs/LANGUAGE_GRAMMAR.md`](https://github.com/Lamachine-code/Mongoose/blob/development/ai/docs/LANGUAGE_GRAMMAR.md). It includes array literals (`[1, 2]`), dictionary literals (`[\"name\": \"Alice\"]` and `[:]`), chained indexing, exponentiation (`^`), modulo (`%`) and floor division (`//`). A `//` comment is recognized only when it is the first non-whitespace text on a line; `#` is the unambiguous line-comment form. `function name(...) ... stop`, `if condition then ... stop`, `while condition do ... stop`, and inclusive `for i = start to end do ... stop` are supported.

## License

MIT
