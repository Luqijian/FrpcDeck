# Contributing to FrpcDeck

Thanks for taking the time to contribute! This project aims to make frpc configuration approachable without hiding any of its capabilities.

## Ways to contribute

- Report bugs and regressions
- Suggest features or UX improvements
- Improve documentation, translations and screenshots
- Add or correct frpc field coverage
- Improve tests, Docker packaging and security

For security problems, **do not open a public issue**. Follow [SECURITY.md](SECURITY.md).

## Before you start

- Search existing issues and pull requests.
- For larger features, open an issue first so we can agree on the approach.
- Keep pull requests focused. One topic per PR is much easier to review.
- By contributing, you agree that your contribution is licensed under the project's [MIT License](LICENSE).

## Development setup

Requirements: Node.js `^20.19` or `>=22.12`, pnpm 11, and optionally a local frpc binary and Chrome.

```bash
pnpm install
FRPC_BIN=/path/to/frpc pnpm dev
```

- UI: http://localhost:5173
- API: http://localhost:8080
- Tests: `pnpm test`
- Build: `pnpm build`
- Browser smoke test: see [docs/development.md](docs/development.md#测试)

Windows PowerShell:

```powershell
$env:FRPC_BIN="E:\tools\frp\frpc.exe"
pnpm dev
```

## Coding guidelines

- Backend is ESM JavaScript; frontend is Vue 3 `<script setup>`.
- Do not add a database or an external service for configuration storage.
- Configuration writes must stay atomic and preserve unknown fields.
- Never log secrets (token, secretKey, passwords, certificate contents).
- User-facing strings are Chinese today; identifier names, comments and commit messages are English.
- Reuse existing design-system components instead of introducing a UI framework.
- Every form control needs a label and must remain usable at 320 px width.
- Add tests for validation, generation or security changes.

## Adding frpc fields

1. Add enums/types to `shared/constants.js` if needed.
2. Normalize the field in `server/config.js`, include it in compaction/serialization, and validate it.
3. Add defaults/display metadata in `web/src/frp.js`.
4. Add the form control in `ProxyEditor.vue`, `VisitorEditor.vue` or `ConnectionPage.vue`.
5. Add a config round-trip test and, if useful, update `tests/fixtures/frpc_full_example.toml`.

See [docs/development.md](docs/development.md#如何新增-frpc-字段) for details.

## Commit messages

Use short, imperative English messages. Conventional Commit prefixes are welcome:

```text
feat: support proxy bandwidth limits
fix: keep admin interface when importing config
docs: add reverse proxy example
test: cover legacy INI import
chore: bump frp to 0.71.1
```

## Pull request checklist

- [ ] The change is described and linked to an issue when relevant
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes
- [ ] No secrets, `.env`, `data/` or generated build output are committed
- [ ] Documentation and screenshots are updated when behavior or UI changes
- [ ] New configuration fields are covered by tests
- [ ] Security-impacting changes are called out explicitly

Use the pull request template and include screenshots for UI changes.

## Code of Conduct

Participation in this project is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Be respectful, assume good intent, and keep discussions technical.

## Questions

Open a GitHub Issue using the question template, or check [docs/troubleshooting.md](docs/troubleshooting.md) first.
