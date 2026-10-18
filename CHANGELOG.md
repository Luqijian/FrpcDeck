# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Nothing yet.

### Changed

- Nothing yet.

### Fixed

- Nothing yet.

## [3.2.1] - 2026-10-18

### Fixed

- Add spacing between the dashboard traffic strip and the proxy/config cards below it.

## [3.2.0] - 2026-10-18

### Added

- Per-instance **frps traffic monitoring** integration, configured from Settings.
- New **监控** page with daily ingress/egress, live throughput, active connections and per-proxy traffic.
- Dashboard traffic strip with daily totals, live rates, connections and a monitor shortcut.
- Traffic history, byte/rate formatting and frps Dashboard connection status.
- Optional Basic Auth and automatic `http://<frps>:7500` Dashboard URL fallback.
- Monitor API and documentation.

### Performance

- frps Dashboard sampling every 15 seconds; disabled monitoring makes no outbound requests.
- Monitor page reads cached snapshots; only proxy types used by the current instance are queried.
- Traffic history capped at 60 samples per instance.

## [3.1.1] - 2026-10-18

### Changed

- Deployment guide and README no longer require cloning the repository.
- Added complete copy-paste `compose.yaml` and `.env` examples for bridge and host networking.
- Upgrade instructions now only pull the image and recreate the container.

## [3.1.0] - 2026-10-18

### Added

- Built-in documentation center at **文档** in the sidebar.
- Markdown rendering with categorized navigation, search, tables, code blocks, screenshots and internal document links.
- Documentation API (`/api/docs`, `/api/docs/:slug`, `/api/docs/assets/*`).
- All project docs, README files, changelog, security policy and release notes are shipped inside the container image.

### Changed

- Refreshed all UI screenshots for login, dashboard, proxies, editor, connection, visitors, logs, instances, mobile, auth and docs pages.

## [3.0.0] - 2026-10-18

### Added

- Multi-instance support: one FrpcDeck can run and manage multiple independent frpc processes, each connected to a different frps server.
- Instance manager with create, rename, activate and delete flows.
- Instance switcher in the top bar plus a dedicated **实例** page.
- Per-instance config, proxies, visitors, runtime state, logs, backups and auto-start settings.
- Automatic unique frpc admin ports for new instances (starting at 7400).
- Instance API: `GET/POST /api/instances`, `PATCH/DELETE /api/instances/:id`, and `POST /api/instances/:id/activate`.
- Request header `X-FrpcDeck-Instance` for instance-scoped APIs; SSE uses `?instance=`.

### Changed

- **Breaking data layout:** legacy single-instance files migrate automatically to `data/instances/default/`; global auth and session key stay at the data root.
- Existing proxies, batch ports, visitors, backups, frps credentials and settings are preserved in the default instance.
- Deleted instances are moved to `data/instances/.deleted/` rather than removed immediately.

## [2.1.1] - 2026-10-18

### Fixed

- Constrained the login layout to a centered 1360 px canvas on very wide / high-DPI screens. The brand column and login card no longer sit at opposite edges of the viewport; the two-column composition keeps a consistent gap and balanced side margins.

## [2.1.0] - 2026-10-18

### Added

- Proxy list page size selector: 10 / 20 / 30 / 50 / 100 rows per page. The choice is stored in the browser and resets to page 1 when changed.
- Proxy editor placement preference: **right drawer** or **centered modal**. It can be toggled from the proxy toolbar or in **Settings → Appearance**, and is stored in the browser.
- The same placement preference applies to create, edit and duplicate actions.

## [2.0.2] - 2026-10-18

### Fixed

- Restored the missing icon on the dashboard **代理总数** card and the matching hero meta chip. The `Waypoints` icon component was referenced but not imported.

## [2.0.1] - 2026-10-18

### Performance

- Proxy list is paginated at 20 rows per page; large configurations no longer render every row at once.
- Cached the dirty-config comparison and per-proxy fingerprints instead of stringifying the whole config on every render.
- Memoized proxy rows and status counts; off-screen rows use `content-visibility`.
- Editor accordions only mount their form contents when opened.
- Editor drawer paints its shell first and mounts the long form after the first frame.
- Removed the page-level fade transition and shortened the drawer animation; reduced backdrop blur work.

## [2.0.0] - 2026-10-18

### Changed

- **Breaking:** removed `FRPC_WEBUI_PASSWORD` and `FRPC_WEBUI_USERNAME`. Passwords are no longer read from environment variables.
- First startup now generates a random administrator password, prints it once to the container log, and forces a username/password change before the panel can be used.
- Username and password are now both editable in **Settings → Administrator account**.
- The frpc management password is injected through the `FRPCDECK_ADMIN_PASSWORD` environment template and is no longer written in plaintext to `frpc.toml`.
- Legacy environment-managed auth records are forced through the password-change flow on first login.
- `/api/auth/setup` is deprecated; accounts are initialized automatically.

### Security

- The generated first-start password is stored only as an scrypt hash in `data/auth.json`.
- Password/username changes increment the session version and invalidate older sessions.

## [1.2.0] - 2026-10-18

### Added

- Unified visual batch-port model: `parseNumberRangePair` range blocks are imported as editable batch proxies instead of a separate template mode.
- Batch proxy editor for local/remote port ranges, name templates, and common TCP/UDP options.
- Batch entries are shown as one proxy row with aggregated runtime status.
- New batch proxies can be created directly from the proxy editor.
- Exported TOML regenerates `parseNumberRangePair` blocks and round-trips back into the visual model.

### Changed

- Removed the separate Go-template mode and read-only runtime proxy view; ordinary and batch proxies now use the same editor, list, dashboard and API model.
- All proxy types remain editable; batch ranges are available for TCP and UDP.
- Old `rawTemplate` configurations are migrated into batch proxies on startup when possible.

## [1.1.1] - 2026-10-18

### Fixed

- The API and health endpoint now read the application version from `package.json` instead of reporting a stale hardcoded `1.0.0`.
- Version tags now promote `latest` and `main` to the released image after the tag build completes.

## [1.1.0] - 2026-10-18

### Added

- **Go template config mode**: TOML files containing frp Go template directives (for example `range` + `parseNumberRangePair`) are preserved verbatim instead of being expanded.
- Template mode editor on the connection page with validation, TOML preview, apply and an explicit exit action.
- Automatic managed `[webServer]` injection when a template does not declare one, so live status keeps working.
- Read-only runtime proxy list and dashboard counts for proxies generated by a template.
- Public multi-arch container images on GitHub Container Registry: `ghcr.io/luqijian/frpcdeck:latest` and version tags.
- Automated GHCR publishing on main and version tags.
- Release-note synchronization workflow.

### Changed

- Importing a template into an existing configuration keeps the underlying structured config so template mode can be exited without losing it.
- The dashboard, proxy page, visitor page and sidebar now understand template mode.

### Security

- Templates are stored as part of the protected configuration JSON and backups; they still contain tokens and should be handled as secrets.

## [1.0.0] - 2026-10-18

Initial public release.

### Added

- Responsive Vue 3 web UI with dashboard, proxy/visitor editors, connection settings, live logs and settings.
- Structured coverage for the frpc 0.71.x configuration surface:
  - client connection, token / OIDC auth, transport, TLS, QUIC, logging, admin API, metadata and virtual network;
  - TCP, UDP, HTTP, HTTPS, TCPMUX, STCP, SUDP and XTCP proxies;
  - ten built-in plugins, load balancing, health checks, header rewriting and NAT traversal;
  - STCP, SUDP and XTCP visitors.
- TOML generation with `frpc verify` validation before applying.
- Import from TOML, YAML, JSON and legacy INI, preserving unknown fields.
- Live proxy status from the frpc admin API and SSE streaming logs.
- File log tailing support for frpc's `log.to`.
- Automatic backups before every apply, manual backup/restore/download and 30-backup retention.
- Authentication with scrypt hashing, signed HttpOnly sessions, login rate limiting, CSRF protection and CSP.
- Single Docker image containing the panel, Node service and frpc, with amd64/arm64/arm support.
- Docker Compose examples for bridge and Linux host networking.
- Reverse proxy examples and deployment documentation.
- Automated tests for config generation, official full-example round trips, storage recovery, API integration and browser smoke testing.

### Security

- Admin interface credentials are generated randomly on first run.
- Sensitive configuration files are written with mode `0600`; the data directory uses `0700`.
- The frpc admin API is bound to `127.0.0.1` by default.

[Unreleased]: https://github.com/Luqijian/FrpcDeck/compare/v3.2.1...HEAD
[3.2.1]: https://github.com/Luqijian/FrpcDeck/compare/v3.2.0...v3.2.1
[3.2.0]: https://github.com/Luqijian/FrpcDeck/compare/v3.1.1...v3.2.0
[3.1.1]: https://github.com/Luqijian/FrpcDeck/compare/v3.1.0...v3.1.1
[3.1.0]: https://github.com/Luqijian/FrpcDeck/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/Luqijian/FrpcDeck/compare/v2.1.1...v3.0.0
[2.1.1]: https://github.com/Luqijian/FrpcDeck/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/Luqijian/FrpcDeck/compare/v2.0.2...v2.1.0
[2.0.2]: https://github.com/Luqijian/FrpcDeck/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/Luqijian/FrpcDeck/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/Luqijian/FrpcDeck/compare/v1.2.0...v2.0.0
[1.2.0]: https://github.com/Luqijian/FrpcDeck/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/Luqijian/FrpcDeck/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/Luqijian/FrpcDeck/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Luqijian/FrpcDeck/tree/v1.0.0
