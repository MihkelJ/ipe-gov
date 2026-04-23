import type { Hex } from "viem";
import { LiquidDelegationABI, addresses } from "@ipe-gov/sdk";

export const DELEGATION_ADDRESS = addresses.sepolia.liquidDelegation as Hex;
export const DELEGATION_ABI = LiquidDelegationABI;
