export const name = 'niu-sandbox-invariant'
export const inject = ['invariants']
export const apply = (ctx) => Promise.resolve(ctx.invariants.register('@cmx666/dsh-niu-sandbox', () => {}))
