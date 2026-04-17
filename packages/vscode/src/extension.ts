import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";

// -----------------------------------------------------------------------
// Types — mirrors CLI's --format json output
// -----------------------------------------------------------------------

interface CheckError {
  file: string;
  /** 1-based line number */
  line: number;
  /** 1-based column, or 0 if unknown */
  column: number;
  message: string;
}

/** stdout の上限サイズ (5MB) — これを超えたらプロセスを強制終了する */
const MAX_STDOUT_BYTES = 5 * 1024 * 1024;

// -----------------------------------------------------------------------
// Extension entry points
// -----------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection("mdx-tsx-import-checker");
  context.subscriptions.push(collection);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (isMdx(doc)) validate(doc, collection);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isMdx(doc)) validate(doc, collection);
    })
  );

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!isMdx(event.document)) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => validate(event.document, collection), 800);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      collection.delete(doc.uri);
    })
  );

  for (const doc of vscode.workspace.textDocuments) {
    if (isMdx(doc)) validate(doc, collection);
  }
}

export function deactivate(): void {}

// -----------------------------------------------------------------------
// Validation — delegates to CLI via child_process
// -----------------------------------------------------------------------

function isMdx(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith(".mdx");
}

function validate(
  doc: vscode.TextDocument,
  collection: vscode.DiagnosticCollection
): void {
  const config = vscode.workspace.getConfiguration("mdxImportChecker");
  if (!config.get<boolean>("enable", true)) {
    collection.delete(doc.uri);
    return;
  }

  const workspaceRoot = getWorkspaceRoot(doc);
  const localBin = findLocalBin(workspaceRoot);

  if (!localBin) {
    vscode.window.showWarningMessage(
      "MDX TSX Import Checker: mdx-tsx-import-checker is not installed in this project. " +
      "Run: npm install -D mdx-tsx-import-checker",
      "Show docs"
    ).then((selection) => {
      if (selection === "Show docs") {
        vscode.env.openExternal(
          vscode.Uri.parse("https://www.npmjs.com/package/mdx-tsx-import-checker")
        );
      }
    });
    collection.set(doc.uri, []);
    return;
  }

  const tsconfigPath = resolveConfiguredTsconfig(workspaceRoot, config);

  runCli(localBin, doc.fileName, workspaceRoot, tsconfigPath)
    .then((errors) => {
      const diagnostics = errors.map((err) => makeDiagnostic(doc, err));
      collection.set(doc.uri, diagnostics);
    })
    .catch((err: Error) => {
      console.error(`mdx-tsx-import-checker error: ${err.message}`);
      collection.set(doc.uri, []);
    });
}

// -----------------------------------------------------------------------
// CLI binary resolution
// -----------------------------------------------------------------------

/**
 * ローカルの node_modules/.bin を探す。
 *
 * 探索範囲を workspaceRoot 自身に限定する。
 * monorepo で親の node_modules も必要な場合は、
 * VSCode が認識している workspaceFolders の最上位までに制限する。
 */
function findLocalBin(workspaceRoot: string | null): string | null {
  if (!workspaceRoot) return null;

  // 探索の上限: VSCode のワークスペースフォルダの中で最も上位のパス
  const searchCeiling = getWorkspaceCeiling();

  let dir = workspaceRoot;
  const fsRoot = path.parse(dir).root;

  while (true) {
    const bin = path.join(dir, "node_modules", ".bin", "mdx-tsx-import-checker");
    if (fs.existsSync(bin)) return bin;

    // 上限に達したら終了
    if (dir === searchCeiling || dir === fsRoot) break;
    dir = path.dirname(dir);
  }

  return null;
}

/**
 * VSCode が認識しているワークスペースフォルダのうち最も上位のパスを返す。
 * これ以上は遡らないことでプロジェクト外のバイナリ実行を防ぐ。
 */
function getWorkspaceCeiling(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return path.parse(process.cwd()).root;

  // 最も短いパス（= 最上位）を ceiling とする
  return folders
    .map((f) => f.uri.fsPath)
    .reduce((shortest, current) =>
      current.length < shortest.length ? current : shortest
    );
}

// -----------------------------------------------------------------------
// CLI runner
// -----------------------------------------------------------------------

function runCli(
  localBin: string,
  filePath: string,
  workspaceRoot: string | null,
  tsconfigPath: string | undefined
): Promise<CheckError[]> {
  const args: string[] = [
    filePath,
    "--format", "json",
    "--no-color",
    ...(tsconfigPath ? ["--tsconfig", tsconfigPath] : []),
  ];

  const cwd = workspaceRoot ?? path.dirname(filePath);

  return new Promise((resolve, reject) => {
    let stdoutBuf = "";
    let stdoutBytes = 0;
    let stderr = "";

    // Windows でも shell: false で動作させるため、
    // cmd.exe 経由で明示的に組み立てる
    const spawnCmd = process.platform === "win32" ? "cmd.exe" : localBin;
    const spawnArgs = process.platform === "win32"
      ? ["/c", localBin, ...args]
      : args;

    const child = spawn(spawnCmd, spawnArgs, {
      cwd,
      shell: false, // パスインジェクションリスクを排除
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      // stdout が上限を超えたらプロセスを強制終了
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        child.kill();
        reject(new Error("mdx-tsx-import-checker: stdout exceeded size limit (5MB)"));
        return;
      }
      stdoutBuf += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      // exit code 0 = no errors, 1 = errors found — どちらも正常終了
      if (code !== 0 && code !== 1) {
        reject(new Error(`exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const errors = JSON.parse(stdoutBuf) as CheckError[];
        resolve(errors);
      } catch {
        resolve([]);
      }
    });

    child.on("error", reject);
  });
}

// -----------------------------------------------------------------------
// Diagnostic builder
// -----------------------------------------------------------------------

function makeDiagnostic(doc: vscode.TextDocument, err: CheckError): vscode.Diagnostic {
  const line = Math.max(0, err.line - 1);
  const col = Math.max(0, err.column - 1);
  const lineText = doc.lineAt(line).text;

  const range =
    err.column > 0
      ? new vscode.Range(line, col, line, col + extractSymbolLength(err.message))
      : new vscode.Range(line, 0, line, lineText.length);

  const diag = new vscode.Diagnostic(range, err.message, vscode.DiagnosticSeverity.Error);
  diag.source = "mdx-tsx-import-checker";
  return diag;
}

function extractSymbolLength(message: string): number {
  const m = message.match(/^'(\w+)'/);
  return m ? m[1].length : 1;
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function getWorkspaceRoot(doc: vscode.TextDocument): string | null {
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  if (folder) return folder.uri.fsPath;

  let dir = path.dirname(doc.fileName);
  const root = path.parse(dir).root;
  while (dir !== root) {
    for (const marker of ["tsconfig.json", "package.json", ".git"]) {
      if (fs.existsSync(path.join(dir, marker))) return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function resolveConfiguredTsconfig(
  workspaceRoot: string | null,
  config: vscode.WorkspaceConfiguration
): string | undefined {
  const configured = config.get<string>("tsconfigPath", "");
  if (configured && workspaceRoot) {
    return path.resolve(workspaceRoot, configured);
  }
  return undefined;
}
