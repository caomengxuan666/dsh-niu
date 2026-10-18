/**
 * Sandbox-consuming Niubash executor — the Niubash twin of
 * `@deepseek-ai/dsh-pwsh-sandbox` (and through it of
 * `@deepseek-ai/dsh-bash-sandbox`). It wraps the exact local niu argv
 * through `ctx.sandbox` (which on Windows resolves to the ACL restricted-token
 * runner chain), inherits local process mechanics, and reports the selected
 * mode, enforcement, and denial facts. Positive runner-launch evidence means
 * the command never ran: foreground calls throw `SANDBOX_UNAVAILABLE`, while
 * background processes carry `runnerFailed`; other spawn rejections retain
 * local-executor semantics. The tool layer owns the escalation approval flow
 * through `ctx.approval`; this executor reports the sandbox facts the tool
 * renders.
 *
 * The confinement mechanics (per-call policy resolution, the
 * `executeArgv` preparation hook, the per-process fact ledger, and the
 * `onProcessDone` settlement classification) are inherited verbatim from
 * `SandboxPwshExecutor`; this subclass supplies only the niu executable and
 * its `-c` argv.
 *
 * @module @cmx666/dsh-niu-sandbox
 */

import { Context } from '@deepseek-ai/cordis'
import type { Volatile } from '@deepseek-ai/cordis'
import type { ShellExecSpec } from '@deepseek-ai/dsh-shell'
import { SandboxPwshExecutor } from '@deepseek-ai/dsh-pwsh-sandbox'
import type { Config as PwshSandboxConfig } from '@deepseek-ai/dsh-pwsh-sandbox'
import { resolveNiuPath } from '@cmx666/dsh-niu-local'

/**
 * Plugin config: the local executor's knobs, verbatim. The sandbox policy —
 * the default mode and fallback `workspace-write` root — is NOT here: it lives
 * on `ctx.sandboxPolicy` (`@deepseek-ai/dsh-sandbox-policy`), which resolves
 * each calling session's mode and cwd for every enforcing capability. The
 * runner choice is likewise the `ctx.sandbox` provider's config, not this
 * executor's.
 */
export type Config = PwshSandboxConfig & {
  /** Explicit niu executable; absent probes PATH for `niu[.exe]`. */
  niuPath?: string
}

/**
 * Project the caller-facing `niuPath` onto the base executor's `pwshPath`
 * reference so the inherited argv seam spawns niu.
 * @param config - the received section carrying the raw `niuPath`.
 * @returns a `pwshPath` reference that resolves the niu executable.
 */
function niuExecutable(config: Config): Volatile<string | undefined> {
  return { get: () => resolveNiuPath(config.niuPath) }
}

/**
 * Registers as `ctx.shell` in place of the local Niubash executor and requires
 * a `ctx.sandbox` provider plus `ctx.sandboxPolicy`; the tool layer carries the
 * sandbox denial rendering and escalation surface. Tool calls pass the calling
 * session's resolved policy; direct calls fall back to deployment policy.
 * `result.sandbox` reports the mode, enforcement, and denial facts the tool
 * renders.
 */
export class NiuSandboxExecutor extends SandboxPwshExecutor {
  static override inject = ['subprocess', 'sandbox', 'sandboxPolicy']

  constructor(ctx: Context, config: Config) {
    super(ctx, { ...config, pwshPath: niuExecutable(config) })
  }

  /** The niu executable every command runs through. */
  get niuPath(): string {
    return this.pwshPath
  }

  /**
   * The niu invocation argv for one resolved spec — the argv-level seam the
   * inherited `confine` wraps through `ctx.sandbox.confine`.
   */
  protected override argv(spec: ShellExecSpec): string[] {
    return [this.niuPath, '-c', spec.command]
  }
}

export default NiuSandboxExecutor
