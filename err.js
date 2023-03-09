import { crocks, HyperErr, isHyperErr, R } from './deps.js'

const { Async } = crocks
const { ifElse } = R

export { HyperErr, isHyperErr }

export const handleHyperErr = ifElse(
  isHyperErr,
  Async.Resolved,
  Async.Rejected,
)
