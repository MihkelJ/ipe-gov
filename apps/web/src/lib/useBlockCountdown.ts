import { useEffect, useState } from "react";
import { useBlockNumber } from "wagmi";

const SEPOLIA_BLOCK_TIME = 12;

/** Seconds remaining until `endBlock` based on Sepolia's ~12s-per-block pace.
 *  Smooth-ticks every second locally and resyncs whenever a new block lands,
 *  so the display doesn't jump at 12s intervals. Returns null until we have
 *  both the current block and a target. */
export function useBlockCountdown(endBlock: bigint | undefined): number | null {
  const { data: currentBlock } = useBlockNumber({ watch: true });
  const [syncedAt, setSyncedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (currentBlock !== undefined) setSyncedAt(Date.now());
  }, [currentBlock]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (currentBlock === undefined || endBlock === undefined) return null;

  const baseSeconds =
    endBlock > currentBlock
      ? Number(endBlock - currentBlock) * SEPOLIA_BLOCK_TIME
      : 0;
  const elapsed = Math.floor((now - syncedAt) / 1000);
  return Math.max(0, baseSeconds - elapsed);
}

/** Format seconds as the two biggest non-zero units. */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "closing now";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const secs = seconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
