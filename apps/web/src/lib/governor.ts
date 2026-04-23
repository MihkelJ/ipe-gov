import type { Hex } from "viem";
import { UnlockConfidentialGovernorLiquidABI, addresses } from "@ipe-gov/sdk";

export const GOVERNOR_ADDRESS = addresses.sepolia.governorLiquid as Hex;
export const GOVERNOR_ABI = UnlockConfidentialGovernorLiquidABI;
