/**
 * Structural and drift tests for the `@cmx666/dsh-niu-bundle` patch set.
 *
 * The bundle ships host-plane rows (cordis.patch.yml) and full-config
 * overrides of the web-app agent presets (presets/*.patch.yml). DSH patches
 * replace a targeted row's whole `config` instead of merging by id, so the
 * preset overrides restate the entire preset row of one pinned
 * @deepseek-ai/dsh-web-app version (the verbatim copy lives in
 * tests/fixtures/). These tests pin that contract: the shipped overrides may
 * differ from the upstream snapshot ONLY in the two Windows shell rows, so a
 * DSH upgrade that adds or edits preset tools fails here instead of silently
 * dropping them for users.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'

const pkgDir = new URL('..', import.meta.url)

/**
 * Parse a DSH patch file, keeping !!js expressions as opaque "js: ..." strings.
 * The expressions are rewritten to quoted scalars before parsing so the plain
 * core schema stays in charge of every real boolean, number and string.
 */
function parsePatch(relativePath: string): unknown {
  const raw = readFileSync(new URL(relativePath, pkgDir), 'utf8')
  const normalized = raw.replace(/!!js (".*"|.*\S)[ \t]*(?=\n|$)/g, (_, scalar: string) => {
    const expression = scalar.startsWith('"') && scalar.endsWith('"')
      ? scalar.slice(1, -1).replace(/\\"/g, '"')
      : scalar
    return JSON.stringify(`js: ${expression}`)
  })
  return load(normalized)
}

type Row = Record<string, unknown>

function rowsOf(patch: unknown): Row[] {
  expect(Array.isArray(patch)).toBe(true)
  return patch as Row[]
}

/** The single preset row of a fixture patch file, unwrapping its `insert:`. */
function presetRowOf(patch: unknown): Row {
  const rows = rowsOf(patch)
  const insert = rows.find((row) => Array.isArray(row.insert)) as { insert: Row[] } | undefined
  const candidate = insert !== undefined ? (insert.insert as Row[]) : rows
  expect(candidate).toHaveLength(1)
  return candidate[0]
}

function findRow(rows: Row[], id: string): Row {
  const row = rows.find((candidate) => candidate.id === id)
  expect(row, `row ${id}`).toBeDefined()
  return row as Row
}

/** Order-insensitive structural comparison for parsed YAML values. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Row).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Row)[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function deepEqual(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right)
}

const pinnedVersion = readdirSync(new URL('tests/fixtures', pkgDir))
  .find((name) => name.startsWith('dsh-web-app-'))
  ?.replace('dsh-web-app-', '')

const bundleManifest: Row = JSON.parse(readFileSync(new URL('package.json', pkgDir), 'utf8'))
const sandboxManifest: Row = JSON.parse(
  readFileSync(new URL('../../shell/niu-sandbox/package.json', pkgDir), 'utf8'),
)

describe('bundle manifest', () => {
  it('installs no second copy of a host core package', () => {
    // The 0.2.0 compatibility gate denies profile rows whose resolved
    // manifest pins an exact dsh version (issue #2): a profile dependency on
    // any @deepseek-ai package resolves to one prerelease line and shadows
    // the installation copy the runtime actually provides. The bundle and
    // every profile-installed package it depends on must therefore declare
    // dsh core packages as peers only (the host always supplies them).
    const manifestsWithDependencies = [
      ['bundle', bundleManifest],
      ['niu-sandbox', sandboxManifest],
    ] as const
    for (const [name, manifest] of manifestsWithDependencies) {
      const dependencies = manifest.dependencies as Record<string, string> | undefined
      const offenders = Object.keys(dependencies ?? {}).filter(
        (dependency) => dependency === '@deepseek-ai/dsh' || dependency.startsWith('@deepseek-ai/dsh-'),
      )
      expect(offenders, `${name} dependencies`).toEqual([])
    }
  })

  it('gates itself to the dsh line the preset snapshot was taken from', () => {
    // With engines.dsh present the compatibility gate decides on this range
    // alone; on any other dsh line the bundle is skipped with a diagnostic
    // instead of mounting stale frozen presets.
    expect(pinnedVersion).toBe('0.2.1-rc.2')
    expect(bundleManifest.engines).toEqual({ dsh: `^${pinnedVersion}` })
  })

  it('ships the host-plane patch followed by every preset override', () => {
    const patches = ((bundleManifest.dsh as Row).bundle as Row).patch as string[]
    const expected = [
      './cordis.patch.yml',
      './presets/standard.patch.yml',
      './presets/ptc.patch.yml',
      './presets/cordis.patch.yml',
    ]
    expect(patches).toEqual(expected)
    for (const patch of patches) {
      const shipped = (bundleManifest.files as string[]).some(
        (glob) => glob === patch.slice(2) || (glob === 'presets/*.patch.yml' && patch.startsWith('./presets/')),
      )
      expect(shipped, `${patch} published`).toBe(true)
      expect(() => readFileSync(new URL(patch, pkgDir)), patch).not.toThrow()
    }
  })
})

describe('host-plane patch', () => {
  const rows = rowsOf(parsePatch('cordis.patch.yml'))

  it('disables the PowerShell shell provider and tool', () => {
    expect(findRow(rows, 'pwsh-sandbox').disabled).toBe(true)
    expect(findRow(rows, 'tool-pwsh').disabled).toBe(true)
  })

  it('enables tool-bash without installing a profile-local copy', () => {
    const toolBash = findRow(rows, 'tool-bash')
    expect(toolBash.disabled).toBe(false)
    expect(toolBash.name).toBe('@deepseek-ai/dsh-tool-bash')
  })

  it('mounts the niu sandbox executor', () => {
    const insert = rows.find((row) => Array.isArray(row.insert)) as { insert: Row[] }
    expect(Array.isArray(insert.insert)).toBe(true)
    const niuSandbox = insert.insert.find((row) => row.id === 'niu-sandbox')
    expect(niuSandbox).toMatchObject({
      name: '@cmx666/dsh-niu-sandbox',
      disabled: false,
      config: { niuPath: 'niu' },
    })
  })
})

describe('preset overrides', () => {
  const presets = ['standard', 'ptc', 'cordis'] as const

  for (const preset of presets) {
    const override = presetRowOf(parsePatch(`presets/${preset}.patch.yml`))
    const upstreamRow = presetRowOf(
      parsePatch(`tests/fixtures/dsh-web-app-${pinnedVersion}/${preset}.patch.yml`),
    )
    const upstreamConfig = upstreamRow.config as Row

    it(`${preset}: overrides the upstream row by id and name`, () => {
      expect(upstreamRow.id).toBe(`preset-${preset}`)
      expect(override.id).toBe(`preset-${preset}`)
      // A name mismatch makes the Loader skip the override entirely, so the
      // restated name must track the upstream row.
      expect(override.name).toBe('@deepseek-ai/dsh-agent-preset')
      expect(override.name).toBe(upstreamRow.name)
    })

    it(`${preset}: restates the full upstream config except the shell rows`, () => {
      const config = override.config as Row
      expect(config.id).toBe(upstreamConfig.id)
      expect(config.order).toBe(upstreamConfig.order)
      expect(config.id).toBe(preset)

      const expectedPlugins = (structuredClone(upstreamConfig.plugins) as Row[]).map((plugin) => {
        if (plugin.id === 'tool-bash') return { ...plugin, disabled: false }
        if (plugin.id === 'tool-pwsh') return { ...plugin, disabled: true }
        return plugin
      })
      // Every other tool, group, isolate and prompt section must match the
      // pinned upstream preset structurally - this is the drift tripwire for
      // DSH preset changes.
      expect(deepEqual(config.plugins, expectedPlugins), `drift in preset ${preset}: ${canonical({
        shipped: config.plugins,
        expected: expectedPlugins,
      })}`).toBe(true)
    })

    it(`${preset}: forces bash and forces pwsh off on every platform`, () => {
      const plugins = (override.config as Row).plugins as Row[]
      expect(findRow(plugins, 'tool-bash').disabled).toBe(false)
      expect(findRow(plugins, 'tool-pwsh').disabled).toBe(true)
      const serialized = readFileSync(new URL(`presets/${preset}.patch.yml`, pkgDir), 'utf8')
      expect(serialized.includes('!!js process.platform')).toBe(false)
    })
  }

  it('covers every shipped preset that mounts a shell tool', () => {
    const upstreamPresets = readdirSync(new URL('tests/fixtures', pkgDir))
      .filter((name) => name.startsWith('dsh-web-app-'))
    expect(upstreamPresets).toHaveLength(1)
    const upstreamFiles = readdirSync(new URL(`tests/fixtures/${upstreamPresets[0]}`, pkgDir))
    const withShellTool = upstreamFiles.filter((file) => {
      const row = presetRowOf(parsePatch(`tests/fixtures/${upstreamPresets[0]}/${file}`))
      return String(row.id).startsWith('preset-')
        && Array.isArray((row.config as Row)?.plugins)
        && ((row.config as Row).plugins as Row[]).some((plugin) => plugin.id === 'tool-pwsh')
    })
    // minimal.patch.yml deliberately mounts no interactive shell tool; every
    // preset that does must have an override.
    expect(withShellTool.sort()).toEqual(['cordis.patch.yml', 'ptc.patch.yml', 'standard.patch.yml'])
  })
})
