import { isAddress } from "viem";
import { z } from "zod";

const MAX_PROSE = 8_000;

// `z.custom` preserves the branded `\`0x${string}\`` template-literal type
// through `z.infer`, so consumers don't need to cast back to viem's `Hex`.
// `strict: false` accepts both checksummed and lowercase forms — the pin-api
// shouldn't reject a valid address just because the caller didn't EIP-55
// encode it.
const addressSchema = z.custom<`0x${string}`>(
  (v) => typeof v === "string" && isAddress(v, { strict: false }),
  "invalid address",
);

const costLineSchema = z.object({
  item: z.string().min(1).max(400),
  amount: z.string().min(1).max(80),
});

const milestoneSchema = z.object({
  label: z.string().max(80),
  date: z.string().max(40),
  amount: z.string().max(80),
  detail: z.string().max(1000),
});

/** Single source of truth for structured proposal bodies. `ProposalBody` is
 *  derived from this schema, and `safeParse` is used by the pin-api Worker to
 *  validate incoming requests before pinning. Keep schema and type in lockstep
 *  by always exporting the inferred type, never a hand-written one. */
export const ProposalBodySchema = z.object({
  schema: z.literal("ipe-gov.proposal-body/1"),
  headline: z.string().min(1).max(MAX_PROSE),
  problem: z.string().min(1).max(MAX_PROSE),
  solution: z.string().min(1).max(MAX_PROSE),
  outcomes: z.string().min(1).max(MAX_PROSE),
  credentials: z.string().max(MAX_PROSE).optional(),
  costs: z.array(costLineSchema).min(1).max(200),
  totalCost: z.number().finite().nonnegative(),
  milestones: z.array(milestoneSchema).min(1).max(200),
  authors: z.object({
    lead: addressSchema,
    coAuthors: z.array(addressSchema).max(200),
  }),
});

export type ProposalBody = z.infer<typeof ProposalBodySchema>;
