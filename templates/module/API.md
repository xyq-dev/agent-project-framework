# Module API Contract

## Applicability

- Status: `APPLICABLE` / `NOT APPLICABLE`
- Reason:

API means any stable consumer contract: library interface, command, event, file contract or network endpoint. Do not assume HTTP unless the Module requires it.

## Contract Principles

- Provider-neutral inputs and outputs.
- Stable error taxonomy.
- Explicit idempotency and retry behavior.
- Versioned compatibility and deprecation.

## Operations

### `operation-name`

- Capability: `primary-capability`
- Purpose:
- Preconditions:
- Input:
- Output:
- Errors:
- Idempotency:
- Authorization:
- Observability:

## Error Model

| Code | Meaning | Retryable | Sensitive detail policy |
| --- | --- | --- | --- |
| `invalid-input` | Contract validation failed | no | no raw sensitive input |

## Events

List produced/consumed events, delivery semantics and versioning, or state why not applicable.

## Compatibility

Describe additive changes, breaking changes, deprecation window and consumer migration.

## Examples

Use pseudocode or a clearly named Implementation Profile; do not make one language the Framework Contract.

## API Review

- Decision: `PENDING`
- Reviewer:
- Evidence:

