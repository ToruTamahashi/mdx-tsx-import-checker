# mdx-tsx-import-checker

Validates named imports of **React/TSX components** in MDX files.

Detects errors like wrong export names or missing files — before you run the dev server.

---

## Packages

| Package | Description |
|---|---|
| [`mdx-tsx-import-checker`](./packages/cli) | CLI tool (`npx` compatible) |
| [`mdx-tsx-import-checker-vscode`](./packages/vscode) | VSCode extension |
| [`@mdx-tsx-import-checker/core`](./packages/core) | Core logic (used by both) |

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

- `.astro` components (Astro's own format)
- `.svelte` / `.vue` components
- CSS modules, images, and other non-JS assets
- Dynamic imports (`await import(...)`)

Only TypeScript/JavaScript files (`.ts`, `.tsx`, `.js`, `.jsx`, `.d.ts`, `.mjs`, `.cjs`) are analyzed for named exports.

---

## CLI

### Installation

```bash
npm install -g mdx-tsx-import-checker
# or use without installing:
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
npx mdx-tsx-import-checker ./src/content/docs --format json     # machine-readable

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

The `--format github` flag emits [GitHub Actions annotations](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#setting-an-error-message) that appear inline in pull request diffs.

---

## VSCode Extension

Install from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=ToruTamahashi.mdx-tsx-import-checker-vscode) *(coming soon)*.

Errors appear inline in the editor and in the Problems panel as you type.

### Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `mdxImportChecker.enable` | boolean | `true` | Enable or disable the extension |
| `mdxImportChecker.tsconfigPath` | string | `""` | Path to `tsconfig.json` relative to workspace root. Leave empty to auto-detect. |

---

## License

MIT
