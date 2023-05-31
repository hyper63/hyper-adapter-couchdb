import { R } from './deps.js'

const {
  allPass,
  isNil,
  is,
  identity,
  complement,
  transduce,
  append,
  omit,
  pluck,
  map,
  filter,
  compose,
  cond,
  T,
  defaultTo,
  head,
  toLower,
  toPairs,
} = R

export const isDefined = complement(isNil)

export const isDesignDoc = (doc) => (/^_design/.test(doc._id))
export const isNotDesignDoc = complement(isDesignDoc)

export const pluckDoc = pluck('doc')
export const omitRev = omit(['rev', '_rev'])

/**
 * A transduce allows us to iterate the array only once,
 * performing composed transformations inlined with reducing,
 * -- hence "trans"-"duce".
 *
 * This prevents iterating the array multiple times to perform multiple
 * transformations
 *
 * NOTE: compositions passed to transduce run top -> bottom instead of the usual
 * bottom to top. This is becase we are composing transformers which are functions
 * not values
 */
export const foldWith = (transformer) => (iter) =>
  transduce(transformer, (acc, item) => append(item, acc), [], iter)

export const sanitizeDocs = foldWith(
  compose(
    filter(allPass([isDefined, isNotDesignDoc])),
    map(omitRev),
  ),
)

/**
 * Each row is like
 * {
      key: '1',
      id: '1',
      value: { rev: '1' },
      doc: { _id: '1', _rev: '1', hello: 'world' },
    }

    So pluck the doc first to pass into sanitizing
  */
export const sanitizeRows = foldWith(
  compose(
    pluck('doc'),
    filter(allPass([isDefined, isNotDesignDoc])),
    map(omitRev),
  ),
)

/**
 * Given an array of hyper sort criteria,
 * return an array of Couch sort criteria.
 *
 * If no, sort criteria is provided, then this noops
 *
 * @param {string[] | Object[]} [sort]
 * @returns {string[] | Object[] | undefined}
 */
export const mapSort = (sort) => {
  if (!sort || !sort.length) return sort

  return sort.map(cond([
    [is(String), identity],
    [
      is(Object),
      compose(
        ([k, v]) => ({ [k]: toLower(v) }),
        head,
        toPairs,
      ),
    ],
    [T, identity],
  ]))
}

/**
 * Given a hyper selector, default to an empty object
 * if the selector is nil
 */
export const mapSelector = defaultTo({})
