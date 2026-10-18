# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |
| < 1.0 | No |

FrpcDeck is a self-hosted administration panel with full control over frpc. Security depends heavily on how you deploy and expose it.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Use GitHub's private vulnerability reporting:

- <https://github.com/Luqijian/FrpcDeck/security/advisories/new>

If private reporting is unavailable, contact the maintainer at **lqj2493886314@outlook.com** with a subject starting with `[FrpcDeck security]`.

Please include:

- Affected version or commit
- Deployment mode (Docker bridge / host / local Node)
- Reproduction steps or proof of concept
- Impact assessment
- Any relevant logs or configuration with secrets redacted

You can expect an initial acknowledgement on a best-effort basis. This is a volunteer project, so no response or fix SLA is guaranteed. Please allow reasonable time for a fix before public disclosure.

## Scope

In scope:

- Authentication and session handling
- CSRF / origin checks / rate limiting
- Path traversal or arbitrary file access through the panel
- Secret leakage in API responses, logs or error messages
- Command injection through configuration or import paths
- Privilege escalation inside the container
- Stored XSS in configuration values, logs, backup names or annotations
- Docker packaging or entrypoint issues that weaken isolation

Out of scope:

- Attacks that require an already authenticated administrator
- Misconfiguration of the host, Docker, frps or firewall
- Vulnerabilities in frp/frpc itself (report upstream)
- Denial of service through deliberately huge configuration values
- Browser warnings caused by serving the panel over plain HTTP
- Social engineering or physical access

## Secure deployment checklist

- Set a strong `FRPC_WEBUI_PASSWORD`; do not rely on the setup wizard on an untrusted network.
- Restrict port 8080 to trusted networks.
- Put the panel behind an HTTPS reverse proxy before exposing it beyond a LAN.
- Set `COOKIE_SECURE=true` and `TRUST_PROXY=true` when a reverse proxy terminates TLS.
- Keep the frpc admin interface on `127.0.0.1`.
- Protect `data/`: it contains tokens, secret keys, password hashes and backups.
- Keep the image and frp version up to date.
- Do not run the container with additional privileges unless required.

## Built-in protections

- scrypt password hashing with per-user salts
- HMAC-signed HttpOnly session cookies with password-version revocation
- SameSite cookies, CSRF header and Origin checks
- Login rate limiting by client IP
- Content-Security-Policy and common security headers
- Atomic writes with restrictive file modes
- No shell execution when spawning frpc
- Management API bound to loopback by default

See [docs/architecture.md](docs/architecture.md) for the security model and [docs/deployment.md](docs/deployment.md) for hardening guidance.
