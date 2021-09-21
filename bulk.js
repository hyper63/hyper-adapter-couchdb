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
const lensRev = lens(path(["value", "rev"]), assoc("rev"));
const lensId = lens(prop("id"), assoc("_id"));

const xRevs = map(
  compose(
    omit(["key", "value"]),
    over(lensRev, identity),
  ),
);
const mergeWithRevs = (docs) =>
  (revs) =>
    map((doc) => {
      const rev = find((rev) => doc.id === rev.id, revs);
      return rev ? { _rev: rev.rev, ...doc } : doc;
    }, docs);

const switchIds = map(compose(omit(["id"]), over(lensId, identity)));

const pluckIds = pluck("id");

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
      .chain(checkDbExists(couchUrl, db, headers))
      .chain(checkDocs)
      .map(pluckIds)
      .chain(getDocsThatExist(couchUrl, db, headers))
      .map(mergeWithRevs(docs))
      .map(switchIds)
      .chain(applyBulkDocs(couchUrl, db, headers))
      .map(map(omit(["rev"])))
      .map(map((d) => d.error ? assoc("ok", false, d) : d))
      .map((results) => ({ ok: true, results }))
      .toPromise();
};
