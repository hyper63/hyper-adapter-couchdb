import { default as hyper } from "https://x.nest.land/hyper@1.4.9/mod.js";
import { default as app } from "https://x.nest.land/hyper-app-opine@1.2.4/mod.js";
import { default as couchdb } from "../mod.js";

hyper({
  app,
  adapters: [{
    port: "data",
    plugins: [couchdb({ url: "http://localhost:5984" })],
  }],
});
