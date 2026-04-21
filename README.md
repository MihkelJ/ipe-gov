# ipe-gov

Monorepo starter for a confidential DAO: FHEVM (Zama) smart contracts + TanStack Start frontend.

## Structure

```
ipe-gov/
├── apps/
│   └── web/          # TanStack Start app (React, Vite, Tailwind, TanStack Query, shadcn)
├── packages/
│   ├── contracts/    # Hardhat + FHEVM (from zama-ai/fhevm-hardhat-template)
│   └── sdk/          # Shared ABIs, addresses, types for the frontend
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## Prerequisites

- Node.js >= 20
- pnpm >= 10

## Install

```bash
pnpm install
```

## Common commands

```bash
pnpm dev              # run all dev tasks
pnpm build            # build every package
pnpm compile          # compile contracts only (runs postcompile typechain)
pnpm test             # run tests across the workspace
pnpm deploy:sepolia   # deploy contracts to Sepolia
```

Scoped to one package:

```bash
pnpm --filter @ipe-gov/contracts run compile
pnpm --filter @ipe-gov/web run dev
```

## Contracts

Set required vars before deploying:

```bash
cd packages/contracts
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
# optional
npx hardhat vars set ETHERSCAN_API_KEY
```

## Frontend

```bash
pnpm --filter @ipe-gov/web dev
# http://localhost:3000
```

## Sharing ABIs with the frontend

Add an export script in `packages/contracts` that writes compiled ABIs into `packages/sdk/src/abis/`, then re-export from `packages/sdk/src/index.ts`. The web app imports via `@ipe-gov/sdk`.

## References

- FHEVM Hardhat template: https://github.com/zama-ai/fhevm-hardhat-template
- OpenZeppelin Confidential Contracts: https://github.com/OpenZeppelin/openzeppelin-confidential-contracts
- TanStack Start: https://tanstack.com/start
