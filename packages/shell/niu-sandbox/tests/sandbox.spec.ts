/**
 * Consumer-side `NiuSandboxExecutor` tests. A fake Cordis sandbox service
 * makes wrapping, policy hand-off, fail-closed propagation, and fact stamping
 * deterministic; real-provider integration lives in the pwsh twin's
 * `tests/acl.e2e.ts` (the ACL runner is provider-side, not executor-side).
 * Requires niu for the integration block (skips without it — same gate as
 * niu-local's suites); the helpers block is pure and always runs.
 *
 * 0.2.x seam: `execute()` publishes the handle after preparation and never
 * throws for a spawn problem — the handle settles as `killed` and the
 * foreground projection `result()` carries the failure, which the sandbox
 * subclass maps to `SANDBOX_UNAVAILABLE` when the evidence is attributable
 * to the confinement runner.
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { SandboxProvider, SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox'
import type { ConfinedArgv, RunnerFailureRule, SandboxExecutionPolicy, SandboxPolicy } from '@deepseek-ai/dsh-sandbox'
import type { ShellExecution, ShellExecRequest, ShellRunResult } from '@deepseek-ai/dsh-shell'
import { resolveNiuPath } from '@cmx666/dsh-niu-local'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { NiuSandboxExecutor } from '../src/index.ts'
import { classifyRunnerFailure, isRunnerSpawnFailure, matchesSignature } from '../src/helpers.ts'

// The same probe niu-local's suites and the vitest coverage exemption use:
// spawnSync never throws on a missing binary (it reports status null) — only
// the status is truth.
function niuAvailable(): boolean {
  return spawnSync(resolveNiuPath(), ['-c', 'exit 0'], { encoding: 'utf8' }).status === 0
}

const spillDir = mkdtempSync(join(tmpdir(), 'dsh-niu-sandbox-spec-'))

/** One recorded provider call: the argv handed over and the policy it rode with. */
interface ConfineCall {
  argv: string[]
  policy: SandboxPolicy
}

/** A passthrough wrap: the caller's argv unchanged, asserted full — commands run unconfined, deterministically. */
const passthrough = (argv: readonly string[]): ConfinedArgv =>
  ({ argv: [...argv], enforcement: 'full', denialSignatures: ['access is denied', 'access to the path'], runnerFailureRules: [] })

/** A subprocess service whose spawn() throws SYNCHRONOUSLY — the paths the async service never produces. */
function throwingSubprocessRuntime(error: unknown): new (ctx: Context) => Service {
  return class extends Service {
    constructor(ctx: Context) {
      super(ctx, 'subprocess')
    }

    spawn(): never {
      throw error
    }
  }
}

async function setup(
  behavior: (argv: readonly string[], policy: SandboxPolicy, signal?: AbortSignal) => ConfinedArgv | Promise<ConfinedArgv> = passthrough,
  subprocess: new (ctx: Context) => Service = LocalSubprocessRuntime,
): Promise<{ executor: NiuSandboxExecutor; calls: ConfineCall[] }> {
  const calls: ConfineCall[] = []
  class FakeSandboxProvider extends SandboxProvider {
    async confine(argv: readonly string[], policy: SandboxPolicy, signal?: AbortSignal): Promise<ConfinedArgv> {
      calls.push({ argv: [...argv], policy })
      return behavior(argv, policy, signal)
    }
  }
  const ctx = new Context()
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(FakeSandboxProvider)
  await ctx.plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: spillDir })
  await ctx.plugin(subprocess)
  if (ctx.subprocess instanceof LocalSubprocessRuntime) {
    ctx.subprocess.internals = { spillDir }
  }
  await ctx.plugin(NiuSandboxExecutor, { graceMs: 200 })
  return { executor: ctx.shell as NiuSandboxExecutor, calls }
}

/** Foreground projection: the settled result of one execution. */
async function run(executor: NiuSandboxExecutor, request: ShellExecRequest): Promise<ShellRunResult> {
  const execution = await executor.execute(executor.resolve(request))
  return execution.result()
}

/** Background projection: the live handle execute() publishes. */
async function start(executor: NiuSandboxExecutor, request: ShellExecRequest): Promise<ShellExecution> {
  return executor.execute(executor.resolve(request))
}

describe('helpers (pure)', () => {
  const workdir = mkdtempSync(join(tmpdir(), 'dsh-niu-sandbox-helpers-'))
  afterAll(() => {
    rmSync(workdir, { recursive: true, force: true })
  })

  describe('isRunnerSpawnFailure', () => {
    const absolute = process.execPath
    const bare = 'node'
    const relative = './sandbox-runner'

    it('attributes ENOENT/EACCES with argv[0] provenance and a usable workdir', () => {
      for (const runnerProgram of [absolute, bare, relative]) {
        expect(isRunnerSpawnFailure({ code: 'ENOENT', syscall: `spawn ${runnerProgram}`, path: runnerProgram }, runnerProgram, workdir)).toBe(true)
        expect(isRunnerSpawnFailure({ code: 'EACCES', syscall: `spawn ${runnerProgram}`, path: runnerProgram }, runnerProgram, workdir)).toBe(true)
        expect(isRunnerSpawnFailure({ code: 'ENOENT', syscall: 'spawn', path: runnerProgram }, runnerProgram, workdir)).toBe(true)
        expect(isRunnerSpawnFailure({ code: 'ENOENT', syscall: `spawn ${runnerProgram}` }, runnerProgram, workdir)).toBe(true)
      }
    })

    it('rejects mismatched provenance, foreign codes, unusable workdirs, and non-object errors', () => {
      expect(isRunnerSpawnFailure({ code: 'ENOENT', syscall: 'spawn', path: 'other' }, 'node', workdir)).toBe(false)
      expect(isRunnerSpawnFailure({ code: 'ENOENT', syscall: 'spawn other', path: 'node' }, 'node', workdir)).toBe(false)
      expect(isRunnerSpawnFailure({ code: 'EMFILE', syscall: 'spawn', path: 'node' }, 'node', workdir)).toBe(false)
      expect(isRunnerSpawnFailure({ code: 'ENOENT', path: 'node' }, 'node', workdir)).toBe(false)
      expect(isRunnerSpawnFailure({ code: 'ENOENT', syscall: 'spawn' }, 'node', join(workdir, 'missing'))).toBe(false)
      expect(isRunnerSpawnFailure({ code: 'ENOENT', syscall: 'spawn' }, undefined, workdir)).toBe(false)
      expect(isRunnerSpawnFailure('boom', 'node', workdir)).toBe(false)
      expect(isRunnerSpawnFailure(null, 'node', workdir)).toBe(false)
      // An existing FILE (not a directory) workdir is unusable without throwing.
      const fileWorkdir = join(workdir, 'a-file')
      writeFileSync(fileWorkdir, 'x')
      expect(isRunnerSpawnFailure({ code: 'ENOENT', syscall: 'spawn', path: 'node' }, 'node', fileWorkdir)).toBe(false)
    })
  })

  describe('classifyRunnerFailure', () => {
    const rules: readonly RunnerFailureRule[] = [{
      allowedExitCodes: [127],
      fatalSignatures: ['fake-runner: '],
      informationalLines: ['fake-runner: partial enforcement'],
    }]

    it('matches a fatal signature on a gated exit code, skipping informational lines', () => {
      expect(classifyRunnerFailure(127, 'fake-runner: partial enforcement\nfake-runner: profile refused\n', rules))
        .toEqual({ detail: 'fake-runner: profile refused' })
    })

    it('rejects zero/null exits, gate mismatches, and empty signatures', () => {
      expect(classifyRunnerFailure(0, 'fake-runner: x', rules)).toBeUndefined()
      expect(classifyRunnerFailure(null, 'fake-runner: x', rules)).toBeUndefined()
      expect(classifyRunnerFailure(1, 'fake-runner: x', rules)).toBeUndefined()
      expect(classifyRunnerFailure(127, 'clean output', rules)).toBeUndefined()
      expect(classifyRunnerFailure(127, 'fake-runner: x', [{ fatalSignatures: ['  '] }])).toBeUndefined()
    })

    it('the windows-acl rule is exit-gated on 127: a confined command that merely prints the signature on a non-127 exit is NOT a runner failure', () => {
      const windowsAclRules: readonly RunnerFailureRule[] = [{ allowedExitCodes: [127], fatalSignatures: ['windows-acl-run: '] }]
      expect(classifyRunnerFailure(3, 'windows-acl-run: something the command printed', windowsAclRules)).toBeUndefined()
      expect(classifyRunnerFailure(127, 'windows-acl-run: missing --workspace', windowsAclRules))
        .toEqual({ detail: 'windows-acl-run: missing --workspace' })
    })
  })

  describe('matchesSignature', () => {
    it('matches non-zero exits case-insensitively, never zero or signal exits', () => {
      expect(matchesSignature(1, 'Access to the path is denied.', ['access to the path'])).toBe(true)
      expect(matchesSignature(1, 'ACCESS IS DENIED.', ['access is denied'])).toBe(true)
      expect(matchesSignature(1, 'clean', ['access is denied'])).toBe(false)
      expect(matchesSignature(0, 'access is denied', ['access is denied'])).toBe(false)
      expect(matchesSignature(null, 'access is denied', ['access is denied'])).toBe(false)
    })
  })
})

describe.skipIf(!niuAvailable())('NiuSandboxExecutor', () => {
  // Denial device for the POSIX classification cases: a mode-0555 directory
  // INSIDE a temp scratch tree (the same device as bash/pwsh-sandbox's
  // suites) — unit tests never attempt writes outside the system temp
  // directory. On win32 there is no POSIX mode denial; the real-sandbox denial
  // coverage lives in the pwsh twin's tests/acl.e2e.ts, where the ACL runner
  // denies scratch paths (the runner is provider-side, shared by niu).
  const readOnlyDir = mkdtempSync(join(tmpdir(), 'dsh-niu-sandbox-ro-'))
  if (process.platform !== 'win32') chmodSync(readOnlyDir, 0o555)
  const deniedWriteCommand = `printf 'x' > '${join(readOnlyDir, 'probe.txt')}'`

  afterAll(() => {
    if (process.platform !== 'win32') chmodSync(readOnlyDir, 0o755)
    rmSync(readOnlyDir, { recursive: true, force: true })
    rmSync(spillDir, { recursive: true, force: true })
  })

  // POSIX-only denial device (mode-0555 scratch); win32 real-sandbox denial
  // coverage lives in the pwsh twin's tests/acl.e2e.ts. A privileged runner
  // (root) bypasses the mode bits, so the device needs an unprivileged user.
  const denialDeviceWorks = process.platform !== 'win32' && (process.getuid?.() ?? 0) !== 0

  const RO: SandboxExecutionPolicy = { mode: 'read-only', workspaceRoot: '/ws' }

  it('wraps the exact niu argv through ctx.sandbox with the per-call policy', async () => {
    const { executor, calls } = await setup()
    const result = await run(executor, { command: 'echo wrapped', sandboxPolicy: RO })
    expect(result.exitCode).toBe(0)
    expect(calls).toHaveLength(1)
    const call = calls[0]
    expect(call?.policy).toEqual(RO)
    // The confined argv is the niu invocation, ready for a runner prefix.
    expect(call?.argv[0]).toMatch(/(?:niu|niu)(\.exe)?$/u)
    expect(call?.argv).toContain('-c')
    expect(call?.argv.at(-1)).toContain('echo wrapped')
    expect(result.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full' })
  }, 30_000)

  it('advertises the deployment default mode and stamps the deployment policy when none rides the request', async () => {
    const { executor, calls } = await setup()
    expect(executor.sandboxMode).toBe('workspace-write')
    const result = await run(executor, { command: 'echo fallback' })
    expect(result.exitCode).toBe(0)
    expect(calls[0]?.policy.mode).toBe('workspace-write')
  }, 30_000)

  it('danger-full-access bypasses confine entirely and stamps full-access facts', async () => {
    const { executor, calls } = await setup()
    const result = await run(executor, { command: 'echo full', sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/ws' } })
    expect(result.exitCode).toBe(0)
    expect(calls).toHaveLength(0)
    expect(result.sandbox).toEqual({ mode: 'danger-full-access', denied: false })
  }, 30_000)

  it('an aborted caller signal outranks runner-spawn attribution', async () => {
    const controller = new AbortController()
    controller.abort('caller-cancel')
    const { executor } = await setup(() => ({
      argv: ['definitely-not-a-real-runner', '--', 'niu'],
      enforcement: 'full',
      denialSignatures: [],
      runnerFailureRules: [],
    }))
    // A signal already aborted at preparation rejects execute() itself with
    // the caller's reason — never a runner-attribution error.
    await expect(executor.execute(executor.resolve({ command: 'echo never', sandboxPolicy: RO, signal: controller.signal })))
      .rejects.toThrow('caller-cancel')
  }, 30_000)

  // POSIX-only: the denial device is a mode-0555 scratch dir. On win32 the
  // real-sandbox denial classification is covered by the pwsh twin's
  // tests/acl.e2e.ts (the ACL runner denies scratch paths — unit tests never
  // leave temp).
  it.skipIf(!denialDeviceWorks)('classifies a failed write against the backend denial dialect', async () => {
    const { executor } = await setup()
    const result = await run(executor, {
      command: deniedWriteCommand,
      sandboxPolicy: RO,
    })
    expect(result.exitCode).not.toBe(0)
    expect(result.sandbox).toEqual({ mode: 'read-only', denied: true, enforcement: 'full' })
  }, 30_000)

  it('a runner launch refusal fails closed with SANDBOX_UNAVAILABLE, never unconfined', async () => {
    const { executor } = await setup(() => ({
      argv: ['definitely-not-a-real-runner', '--', 'niu'],
      enforcement: 'full',
      denialSignatures: [],
      runnerFailureRules: [{ fatalSignatures: ['fake-runner: '] }],
    }))
    const execution = await executor.execute(executor.resolve({ command: 'echo never-runs', sandboxPolicy: RO }))
    await expect(execution.result()).rejects.toThrow(SandboxUnavailableError)
  }, 30_000)

  it('a SYNCHRONOUS attributable spawn rejection fails closed, an unattributable one rethrows', async () => {
    const attributable = Object.assign(new Error('sync-enoent'), { code: 'ENOENT', syscall: 'spawn node', path: 'node' })
    const { executor: closed } = await setup(() => ({
      argv: ['node', '--', 'niu'],
      enforcement: 'full',
      denialSignatures: [],
      runnerFailureRules: [{ fatalSignatures: ['fake-runner: '] }],
    }), throwingSubprocessRuntime(attributable))
    const closedExecution = await closed.execute(closed.resolve({ command: 'echo never', sandboxPolicy: RO }))
    await expect(closedExecution.result()).rejects.toThrow(SandboxUnavailableError)

    const foreign = Object.assign(new Error('sync-emfile'), { code: 'EMFILE', syscall: 'spawn', path: 'node' })
    const { executor: passthroughError } = await setup(undefined, throwingSubprocessRuntime(foreign))
    const foreignExecution = await passthroughError.execute(passthroughError.resolve({ command: 'echo never', sandboxPolicy: RO }))
    await expect(foreignExecution.result()).rejects.toThrow('sync-emfile')
  }, 30_000)

  it('a SYNCHRONOUS spawn rejection settles the background handle with the same attribution split', async () => {
    const attributable = Object.assign(new Error('sync-enoent-start'), { code: 'ENOENT', syscall: 'spawn node', path: 'node' })
    const { executor: closed } = await setup(() => ({
      argv: ['node', '--', 'niu'],
      enforcement: 'full',
      denialSignatures: [],
      runnerFailureRules: [{ fatalSignatures: ['fake-runner: '] }],
    }), throwingSubprocessRuntime(attributable))
    const closedProc = await closed.execute(closed.resolve({ command: 'echo never', sandboxPolicy: RO }))
    await closedProc.done
    expect(closedProc.status).toBe('killed')
    expect(closedProc.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full', runnerFailed: true })
    await expect(closedProc.result()).rejects.toThrow(SandboxUnavailableError)

    const foreign = Object.assign(new Error('sync-emfile-start'), { code: 'EMFILE', syscall: 'spawn', path: 'node' })
    const { executor: passthroughError } = await setup(undefined, throwingSubprocessRuntime(foreign))
    const foreignProc = await passthroughError.execute(passthroughError.resolve({ command: 'echo never', sandboxPolicy: RO }))
    await foreignProc.done
    expect(foreignProc.status).toBe('killed')
    // An unattributable rejection keeps the wrap's facts but not runnerFailed:
    // the provider failure names no confinement runner.
    expect(foreignProc.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full' })
    await expect(foreignProc.result()).rejects.toThrow('sync-emfile-start')
  }, 30_000)

  it('a runner that REFUSES at runtime (fatal signature, nonzero exit) fails closed too', async () => {
    const { executor } = await setup(() => ({
      argv: [process.execPath, '-e', 'console.error(\'fake-runner: profile refused\'); process.exit(127)', '--'],
      enforcement: 'full',
      denialSignatures: [],
      runnerFailureRules: [{ fatalSignatures: ['fake-runner: '] }],
    }))
    const execution = await executor.execute(executor.resolve({ command: 'echo never-runs', sandboxPolicy: RO }))
    await expect(execution.result()).rejects.toThrow(SandboxUnavailableError)
  }, 30_000)

  it('background confined runs stamp clean facts at settlement', async () => {
    const { executor } = await setup()
    const clean = await start(executor, { command: 'echo background-ok', sandboxPolicy: RO })
    await clean.done
    expect(clean.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full' })
  }, 30_000)

  // POSIX-only denial device (mode-0555 scratch; skipped for privileged
  // runners); win32 real-sandbox denial coverage lives in the pwsh twin's
  // tests/acl.e2e.ts.
  it.skipIf(!denialDeviceWorks)('background denied writes stamp denied facts at settlement', async () => {
    const { executor } = await setup()
    const denied = await start(executor, {
      command: deniedWriteCommand,
      sandboxPolicy: RO,
    })
    await denied.done
    expect(denied.sandbox).toEqual({ mode: 'read-only', denied: true, enforcement: 'full' })
  }, 30_000)

  it('background spawn rejections settle as runnerFailed facts', async () => {
    const { executor } = await setup(() => ({
      argv: ['definitely-not-a-real-runner', '--', 'niu'],
      enforcement: 'full',
      denialSignatures: [],
      runnerFailureRules: [{ fatalSignatures: ['fake-runner: '] }],
    }))
    const proc = await start(executor, { command: 'echo never', sandboxPolicy: RO })
    await proc.done
    expect(proc.sandbox).toEqual({ mode: 'read-only', denied: false, enforcement: 'full', runnerFailed: true })
    // The failure note surfaces through the read path.
    const read = proc.readOutput()
    expect(read.delta).toContain('subprocess failed before reporting an outcome:')
  }, 30_000)

  it('danger-full-access background runs bypass confine and carry no facts', async () => {
    const { executor, calls } = await setup()
    const proc = await start(executor, {
      command: 'echo full-bg',
      sandboxPolicy: { mode: 'danger-full-access', workspaceRoot: '/ws' },
    })
    await proc.done
    expect(calls).toHaveLength(0)
    expect(proc.sandbox).toBeUndefined()
  }, 30_000)
})
