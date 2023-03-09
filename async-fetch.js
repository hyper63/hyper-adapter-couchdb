import { crocks, R } from './deps.js'

const { Async, composeK } = crocks
const { ifElse, propEq, assoc } = R

export const asyncFetch = (fetch) => Async.fromPromise(fetch)
export const createHeaders = (username, password) => {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (username) {
    headers.authorization = `Basic ${btoa(username + ':' + password)}`
  }
  return headers
}

const toJSON = (result) => Async.fromPromise(result.json.bind(result))()
const toJSONReject = (result) =>
  composeK(
    Async.Rejected,
    (body) => Async.Resolved(assoc('status', result.status, body)),
    toJSON,
  )(result)

export const handleResponse = (code) => ifElse(propEq('status', code), toJSON, toJSONReject)
