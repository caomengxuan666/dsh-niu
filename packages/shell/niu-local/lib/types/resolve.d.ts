/**
 * Niubash executable resolution, dependency-free so non-package consumers
 * (the repository's coverage-gate probe in `vitest.config.ts`) can share the
 * ONE resolution definition with the executor and its suites — a probe that
 * resolved differently from the code under test could exempt a file whose
 * suites actually run.
 *
 * Niubash ships as `niu[.exe]`; the default discovery probes every PATH entry
 * in order, then falls back to a bare `niu` that the operating system resolves
 * through PATH (CreateProcess on Windows applies PATHEXT, so a `.cmd`/`.bat`
 * shim on PATH still works).
 *
 * @module @cmx666/dsh-niu-local/resolve
 */
/**
 * PATH-derived niu executable candidates, platform-named. Explicitly
 * parameterized (env, platform) so resolution is a pure function of its
 * inputs on every platform.
 * @param env - the environment to probe; defaults to the process environment.
 * @param platform - the platform to resolve for; defaults to the process platform.
 * @returns candidate paths in resolution order: every PATH entry's
 *          `niu[.exe]`, in PATH order.
 */
export declare function candidateNiubashPaths(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string[];
/**
 * Resolve the niu executable this executor spawns.
 * @param configured - an explicit `niuPath` config value, trusted as-is.
 * @param env - the environment to probe; defaults to the process environment.
 * @param platform - the platform to resolve for; defaults to the process platform.
 * @returns the configured path verbatim, else the first existing PATH
 * candidate, else a bare `niu` for PATH resolution.
 */
export declare function resolveNiuPath(configured?: string, env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string;
