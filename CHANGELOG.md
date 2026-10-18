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

[Unreleased]: https://github.com/Luqijian/FrpcDeck/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Luqijian/FrpcDeck/releases/tag/v1.0.0
