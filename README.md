<h1 align="center">hyper-adapter-couchdb</h1>
<p align="center">A Data port adapter that uses CouchDB in the <a href="https://hyper.io/">hyper</a>  service framework</p>
</p>
<p align="center">
  <a href="https://nest.land/package/hyper-adapter-couchdb"><img src="https://nest.land/badge.svg" alt="Nest Badge" /></a>
  <a href="https://github.com/hyper63/hyper-adapter-couchdb/actions/workflows/test-and-publish.yml"><img src="https://github.com/hyper63/hyper-adapter-couchdb/actions/workflows/test-and-publish.yml/badge.svg" alt="Test" /></a>
  <a href="https://github.com/hyper63/hyper-adapter-couchdb/tags/"><img src="https://img.shields.io/github/tag/hyper63/hyper-adapter-couchdb" alt="Current Version" /></a>
</p>

---

## Table of Contents

- [Getting Started](#getting-started)
- [Installation](#installation)
- [Features](#features)
- [Methods](#methods)
- [Contributing](#contributing)
- [License](#license)

## Getting Started

`hyper.config.js`

```js
import { default as couchdb } from 'https://x.nest.land/hyper-adapter-couchdb@VERSION/mod.js'

export default {
  app: opine,
  adapter: [
    { port: 'data', plugins: [couchdb({ url: 'http://localhost:5984' })] },
  ],
}
```

The value of the connection url should be in the following format:

> `[protocol]://[key]:[secret]@[host]:[port]`

When a new database is created, the following roles will be added to the security document:

- db-admin
- db-user

Using this adapter, you will not have any access to the \_users table or the _replicator table

### Credentials from ENV VARS

When using this adapter, you will need to configure three environment variables, one for the
`server-admin` credentials, so that the adapter can create/delete databases, and one for the
`db-admin` user so a search index can be created. And finally one for the `db-user` user to manage
documents.

.env

```
DATA_SVR_ADMIN=XXX_URL
DATA_DB_ADMIN=XXX_URL
DATA_DB_USER=XXX_URL
```

## Installation

This is a Deno module available to import from
[nest.land](https://nest.land/package/hyper-adapter-couchdb)

deps.js

```js
export { default as couchdb } from 'https://x.nest.land/hyper-adapter-couchdb@VERSION/mod.js'
```

## Features

- Create a `CouchDB` datastore
- Remove a `CouchDB` datastore
- Create a document in a `CouchDB` datastore
- Retrieve a document in a `CouchDB` datastore
- Update a document in a `CouchDB` datastore
- Remove a document from a `CouchDB` datastore
- List documents in a `CouchDB` datastore
- Query documents in a `CouchDB` datastore
- Index documents in a `CouchDB` datastore
- Bulk create documents in a `CouchDB` datastore

## Methods

This adapter fully implements the Data port and can be used as the
[hyper Data service](https://docs.hyper.io/oss/data-api) adapter

See the full port [here](https://nest.land/package/hyper-port-data)

## Contributing

Contributions are welcome! See the hyper
[contribution guide](https://docs.hyper.io/contributing-to-hyper)

## Testing

```
./scripts/test.sh
```

To lint, check formatting, and run unit tests

## Setup a standalone couchdb server using docker

`Dockerfile`

```
FROM couchdb:3.1.1

RUN echo '[couchdb]' > /opt/couchdb/etc/local.d/10-single-node.ini
RUN echo 'single_node=true' >> /opt/couchdb/etc/local.d/10-single-node.ini
```

Then run

```sh
docker build -t single-couchdb:1 .
docker run -d -p 5984:5984 -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=password --name couch single-couchdb:1
```

## License

Apache-2.0
