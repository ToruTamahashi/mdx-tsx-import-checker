# mdx-tsx-import-checker

Validates named imports of **React/TSX components** in MDX files.

Catches errors like wrong export names or missing files — before you run the dev server.

```
  src/content/docs/index.mdx:21  error  'CardGrid' is not exported from '@astrojs/starlight/components'. Available: Card, CardGrid, ...
```

---

## Packages

| Package | Description |
|---|---|
| [`mdx-tsx-import-checker`](./packages/cli) | CLI tool — use in CI or pre-commit hooks |
| [`mdx-tsx-import-checker-vscode`](./packages/vscode) | VSCode extension — inline diagnostics as you type |
| [`@mdx-tsx-import-checker/core`](./packages/core) | Core logic (bundled into CLI, not published separately) |

---

## CLI

### Installation

```bash
# Install locally (recommended)
npm install -D mdx-tsx-import-checker

# Or run without installing
npx mdx-tsx-import-checker <path>
```

### Usage

```bash
# Check a directory (recursive)
npx mdx-tsx-import-checker ./src/content/docs

# Specify tsconfig manually
npx mdx-tsx-import-checker ./src/content/docs --tsconfig ./tsconfig.json

# Output formats
npx mdx-tsx-import-checker ./src/content/docs --format pretty   # default
npx mdx-tsx-import-checker ./src/content/docs --format github   # GitHub Actions annotations
npx mdx-tsx-import-checker ./src/content/docs --format json     # machine-readable JSON

# Disable color output
npx mdx-tsx-import-checker ./src/content/docs --no-color

# Verbose debug output
npx mdx-tsx-import-checker ./src/content/docs --verbose
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | No errors found |
| `1` | One or more import errors found |

### CI Integration

**GitHub Actions:**

```yaml
- name: Check MDX imports
  run: npx mdx-tsx-import-checker ./src/content/docs --format github
```

`--format github` outputs [workflow annotations](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#setting-an-error-message) that appear inline in pull request diffs.

---

## VSCode Extension

Install from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=ToruTamahashi.mdx-tsx-import-checker-vscode).

The extension requires the CLI to be **installed locally in your project**:

```bash
npm install -D mdx-tsx-import-checker
```

> The extension intentionally does not use `npx` to avoid automatically downloading and executing unverified packages. Pinning the version in `package.json` ensures the exact binary is verified via your lockfile.

---

## Supported Import Types

| Type | Example | Supported |
|---|---|---|
| tsconfig path alias | `from '@/components/Button'` | ✅ |
| Relative path | `from './components/Button'` | ✅ |
| node_modules (TS/JS) | `from '@astrojs/starlight/components'` | ✅ |
| Default import | `import Foo from '...'` | ⚪ skipped |

## Not Supported

The following import targets are **not supported** and will be silently skipped:

- `.astro` / `.svelte` / `.vue` components
- CSS modules, images, and other non-JS assets
- Dynamic imports (`await import(...)`)
- Imports inside fenced code blocks (` ``` `)

Only TypeScript/JavaScript files (`.ts`, `.tsx`, `.js`, `.jsx`, `.d.ts`, `.mjs`, `.cjs`) are analyzed for named exports.

---

## Repository Structure

```
packages/
├── core/    # Core logic (import parsing, module resolution, export extraction)
├── cli/     # CLI — core is bundled in, no runtime dependencies
└── vscode/  # VSCode extension — calls CLI via child_process, no direct core dependency
```

---

## License

MIT
