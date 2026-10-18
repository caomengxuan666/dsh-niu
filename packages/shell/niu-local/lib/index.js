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
import { PwshLocalExecutor } from '@deepseek-ai/dsh-pwsh-local';
import { resolveNiuPath } from "./resolve.js";
/**
 * Project the caller-facing `niuPath` onto the base executor's `pwshPath`
 * reference. The base re-resolves whenever the reference's value changes, so
 * the niu discovery (PATH probing) stays live against config edits while the
 * base's caching sees one stable value per resolved path.
 * @param config - the received section carrying the raw `niuPath`.
 * @returns a `pwshPath` reference that resolves the niu executable.
 */
function niuExecutable(config) {
    return { get: () => resolveNiuPath(config.niuPath) };
}
// Resolution lives in its own dependency-free module so the repository's
// coverage-gate probe shares the exact definition the suites use.
export { candidateNiubashPaths, resolveNiuPath } from "./resolve.js";
/**
 * Local Niubash executor over `ctx.subprocess` — the Niubash twin of
 * `PwshLocalExecutor`. All process mechanics (bounded spill-backed output,
 * deadlines, kill escalation, background handles) are inherited; this
 * subclass supplies the niu executable resolution, the `-c` argv, the
 * bash-like model-friendly environment, and niu-branded diagnostics.
 */
export class NiuLocalExecutor extends PwshLocalExecutor {
    constructor(ctx, config) {
        super(ctx, { ...config, pwshPath: niuExecutable(config) });
    }
    /** The niu executable every command runs through. */
    get niuPath() {
        return this.pwshPath;
    }
    /**
     * Fill the spec, then stamp the bash-dialect terminal override. The base
     * merges `spec.env` over its own overrides at spawn, so `TERM=dumb` (the
     * `dsh-bash-local` dialect) applies unless the caller already set `TERM`.
     */
    resolve(request) {
        const spec = super.resolve(request);
        return { ...spec, env: { TERM: 'dumb', ...spec.env } };
    }
    /**
     * The niu invocation argv for one resolved spec — the argv-level seam a
     * confining subclass wraps through `ctx.sandbox.confine` (the niu twin
     * of `dsh-pwsh-local`'s argv hook; see `@cmx666/dsh-niu-sandbox`).
     */
    argv(spec) {
        return [this.niuPath, '-c', spec.command];
    }
}
export default NiuLocalExecutor;
