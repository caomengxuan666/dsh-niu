/**
 * Live executor configuration for `@cmx666/dsh-niu-local`, exercised through
 * the same Loader updates profile reconciliation performs: schema-declared
 * volatile budgets update in place (the fiber and the executor instance
 * survive), while the raw `niuPath` key is an ordinary value whose change
 * re-instantiates the executor — re-running niu discovery against the new
 * path. Mounted behind Loader, so the raw config stays editable after boot.
 */

import { describe, expect, it, onTestFinished } from 'vitest'
import { Context, resolveConfig, type Plugin } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { NiuLocalExecutor } from '@cmx666/dsh-niu-local'

function merge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const before = result[key]
    result[key] = before && typeof before === 'object' && !Array.isArray(before)
      && value && typeof value === 'object' && !Array.isArray(value)
      ? merge(before as Record<string, unknown>, value as Record<string, unknown>) : value
  }
  return result
}

/** Mount a consumer behind Loader and edit its raw configuration. */
async function liveConfig(ctx: Context, plugin: Plugin, initial: object = {}) {
  if (ctx.get('loader') === undefined) {
    await ctx.plugin(Loader)
  }
  const name = `live-${Object.keys(ctx.loader.builtins).length}`
  ctx.loader.builtins[name] = plugin
  const options = { id: plugin.name ?? name, name: `cordis:${name}`, config: initial }
  const id = await ctx.loader.create(options)
  const entry = ctx.loader.resolve(id)
  await entry.fiber!.await()
  const replace = async (next: Record<string, unknown>) => {
    const fiber = entry.fiber!
    resolveConfig(fiber.runtime!, fiber.ctx.waterfall(fiber, 'internal/config', next, () => next))
    await entry.update({ config: next })
    await entry.fiber!.await()
    ctx.emit('app-boot/config-reload')
  }
  return {
    entry,
    fiber: entry.fiber!,
    update: (patch: Record<string, unknown>) => replace(merge(entry.options.config as Record<string, unknown>, patch)),
    replace,
  }
}

async function boot(initial: object = {}): Promise<{ ctx: Context; live: Awaited<ReturnType<typeof liveConfig>> }> {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(LocalSubprocessRuntime)
  const live = await liveConfig(ctx, NiuLocalExecutor, { timeoutMs: 60_000, ...initial })
  return { ctx, live }
}

describe('niu executor live configuration', () => {
  it('uses changed budgets for later commands without remounting the executor', async () => {
    const { ctx, live } = await boot()
    const before = live.fiber
    await live.update({ timeoutMs: 5_000, maxOutputBytes: 1_024 })
    expect(live.entry.fiber === before).toBe(true)
    expect(ctx.shell.resolve({ command: 'echo ok' })).toMatchObject({ timeoutMs: 5_000, stdoutMaxBytes: 1_024 })
    // A stored budget the executor cannot use fails the next command, not the profile write.
    await live.update({ timeoutMs: 0 })
    expect(() => ctx.shell.resolve({ command: 'echo ok' })).toThrow('timeoutMs must be a positive finite number')
    await live.update({ timeoutMs: 5_000, graceMs: Number.MAX_SAFE_INTEGER })
    expect(() => ctx.shell.resolve({ command: 'echo ok' })).toThrow('graceMs must be no greater')
    await live.update({ graceMs: 200 })
    expect(ctx.shell.resolve({ command: 'echo ok' }).timeoutMs).toBe(5_000)
    await live.replace({})
    expect(ctx.shell.resolve({ command: 'echo ok' }).timeoutMs).toBe(120_000)
  })

  it('re-resolves the executable when the stored niuPath changes', async () => {
    const { ctx, live } = await boot({ niuPath: '/opt/first/niu' })
    expect((ctx.shell as NiuLocalExecutor).niuPath).toBe('/opt/first/niu')

    await live.update({ niuPath: '/opt/second/niu' })

    // The raw key is an ordinary value: the executor re-instantiates, and the
    // fresh instance's discovery reads the new path.
    expect((ctx.shell as NiuLocalExecutor).niuPath).toBe('/opt/second/niu')
  })

  it('keeps the resolved executable when an unrelated volatile field changes', async () => {
    const { ctx, live } = await boot({ niuPath: '/opt/first/niu' })
    const before = live.fiber
    const resolved = (ctx.shell as NiuLocalExecutor).niuPath

    await live.update({ timeoutMs: 5_000 })

    // ctx.shell is a tracked proxy, so identity is asserted on the fiber the
    // official pattern uses: a volatile-only change updates the references in
    // place and re-instantiates nothing.
    expect(live.entry.fiber === before).toBe(true)
    expect((ctx.shell as NiuLocalExecutor).niuPath).toBe(resolved)
    expect(ctx.shell.resolve({ command: 'echo ok' }).timeoutMs).toBe(5_000)
  })

  it('falls back to the composition entry when the stored path is cleared', async () => {
    const { ctx, live } = await boot({ niuPath: '/opt/first/niu' })
    await live.update({ niuPath: '/opt/second/niu' })
    expect((ctx.shell as NiuLocalExecutor).niuPath).toBe('/opt/second/niu')

    await live.replace({ niuPath: '/opt/first/niu' })

    expect((ctx.shell as NiuLocalExecutor).niuPath).toBe('/opt/first/niu')
  })

  it('releases the shell registration when the executor unloads', async () => {
    const { ctx, live } = await boot()
    expect(ctx.get('shell')).toBeInstanceOf(NiuLocalExecutor)

    await live.fiber.dispose()

    expect(ctx.get('shell')).toBeUndefined()
  })
})
