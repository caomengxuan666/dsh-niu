# @cmx666/dsh-niu-bundle

One-command DSH profile bundle for Windows Niubash support.

```sh
dsh plugin --profile web add @cmx666/dsh-niu-bundle
```

The bundle installs the Niubash providers, enables `niu-sandbox` and `tool-bash`, and disables the PowerShell shell/tool rows. Install Niubash separately and ensure `niu.exe` is on `PATH`, then start DSH normally with `dsh web`.

## DSH version line

This `0.2.1-rc.x` line of the bundle targets DSH `0.2.1-rc.2` and newer `0.2.1` prereleases (`engines.dsh: ^0.2.1-rc.2`). The compatibility gate reads that range alone and skips the whole bundle with a diagnostic on any other DSH line, instead of mounting half of it. Install the bundle line that matches your DSH release.

## Why there is no profile copy of dsh-tool-bash

The bundle deliberately does not depend on `@deepseek-ai/dsh-tool-bash`. Its `tool-bash` rows resolve to the copy that ships inside the dsh installation, which is always built for the running runtime. A profile-local copy would shadow the installation copy and then be denied by the compatibility gate whenever its exact peer versions lag the runtime - the "install succeeds, executor works, bash tool missing" state reported in issue #2.

## Preset overrides

The model-facing shell tools are mounted by the agent presets, not by the profile top level, so the bundle also ships full-config overrides of the web-app presets (`presets/standard.patch.yml`, `presets/ptc.patch.yml`, `presets/cordis.patch.yml`). DSH patches replace a targeted row's whole `config` instead of merging by id, so each override restates the entire preset row of one pinned `@deepseek-ai/dsh-web-app` version (0.2.1-rc.2) and flips only the shell rows: `tool-bash` enabled, `tool-pwsh` disabled on every platform. The verbatim upstream copy lives in `tests/fixtures/`, and `tests/bundle.spec.ts` fails when a DSH upgrade changes anything else in those presets, so a snapshot refresh is always a conscious update.
