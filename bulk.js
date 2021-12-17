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
} = R;

const xRevs = map(
  compose(
    omit(["key", "value"]),
    over(
      lens(path(["value", "rev"]), assoc("rev")),
      identity,
    ),
  ),
);
const mergeWithRevs = (docs) =>
  (revs) =>
    map((doc) => {
      const rev = find((rev) => doc._id === rev.id || doc.id === rev.id, revs);
      return rev ? { _rev: rev.rev, ...doc } : doc;
    }, docs);

// TODO: remove with blueberry
const switchIds = map(
  (doc) => ({
    ...doc,
    _id: doc._id || doc.id,
    id: doc.id || doc._id,
  }),
);

const pluckIds = map(
  (doc) => doc._id || doc.id,
);

const checkDocs = (docs) =>
  is(Object, head(docs))
    ? Async.Resolved(docs)
    : Async.Rejected({ ok: false, msg: "docs must be objects" });

export const bulk = (couchUrl, asyncFetch, headers, handleResponse) => {
  const getDocsThatExist = (url, db, headers) =>
    (ids) =>
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
      .map(switchIds)
      .chain(applyBulkDocs(couchUrl, db, headers))
      .map(map(omit(["rev"])))
      .map(map((d) => d.error ? assoc("ok", false, d) : d))
      .map((results) => ({ ok: true, results }))
      .toPromise();
};
