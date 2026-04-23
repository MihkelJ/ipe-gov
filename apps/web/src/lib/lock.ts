import type { Hex } from "viem";
import { PublicLockABI, addresses } from "@ipe-gov/sdk";

export const LOCK_ADDRESS = addresses.sepolia.lock as Hex;
export const LOCK_ABI = PublicLockABI;
