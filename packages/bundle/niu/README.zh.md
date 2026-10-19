# @cmx666/dsh-niu-bundle

Windows 上启用 Niubash 的一条命令 DSH profile bundle。

```sh
dsh plugin --profile web add @cmx666/dsh-niu-bundle
```

此 bundle 会安装 Niubash Provider，启用 `niu-sandbox` 和 `tool-bash`，并禁用 PowerShell shell/tool。请另外安装 Niubash，并确保 `niu.exe` 位于 `PATH`，然后正常启动 `dsh web`。

## DSH 版本线

bundle 的 `0.2.1-rc.x` 线面向 DSH `0.2.1-rc.2` 及更新的 `0.2.1` 预发布版（`engines.dsh: ^0.2.1-rc.2`）。兼容性门禁只看这个范围，在不匹配的 DSH 版本上会整包跳过并给出诊断信息，而不是只挂载一半。请安装与自己 DSH 版本匹配的 bundle 线。

## 为什么不内置 dsh-tool-bash 副本

bundle 刻意不依赖 `@deepseek-ai/dsh-tool-bash`。它的 `tool-bash` 行会解析到 dsh 安装目录自带的副本——那个副本永远与运行时版本匹配。如果 profile 里装了第二份副本，它会遮蔽安装目录的版本，并在其精确 peer 版本落后于运行时时被兼容性门禁禁用，形成 issue #2 报告的"安装成功、执行器生效、bash 工具缺失"的状态。

## Preset 覆盖

模型可见的 shell 工具由 agent preset 挂载，而不是 profile 顶层，所以 bundle 同时提供 web-app preset 的整段覆盖（`presets/standard.patch.yml`、`presets/ptc.patch.yml`、`presets/cordis.patch.yml`）。DSH 的 patch 是按 id 整段替换 `config`，不按 id 合并，因此每个覆盖文件都完整复述了锁定版本（`@deepseek-ai/dsh-web-app` 0.2.1-rc.2）的整行 preset，只翻转 shell 两行：`tool-bash` 启用、`tool-pwsh` 在所有平台禁用。上游原文保存在 `tests/fixtures/`；当 DSH 升级改动了 preset 的任何其他内容时 `tests/bundle.spec.ts` 会失败，保证快照更新永远是显式动作。
