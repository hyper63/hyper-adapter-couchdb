#!/usr/bin/env bash

deno lint && \
deno fmt --check && \
deno test  --allow-net --no-check
