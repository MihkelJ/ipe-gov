import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, network } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  LiquidDelegation,
  LiquidDelegation__factory,
  MockPublicLock,
  MockPublicLock__factory,
  UnlockConfidentialGovernorLiquid,
  UnlockConfidentialGovernorLiquid__factory,
} from "../types";

const VOTING_PERIOD = 50;
const MIN_VOTING_PERIOD = 10;
const MAX_VOTING_PERIOD = 1000;

async function deployFixture() {
  const lockFactory = (await ethers.getContractFactory("MockPublicLock")) as MockPublicLock__factory;
  const lock = (await lockFactory.deploy()) as MockPublicLock;
  const lockAddress = await lock.getAddress();

  const delegationFactory = (await ethers.getContractFactory("LiquidDelegation")) as LiquidDelegation__factory;
  const delegation = (await delegationFactory.deploy(lockAddress)) as LiquidDelegation;
  const delegationAddress = await delegation.getAddress();

  const govFactory = (await ethers.getContractFactory(
    "UnlockConfidentialGovernorLiquid",
  )) as UnlockConfidentialGovernorLiquid__factory;
  const governor = (await govFactory.deploy(
    lockAddress,
    delegationAddress,
    MIN_VOTING_PERIOD,
    MAX_VOTING_PERIOD,
  )) as UnlockConfidentialGovernorLiquid;
  const governorAddress = await governor.getAddress();

  return { lock, delegation, governor, governorAddress };
}

async function encryptSupport(governorAddress: string, voter: string, support: number) {
  return fhevm.createEncryptedInput(governorAddress, voter).add32(support).encrypt();
}

async function mineBlocks(n: number) {
  await network.provider.send("hardhat_mine", ["0x" + n.toString(16)]);
}

async function decryptTallies(governor: UnlockConfidentialGovernorLiquid, id: bigint | number) {
  const [, , , f, a, ab] = await governor.getProposal(id);
  return {
    f: await fhevm.publicDecryptEuint(FhevmType.euint32, f),
    a: await fhevm.publicDecryptEuint(FhevmType.euint32, a),
    ab: await fhevm.publicDecryptEuint(FhevmType.euint32, ab),
  };
}

describe("UnlockConfidentialGovernorLiquid", function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let carol: HardhatEthersSigner;
  let lock: MockPublicLock;
  let delegation: LiquidDelegation;
  let governor: UnlockConfidentialGovernorLiquid;
  let governorAddress: string;

  before(async function () {
    const signers = await ethers.getSigners();
    [, alice, bob, carol] = signers;
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("Tests require the FHEVM mock; skipping.");
      this.skip();
    }

    const fixture = await deployFixture();
    lock = fixture.lock;
    delegation = fixture.delegation;
    governor = fixture.governor;
    governorAddress = fixture.governorAddress;

    for (const m of [alice, bob, carol]) {
      await (await lock.grant(m.address)).wait();
    }
  });

  it("counts transitive delegators on a delegate-cast", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    // carol -> bob -> alice, so alice casting covers both of them.
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();
    await (await delegation.connect(carol).delegate(1, bob.address)).wait();

    // Alice claims her two delegators, then casts her own vote separately.
    const encDelegate = await encryptSupport(governorAddress, alice.address, 1);
    await (
      await governor
        .connect(alice)
        .castVoteAsDelegate(1, encDelegate.handles[0], encDelegate.inputProof, [bob.address, carol.address])
    ).wait();
    const encSelf = await encryptSupport(governorAddress, alice.address, 1);
    await (await governor.connect(alice).castVote(1, encSelf.handles[0], encSelf.inputProof)).wait();

    expect(await governor.hasVoted(1, alice.address)).to.eq(true);
    expect(await governor.hasVoted(1, bob.address)).to.eq(true);
    expect(await governor.hasVoted(1, carol.address)).to.eq(true);

    await mineBlocks(VOTING_PERIOD + 1);
    await (await governor.finalize(1)).wait();

    const { f, a, ab } = await decryptTallies(governor, 1);
    expect(f).to.eq(3n);
    expect(a).to.eq(0n);
    expect(ab).to.eq(0n);
  });

  it("supports multi-batch delegate-casts without self-vote side effects", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();
    await (await delegation.connect(carol).delegate(1, alice.address)).wait();

    // Alice claims bob in one call, carol in another — both must succeed.
    const batch1 = await encryptSupport(governorAddress, alice.address, 1);
    await (
      await governor.connect(alice).castVoteAsDelegate(1, batch1.handles[0], batch1.inputProof, [bob.address])
    ).wait();
    const batch2 = await encryptSupport(governorAddress, alice.address, 1);
    await (
      await governor.connect(alice).castVoteAsDelegate(1, batch2.handles[0], batch2.inputProof, [carol.address])
    ).wait();

    // Alice still hasn't directly voted.
    expect(await governor.hasDirectlyVoted(1, alice.address)).to.eq(false);
    // But bob and carol have been counted.
    expect(await governor.hasVoted(1, bob.address)).to.eq(true);
    expect(await governor.hasVoted(1, carol.address)).to.eq(true);

    // Alice casts for herself.
    const encSelf = await encryptSupport(governorAddress, alice.address, 1);
    await (await governor.connect(alice).castVote(1, encSelf.handles[0], encSelf.inputProof)).wait();

    await mineBlocks(VOTING_PERIOD + 1);
    await (await governor.finalize(1)).wait();

    const { f, a, ab } = await decryptTallies(governor, 1);
    expect(f).to.eq(3n);
    expect(a).to.eq(0n);
    expect(ab).to.eq(0n);
  });

  it("lets a delegator override a delegate-credited vote", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();
    await (await delegation.connect(carol).delegate(1, alice.address)).wait();

    // Alice claims bob and carol as FOR, then casts her own FOR.
    const encFor = await encryptSupport(governorAddress, alice.address, 1);
    await (
      await governor
        .connect(alice)
        .castVoteAsDelegate(1, encFor.handles[0], encFor.inputProof, [bob.address, carol.address])
    ).wait();
    const encAliceFor = await encryptSupport(governorAddress, alice.address, 1);
    await (await governor.connect(alice).castVote(1, encAliceFor.handles[0], encAliceFor.inputProof)).wait();

    // Carol overrides with AGAINST.
    const encAgainst = await encryptSupport(governorAddress, carol.address, 0);
    await (await governor.connect(carol).castVote(1, encAgainst.handles[0], encAgainst.inputProof)).wait();

    // Bob overrides with ABSTAIN.
    const encAbstain = await encryptSupport(governorAddress, bob.address, 2);
    await (await governor.connect(bob).castVote(1, encAbstain.handles[0], encAbstain.inputProof)).wait();

    await mineBlocks(VOTING_PERIOD + 1);
    await (await governor.finalize(1)).wait();

    // Alice's own FOR stays; carol's share becomes AGAINST; bob's share becomes ABSTAIN.
    const { f, a, ab } = await decryptTallies(governor, 1);
    expect(f).to.eq(1n);
    expect(a).to.eq(1n);
    expect(ab).to.eq(1n);
  });

  it("emits VoteOverridden when a direct vote supersedes a delegate-credited one", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();

    const encDelegate = await encryptSupport(governorAddress, alice.address, 1);
    await (
      await governor.connect(alice).castVoteAsDelegate(1, encDelegate.handles[0], encDelegate.inputProof, [bob.address])
    ).wait();

    // Bob reclaims his vote — the event should name him as voter and alice
    // as the previous delegate.
    const encBob = await encryptSupport(governorAddress, bob.address, 0);
    await expect(governor.connect(bob).castVote(1, encBob.handles[0], encBob.inputProof))
      .to.emit(governor, "VoteOverridden")
      .withArgs(1, bob.address, alice.address)
      .and.to.emit(governor, "VoteCast")
      .withArgs(1, bob.address);
  });

  it("does not emit VoteOverridden on a first-time direct vote", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();

    const enc = await encryptSupport(governorAddress, alice.address, 1);
    const tx = governor.connect(alice).castVote(1, enc.handles[0], enc.inputProof);
    await expect(tx).to.emit(governor, "VoteCast").withArgs(1, alice.address);
    await expect(tx).to.not.emit(governor, "VoteOverridden");
  });

  it("rejects a delegator whose chain has grown past MAX_CHAIN_DEPTH", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();

    // Build a chain of 17 edges front-to-back so each individual `delegate`
    // passes `_checkChain`, but the resulting chain exceeds resolveTerminal's
    // 16-iter cap. resolveTerminal returns address(0), so `_validateDelegator`
    // in castVoteAsDelegate must reject.
    // Hardhat default provides 20 signers; slice(1,19) gives 18 members
    // (indices 1..18) which allows a 17-edge chain — past resolveTerminal's
    // 16-iter cap.
    const signers = await ethers.getSigners();
    const chain: HardhatEthersSigner[] = signers.slice(1, 19);
    expect(chain.length).to.eq(18);
    for (const s of chain) {
      await (await lock.grant(s.address)).wait();
    }
    for (let i = 0; i < chain.length - 1; i++) {
      await (await delegation.connect(chain[i]).delegate(1, chain[i + 1].address)).wait();
    }

    const terminal = chain[chain.length - 1];
    const enc = await encryptSupport(governorAddress, terminal.address, 1);
    await expect(
      governor.connect(terminal).castVoteAsDelegate(1, enc.handles[0], enc.inputProof, [chain[0].address]),
    ).to.be.revertedWithCustomError(governor, "InvalidDelegator");
  });

  it("reverts deployment if the delegation contract's lock does not match", async function () {
    const lockFactory = (await ethers.getContractFactory("MockPublicLock")) as MockPublicLock__factory;
    const otherLock = await lockFactory.deploy();
    const otherLockAddress = await otherLock.getAddress();

    // Delegation is wired to `lock` in the fixture; deploying a governor
    // with a different lock must revert via LockMismatch.
    const delegationAddress = await delegation.getAddress();
    const govFactory = (await ethers.getContractFactory(
      "UnlockConfidentialGovernorLiquid",
    )) as UnlockConfidentialGovernorLiquid__factory;
    await expect(
      govFactory.deploy(otherLockAddress, delegationAddress, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD),
    ).to.be.revertedWithCustomError(govFactory, "LockMismatch");
  });

  it("rejects a delegate claiming a delegator who already voted directly", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();

    const encBobAgainst = await encryptSupport(governorAddress, bob.address, 0);
    await (await governor.connect(bob).castVote(1, encBobAgainst.handles[0], encBobAgainst.inputProof)).wait();

    const encAliceFor = await encryptSupport(governorAddress, alice.address, 1);
    await expect(
      governor.connect(alice).castVoteAsDelegate(1, encAliceFor.handles[0], encAliceFor.inputProof, [bob.address]),
    ).to.be.revertedWithCustomError(governor, "InvalidDelegator");
  });

  it("rejects a delegator whose chain does not resolve to the caller", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    // bob delegates to carol, not alice.
    await (await delegation.connect(bob).delegate(1, carol.address)).wait();

    const encFor = await encryptSupport(governorAddress, alice.address, 1);
    await expect(
      governor.connect(alice).castVoteAsDelegate(1, encFor.handles[0], encFor.inputProof, [bob.address]),
    ).to.be.revertedWithCustomError(governor, "InvalidDelegator");
  });

  it("scopes delegations per proposal", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    await (await governor.connect(alice).propose("p2", VOTING_PERIOD)).wait();
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();

    // On proposal 2, bob has no delegation, so alice cannot claim him.
    const encFor = await encryptSupport(governorAddress, alice.address, 1);
    await expect(
      governor.connect(alice).castVoteAsDelegate(2, encFor.handles[0], encFor.inputProof, [bob.address]),
    ).to.be.revertedWithCustomError(governor, "InvalidDelegator");
  });

  it("rejects propose from a non-member", async function () {
    const [, , , , , outsider] = await ethers.getSigners();
    await expect(governor.connect(outsider).propose("p1", VOTING_PERIOD)).to.be.revertedWithCustomError(governor, "NotMember");
  });

  it("rejects castVote from a non-member", async function () {
    const [, , , , , outsider] = await ethers.getSigners();
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    const enc = await encryptSupport(governorAddress, outsider.address, 1);
    await expect(governor.connect(outsider).castVote(1, enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(
      governor,
      "NotMember",
    );
  });

  it("rejects castVoteAsDelegate from a non-member", async function () {
    const [, , , , , outsider] = await ethers.getSigners();
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    const enc = await encryptSupport(governorAddress, outsider.address, 1);
    await expect(
      governor.connect(outsider).castVoteAsDelegate(1, enc.handles[0], enc.inputProof, []),
    ).to.be.revertedWithCustomError(governor, "NotMember");
  });

  it("rejects a second direct vote from the same member", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    const enc1 = await encryptSupport(governorAddress, alice.address, 1);
    await (await governor.connect(alice).castVote(1, enc1.handles[0], enc1.inputProof)).wait();
    const enc2 = await encryptSupport(governorAddress, alice.address, 0);
    await expect(governor.connect(alice).castVote(1, enc2.handles[0], enc2.inputProof)).to.be.revertedWithCustomError(
      governor,
      "AlreadyVoted",
    );
  });

  it("reverts castVote, castVoteAsDelegate, and finalize on an unknown proposal", async function () {
    // Proposal 42 never existed. Each entry point must bail on `startBlock == 0`
    // before touching FHE state — this pins all three of those checks in one
    // test rather than duplicating scaffolding.
    const enc = await encryptSupport(governorAddress, alice.address, 1);
    await expect(governor.connect(alice).castVote(42, enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(
      governor,
      "UnknownProposal",
    );
    await expect(
      governor.connect(alice).castVoteAsDelegate(42, enc.handles[0], enc.inputProof, []),
    ).to.be.revertedWithCustomError(governor, "UnknownProposal");
    await expect(governor.finalize(42)).to.be.revertedWithCustomError(governor, "UnknownProposal");
  });

  it("reverts castVote after the voting window has closed", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    await mineBlocks(VOTING_PERIOD + 1);
    const enc = await encryptSupport(governorAddress, alice.address, 1);
    await expect(governor.connect(alice).castVote(1, enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(
      governor,
      "VotingClosed",
    );
  });

  it("reverts castVoteAsDelegate after the voting window has closed", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();
    await mineBlocks(VOTING_PERIOD + 1);
    const enc = await encryptSupport(governorAddress, alice.address, 1);
    await expect(
      governor.connect(alice).castVoteAsDelegate(1, enc.handles[0], enc.inputProof, [bob.address]),
    ).to.be.revertedWithCustomError(governor, "VotingClosed");
  });

  it("reverts finalize while voting is still open", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    await expect(governor.finalize(1)).to.be.revertedWithCustomError(governor, "VotingOngoing");
  });

  it("reverts finalize on an already-finalized proposal", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    await mineBlocks(VOTING_PERIOD + 1);
    await (await governor.finalize(1)).wait();
    await expect(governor.finalize(1)).to.be.revertedWithCustomError(governor, "AlreadyFinalized");
  });

  it("reverts castVoteAsDelegate when delegators exceeds MAX_DELEGATORS_PER_CALL", async function () {
    // The length check fires before any per-delegator validation, so these 65
    // addresses don't need to be members or have delegations wired.
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    const tooMany = Array.from({ length: 65 }, () => ethers.Wallet.createRandom().address);
    const enc = await encryptSupport(governorAddress, alice.address, 1);
    await expect(
      governor.connect(alice).castVoteAsDelegate(1, enc.handles[0], enc.inputProof, tooMany),
    ).to.be.revertedWithCustomError(governor, "TooManyDelegators");
  });

  it("accepts 64 delegators without triggering TooManyDelegators (upper-bound pin)", async function () {
    // Off-by-one check on the `>` comparison. Using alice.address 64× so the
    // first iteration trips `d == msg.sender` (`InvalidDelegator`) — the
    // important assertion is that we got PAST the length check and into the
    // validation loop rather than hitting `TooManyDelegators` at exactly 64.
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    const atBoundary = Array.from({ length: 64 }, () => alice.address);
    const enc = await encryptSupport(governorAddress, alice.address, 1);
    await expect(governor.connect(alice).castVoteAsDelegate(1, enc.handles[0], enc.inputProof, atBoundary))
      .to.be.revertedWithCustomError(governor, "InvalidDelegator")
      .withArgs(alice.address);
  });

  it("accepts an empty delegators[] as a no-op that credits nobody", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    const enc = await encryptSupport(governorAddress, alice.address, 1);
    await (await governor.connect(alice).castVoteAsDelegate(1, enc.handles[0], enc.inputProof, [])).wait();

    expect(await governor.hasDirectlyVoted(1, alice.address)).to.eq(false);
    expect(await governor.hasVoted(1, alice.address)).to.eq(false);

    await mineBlocks(VOTING_PERIOD + 1);
    await (await governor.finalize(1)).wait();
    const { f, a, ab } = await decryptTallies(governor, 1);
    expect(f).to.eq(0n);
    expect(a).to.eq(0n);
    expect(ab).to.eq(0n);
  });

  it("reverts castVoteAsDelegate when delegators contains address(0)", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    const enc = await encryptSupport(governorAddress, alice.address, 1);
    await expect(governor.connect(alice).castVoteAsDelegate(1, enc.handles[0], enc.inputProof, [ethers.ZeroAddress]))
      .to.be.revertedWithCustomError(governor, "InvalidDelegator")
      .withArgs(ethers.ZeroAddress);
  });

  it("reverts castVoteAsDelegate when delegators contains the caller", async function () {
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    const enc = await encryptSupport(governorAddress, alice.address, 1);
    await expect(governor.connect(alice).castVoteAsDelegate(1, enc.handles[0], enc.inputProof, [alice.address]))
      .to.be.revertedWithCustomError(governor, "InvalidDelegator")
      .withArgs(alice.address);
  });

  it("reverts castVoteAsDelegate on a duplicate delegator within a single batch", async function () {
    // The first iteration credits bob and sets countedBy[bob] = alice. The
    // second iteration must trip the `countedBy != 0` branch in
    // `_validateDelegator` — this catches any future refactor that checks
    // state once up front instead of per-iteration.
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();
    const enc = await encryptSupport(governorAddress, alice.address, 1);
    await expect(
      governor.connect(alice).castVoteAsDelegate(1, enc.handles[0], enc.inputProof, [bob.address, bob.address]),
    )
      .to.be.revertedWithCustomError(governor, "InvalidDelegator")
      .withArgs(bob.address);
  });

  it("buckets out-of-range support into abstain instead of nulling votes", async function () {
    // A malicious (or buggy) delegate could encrypt `support = 5` which matches
    // none of 0/1/2. With a naive 1-hot this produces (0, 0, 0) — silently
    // dropping the followers' votes while still locking them via `countedBy`.
    // Followers MUST end up in abstain instead.
    await (await governor.connect(alice).propose("p1", VOTING_PERIOD)).wait();
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();
    await (await delegation.connect(carol).delegate(1, alice.address)).wait();

    const encJunk = await encryptSupport(governorAddress, alice.address, 5);
    await (
      await governor
        .connect(alice)
        .castVoteAsDelegate(1, encJunk.handles[0], encJunk.inputProof, [bob.address, carol.address])
    ).wait();
    // Alice casts her own vote with a valid FOR so we can cleanly read the
    // for/against/abstain split.
    const encAliceFor = await encryptSupport(governorAddress, alice.address, 1);
    await (await governor.connect(alice).castVote(1, encAliceFor.handles[0], encAliceFor.inputProof)).wait();

    await mineBlocks(VOTING_PERIOD + 1);
    await (await governor.finalize(1)).wait();

    const { f, a, ab } = await decryptTallies(governor, 1);
    expect(f).to.eq(1n); // only alice's own FOR
    expect(a).to.eq(0n);
    expect(ab).to.eq(2n); // bob + carol routed to abstain
  });

  it("reverts propose when votingPeriodBlocks is below MIN_VOTING_PERIOD", async function () {
    await expect(governor.connect(alice).propose("p1", MIN_VOTING_PERIOD - 1))
      .to.be.revertedWithCustomError(governor, "InvalidVotingPeriod")
      .withArgs(MIN_VOTING_PERIOD - 1, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD);
  });

  it("reverts propose when votingPeriodBlocks is above MAX_VOTING_PERIOD", async function () {
    await expect(governor.connect(alice).propose("p1", MAX_VOTING_PERIOD + 1))
      .to.be.revertedWithCustomError(governor, "InvalidVotingPeriod")
      .withArgs(MAX_VOTING_PERIOD + 1, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD);
  });

  it("uses the supplied votingPeriodBlocks when computing endBlock", async function () {
    const tx = await governor.connect(alice).propose("p1", MIN_VOTING_PERIOD);
    const receipt = await tx.wait();
    const startBlock = BigInt(receipt!.blockNumber);
    const [, gotStart, gotEnd] = await governor.getProposal(1);
    expect(gotStart).to.eq(startBlock);
    expect(gotEnd - gotStart).to.eq(BigInt(MIN_VOTING_PERIOD));
  });

  it("emits ProposalCreated with the chosen voting window", async function () {
    const tx = governor.connect(alice).propose("p1", MIN_VOTING_PERIOD);
    await expect(tx).to.emit(governor, "ProposalCreated");
    const receipt = await (await tx).wait();
    const log = receipt!.logs.find((l) => l.topics[0] === governor.interface.getEvent("ProposalCreated").topicHash)!;
    const parsed = governor.interface.parseLog(log)!;
    expect(parsed.args.votingPeriodBlocks).to.eq(BigInt(MIN_VOTING_PERIOD));
    expect(parsed.args.endBlock - parsed.args.startBlock).to.eq(BigInt(MIN_VOTING_PERIOD));
  });

  it("reverts deployment when minVotingPeriodBlocks is zero", async function () {
    const delegationAddress = await delegation.getAddress();
    const lockAddress = await lock.getAddress();
    const govFactory = (await ethers.getContractFactory(
      "UnlockConfidentialGovernorLiquid",
    )) as UnlockConfidentialGovernorLiquid__factory;
    await expect(govFactory.deploy(lockAddress, delegationAddress, 0, 100)).to.be.revertedWithCustomError(
      govFactory,
      "InvalidVotingBounds",
    );
  });

  it("reverts deployment when min > max", async function () {
    const delegationAddress = await delegation.getAddress();
    const lockAddress = await lock.getAddress();
    const govFactory = (await ethers.getContractFactory(
      "UnlockConfidentialGovernorLiquid",
    )) as UnlockConfidentialGovernorLiquid__factory;
    await expect(govFactory.deploy(lockAddress, delegationAddress, 100, 50)).to.be.revertedWithCustomError(
      govFactory,
      "InvalidVotingBounds",
    );
  });
});
