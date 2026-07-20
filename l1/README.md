# Permissioned Avalanche L1 Template

`genesis.example.json` is a starting point for a permissioned Avalanche L1 version of StealthStream.

It enables:

- `txAllowListConfig`: controls who can submit transactions.
- `contractDeployerAllowListConfig`: controls who can deploy contracts.

Before use:

1. Replace every `0xREPLACE_WITH_ADMIN_WALLET` placeholder with your real admin wallet.
2. Confirm the admin wallet is funded in `alloc`.
3. Create/deploy the L1 through avalanche-cli or Builder Console. AvaCloud is optional.
4. Add creator, sender, deployer, and operator wallets through the allowlist precompile.
5. Deploy `StealthTipRegistry` to that L1 only after your deployer wallet is allowed.

For the current hackathon build, Fuji C-Chain deployment is the required working path. This optional L1 template demonstrates the bonus privacy architecture after the human-owned network steps are complete.
