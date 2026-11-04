# Archived production delivery design

GADash is retired. The repository is preserved for reference, GitHub Actions is
disabled, and the production caller has no automatic trigger and skips both
jobs. The source does not establish that any former hosted service, OAuth app,
credential, webhook, or domain is still active. Do not dispatch delivery or
resume service synchronization as part of archive maintenance.

## Historical design

The production caller pinned a reusable workflow in `tsilva/.github` to a full
commit SHA. Its privileged job checked out the trusted shared implementation,
waited for CI on the exact latest main commit, synchronized an application
allowlist from an isolated production vault, deployed that commit, and verified
a READY deployment. App code and inputs could not select arbitrary source
vaults or destinations. Vercel automatic Git deployments were disabled to avoid
racing secret synchronization.

A standalone relay verified signed secret-change notifications, retained pending
routing metadata, coalesced bursts, and dispatched the fixed production entry
workflow. An acknowledgement established acceptance, not deployment success.
The caller's pinned reusable workflow and its trust contract describe the
implementation; they do not guarantee current compatibility or authorization.

## Requirements for an independent fork

Before enabling delivery, review the current shared implementation and establish
your own vault, destination project, narrowly scoped credentials, OIDC trust,
and OAuth registrations. Do not reuse the original application's identities or
assume its immutable repository mapping applies to another repository.

Keep Production credentials separate from Preview and Development, retain
Vercel's Require Separate Values policy, and classify public configuration
explicitly. Do not export plaintext environment files, log credentials, or
upload secret artifacts. A failed check or synchronization must prevent
deployment. Verify CI, synchronization, the exact deployed commit, READY state,
and domain routing before describing a restored deployment as operational.

Reactivation also requires reviewing dependency age exceptions, branch rules,
Actions permissions and full-SHA pinning, Dependabot policy, relay routes, and
credential expiration. Re-enable automation only after those checks and explicit
authorization. Preserve an archived original when experimenting in a fork.
