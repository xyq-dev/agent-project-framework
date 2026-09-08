# Module Architecture

## Context

Summarize the approved Spec and the system boundary this architecture must satisfy.

## Design Principles

- Keep the public contract technology neutral.
- Isolate Providers behind Adapters.
- Make dependencies and failure behavior explicit.
- Prefer capability negotiation over Provider branching in consumers.

## Components

| Component | Responsibility | Owns state? | Dependencies |
| --- | --- | --- | --- |
| Contract | Consumer-facing behavior | no | none |
| Core | Provider-independent orchestration | declare | declared modules |
| Adapter | Provider/runtime translation | declare | external provider/runtime |

## Data and Control Flow

Describe normal flow, validation points and where errors are translated. Add a diagram only when it improves understanding.

## Dependency Direction

State allowed dependency directions and how cycles are prevented.

## Provider Model

Define the Adapter interface, capability discovery, configuration boundary and fallback behavior.

## Failure and Recovery

| Failure | Detection | Consumer behavior | Retry | Recovery evidence |
| --- | --- | --- | --- | --- | --- |
| Example | How detected | Stable error/result | yes/no | Test or runbook |

## Concurrency and Idempotency

State ordering, duplication, retry and race behavior, or explain why not applicable.

## Observability

Define logs, metrics, traces and audit events without leaking sensitive data.

## Security Architecture

Reference `SECURITY.md`; summarize trust boundaries and enforcement points.

## Compatibility and Migration

Describe contract versioning, Adapter compatibility and migration/rollback strategy.

## Alternatives and Decisions

| Decision | Chosen option | Alternatives | Reason | Consequence |
| --- | --- | --- | --- | --- |
| ADR-001 | | | | |

## Architecture Gate

- Decision: `PENDING`
- Reviewer:
- Evidence:
- Residual risks:

