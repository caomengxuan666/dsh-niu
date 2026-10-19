// One-shot generator for presets/*.patch.yml from the verbatim upstream
// fixtures. Not shipped, not wired into tests - run by hand when rebasing the
// snapshot onto a new DSH line:
//   node tests/generate-presets.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const upstreamDir = new URL('./fixtures/dsh-web-app-0.2.1-rc.2/', import.meta.url)
const BASH_ROW = "disabled: !!js process.platform === 'win32'"
const PWSH_ROW = "disabled: !!js process.platform !== 'win32'"

for (const f of ['standard', 'ptc', 'cordis']) {
  const src = readFileSync(new URL(`${f}.patch.yml`, upstreamDir), 'utf8')
  if (!src.includes(BASH_ROW) || !src.includes(PWSH_ROW)) {
    throw new Error(`${f}.patch.yml: expected exactly one win32 gate line per shell tool`)
  }
  const header = [
    `# Full-config override of @deepseek-ai/dsh-web-app 0.2.1-rc.2 preset "${f}".`,
    "# DSH patches replace a targeted row's whole `config` (no merge by id), so this file",
    '# restates the entire preset row verbatim from the pinned web-app version and flips only',
    '# the Windows shell rows: the niu bundle mounts tool-bash (executed through niu-sandbox)',
    '# and disables tool-pwsh on every platform. tests/bundle.spec.ts drift-checks this file',
    '# against the verbatim upstream copy in tests/fixtures/ - update both together when',
    '# rebasing the snapshot onto a new DSH line.',
    '',
  ].join('\n')
  const body = src
    .replace(/^#.*\n/gm, '')
    .replace(/^- insert:\n/m, '')
    .replace(/^ {4}/gm, '')
    .replace(BASH_ROW, 'disabled: false')
    .replace(PWSH_ROW, 'disabled: true')
    .replace(/^\n+/, '')
  writeFileSync(new URL(`../presets/${f}.patch.yml`, import.meta.url), header + body)
  console.log(`presets/${f}.patch.yml written`)
}
