import type { Hex } from "viem";
import { UnlockConfidentialGovernorABI, addresses } from "@ipe-gov/sdk";

export const GOVERNOR_ADDRESS = addresses.sepolia.governor as Hex;
export const GOVERNOR_ABI = UnlockConfidentialGovernorABI;
