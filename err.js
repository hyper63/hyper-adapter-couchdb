import { crocks, R } from "./deps.js";

const { Async } = crocks;
const {
  __,
  assoc,
  isEmpty,
  ifElse,
  defaultTo,
  propEq,
  cond,
  is,
  identity,
  T,
  complement,
  isNil,
  compose,
  has,
  allPass,
  anyPass,
  filter,
} = R;

const isDefined = complement(isNil);
const isEmptyObject = allPass([
  complement(is(Array)), // not an array
  is(Object),
  isEmpty,
]);
const rejectNil = filter(isDefined);

/**
 * Constructs a hyper-esque error
 *
 * @typedef {Object} HyperErrArgs
 * @property {string} msg
 * @property {number?} status
 *
 * @typedef {Object} NotOk
 * @property {false} ok
 *
 * @param {(HyperErrArgs | string)} argsOrMsg
 * @returns {NotOk & HyperErrArgs} - the hyper-esque error
 */
export const HyperErr = (argsOrMsg) =>
  compose(
    ({ ok, msg, status }) => rejectNil({ ok, msg, status }), // pick and filter nil
    assoc("ok", false),
    cond([
      // string
      [is(String), assoc("msg", __, {})],
      // { msg?, status? }
      [
        anyPass([
          isEmptyObject,
          has("msg"),
          has("status"),
        ]),
        identity,
      ],
      // Fallthrough to error
      [T, () => {
        throw new Error(
          "HyperErr args must be a string or an object with msg or status",
        );
      }],
    ]),
    defaultTo({}),
  )(argsOrMsg);

export const isHyperErr = allPass([
  propEq("ok", false),
  /**
   * should not have an _id.
   * Otherwise it's a document ie data.retrieveDocument
   * or cache.getDoc
   */
  complement(has("_id")),
]);

export const handleHyperErr = ifElse(
  isHyperErr,
  Async.Resolved,
  Async.Rejected,
);
