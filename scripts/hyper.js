import { default as hyper } from "https://x.nest.land/hyper@1.5.2/mod.js";
import { default as app } from "https://x.nest.land/hyper-app-opine@1.2.7/mod.js";
import { default as couchdb } from "../mod.js";

hyper({
  app,
  adapters: [{
    port: "data",
    plugins: [couchdb({ url: "http://admin:password@localhost:5984" })],
  }],
});
