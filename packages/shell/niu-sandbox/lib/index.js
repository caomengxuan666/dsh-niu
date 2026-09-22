import { SandboxPwshExecutor } from '@deepseek-ai/dsh-pwsh-sandbox'
import { resolveNiuPath } from '@cmx666/dsh-niu-local'

class NiuSandboxExecutor extends SandboxPwshExecutor {
  static inject = ['subprocess', 'sandbox', 'sandboxPolicy']

  constructor(ctx, config = {}) {
    const configured = config.niuPath ?? config.niuPath ?? config.pwshPath
    super(ctx, { ...config, pwshPath: resolveNiuPath(configured) })
  }

  get niuPath() {
    return this.pwshPath
  }

  argv(spec) {
    return [this.niuPath, '-c', spec.command]
  }
}

export { NiuSandboxExecutor }
export default NiuSandboxExecutor
