import { assert, assertEquals, assertObjectMatch } from './dev_deps.js'
import { asyncFetch, createHeaders, handleResponse } from './async-fetch.js'
import { adapter } from './adapter.js'

const test = Deno.test
const COUCH = 'http://localhost:5984'

const testFetch = (url, options) => {
  options.method = options.method || 'GET'

  // Create DB
  if (url === 'http://localhost:5984/hello' && options.method === 'PUT') {
    return Promise.resolve({
      status: 201,
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    })
  }
  // Create security
  if (
    url === 'http://localhost:5984/hello/_security' && options.method === 'PUT'
  ) {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    })
  }

  // Delete DB
  if (url === 'http://localhost:5984/hello' && options.method === 'DELETE') {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    })
  }

  // Create Document
  if (url === 'http://localhost:5984/hello' && options.method === 'POST') {
    return Promise.resolve({
      status: 201,
      ok: true,
      json: () => Promise.resolve({ ok: true, rev: 'foo', id: '1' }),
    })
  }
  // Create Document conflict
  if (url === 'http://localhost:5984/conflict' && options.method === 'POST') {
    return Promise.resolve({
      status: 409,
      ok: false,
      json: () => Promise.resolve(),
    })
  }

  // Get Document
  if (url === 'http://localhost:5984/hello/1' && options.method === 'GET') {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ _id: '1', _rev: '1', hello: 'world' }),
    })
  }

  // Get Document - Not Found
  if (
    url === 'http://localhost:5984/hello/not_found' && options.method === 'GET'
  ) {
    return Promise.resolve({
      status: 404,
      ok: true,
      json: () => Promise.resolve(),
    })
  }

  // Remove Document
  if (url === 'http://localhost:5984/hello/1?rev=1' && options.method === 'DELETE') {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ id: '1', rev: '1', ok: true }),
    })
  }

  // Remove Document - Not Found
  if (url === 'http://localhost:5984/hello/not_found' && options.method === 'DELETE') {
    return Promise.resolve({
      status: 404,
      ok: true,
      json: () => Promise.resolve({ ok: false, msg: 'not_found' }),
    })
  }

  // Query Docs
  if (
    url === 'http://localhost:5984/hello/_find' && options.method === 'POST'
  ) {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          docs: [
            { _id: '1', _rev: '1', hello: 'world' },
            // should be filtered out because design doc
            { _id: '_design_2', _rev: '2', hello: 'world' },
            // should be filtered out because nil
            undefined,
          ],
        }),
    })
  }

  // Index Docs
  if (
    url === 'http://localhost:5984/hello/_index' && options.method === 'POST'
  ) {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    })
  }

  // List Docs
  if (
    url === 'http://localhost:5984/hello/_all_docs' && options.method === 'POST'
  ) {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          rows: [{
            key: '1',
            id: '1',
            value: { rev: '1' },
            doc: { _id: '1', _rev: '1', hello: 'world' },
          }, {
            key: '2',
            id: '2',
            value: { rev: '2' },
            doc: { _id: '_design_2', _rev: '2', hello: 'world' }, // should be fitlered out because design doc
          }, {
            key: '3',
            id: '3',
            value: { rev: '3' },
            no_doc: { _id: '3', _rev: '3', hello: 'world' }, // should be filtered out because no 'doc' key
          }, {
            key: '4',
            id: '4',
            value: { rev: '4' },
            doc: undefined,
          }],
        }),
    })
  }

  if (url === 'http://localhost:5984/hello' && options.method === 'GET') {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ db_name: 'hello' }),
    })
  }

  // Bulk Documents
  if (
    url === 'http://localhost:5984/hello/_bulk_docs' &&
    options.method === 'POST'
  ) {
    return Promise.resolve({
      status: 201,
      ok: true,
      json: () => Promise.resolve([{ id: '1', ok: true }, { id: '2', ok: true }]),
    })
  }
  console.log('URL not resolving: ', options.method, url)

  return Promise.resolve({
    status: 500,
    ok: false,
    json: () => Promise.resolve({ ok: true }),
  })
}

const a = adapter({
  config: { origin: COUCH },
  asyncFetch: asyncFetch(testFetch),
  headers: createHeaders('admin', 'password'),
  handleResponse,
})

test('adapter', async (t) => {
  await t.step('createDatabase', async (t) => {
    await t.step('should create a database', async () => {
      const result = await a.createDatabase('hello')
      assertEquals(result.ok, true)
    })

    await t.step('should return a HyperErr if the database already exists', async () => {
      // const result = await a.createDatabase('dne')
      // assertEquals(result.ok, false)
      // assertEquals(result.status, 409)
    })
  })

  await t.step('removeDatabase', async (t) => {
    await t.step('should remove the database', async () => {
      const result = await a.removeDatabase('hello')
      assertEquals(result.ok, true)
    })

    await t.step('should return a HyperErr if the database does not exist', async () => {
      // const result = await a.removeDatabase('hello')
      // assertEquals(result.ok, true)
      // assertEquals(result.status, 404)
    })
  })

  await t.step('createDocument', async (t) => {
    await t.step('should create the document', async () => {
      const result = await a.createDocument({
        db: 'hello',
        id: '1',
        doc: { hello: 'world' },
      })
      assertEquals(result.ok, true)
    })

    await t.step('should omit rev from the result', async () => {
      const result = await a.createDocument({
        db: 'hello',
        id: '1',
        doc: { hello: 'world' },
      })
      assertEquals(!!result.rev, false)
    })

    await t.step('should return a HyperErr if the provided doc is empty', async () => {
      const err = await a.createDocument({
        db: 'hello',
        id: '1',
        doc: {},
      })

      assertObjectMatch(err, {
        ok: false,
        status: 400,
        msg: 'document empty',
      })
    })

    await t.step('should return a HyperErr if a doc with _id already exists', async () => {
      const err = await a.createDocument({
        db: 'conflict',
        id: '1',
        doc: { hello: 'world' },
      })

      assertObjectMatch(err, {
        ok: false,
        status: 409,
        msg: 'document conflict',
      })
    })

    await t.step('should return a HyperErr if attempting to create a design doc', async () => {
      const err = await a.createDocument({
        db: 'hello',
        id: '_design/1',
        doc: { hello: 'world' },
      })

      assertObjectMatch(err, {
        ok: false,
        status: 403,
        msg: 'user can not create design docs',
      })
    })
  })

  await t.step('retrieveDocument', async (t) => {
    await t.step('should retrieve the document', async () => {
      const result = await a.retrieveDocument({
        db: 'hello',
        id: '1',
      })
      assertEquals(result.hello, 'world')
      assertEquals(result._id, '1')
    })

    await t.step('should omit _rev from the result', async () => {
      const result = await a.retrieveDocument({
        db: 'hello',
        id: '1',
      })
      assertEquals(!!result.rev, false)
    })

    await t.step('should return a HyperErr if no document is found', async () => {
      const err = await a.retrieveDocument({
        db: 'hello',
        id: 'not_found',
      })
      assertObjectMatch(err, { ok: false, status: 404, msg: 'doc not found' })
    })
  })

  await t.step('removeDocument', async (t) => {
    await t.step('should remove the document', async () => {
      const result = await a.removeDocument({
        db: 'hello',
        id: '1',
      })

      assertEquals(result.ok, true)
      assertEquals(result.id, '1')
    })

    await t.step('should omit _rev from the result', async () => {
      const result = await a.removeDocument({
        db: 'hello',
        id: '1',
      })
      assertEquals(!!result.rev, false)
    })

    await t.step('should return a HyperErr if no document is found to remove', async () => {
      // const result = await a.removeDocument({
      //   db: 'hello',
      //   id: 'not_found',
      // })
      // assertEquals(result.ok, false)
      // assertEquals(result.status, 404)
    })
  })

  await t.step('updateDocument', async (t) => {
    await t.step('should update the document', async () => {
    })
  })

  await t.step('queryDocuments', async (t) => {
    await t.step('should return the documents found', async (t) => {
      const results = await a.queryDocuments({
        db: 'hello',
        query: {
          selector: {
            _id: '1',
          },
        },
      })

      await t.step('should return valid documents', () => {
        assertEquals(results.docs.length, 1)
        assertObjectMatch(results.docs[0], {
          _id: '1',
          hello: 'world',
        })
      })

      await t.step('should remove undefined docs', () => {
        assertEquals(results.docs.length, 1)
        assert(results.docs[0] !== undefined)
      })

      await t.step('should remove design docs', () => {
        assertEquals(results.docs.length, 1)
        assert(results.docs[0]._id !== '_design_2')
      })

      await t.step('should remove _rev from all docs', () => {
        assertEquals(results.docs.length, 1)
        assert(!results.docs[0]._rev)
      })
    })

    await t.step('should lowercase sort and default empty selector', async () => {
      const a = adapter({
        config: { origin: COUCH },
        asyncFetch: asyncFetch((url, options) => {
          // Query Docs
          if (
            url === 'http://localhost:5984/hello/_find' && options.method === 'POST'
          ) {
            return Promise.resolve({
              status: 200,
              ok: true,
              json: () =>
                Promise.resolve({
                  ok: true,
                  docs: [
                    { _id: '1', _rev: '1', options: JSON.parse(options.body) },
                  ],
                }),
            })
          }
        }),
        headers: createHeaders('admin', 'password'),
        handleResponse,
      })

      const { docs } = await a.queryDocuments({
        db: 'hello',
        query: { sort: [{ _id: 'ASC' }, { foo: 'DESC' }] },
      })

      assertEquals(docs[0].options.sort[0]._id, 'asc')
      assertEquals(docs[0].options.sort[1].foo, 'desc')
      assertEquals(docs[0].options.selector, {})
    })
  })

  await t.step('indexDocuments', async (t) => {
    await t.step('should create the index', async () => {
      const results = await a.indexDocuments({
        db: 'hello',
        name: 'foo',
        fields: ['foo'],
      })
      assertEquals(results.ok, true)
    })

    await t.step('should properly map to the index body', async () => {
      const a = adapter({
        config: { origin: COUCH },
        asyncFetch: asyncFetch((url, options) => {
          /**
           * Check the body matches the expected couch index body
           */
          const body = JSON.parse(options.body)
          assertObjectMatch(body, { index: { fields: ['foo'] }, ddoc: 'foo' })
          // Index Docs
          if (
            url === 'http://localhost:5984/hello/_index' && options.method === 'POST'
          ) {
            return Promise.resolve({
              status: 200,
              ok: true,
              json: () => Promise.resolve({ ok: true }),
            })
          }

          // unreachable
          assert(false)
        }),
        headers: createHeaders('admin', 'password'),
        handleResponse,
      })

      await a.indexDocuments({
        db: 'hello',
        name: 'foo',
        fields: ['foo'],
      })
    })
  })

  await t.step('bulkDocuments', async (t) => {
    await t.step('should bulk upsert the documents', async () => {
      const result = await a.bulkDocuments({
        db: 'hello',
        docs: [{ _id: '1' }, { _id: '2' }],
      }).catch((err) => ({ ok: false, err }))
      console.log('results', result)
      assertEquals(result.ok, true)
      assertEquals(result.results.length, 2)
    })

    await t.step('should attach revs to documents that are being updated', async () => {
    })

    await t.step('should map per document errors', async () => {
    })

    await t.step('should remove rev from each doc result', async () => {
    })

    await t.step('should return a HyperErr if no db exists', async () => {
    })

    await t.step('should return a HyperErr if any doc is not an Object', async () => {
    })
  })

  await t.step('listDocuments', async (t) => {
    await t.step('should list the documents', async (t) => {
      const results = await a.listDocuments({
        db: 'hello',
        limit: 1,
      })

      await t.step('should return valid documents', () => {
        assertEquals(results.docs.length, 1)
        assertObjectMatch(results.docs[0], {
          _id: '1',
          hello: 'world',
        })
      })

      await t.step('should remove undefined docs', () => {
        assertEquals(results.docs.length, 1)
        assert(results.docs[0] !== undefined)
      })

      await t.step('should remove design docs', () => {
        assertEquals(results.docs.length, 1)
        assert(results.docs[0]._id !== '_design_2')
      })

      await t.step('should remove _rev from all docs', () => {
        assertEquals(results.docs.length, 1)
        assert(!results.docs[0]._rev)
      })
    })

    await t.step('should include optional parameters', async (t) => {
      const a = adapter({
        config: { origin: COUCH },
        asyncFetch: asyncFetch((url, options) => {
          // List Docs
          if (
            url === 'http://localhost:5984/hello/_all_docs' && options.method === 'POST'
          ) {
            return Promise.resolve({
              status: 200,
              ok: true,
              json: () =>
                Promise.resolve({
                  ok: true,
                  rows: [{
                    key: '1',
                    id: '1',
                    value: { rev: '1' },
                    doc: { _id: '1', _rev: '1', options: JSON.parse(options.body) },
                  }],
                }),
            })
          }
        }),
        headers: createHeaders('admin', 'password'),
        handleResponse,
      })

      await t.step('should always add include_docs', async () => {
        const { docs: [doc] } = await a.listDocuments({
          db: 'hello',
          limit: 3,
        })
        assertEquals(doc.options.include_docs, true)
      })

      await t.step('should include limit, parsing to a number', async () => {
        const { docs: [withLimit] } = await a.listDocuments({
          db: 'hello',
          limit: 3,
        })
        assertEquals(withLimit.options.limit, 3)
      })

      await t.step('should include the startkey', async () => {
        const { docs: [withStartkey] } = await a.listDocuments({
          db: 'hello',
          startkey: '123',
        })
        assertEquals(withStartkey.options.startkey, '123')
      })

      await t.step('should include the endkey', async () => {
        const { docs: [withEndkey] } = await a.listDocuments({
          db: 'hello',
          endkey: '123',
        })
        assertEquals(withEndkey.options.endkey, '123')
      })

      await t.step('should include the split trimmed keys', async () => {
        const { docs: [withKeys] } = await a.listDocuments({
          db: 'hello',
          keys: '123,456, 789',
        })
        assertEquals(withKeys.options.keys.length, 3)
        assertEquals(withKeys.options.keys[0], '123')
        assertEquals(withKeys.options.keys[1], '456')
        assertEquals(withKeys.options.keys[2], '789')
      })

      await t.step('should include descending', async () => {
        const { docs: [withDescending] } = await a.listDocuments({
          db: 'hello',
          descending: true,
        })
        assertEquals(withDescending.options.descending, true)
      })
    })
  })
})
