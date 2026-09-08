# Module Security

## Risk Classification

- Risk: `medium`
- Classification rationale:
- Security Gate required: `YES` / `NO`

## Assets

List data, credentials, operations and availability properties requiring protection.

## Trust Boundaries

Describe callers, Module boundary, Provider boundary, persistence and administrative surfaces.

## Threats and Controls

| Threat | Impact | Control | Verification | Residual risk |
| --- | --- | --- | --- | --- |
| Unauthorized operation | | | | |

## Authentication and Authorization

Define what identity/permission context the Module requires. Do not implement business ACL inside an Infrastructure Module unless it owns that responsibility.

## Sensitive Data

- Data categories:
- Minimization:
- Encryption expectations:
- Logging/redaction:
- Retention/deletion:

## Secrets and Provider Credentials

Define injection, scope, rotation and failure behavior. Never place real credentials in this document or Module defaults.

## Abuse and Resource Limits

Define input limits, rate/resource controls and denial-of-service considerations where applicable.

## Supply Chain

Record dependency provenance, update policy and artifact integrity requirements.

## Security Tests

- `SEC-001`: Add a test mapped to a threat/control pair.

## Security Gate

- Decision: `PENDING`
- Reviewer:
- Evidence:
- Accepted residual risks:

