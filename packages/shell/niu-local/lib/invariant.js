export const name = 'niu-local-invariant'
export const inject = ['invariants']
export const apply = (ctx) => Promise.resolve(ctx.invariants.register('@cmx666/dsh-niu-local', () => {}))
