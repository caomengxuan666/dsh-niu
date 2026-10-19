# DSH Niubash Plugins

Niubash support for [DeepSeek Harness](https://github.com/caomengxuan666/deepseek-harness-desktop): runtime providers, a one-command profile bundle, and the Web Settings card.

## Install For Official DSH

Install Niubash first and make `niu.exe` available on `PATH`. Then run one command:

```sh
dsh plugin --profile web add @cmx666/dsh-niu-bundle@0.2.1-rc.1
```

The bundle line must match the DSH release: `0.2.1-rc.1` targets DSH `0.2.1-rc.2` (the compatibility gate skips the whole bundle on any other line, with a diagnostic). Start DSH normally:

```sh
dsh web
```

The bundle enables `niu-sandbox` and `tool-bash`, disables the PowerShell shell/tool rows (both at the profile top level and inside the `standard`, `ptc`, and `cordis` agent presets), adds the Niubash card under Settings > Plugins, and moves Session export into the session action group. The `tool-bash` rows resolve to the dsh installation's own copy, so no stale second copy of the tool ever enters the profile.

## Packages

- `@cmx666/dsh-niu-local`: local Niubash executor.
- `@cmx666/dsh-niu-sandbox`: sandboxed Niubash executor.
- `@cmx666/dsh-niu-bundle`: one-command DSH profile bundle.
- `@cmx666/dsh-client-ui-niu`: Web Settings card and client session action placement.

## Desktop

The Frameless Desktop integration lives in the main repository and installs the bundle automatically:

<https://github.com/caomengxuan666/deepseek-harness-desktop>

## Source And Releases

- Source: <https://github.com/caomengxuan666/dsh-niu>
- Desktop releases: <https://github.com/caomengxuan666/deepseek-harness-desktop/releases>
- npm scope: <https://www.npmjs.com/org/cmx666>

## Development

Each package is independently publishable from its package directory. The source mirrors the package contents published to npm; Desktop integration remains in the Desktop repository.

## License

See the individual package metadata and upstream DSH license terms.
