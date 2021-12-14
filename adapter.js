import { crocks, R } from "./deps.js";
import { bulk } from "./bulk.js";
const { Async } = crocks;

const {
  compose,
  omit,
  map,
  lens,
  prop,
  assoc,
  over,
  identity,
  merge,
  pluck,
  isEmpty,
  toLower,
  head,
  toPairs,
} = R;
const xId = lens(prop("_id"), assoc("id"));

const lowerCaseValue = compose(
  ([k, v]) => ({ [k]: toLower(v) }),
  head,
  toPairs,
);

export function adapter({ config, asyncFetch, headers, handleResponse }) {
  const retrieveDocument = ({ db, id }) =>
    asyncFetch(`${config.origin}/${db}/${id}`, {
      headers,
    }).chain(handleResponse(200));

  return ({
    // create database needs to
    // create the database
    // and create the security document
    // adding the db-admin and db-user
    // to the database
    createDatabase: (name) =>
      asyncFetch(`${config.origin}/${name}`, {
        method: "PUT",
        headers,
      })
        .chain(handleResponse(201))
        // create security document
        .chain(() =>
          asyncFetch(`${config.origin}/${name}/_security`, {
            method: "PUT",
            headers,
            body: JSON.stringify({
              admins: {
                names: [],
                roles: ["db-admins"],
              },
              members: {
                names: [],
                roles: ["db-users"],
              },
            }),
          })
        )
        .chain(handleResponse(200))
        .toPromise(),
    removeDatabase: (name) =>
      asyncFetch(`${config.origin}/${name}`, {
        method: "DELETE",
        headers,
      }).chain(handleResponse(200)).toPromise(),

    createDocument: ({ db, id, doc }) =>
      Async.of(doc)
        .chain((doc) =>
          isEmpty(doc)
            ? Async.Rejected({ ok: false, status: 400, msg: "document empty" })
            : Async.Resolved(doc)
        )
        .chain((doc) => Async.Resolved({ ...doc, _id: id }))
        .chain((doc) =>
          /^_design/.test(doc._id)
            ? Async.Rejected({
              ok: false,
              msg: "user can not create design docs",
            })
            : Async.Resolved(doc)
        )
        .chain((doc) =>
          asyncFetch(`${config.origin}/${db}`, {
            method: "POST",
            headers,
            body: JSON.stringify(doc),
          })
        )
        .chain(handleResponse(201))
        .bichain(
          (e) =>
            e.status ? Async.Rejected(e) : Async.Rejected({
              ok: false,
              status: 409,
              msg: "document conflict",
            }),
          Async.Resolved,
        )
        .toPromise(),
    retrieveDocument: ({ db, id }) =>
      retrieveDocument({ db, id })
        .map(omit(["_rev"]))
        .map(assoc("id", id))
        .bichain(
          (_) =>
            Async.Rejected({ ok: false, status: 404, msg: "doc not found" }),
          Async.Resolved,
        )
        .toPromise(),
    updateDocument: ({ db, id, doc }) => {
      // need to retrieve the document if exists
      // then upsert if possible
      return asyncFetch(`${config.origin}/${db}/${id}`, {
        headers,
      })
        .chain((res) => Async.fromPromise(res.json.bind(res))())
        .map((doc) => {
          return doc.error ? null : doc;
        })
        .chain((old) =>
          old
            ? asyncFetch(`${config.origin}/${db}/${id}?rev=${old._rev}`, {
              method: "PUT",
              headers,
              body: JSON.stringify(doc),
            })
            : asyncFetch(`${config.origin}/${db}/${id}`, {
              method: "PUT",
              headers,
              body: JSON.stringify(doc),
            })
        )
        .chain(handleResponse(201))
        .map(omit(["rev"]))
        .toPromise();
    },
    removeDocument: ({ db, id }) =>
      retrieveDocument({ db, id })
        .chain((old) =>
          asyncFetch(`${config.origin}/${db}/${id}?rev=${old._rev}`, {
            method: "DELETE",
            headers,
          })
        )
        .chain(handleResponse(200)).toPromise(),
    queryDocuments: ({ db, query }) => {
      if (query.sort) {
        query.sort = query.sort.map(lowerCaseValue);
      }

      return asyncFetch(`${config.origin}/${db}/_find`, {
        method: "POST",
        headers,
        body: JSON.stringify(query),
      })
        .chain(handleResponse(200))
        .map(({ docs }) => ({
          ok: true,
          docs: map(
            compose(
              omit(["_rev"]),
              over(xId, identity),
            ),
            docs,
          ),
        }))
        .toPromise();
    },
    indexDocuments: ({ db, name, fields }) =>
      asyncFetch(`${config.origin}/${db}/_index`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          index: {
            fields,
          },
          ddoc: name,
        }),
      })
        .chain(handleResponse(200))
        .map(() => ({ ok: true }))
        .toPromise(),
    listDocuments: ({ db, limit, startkey, endkey, keys, descending }) => {
      // deno-lint-ignore camelcase
      let options = { include_docs: true };
      options = limit ? merge({ limit: Number(limit) }, options) : options;
      options = startkey ? merge({ startkey }, options) : options;
      options = endkey ? merge({ endkey }, options) : options;
      options = keys ? merge({ keys: keys.split(",") }, options) : options;
      options = descending ? merge({ descending }, options) : options;

      return asyncFetch(`${config.origin}/${db}/_all_docs`, {
        method: "POST",
        headers,
        body: JSON.stringify(options),
      })
        .chain(handleResponse(200))
        .map((result) => ({
          ok: true,
          docs: map(
            compose(
              omit(["_rev"]),
              over(xId, identity),
            ),
            pluck("doc", result.rows),
          ),
        }))
        .toPromise();
    },
    bulkDocuments: bulk(config.origin, asyncFetch, headers, handleResponse),
  });
}
