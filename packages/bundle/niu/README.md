# @cmx666/dsh-niu-bundle

One-command DSH profile bundle for Windows Niubash support.

```sh
dsh plugin --profile web add @cmx666/dsh-niu-bundle
```

The bundle installs the Niubash providers, enables `niu-sandbox` and `tool-bash`, and disables the PowerShell shell/tool rows. Install Niubash separately and ensure `niu.exe` is on `PATH`, then start DSH normally with `dsh web`.
