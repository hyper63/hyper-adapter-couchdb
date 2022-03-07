import { assertEquals, assertObjectMatch } from "./dev_deps.js";
import { asyncFetch, createHeaders, handleResponse } from "./async-fetch.js";
import { adapter } from "./adapter.js";

const test = Deno.test;
const COUCH = "http://localhost:5984";

const testFetch = (url, options) => {
  options.method = options.method || "GET";

  if (url === "http://localhost:5984/hello" && options.method === "PUT") {
    return Promise.resolve({
      status: 201,
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
  }
  if (
    url === "http://localhost:5984/hello/_security" && options.method === "PUT"
  ) {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
  }

  if (url === "http://localhost:5984/hello" && options.method === "DELETE") {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
  }

  if (url === "http://localhost:5984/hello" && options.method === "POST") {
    return Promise.resolve({
      status: 201,
      ok: true,
      json: () => Promise.resolve({ ok: true, id: "1" }),
    });
  }
  // doc conflict
  if (url === "http://localhost:5984/conflict" && options.method === "POST") {
    return Promise.resolve({
      status: 409,
      ok: false,
      json: () => Promise.resolve(),
    });
  }
  if (url === "http://localhost:5984/hello/1" && options.method === "GET") {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ _id: "1", _rev: "1", hello: "world" }),
    });
  }
  // doc not found
  if (
    url === "http://localhost:5984/hello/not_found" && options.method === "GET"
  ) {
    return Promise.resolve({
      status: 404,
      ok: true,
      json: () => Promise.resolve(),
    });
  }

  if (
    url === "http://localhost:5984/hello/_find" && options.method === "POST"
  ) {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          docs: [{ _id: "1", _rev: "1", hello: "world" }],
        }),
    });
  }

  if (
    url === "http://localhost:5984/hello/_index" && options.method === "POST"
  ) {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
  }

  if (
    url === "http://localhost:5984/hello/_all_docs" && options.method === "POST"
  ) {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          rows: [{
            key: "1",
            id: "1",
            value: { rev: "1" },
            doc: { _id: "1", _rev: "1", hello: "world" },
          }],
        }),
    });
  }

  if (url === "http://localhost:5984/hello" && options.method === "GET") {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ db_name: "hello" }),
    });
  }

  if (
    url === "http://localhost:5984/hello/_bulk_docs" &&
    options.method === "POST"
  ) {
    return Promise.resolve({
      status: 201,
      ok: true,
      json: () =>
        Promise.resolve([{ id: "1", ok: true }, { id: "2", ok: true }]),
    });
  }
  console.log("URL not resolving: ", options.method, url);

  return Promise.resolve({
    status: 500,
    ok: false,
    json: () => Promise.resolve({ ok: true }),
  });
};

const a = adapter({
  config: { origin: COUCH },
  asyncFetch: asyncFetch(testFetch),
  headers: createHeaders("admin", "password"),
  handleResponse,
});

test("bulk documents", async () => {
  const result = await a.bulkDocuments({
    db: "hello",
    docs: [{ _id: "1" }, { _id: "2" }],
  }).catch((err) => ({ ok: false, err }));
  console.log("results", result);
  assertEquals(result.ok, true);
  assertEquals(result.results.length, 2);
});

test("create database", async () => {
  const result = await a.createDatabase("hello");
  assertEquals(result.ok, true);
});

test("remove database", async () => {
  const result = await a.removeDatabase("hello");
  assertEquals(result.ok, true);
});

test("create document", async () => {
  const result = await a.createDocument({
    db: "hello",
    id: "1",
    doc: { hello: "world" },
  });
  assertEquals(result.ok, true);
});

test("create document - empty doc", async () => {
  const err = await a.createDocument({
    db: "hello",
    id: "1",
    doc: {},
  });

  assertObjectMatch(err, {
    ok: false,
    status: 400,
    msg: "document empty",
  });
});

test("create document - conflict", async () => {
  const err = await a.createDocument({
    db: "conflict",
    id: "1",
    doc: { hello: "world" },
  });

  assertObjectMatch(err, {
    ok: false,
    status: 409,
    msg: "document conflict",
  });
});

test("create document - do not allow creating design document", async () => {
  const err = await a.createDocument({
    db: "hello",
    id: "_design/1",
    doc: { hello: "world" },
  });

  assertObjectMatch(err, {
    ok: false,
    status: 403,
    msg: "user can not create design docs",
  });
});

test("retrieve document", async () => {
  const result = await a.retrieveDocument({
    db: "hello",
    id: "1",
  });
  assertEquals(result.hello, "world");
  assertEquals(result._id, "1");
});

test("retrieve document - not found", async () => {
  const err = await a.retrieveDocument({
    db: "hello",
    id: "not_found",
  });

  assertObjectMatch(err, { ok: false, status: 404, msg: "doc not found" });
});

test("find documents", async () => {
  const results = await a.queryDocuments({
    db: "hello",
    query: {
      selector: {
        _id: "1",
      },
    },
  });

  assertObjectMatch(results.docs[0], {
    _id: "1",
    hello: "world",
  });
});

test("create query index", async () => {
  const results = await a.indexDocuments({
    db: "hello",
    name: "foo",
    fields: ["foo"],
  });
  //console.log("results", results);
  assertEquals(results.ok, true);
});

test("list documents", async () => {
  const results = await a.listDocuments({
    db: "hello",
    limit: 1,
  });
  assertObjectMatch(results.docs[0], {
    _id: "1",
    hello: "world",
  });
});
