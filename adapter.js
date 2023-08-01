import { crocks, R } from './deps.js'
import { bulk } from './bulk.js'
import { handleHyperErr, HyperErr } from './err.js'
import { mapSelector, mapSort, omitRev, sanitizeDocs, sanitizeRows } from './utils.js'

const { Async } = crocks

const {
  always,
  omit,
  mergeRight,
  prop,
  isEmpty,
  trim,
} = R

export function adapter({ config, asyncFetch, headers, handleResponse }) {
  const retrieveDocument = ({ db, id }) =>
    // https://docs.couchdb.org/en/stable/api/document/common.html#get--db-docid
    asyncFetch(`${config.origin}/${db}/${id}`, {
      headers,
    }).chain(handleResponse(200))

  return ({
    // create database needs to
    // create the database
    // and create the security document
    // adding the db-admin and db-user
    // to the database
    createDatabase: (name) =>
      asyncFetch(`${config.origin}/${name}`, {
        method: 'PUT',
        headers,
      })
        .chain(handleResponse(201))
        // create security document
        .chain(() =>
          asyncFetch(`${config.origin}/${name}/_security`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              admins: {
                names: [],
                roles: ['db-admins'],
              },
              members: {
                names: [],
                roles: ['db-users'],
              },
            }),
          })
        )
        .chain(handleResponse(200))
        .bichain(
          handleHyperErr,
          always(Async.Resolved({ ok: true })),
        )
        .toPromise(),

    removeDatabase: (name) =>
      asyncFetch(`${config.origin}/${name}`, {
        method: 'DELETE',
        headers,
      })
        .chain(handleResponse(200))
        .bichain(
          handleHyperErr,
          always(Async.Resolved({ ok: true })),
        ).toPromise(),

    createDocument: ({ db, id, doc }) =>
      Async.of(doc)
        .chain((doc) =>
          isEmpty(doc)
            ? Async.Rejected(HyperErr({ status: 400, msg: 'document empty' }))
            : Async.Resolved(doc)
        )
        .chain((doc) => Async.Resolved({ ...doc, _id: id }))
        .chain((doc) =>
          /^_design/.test(doc._id)
            ? Async.Rejected(HyperErr({
              status: 403,
              msg: 'user can not create design docs',
            }))
            : Async.Resolved(doc)
        )
        .chain((doc) =>
          // https://docs.couchdb.org/en/stable/api/database/common.html#post--db
          asyncFetch(`${config.origin}/${db}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(doc),
          }).chain(handleResponse(201))
            .bichain(
              (e) =>
                // TODO: map some more errors from couch here
                // TODO: see Status Codes section on https://docs.couchdb.org/en/stable/api/database/common.html#post--db
                e.status !== 409 ? Async.Rejected(e) : Async.Rejected(HyperErr({
                  status: 409,
                  msg: 'document conflict',
                })),
              Async.Resolved,
            )
        )
        .map(omit(['rev'])) // { ok, id }
        .bichain(
          handleHyperErr,
          Async.Resolved,
        )
        .toPromise(),

    retrieveDocument: ({ db, id }) =>
      retrieveDocument({ db, id })
        .map(omit(['_rev']))
        .bichain(
          (_) =>
            Async.Rejected(
              HyperErr({ status: 404, msg: 'doc not found' }),
            ),
          Async.Resolved,
        )
        .bichain(
          handleHyperErr,
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
          return doc.error ? null : doc
        })
        .chain((old) =>
          // https://docs.couchdb.org/en/stable/api/document/common.html#put--db-docid
          old
            ? asyncFetch(`${config.origin}/${db}/${id}?rev=${old._rev}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify(doc),
            })
            : asyncFetch(`${config.origin}/${db}/${id}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify(doc),
            })
        )
        .chain(handleResponse(201))
        .map(omit(['rev'])) // { ok, id }
        .bichain(
          handleHyperErr,
          Async.Resolved,
        )
        .toPromise()
    },

    removeDocument: ({ db, id }) =>
      retrieveDocument({ db, id })
        .chain((old) =>
          // https://docs.couchdb.org/en/stable/api/document/common.html#delete--db-docid
          asyncFetch(`${config.origin}/${db}/${id}?rev=${old._rev}`, {
            method: 'DELETE',
            headers,
          })
        )
        .chain(handleResponse(200))
        .map(omitRev) // { ok, id }
        .bichain(
          handleHyperErr,
          Async.Resolved,
        )
        .toPromise(),

    queryDocuments: ({ db, query }) => {
      return Async.of(query)
        .map((query) => ({
          ...query,
          selector: mapSelector(query.selector),
          sort: mapSort(query.sort),
        }))
        // https://docs.couchdb.org/en/stable/api/database/find.html
        .chain((query) =>
          asyncFetch(`${config.origin}/${db}/_find`, {
            method: 'POST',
            headers,
            body: JSON.stringify(query),
          })
        )
        .chain(handleResponse(200))
        .map(prop('docs'))
        .map(sanitizeDocs)
        .map((docs) => ({ ok: true, docs }))
        .bichain(
          handleHyperErr,
          Async.Resolved,
        )
        .toPromise()
    },

    indexDocuments: ({ db, name, fields, partialFilter }) => {
      return Async.of({
        fields: mapSort(fields),
        ...(partialFilter ? { partial_filter_selector: partialFilter } : {}),
      })
        .chain((index) => {
          // https://docs.couchdb.org/en/stable/api/database/find.html#post--db-_index
          return asyncFetch(`${config.origin}/${db}/_index`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ index, ddoc: name }),
          })
        })
        .chain(handleResponse(200))
        .bichain(
          handleHyperErr,
          always(Async.Resolved({ ok: true })),
        )
        .toPromise()
    },

    listDocuments: ({ db, limit, startkey, endkey, keys, descending }) => {
      // deno-lint-ignore camelcase
      let options = { include_docs: true }
      options = limit ? mergeRight({ limit: Number(limit) }, options) : options
      options = startkey ? mergeRight({ startkey }, options) : options
      options = endkey ? mergeRight({ endkey }, options) : options
      options = keys ? mergeRight({ keys: keys.split(',').map(trim) }, options) : options
      options = descending ? mergeRight({ descending }, options) : options

      // https://docs.couchdb.org/en/stable/api/database/bulk-api.html#post--db-_all_docs
      return asyncFetch(`${config.origin}/${db}/_all_docs`, {
        method: 'POST',
        headers,
        body: JSON.stringify(options),
      })
        .chain(handleResponse(200))
        .map(prop('rows'))
        .map(sanitizeRows)
        .map((docs) => ({ ok: true, docs }))
        .bichain(
          handleHyperErr,
          Async.Resolved,
        )
        .toPromise()
    },
    bulkDocuments: bulk(config.origin, asyncFetch, headers, handleResponse),
  })
}
