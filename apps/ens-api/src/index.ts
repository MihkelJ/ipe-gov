import { Hono } from "hono";
import {
  createWalletClient,
  encodeFunctionData,
  http,
  isAddress,
  isHex,
  namehash,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { entryPoint08Address } from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { createSmartAccountClient } from "permissionless";
import { to7702SimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { z } from "zod";
import {
  LABEL_RE,
  MAX_LABEL_LEN,
  MIN_LABEL_LEN,
  NameWrapperABI,
  addresses,
  extractField,
} from "@ipe-gov/sdk";
import {
  HttpError,
  applyCors,
  assertSepoliaUnlockMember,
  buildMainnetReadClient,
  errorResponse,
  readJsonBody,
  verifySignedMessage,
  type MainnetReadClient,
} from "@ipe-gov/workers-shared";

/** Pimlico-published SimpleAccount 7702 delegation target — same address
 *  across every chain Pimlico supports. Delegating the operator EOA here
 *  unlocks bundler-based sponsorship while leaving the wallet's private
 *  key as the sole authorization root. */
const SIMPLE_ACCOUNT_7702_IMPL =
  "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as const;

type Env = {
  /** Sepolia RPC; used to verify Unlock membership before issuing a claim. */
  RPC_URL_11155111: string;
  /** Paymaster-proxy URL for chain 1 (e.g. https://…/rpc/1). Used both for
   *  reads (forwarded to upstream) and bundler/paymaster methods (routed to
   *  Pimlico). The proxy gates paymaster methods via the operator allowlist
   *  — this worker's key must be in `OPERATOR_ALLOWLIST_1`. */
  RPC_URL_1: string;
  /** 0x-prefixed private key of the hot wallet that holds NameWrapper
   *  setApprovalForAll on the parent. Doesn't need an ETH balance — gas is
   *  paid by Pimlico via the paymaster-proxy. */
  MAINNET_OPERATOR_KEY: string;
  /** ENS parent under which subnames are issued (e.g. "govdemo.eth"). */
  ENS_PARENT_NAME: string;
  /** Comma-separated CORS allowlist. */
  ALLOWED_ORIGINS?: string;
  /** KV: stores the issued-claims log under key `claims:all`. */
  IDENTITIES: KVNamespace;
};

const CLAIMS_KEY = "claims:all";

type ClaimRecord = {
  address: Address;
  label: string;
  node: Hex;
  fullName: string;
  txHash: Hex;
  mintedAt: string;
};

const AddressSchema = z.custom<Address>(
  (v) => typeof v === "string" && isAddress(v, { strict: false }),
  "invalid address",
);
const HexSchema = z.custom<Hex>((v) => isHex(v), "invalid hex");
const LabelSchema = z
  .string()
  .min(MIN_LABEL_LEN)
  .max(MAX_LABEL_LEN)
  .regex(LABEL_RE);

const ClaimRequestSchema = z.object({
  label: LabelSchema,
  recipient: AddressSchema,
  signature: HexSchema,
  message: z.string().min(1),
});

const app = new Hono<{ Bindings: Env }>();

applyCors(app);

app.get("/", (c) => c.text("ipe-gov ens-api"));

/** Availability check. Reads NameWrapper.ownerOf for the proposed subname's
 *  token id (= uint256(namehash)). A non-zero owner means taken. Rejects
 *  malformed labels without an RPC round-trip. */
app.get("/ens/available", async (c) => {
  const label = c.req.query("label");
  const parsed = LabelSchema.safeParse(label);
  if (!parsed.success) {
    return c.json({ available: false, reason: "invalid-label" });
  }

  try {
    const fullName = `${parsed.data}.${c.env.ENS_PARENT_NAME}`;
    const node = namehash(fullName);
    const owner = await readNodeOwner(buildMainnetReadClient(c.env), node);
    return c.json({ available: owner === zeroAddress, label: parsed.data });
  } catch (err) {
    return errorResponse(c, err);
  }
});

/**
 * Claim flow. The web client signs a `claim subname` message and POSTs it.
 * We verify membership on Sepolia, do label sanity, then mint via NameWrapper
 * from the operator hot wallet. Member receives the ERC-1155 wrapped subname;
 * they pay no gas.
 */
app.post("/ens/claim", async (c) => {
  let body: z.infer<typeof ClaimRequestSchema>;
  try {
    body = await readJsonBody(c.req.raw, ClaimRequestSchema);
  } catch (err) {
    return errorResponse(c, err);
  }

  try {
    await verifySignedMessage({
      recipient: body.recipient,
      message: body.message,
      signature: body.signature,
      expectedIntent: "claim subname",
    });

    // Endpoint-specific cross-check: the message must commit to the same
    // recipient + label that the JSON body claims. Without this, a sig
    // bound to one (recipient, label) pair could be reused for another.
    const messageRecipient = extractField(body.message, "recipient: ");
    const messageLabel = extractField(body.message, "label: ");
    if (
      !messageRecipient ||
      messageRecipient.toLowerCase() !== body.recipient.toLowerCase() ||
      messageLabel !== body.label
    ) {
      throw new HttpError(400, "message does not match submitted recipient/label");
    }

    await assertSepoliaUnlockMember(c.env, body.recipient);

    const fullName = `${body.label}.${c.env.ENS_PARENT_NAME}`;
    const node = namehash(fullName);
    const parentNode = namehash(c.env.ENS_PARENT_NAME);

    const mainnetReadClient = buildMainnetReadClient(c.env);

    // Hard pre-check: label not already minted. The on-chain mint would
    // revert anyway, but this gives a clean 409 before we send a tx.
    const existingOwner = await readNodeOwner(mainnetReadClient, node);
    if (existingOwner !== zeroAddress) {
      throw new HttpError(409, "label is already taken");
    }

    // Worker invariant: one subname per recipient under our parent.
    // Cheaper to check our KV than to call NameWrapper for every prior label.
    const existingClaim = await getClaimByAddress(c.env, body.recipient);
    if (existingClaim && existingClaim.label !== body.label) {
      throw new HttpError(409, `recipient already owns ${existingClaim.fullName}`);
    }

    // NameWrapper caps subname expiry at parent's expiry. Pass uint64.max and
    // let the contract clamp; saves a getData round-trip per claim.
    const mintCallData = encodeFunctionData({
      abi: NameWrapperABI,
      functionName: "setSubnodeRecord",
      args: [
        parentNode,
        body.label,
        body.recipient,
        addresses.mainnet.publicResolver,
        0n, // ttl
        0, // fuses (no irreversible burns; parent can revoke if needed)
        BigInt("18446744073709551615"), // 2^64 - 1; clamped to parent's expiry
      ],
    });
    const mintHash = await sponsoredMint(c.env, mainnetReadClient, mintCallData);

    const receipt = await mainnetReadClient.waitForTransactionReceipt({
      hash: mintHash,
    });
    if (receipt.status !== "success") {
      throw new HttpError(502, "mint transaction reverted");
    }

    const record: ClaimRecord = {
      address: body.recipient,
      label: body.label,
      node,
      fullName,
      txHash: mintHash,
      mintedAt: new Date().toISOString(),
    };
    await recordClaim(c.env, record);

    return c.json({ ok: true, ...record });
  } catch (err) {
    return errorResponse(c, err);
  }
});

/** Single-address identity lookup. Backed by KV (the worker is the only
 *  writer to the parent name, so KV is authoritative for our own mints).
 *  An on-chain ownership re-check filters out subnames that have been
 *  transferred away from the original claimant. */
app.get("/ens/identity/:address", async (c) => {
  const parsed = AddressSchema.safeParse(c.req.param("address"));
  if (!parsed.success) return c.json({ error: "invalid address" }, 400);

  try {
    const claim = await getClaimByAddress(c.env, parsed.data);
    if (!claim) return c.json({ identity: null });

    if (!(await isClaimStillLive(buildMainnetReadClient(c.env), claim))) {
      return c.json({ identity: null });
    }

    return c.json({
      identity: {
        address: claim.address,
        label: claim.label,
        fullName: claim.fullName,
        node: claim.node,
      },
    });
  } catch (err) {
    return errorResponse(c, err);
  }
});

/** Bulk listing for member search / delegation pickers. KV is read with one
 *  GET; ownership re-verification is multicalled by viem. */
app.get("/ens/identities", async (c) => {
  try {
    const claims = await listClaims(c.env);
    if (claims.length === 0) return c.json({ identities: [] });

    const mainnetClient = buildMainnetReadClient(c.env);
    const live = await Promise.all(
      claims.map(async (claim) => ((await isClaimStillLive(mainnetClient, claim)) ? claim : null)),
    );

    return c.json({
      identities: live
        .filter((c): c is ClaimRecord => c !== null)
        .map((c) => ({
          address: c.address,
          label: c.label,
          fullName: c.fullName,
          node: c.node,
        })),
    });
  } catch (err) {
    return errorResponse(c, err);
  }
});

// ---- ens-api-specific helpers ----------------------------------------------

function buildOperatorWallet(env: Env) {
  if (!env.RPC_URL_1) throw new HttpError(500, "server missing RPC_URL_1");
  if (!env.MAINNET_OPERATOR_KEY) throw new HttpError(500, "server missing MAINNET_OPERATOR_KEY");
  const key = env.MAINNET_OPERATOR_KEY.startsWith("0x")
    ? (env.MAINNET_OPERATOR_KEY as Hex)
    : (`0x${env.MAINNET_OPERATOR_KEY}` as Hex);
  const account = privateKeyToAccount(key);
  return createWalletClient({ account, chain: mainnet, transport: http(env.RPC_URL_1) });
}

/**
 * Submit a NameWrapper mint as a sponsored UserOp. The operator EOA is
 * EIP-7702-delegated to Pimlico's SimpleAccount on first use; subsequent
 * mints reuse the existing delegation. All gas is paid by the Pimlico
 * account behind the paymaster-proxy — the operator wallet itself never
 * needs an ETH balance.
 *
 * Pre-req: the operator's address must be listed in the proxy's
 * `OPERATOR_ALLOWLIST_1` secret so the policy check passes.
 */
async function sponsoredMint(
  env: Env,
  publicClient: MainnetReadClient,
  callData: Hex,
): Promise<Hex> {
  const wallet = buildOperatorWallet(env);

  const smartAccount = await to7702SimpleSmartAccount({
    client: publicClient,
    owner: wallet,
    entryPoint: { address: entryPoint08Address, version: "0.8" },
  });

  const pimlicoClient = createPimlicoClient({
    chain: mainnet,
    transport: http(env.RPC_URL_1),
  });

  const smartAccountClient = createSmartAccountClient({
    account: smartAccount,
    chain: mainnet,
    bundlerTransport: http(env.RPC_URL_1),
    paymaster: pimlicoClient,
    userOperation: {
      estimateFeesPerGas: async () =>
        (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  });

  // Skip the authorization signature once the EOA is already delegated to
  // SimpleAccount. Cheap getCode check before each mint avoids signing an
  // auth that would be ignored by the bundler.
  const code = await publicClient.getCode({
    address: wallet.account.address,
  });
  const alreadyDelegated = code !== undefined && code !== "0x";

  const authorization = alreadyDelegated
    ? undefined
    : await wallet.signAuthorization({
        contractAddress: SIMPLE_ACCOUNT_7702_IMPL,
        chainId: mainnet.id,
      });

  return smartAccountClient.sendTransaction({
    calls: [{ to: addresses.mainnet.nameWrapper, value: 0n, data: callData }],
    ...(authorization ? { authorization } : {}),
  });
}

/** ERC-1155 `ownerOf` against NameWrapper. Returns `zeroAddress` for an
 *  unminted token id. Centralized so the four call sites stay in sync if
 *  the ABI ever needs swapping. */
async function readNodeOwner(client: MainnetReadClient, node: Hex): Promise<Address> {
  return (await client.readContract({
    address: addresses.mainnet.nameWrapper,
    abi: NameWrapperABI,
    functionName: "ownerOf",
    args: [BigInt(node)],
  })) as Address;
}

/** True when the recipient on a stored claim still currently owns the
 *  wrapped subname. Used by both the single-address and bulk identity
 *  endpoints to filter out transferred-away NFTs. */
async function isClaimStillLive(client: MainnetReadClient, claim: ClaimRecord): Promise<boolean> {
  try {
    const owner = await readNodeOwner(client, claim.node);
    return owner.toLowerCase() === claim.address.toLowerCase();
  } catch {
    return false;
  }
}

// ---- KV-backed claim log ---------------------------------------------------
// Single-key JSON list, since the worker is the only writer. Concurrent
// claims serialize at the wallet level (one nonce, one tx at a time), so the
// read-modify-write pattern below is safe in practice for pilot scale.

async function listClaims(env: Env): Promise<ClaimRecord[]> {
  const raw = await env.IDENTITIES.get(CLAIMS_KEY, "json");
  return Array.isArray(raw) ? (raw as ClaimRecord[]) : [];
}

async function getClaimByAddress(env: Env, address: Address): Promise<ClaimRecord | null> {
  const lower = address.toLowerCase();
  const claims = await listClaims(env);
  return claims.find((c) => c.address.toLowerCase() === lower) ?? null;
}

async function recordClaim(env: Env, claim: ClaimRecord) {
  const claims = await listClaims(env);
  const lower = claim.address.toLowerCase();
  const next = [
    ...claims.filter((c) => c.address.toLowerCase() !== lower),
    claim,
  ];
  await env.IDENTITIES.put(CLAIMS_KEY, JSON.stringify(next));
}

export default app;
