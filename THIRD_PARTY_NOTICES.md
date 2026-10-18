# Third-party notices

FrpcDeck is licensed under the MIT License. The project depends on and redistributes the following third-party components.

## frp / frpc

- Project: <https://github.com/fatedier/frp>
- Copyright: The frp authors
- License: Apache License 2.0
- Usage: the Docker image downloads the official frpc release at build time and bundles the binary. The test suite also includes `tests/fixtures/frpc_full_example.toml` from the upstream v0.71.1 release.
- License text: [licenses/Apache-2.0.txt](licenses/Apache-2.0.txt)

The Docker image contains the frpc binary downloaded from the official GitHub Releases. If you redistribute the image, keep the license notices and comply with the Apache License 2.0.

## Node.js

- Project: <https://nodejs.org/>
- License: MIT-style Node.js license
- Usage: runtime base image (`node:22-alpine`).

## Alpine Linux

- Project: <https://alpinelinux.org/>
- License: various free software licenses
- Usage: runtime base image packages (`ca-certificates`, `tzdata`, `curl`, `su-exec`).

## npm dependencies

The production dependency tree is pinned in `pnpm-lock.yaml`. Major runtime components include:

| Package | License |
| --- | --- |
| Fastify | MIT |
| @fastify/static | MIT |
| @fastify/cookie | MIT |
| @fastify/compress | MIT |
| smol-toml | MIT |
| yaml | ISC |
| Vue | MIT |
| Vue Router | MIT |
| Lucide | ISC |

Build-only dependencies include Vite, esbuild and Playwright. Their license texts are distributed with their npm packages.

If you redistribute a built artifact, include the applicable license files from the bundled `node_modules` packages where required.

## Fonts and assets

FrpcDeck uses system fonts and does not bundle third-party web fonts. The logo and interface illustrations are original project assets.
