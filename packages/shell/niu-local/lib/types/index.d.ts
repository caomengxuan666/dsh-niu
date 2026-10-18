/**
 * Local Niubash Service Provider for the bash capability seam. Each command
 * runs as `<niu> -c <command>` in a managed process spawned through
 * `ctx.subprocess`, with the PowerShell executor family's process lifecycle,
 * output collection, deadlines, cause classification, and model-friendly
 * environment inherited from `@deepseek-ai/dsh-pwsh-local`. Niubash is a
 * Windows-native bash-compatible shell with a `-c` command domain: the
 * command string is passed as ONE argv element and niu parses the text
 * itself, so no intermediate shell exists and there is no shell-quoting layer
 * to escape (the `bash -c` string domain applies as-is).
 *
 * @module @cmx666/dsh-niu-local
 */
import { Context } from '@deepseek-ai/cordis';
import type { ShellExecRequest, ShellExecSpec } from '@deepseek-ai/dsh-shell';
import { PwshLocalExecutor } from '@deepseek-ai/dsh-pwsh-local';
import type { Config as PwshConfig } from '@deepseek-ai/dsh-pwsh-local';
/**
 * The config this executor receives: the inherited pwsh-shaped section
 * (Volatile live budgets) plus the patch-supplied `niuPath`. The executable
 * key is not part of the base schema, so a non-strict validation merges it
 * through verbatim; {@link niuExecutable} adapts it onto the base's
 * `pwshPath` reference.
 */
export type Config = PwshConfig & {
    /** Explicit niu executable; absent probes PATH for `niu[.exe]`. */
    niuPath?: string;
};
export { candidateNiubashPaths, resolveNiuPath } from './resolve.ts';
/**
 * Local Niubash executor over `ctx.subprocess` — the Niubash twin of
 * `PwshLocalExecutor`. All process mechanics (bounded spill-backed output,
 * deadlines, kill escalation, background handles) are inherited; this
 * subclass supplies the niu executable resolution, the `-c` argv, the
 * bash-like model-friendly environment, and niu-branded diagnostics.
 */
export declare class NiuLocalExecutor extends PwshLocalExecutor {
    constructor(ctx: Context, config: Config);
    /** The niu executable every command runs through. */
    get niuPath(): string;
    /**
     * Fill the spec, then stamp the bash-dialect terminal override. The base
     * merges `spec.env` over its own overrides at spawn, so `TERM=dumb` (the
     * `dsh-bash-local` dialect) applies unless the caller already set `TERM`.
     */
    resolve(request: ShellExecRequest): ShellExecSpec;
    /**
     * The niu invocation argv for one resolved spec — the argv-level seam a
     * confining subclass wraps through `ctx.sandbox.confine` (the niu twin
     * of `dsh-pwsh-local`'s argv hook; see `@cmx666/dsh-niu-sandbox`).
     */
    protected argv(spec: ShellExecSpec): string[];
}
export default NiuLocalExecutor;
