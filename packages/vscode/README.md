# MDX TSX Import Checker

Validates named imports of **React/TSX components** in MDX files and shows errors inline in the editor.

Catches errors like wrong export names or missing files — as you type, without running the dev server.

---

## Features

- **Inline diagnostics** — Errors appear as red underlines directly in the editor
- **Problems panel** — All errors listed in VSCode's Problems panel (`Cmd+Shift+M`)
- **Real-time checking** — Validates on open, save, and while typing (debounced)
- **tsconfig path alias support** — Resolves `@/components/foo` via `tsconfig.json` paths
- **node_modules support** — Checks named exports from installed packages
- **Zero config** — Works out of the box with auto-detection of `tsconfig.json`

---

## Requirements

This extension requires the [mdx-tsx-import-checker](https://www.npmjs.com/package/mdx-tsx-import-checker) CLI to be **installed locally in your project**:

```bash
npm install -D mdx-tsx-import-checker
# or
pnpm add -D mdx-tsx-import-checker
# or
yarn add -D mdx-tsx-import-checker
```

> **Why local install only?**
> The extension intentionally does not use `npx` to avoid automatically downloading and executing unverified packages. Pinning the version in `package.json` ensures the exact binary is verified via your lockfile.

If the CLI is not installed, the extension will show a warning with a link to the installation docs.

---

## Usage

Open any `.mdx` file in your workspace. Errors will appear automatically.

### Example

```mdx
import { CardGrid } from '@astrojs/starlight/comonents'; // typo in package path
import { ButtonSizeExample } from '@/components/button/size'; // named export checked
```

The extension will underline `CardGrid` and show:

```
'CardGrid' is not exported from '@astrojs/starlight/comonents'
```

---

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `mdxImportChecker.enable` | `boolean` | `true` | Enable or disable the extension |
| `mdxImportChecker.tsconfigPath` | `string` | `""` | Path to `tsconfig.json` relative to workspace root. Leave empty to auto-detect. |

---

## Supported Import Types

| Type | Example | Supported |
|---|---|---|
| tsconfig path alias | `from '@/components/Button'` | ✅ |
| Relative path | `from './components/Button'` | ✅ |
| node_modules (TS/JS) | `from '@astrojs/starlight/components'` | ✅ |
| Default import | `import Foo from '...'` | ⚪ skipped |

## Not Supported

The following import targets are silently skipped:

- `.astro` / `.svelte` / `.vue` components
- CSS modules, images, and other non-JS assets
- Dynamic imports (`await import(...)`)
- Imports inside fenced code blocks (` ``` `)

---

## Related

- [mdx-tsx-import-checker CLI](https://www.npmjs.com/package/mdx-tsx-import-checker) — Use in CI or pre-commit hooks
- [GitHub Repository](https://github.com/ToruTamahashi/mdx-import-checker)

---

## License

MIT
