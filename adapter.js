import { crocks, R } from "./deps.js";
import { bulk } from "./bulk.js";
const { Async } = crocks;

const {
  compose,
  omit,
  map,
  mergeRight,
  pluck,
  isEmpty,
  toLower,
  head,
  toPairs,
  filter,
} = R;

const lowerCaseValue = compose(
  ([k, v]) => ({ [k]: toLower(v) }),
  head,
  toPairs,
);

const omitDesignDocs = filter(
  (doc) => !(/^_design/.test(doc._id)),
);

export function adapter({ config, asyncFetch, headers, handleResponse }) {
  const retrieveDocument = ({ db, id }) =>
    // https://docs.couchdb.org/en/stable/api/document/common.html#get--db-docid
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
          // https://docs.couchdb.org/en/stable/api/database/common.html#post--db
          asyncFetch(`${config.origin}/${db}`, {
            method: "POST",
            headers,
            body: JSON.stringify(doc),
          })
        )
        .chain(handleResponse(201))
        .map(omit(["rev"]))
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
          // https://docs.couchdb.org/en/stable/api/document/common.html#put--db-docid
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
          // https://docs.couchdb.org/en/stable/api/document/common.html#delete--db-docid
          asyncFetch(`${config.origin}/${db}/${id}?rev=${old._rev}`, {
            method: "DELETE",
            headers,
          })
        )
        .chain(handleResponse(200))
        .map(omit(["rev"]))
        .toPromise(),

    queryDocuments: ({ db, query }) => {
      if (query.sort) {
        query.sort = query.sort.map(lowerCaseValue);
      }

      if (!query.selector) {
        query.selector = {};
      }

      // https://docs.couchdb.org/en/stable/api/database/find.html
      return asyncFetch(`${config.origin}/${db}/_find`, {
        method: "POST",
        headers,
        body: JSON.stringify(query),
      })
        .chain(handleResponse(200))
        .map(omitDesignDocs)
        .map(({ docs }) => ({
          ok: true,
          docs: map(
            omit(["_rev"]),
            docs,
          ),
        }))
        .toPromise();
    },

    indexDocuments: ({ db, name, fields }) =>
      // https://docs.couchdb.org/en/stable/api/database/find.html#post--db-_index
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
      options = limit ? mergeRight({ limit: Number(limit) }, options) : options;
      options = startkey ? mergeRight({ startkey }, options) : options;
      options = endkey ? mergeRight({ endkey }, options) : options;
      options = keys ? mergeRight({ keys: keys.split(",") }, options) : options;
      options = descending ? mergeRight({ descending }, options) : options;

      // https://docs.couchdb.org/en/stable/api/database/bulk-api.html#post--db-_all_docs
      return asyncFetch(`${config.origin}/${db}/_all_docs`, {
        method: "POST",
        headers,
        body: JSON.stringify(options),
      })
        .chain(handleResponse(200))
        .map((result) => pluck("doc", result.rows))
        .map(omitDesignDocs)
        .map((docs) => ({
          ok: true,
          docs: map(
            omit(["_rev"]),
            docs,
          ),
        }))
        .toPromise();
    },
    bulkDocuments: bulk(config.origin, asyncFetch, headers, handleResponse),
  });
}
