# Mongoose Language Support for VS Code

VS Code language support for the **Mongoose** programming language.

## Features

- TextMate syntax highlighting for `.snake` source files and optional `.mg` files.
- `//`, `#` and `/* ... */` comments, double-quoted strings, numbers, booleans and `nil`.
- Highlighting for Mongoose control-flow and declaration keywords.
- Lightweight IntelliSense: keyword/literal suggestions, built-in and locally declared function completions, and variables and function parameters visible in the current scope.
- Hover documentation for language keywords, literals and built-in functions.
- Go to Definition for visible variables and function parameters, plus functions in the workspace.
- Live syntax and semantic diagnostics from `mongoose_check`, shown in the editor and Problems panel.
- Run the active `.snake` or `.mg` file with the configured Mongoose interpreter.
- Snippets for variables, functions, conditions, loops, comments and array operations.
- No external language server or Mongoose runtime is required for editor features; running files requires the Mongoose interpreter.

## File extensions

The extension registers both `.snake` and `.mg`. The existing Mongoose project uses `.snake`; `.mg` is provided as a convenient optional alias.

## Icons

The extension includes a Mongoose logo and a **Seti + Mongoose** file icon theme. It preserves the Seti icons and adds a Mongoose icon for `.snake` and `.mg` files. To show them, select **Seti + Mongoose** in VS Code via **Preferences: File Icon Theme**. VS Code allows only one active file icon theme at a time, so the combined theme must be selected instead of the original Seti theme.

## Run a Mongoose file

Set `mongoose.interpreterPath` in VS Code Settings to the path of your Mongoose interpreter. It defaults to `mongoose`, which must be available on `PATH`; otherwise, set it to the full executable path. Open a saved `.snake` or `.mg` file and run **Mongoose: Run Current File** from the Command Palette (`Ctrl+Shift+P`) or the editor title. The program runs in the integrated terminal, using the file's workspace folder (or its containing folder when it is outside a workspace) as its working directory. This runs programs but does not provide debugger or breakpoint support.

## Diagnostics

The extension runs `mongoose_check` on the current Mongoose document after edits and when it is opened or saved. The default `mongoose.checkerPath` value is `mongoose_check`, so it is found automatically if it is on `PATH`; otherwise, set that setting to the full executable path. Diagnostics update as you type and are also listed in VS Code's **Problems** panel. If the checker cannot be started or returns unrecognized output, details are shown in the **Mongoose Checker** output channel.

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
4. Press **F5** in VS Code. A new Extension Development Host window opens.
5. Create or open a `.snake` (or `.mg`) file and try the syntax highlighting, completions and snippets.

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
├── themes/
│   └── mongoose-icon-theme.json
└── src/
    ├── checker.ts
    ├── extension.ts
    └── symbols.ts
```

## Current scope and limitations

This is a lightweight editor integration, not a full Language Server Protocol implementation. Completions and variable navigation recognize top-level `let` declarations, function-local `let` declarations and function parameters; nested function scopes and variable shadowing are supported. Variable visibility is not resolved at the level of `if`, `while` or `for` blocks. Function navigation searches `.snake` and `.mg` files in the workspace. The extension does not implement a full parser or type checker; syntax and semantic diagnostics are provided by the separately installed `mongoose_check` executable.

The grammar follows the syntax currently used by the Mongoose project, including `function name(...) ... stop`, `if condition then ... stop`, `while condition do ... stop`, and `for i = start to end do ... stop`.

## License

MIT
