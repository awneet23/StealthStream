# Hackathon Alignment

StealthStream is aligned to the **Speedrun: Privacy on Avalanche** goal: ship a demoable Avalanche prototype where sensitive value/data is kept confidential.

| Event expectation | StealthStream evidence |
| --- | --- |
| Working prototype | React/Vite app with both Demo Mode and MetaMask-backed Live Mode |
| Fuji C-Chain demonstration | Registry and standalone eERC contracts are deployed on Fuji (chain ID `43113`) |
| Confidential value movement | Confirmed eERC private transfer: [`0xea91...9f8e3`](https://testnet.snowtrace.io/tx/0xea916b7942b6d361f6978216eef02ed5f42282521335aa6eac4201cae159f8e3) |
| Privacy plus compliance | The authorized auditor decrypts the completed 10 eERC transfer locally |
| On-chain app-specific metadata | Confirmed registry reference: [`0xddcf...ddc95`](https://testnet.snowtrace.io/tx/0xddcfc8840361a7438bea0f7b7223b1f6e674f76311f8d1538e5b86cd1c2ddc95) |
| eERC + permissioned L1 bonus path | A permissioned L1 genesis template is included; a live L1 is intentionally **not** claimed as deployed |
| GitHub repository and pitch slides | Prepared documentation, screenshot slots, judge guide, and pitch outline; the team must publish/upload them |

## SDK decision

The project uses `@avalabs/eerc-sdk` `1.0.2` with viem v2/wagmi v2. This is the package successfully used by the confirmed Live Mode eERC registration, encrypted transfer, and auditor report.

## Clear project boundary

The project delivers eERC data privacy on Fuji. It does not claim full transaction-party anonymity, because public-chain transaction addresses remain observable. Its optional `l1/genesis.example.json` demonstrates access-privacy configuration but is not a running L1 deployment.

## Official sources

- [Event rules and submission requirements](https://build.avax.network/events/b5e9fe35-5b5d-4fac-8709-e8eac8a1eaee)
- [eERC SDK overview](https://docs.avacloud.io/encrypted-erc/usage/sdk-overview)
- [eERC deployment walkthrough](https://build.avax.network/academy/blockchain/encrypted-erc/05-eerc-contracts-flow/01-step-by-step)
- [Avalanche transaction allowlist](https://build.avax.network/docs/avalanche-l1s/precompiles/transaction-allowlist)
