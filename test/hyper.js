import { default as hyper } from 'https://raw.githubusercontent.com/hyper63/hyper/hyper%40v4.1.0/packages/core/mod.ts'
import { default as app } from 'https://raw.githubusercontent.com/hyper63/hyper/hyper-app-express%40v1.1.0/packages/app-express/mod.ts'
import { default as couchdb } from '../mod.js'

hyper({
  app,
  adapters: [{
    port: 'data',
    plugins: [couchdb({ url: 'http://admin:password@localhost:5984' })],
  }],
})
