import { crocks, R } from "./deps.js";

const { Async } = crocks;
const {
  assoc,
  compose,
  identity,
  has,
  head,
  find,
  filter,
  is,
  lens,
  map,
  omit,
  over,
  path,
  prop,
  propEq,
  pluck,
} = R;

/**
 * Moves value.rev to top lvl rev field, then removes key and value fields
 */
const xRevs = map(
  compose(
    omit(["key", "value"]),
    over(
      lens(path(["value", "rev"]), assoc("rev")),
      identity,
    ),
  ),
);

/**
 * @param {*} docs - The docs from the bulk payload
 * @returns a function that accepts a list of docs from the db, to merge with bulk payload
 */
const mergeWithRevs = (docs) =>
  (revs) =>
    map((doc) => {
      /**
       * incoming docs have an _id. revs have an id
       */
      const rev = find((rev) => doc._id === rev.id, revs);
      /**
       * If a rev exists, then update doc,
       * Otherwise, create a doc with no _rev
       * and Couch will create a new doc with a new rev
       */
      return rev ? { _rev: rev.rev, ...doc } : doc;
    }, docs);

const pluckIds = pluck("_id");

const checkDocs = (docs) =>
  is(Object, head(docs))
    ? Async.Resolved(docs)
    : Async.Rejected({ ok: false, msg: "docs must be objects" });

export const bulk = (couchUrl, asyncFetch, headers, handleResponse) => {
  const getDocsThatExist = (url, db, headers) =>
    (ids) =>
      // https://docs.couchdb.org/en/stable/api/database/bulk-api.html#post--db-_all_docs
      asyncFetch(`${url}/${db}/_all_docs`, {
        method: "POST",
        body: JSON.stringify({ keys: ids }),
        headers,
      })
        .chain(handleResponse(200))
        .map(prop("rows"))
        .map(filter(has("value")))
        .map(filter((rec) => !rec.value.deleted))
        .map(xRevs);

  const applyBulkDocs = (url, db, headers) =>
    (docs) =>
      // https://docs.couchdb.org/en/stable/api/database/bulk-api.html#db-bulk-docs
      asyncFetch(`${url}/${db}/_bulk_docs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ docs }),
      })
        .chain(handleResponse(201));

  const checkDbExists = (url, db, headers) =>
    (docs) =>
      asyncFetch(`${url}/${db}`, { headers })
        .chain(handleResponse(200))
        .chain((res) =>
          propEq("db_name", db, res)
            ? Async.Resolved(docs)
            : Async.Rejected({ ok: false, msg: "db not found" })
        );

  return ({ db, docs }) =>
    Async.of(docs)
      .map(map(omit(["_update"])))
      .chain(checkDbExists(couchUrl, db, headers))
      .chain(checkDocs)
      .map(pluckIds)
      .chain(getDocsThatExist(couchUrl, db, headers))
      .map(mergeWithRevs(map(omit(["_update"]), docs)))
      .chain(applyBulkDocs(couchUrl, db, headers))
      .map(map(omit(["rev"])))
      .map(map((d) => d.error ? assoc("ok", false, d) : d))
      .map((results) => ({ ok: true, results }))
      .toPromise();
};
