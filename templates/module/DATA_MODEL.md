# Module Data Model

## Applicability

- Status: `APPLICABLE` / `NOT APPLICABLE`
- Reason:

If the Module owns no durable data, state that explicitly and identify any transient/runtime state. Do not invent entities to fill this template.

## Ownership

Define which data this Module is authoritative for and how other Modules access it.

## Conceptual Entities

| Entity | Purpose | Identifier | Lifecycle owner | Sensitive? |
| --- | --- | --- | --- | --- |
| Example | | | | no |

## Invariants

- `INV-001`: State a rule that must always remain true.

## Relationships

Describe conceptual relationships without requiring one database technology.

## Persistence Profile

Describe required persistence semantics—transactionality, consistency, retention, indexing or no persistence—without selecting a provider in the generic contract.

## Data Classification and Retention

State sensitivity, minimization, retention, deletion and export rules.

## Migration and Compatibility

- Migration required: `YES` / `NO`
- Forward compatibility:
- Backward compatibility:
- Rollback/recovery:

## Open Questions

- `None`, or list unresolved data decisions.

