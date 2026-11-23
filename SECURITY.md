
# Security Policy

## Overview

Employee Access Hub implements a multi-layered security architecture designed to protect employee identities, sensitive business information, and communication between services.

The platform uses Keycloak for centralized identity management, Spring Security for access control, and Spring Cloud Gateway as the primary API entry point.

Security controls are applied across authentication, authorization, secret management, service communication, container infrastructure, and vulnerability detection.

## 1. Reporting a Vulnerability

Security vulnerabilities should be reported privately to the project maintainer.

Please avoid disclosing vulnerabilities through public GitHub issues.

A vulnerability report should include:

- Affected component or service
- Description of the vulnerability
- Steps to reproduce the issue
- Potential security impact
- Suggested remediation, if available

Reports will be reviewed and prioritized according to their severity and potential impact.

## 2. Authentication & Identity Management

### Keycloak Authentication

Keycloak serves as the central Identity Provider (IdP) for the platform.

Authentication is implemented using:

- OAuth 2.0
- OpenID Connect (OIDC)
- Authorization Code Flow with PKCE (S256)
- JSON Web Tokens (JWT)
- Single Sign-On (SSO)

User credentials are managed exclusively by Keycloak. Business services do not store or process user passwords.

### Identity Lifecycle

Employee accounts are managed through the HR service and synchronized with Keycloak.

| Operation | Security Behavior |
|-----------|-------------------|
| Onboarding | Automatic account provisioning |
| Password Setup | Secure password creation through Keycloak |
| Role Change | Synchronization of user permissions |
| Account Suspension | Account access disabled |
| Offboarding | Account disabled and active sessions revoked |
| Session Revocation | Active sessions and refresh tokens invalidated |

This integration helps maintain consistency between employee records and application access rights.

## 3. Authorization & Access Control

### Role-Based Access Control (RBAC)

The platform uses Keycloak realm roles to manage permissions.

Four primary roles are defined:

| Role | Access Level |
|------|--------------|
| EMPLOYEE | Personal information and employee services |
| MANAGER | Employee services and team management |
| HR | Human resources administration |
| ADMIN | Platform administration and security management |

Authorization rules are enforced through Spring Security and `@PreAuthorize`.

### Multi-Layer Authorization

Access control is implemented at three levels.

**Layer 1 — API Gateway**

Spring Cloud Gateway validates incoming JWTs before forwarding requests.

Validation includes:

- Token signature
- Token issuer
- Token audience
- Token expiration
- JWKS-based signature verification

**Layer 2 — Microservices**

Each microservice independently validates incoming JWTs.

Services do not rely exclusively on the gateway for authentication.

**Layer 3 — Resource Authorization**

Business operations enforce role-based permissions and resource ownership.

Users can only access information permitted by their role and relationship to the requested resource.

## 4. Secrets Management

Sensitive configuration values are stored outside the source code.

The repository provides environment configuration templates without production credentials.

| Environment | Configuration |
|-------------|---------------|
| Development | `.env` |
| Staging | `.env.staging` |
| Production | `.env.production` |

These files are excluded from version control.

Example configuration files provide the required variable names without exposing actual credentials.

### Environment Validation

The platform uses `docker/scripts/validate-env.sh` to verify environment configuration before startup.

The validation process checks for:

- Missing environment variables
- Placeholder credentials
- Invalid configuration values
- Inconsistent secret configuration

Docker Compose also enforces required environment variables through variable interpolation.

### Security Requirements

- Never commit passwords, API keys, or access tokens.
- Never expose backend credentials through frontend environment variables.
- Use separate credentials for each environment.
- Replace development credentials before deployment.
- Rotate compromised credentials immediately.

## 5. API Security

All business APIs are accessed through Spring Cloud Gateway.

The gateway provides a centralized entry point for authentication and request routing.

### Network Isolation

Business microservices are deployed on internal Docker networks.

The following components are not directly exposed to external clients:

- HR Service
- Leave Service
- Expense Service
- Documents Service
- Analytics Service
- PostgreSQL
- RabbitMQ

Internal API endpoints and monitoring interfaces remain restricted to the backend network.

### Security Headers

The gateway applies HTTP security headers through `SecurityHeadersFilter`.

| Header | Purpose |
|--------|---------|
| X-Content-Type-Options | Prevents MIME-type sniffing |
| X-Frame-Options | Protects against clickjacking |
| Referrer-Policy | Controls referrer information |
| Content-Security-Policy | Restricts permitted content sources |
| Permissions-Policy | Restricts browser capabilities |
| X-XSS-Protection | Disables legacy browser XSS filtering |

HTTP Strict Transport Security (HSTS) is intended to be enforced at the HTTPS reverse proxy.

## 6. Container Security

Docker containers follow security-hardening practices to reduce their attack surface.

Implemented controls include:

- Non-root container execution
- Read-only root filesystems
- Dropped Linux capabilities
- `no-new-privileges` restrictions
- Container resource limits
- Network isolation
- Container health checks

These controls limit container privileges and reduce the potential impact of a compromised service.

## 7. Security Scanning

The project includes automated security analysis to identify exposed credentials, vulnerable dependencies, and infrastructure configuration issues.

### Secret Detection — Gitleaks

Gitleaks is used to detect credentials accidentally introduced into the repository.

It identifies potential exposure of:

- Passwords
- API keys
- Access tokens
- Private keys
- Other sensitive credentials

Development-only test credentials are explicitly scoped in `.gitleaks.toml` to prevent false positives without broadly excluding real secrets.

### Vulnerability Analysis — Trivy

Trivy is used to analyze:

- Application dependencies
- Container images
- Infrastructure configuration
- Filesystem security issues

Vulnerability findings are collected for review and remediation.

### Software Bill of Materials (SBOM)

CycloneDX is used to generate a Software Bill of Materials for backend modules.

The SBOM provides visibility into the software components and dependencies used by the application.

### Security Tools

| Tool | Purpose |
|------|---------|
| Gitleaks | Secret detection |
| Trivy | Dependency and container vulnerability scanning |
| CycloneDX | Software Bill of Materials generation |
| Spring Security | Authentication and authorization |
| Keycloak | Identity and access management |

## 8. Logging & Security Auditing

Security-related activities are recorded to support traceability and incident investigation.

Audited events include:

- Authentication events
- Identity provisioning
- Account modifications
- Role synchronization
- Session revocation
- Account deactivation
- Sensitive document access
- Administrative operations

Application logs are collected using Loki and Promtail.

OpenTelemetry and Tempo provide distributed tracing across services.

Correlation identifiers help trace requests through the microservices architecture.

## 9. Security Considerations

The following practices are important when configuring and operating the platform:

- Use HTTPS for externally accessible environments.
- Replace all development credentials before production use.
- Restrict administrative access to authorized personnel.
- Keep Keycloak, Spring Boot, and dependencies updated.
- Review vulnerability scan results regularly.
- Apply the principle of least privilege.
- Monitor authentication failures and suspicious activity.
- Maintain backups of critical application data.
- Review account permissions when employee responsibilities change.

## 10. Future Security Improvements

The security roadmap includes additional measures to strengthen the platform.

Planned improvements include:

- HashiCorp Vault integration for centralized secret management.
- Dynamic credential management.
- Additional automated security validation.
- Enhanced security monitoring and alerting.
- Periodic access reviews and security assessments.

---

## Maintainer

**Elyouness2004**

GitHub: https://github.com/Elyouness2004

For security-related concerns, please contact the maintainer privately.
