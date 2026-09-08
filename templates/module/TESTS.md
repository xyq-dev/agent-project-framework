# Module Test Plan

## Strategy

Describe how tests prove Capabilities, boundaries, compatibility and failure behavior at the Module's risk level.

## Environment Matrix

| Profile / Adapter | Version | Required | Purpose |
| --- | --- | --- | --- |
| reference | | yes | Contract verification |

## Traceability Matrix

| Test ID | Requirement / Capability | Level | Scenario | Expected evidence |
| --- | --- | --- | --- | --- |
| TEST-001 | REQ-001 / primary-capability | contract | happy path | deterministic pass |

## Required Test Types

- Schema/contract validation
- Unit tests for provider-independent behavior
- Adapter contract tests
- Integration tests required by risk
- Failure, retry and idempotency tests
- Compatibility/regression tests
- Security tests mapped from `SECURITY.md`
- Recovery tests when stateful or high/critical risk

Mark a type N/A only with a reason.

## Test Cases

### TEST-001 — Scenario

- Preconditions:
- Input:
- Steps:
- Expected result:
- Requirement mapping:
- Automation status:

## Commands and Results

| Command / Method | Environment | Result | Evidence |
| --- | --- | --- | --- |
| Not run | | PENDING | |

## Known Gaps

- List untested behavior, owner and risk, or `None`.

## Test Gate

- Decision: `PENDING`
- Reviewer:
- Evidence:
- Failed/blocked tests:

