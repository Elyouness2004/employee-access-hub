# Security

This document describes the security posture of the Employee Access Hub and how
secrets, scanning, and the supply chain are handled. It complements the
architectural zero-trust design in [Architecture.md](docs/architecture/Architecture.md); the deep
supply-chain detail lives in [docs/security/supply-chain.md](docs/security/supply-chain.md).

## Reporting a vulnerability

Report suspected vulnerabilities privately to the maintainers (do not open a
public issue). Include affected component, reproduction, and impact. You will
receive an acknowledgement and a remediation timeline.

## Secrets handling

Secrets never live in the repository. The model is:

| Where | What | Mechanism |
|---|---|---|
| Local / VM | runtime secrets (DB, Keycloak admin, RabbitMQ, client secret) | git-ignored `.env` / `.env.staging` / `.env.production`, filled from the `*.example` contracts |
| Compose | required-secret enforcement | `${VAR:?set in .env}` interpolation — the stack refuses to start with a missing secret |
| Pre-flight | placeholder/missing/inconsistent detection | `docker/scripts/validate-env.sh` (run by `make up` and `deploy.sh`) rejects `change-me` and malformed values |
| CI/CD | deploy credentials (SSH keys, hosts) | GitHub **Actions secrets**; production deploy gated by a GitHub **environment** with required reviewers |
| Secret scanning | committed-secret prevention | Gitleaks in [`.github/workflows/security.yml`](.github/workflows/security.yml), full-history on push |

Documented **dev-only seeds** (the `change-me` placeholders, the `Test1234!`
seed users in the Keycloak realm export, the `admin-local-only` local bootstrap)
are explicitly allowlisted in [`.gitleaks.toml`](.gitleaks.toml) by path and
literal, tightly scoped so a real credential anywhere else still trips the gate.

Future hardening (documented in the roadmap as post-v1): HashiCorp Vault for
dynamic secrets; the ports already isolate the secret sources.

## Application security controls (already in place)

- **Zero-trust JWT** validated at two layers (gateway + each service): signature
  via cached JWKS, issuer, audience, expiry.
- **RBAC** via composite realm roles and `@PreAuthorize`, plus layer-3 ownership.
- **Business services are backend-network-only** — reachable exclusively through
  the gateway; `/internal/**` and actuator metrics never leave the backend network.
- **Security response headers** stamped at the edge by the gateway
  (`SecurityHeadersFilter`): `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Content-Security-Policy`, `Permissions-Policy`,
  `X-XSS-Protection: 0`. Transport security (HSTS) is added at the TLS proxy in
  Phase 9 — it requires HTTPS and must not be asserted over the gateway's plain
  HTTP hop.
- **Container hardening** (Phase 1): non-root, read-only root FS, all Linux
  capabilities dropped, `no-new-privileges`, resource limits.

## Automated scanning (DevSecOps)

`security.yml` runs on every push/PR, weekly, and on demand:

| Scan | Tool | Gate |
|---|---|---|
| Secrets | Gitleaks | **fails** the build |
| Dependencies + IaC misconfig + secrets (filesystem) | Trivy `fs` | reports SARIF (audit) |
| Container images (×6) | Trivy `image` | reports SARIF (audit) |
| SBOM | CycloneDX (Maven) | published artifact (`bom.json`/`bom.xml` per module) |
| Image signing | cosign keyless (opt-in) | prepared in `cd.yml` |

Vulnerability scans run in **audit mode** (`exit-code: 0`) — they surface
findings in the Security tab without blocking a merge on a transitive CVE that
has no same-day fix. Secret scanning is the hard gate. See the supply-chain doc
for the rationale and how to promote a scan to blocking.
