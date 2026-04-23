import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { LiquidDelegation, LiquidDelegation__factory, MockPublicLock, MockPublicLock__factory } from "../types";

async function deployFixture() {
  const lockFactory = (await ethers.getContractFactory("MockPublicLock")) as MockPublicLock__factory;
  const lock = (await lockFactory.deploy()) as MockPublicLock;

  const delegationFactory = (await ethers.getContractFactory("LiquidDelegation")) as LiquidDelegation__factory;
  const delegation = (await delegationFactory.deploy(await lock.getAddress())) as LiquidDelegation;

  return { lock, delegation };
}

describe("LiquidDelegation", function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let carol: HardhatEthersSigner;
  let dave: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;
  let lock: MockPublicLock;
  let delegation: LiquidDelegation;

  before(async function () {
    const signers = await ethers.getSigners();
    [, alice, bob, carol, dave, outsider] = signers;
  });

  beforeEach(async function () {
    const fixture = await deployFixture();
    lock = fixture.lock;
    delegation = fixture.delegation;
    for (const m of [alice, bob, carol, dave]) {
      await (await lock.grant(m.address)).wait();
    }
  });

  it("rejects non-members from delegating", async function () {
    await expect(delegation.connect(outsider).delegate(1, alice.address)).to.be.revertedWithCustomError(
      delegation,
      "NotMember",
    );
  });

  it("rejects delegating to self or to address(0)", async function () {
    await expect(delegation.connect(alice).delegate(1, alice.address)).to.be.revertedWithCustomError(
      delegation,
      "InvalidDelegate",
    );
    await expect(delegation.connect(alice).delegate(1, ethers.ZeroAddress)).to.be.revertedWithCustomError(
      delegation,
      "InvalidDelegate",
    );
  });

  it("rejects delegating to a non-member", async function () {
    await expect(delegation.connect(alice).delegate(1, outsider.address)).to.be.revertedWithCustomError(
      delegation,
      "InvalidDelegate",
    );
  });

  it("records a delegation and reverse index", async function () {
    await (await delegation.connect(alice).delegate(1, bob.address)).wait();
    expect(await delegation.delegateOf(alice.address, 1)).to.eq(bob.address);
    expect(await delegation.delegatorsOf(bob.address, 1)).to.deep.eq([alice.address]);
  });

  it("prevents direct and transitive cycles", async function () {
    await (await delegation.connect(alice).delegate(1, bob.address)).wait();
    // Direct: bob -> alice would loop immediately.
    await expect(delegation.connect(bob).delegate(1, alice.address)).to.be.revertedWithCustomError(
      delegation,
      "DelegationCycle",
    );
    // Transitive: bob -> carol -> alice -> bob.
    await (await delegation.connect(carol).delegate(1, alice.address)).wait();
    await expect(delegation.connect(bob).delegate(1, carol.address)).to.be.revertedWithCustomError(
      delegation,
      "DelegationCycle",
    );
  });

  it("updates reverse index when overwriting a delegation", async function () {
    await (await delegation.connect(alice).delegate(1, bob.address)).wait();
    await (await delegation.connect(alice).delegate(1, carol.address)).wait();

    expect(await delegation.delegatorsOf(bob.address, 1)).to.deep.eq([]);
    expect(await delegation.delegatorsOf(carol.address, 1)).to.deep.eq([alice.address]);
  });

  it("clears delegation on undelegate", async function () {
    await (await delegation.connect(alice).delegate(1, bob.address)).wait();
    await (await delegation.connect(alice).undelegate(1)).wait();

    expect(await delegation.delegateOf(alice.address, 1)).to.eq(ethers.ZeroAddress);
    expect(await delegation.delegatorsOf(bob.address, 1)).to.deep.eq([]);
  });

  it("scopes delegations per proposal", async function () {
    await (await delegation.connect(alice).delegate(1, bob.address)).wait();
    expect(await delegation.delegateOf(alice.address, 2)).to.eq(ethers.ZeroAddress);
    expect(await delegation.delegatorsOf(bob.address, 2)).to.deep.eq([]);
  });

  it("resolves terminal across a chain", async function () {
    // carol -> bob -> alice. Terminal for carol is alice.
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();
    await (await delegation.connect(carol).delegate(1, bob.address)).wait();
    expect(await delegation.resolveTerminal(carol.address, 1)).to.eq(alice.address);
    expect(await delegation.resolveTerminal(bob.address, 1)).to.eq(alice.address);
    expect(await delegation.resolveTerminal(alice.address, 1)).to.eq(alice.address);
  });

  it("rejects delegations onto an already-long chain", async function () {
    const signers = await ethers.getSigners();
    // Build chain s[1] -> s[2] -> ... -> s[16] (15 edges). Then s[0] tries
    // to prepend itself — that would make a 16-edge chain, and the delegate
    // check walks up to MAX_CHAIN_DEPTH-1 = 15 hops of `to`'s chain looking
    // for a terminator. It won't find one, so it reverts.
    const chain: HardhatEthersSigner[] = signers.slice(1, 17);
    for (const s of chain) {
      await (await lock.grant(s.address)).wait();
    }
    for (let i = 0; i < chain.length - 1; i++) {
      await (await delegation.connect(chain[i]).delegate(1, chain[i + 1].address)).wait();
    }
    const head = signers[17];
    await (await lock.grant(head.address)).wait();
    await expect(delegation.connect(head).delegate(1, chain[0].address)).to.be.revertedWithCustomError(
      delegation,
      "ChainTooDeep",
    );
  });

  it("resolveTerminal returns address(0) when the chain exceeds MAX_CHAIN_DEPTH", async function () {
    // Same setup as above, but bypass the delegate() guard by chaining
    // additions back-to-front so each individual delegate() sees a short
    // forward chain. This mirrors the real attack surface: any single
    // delegation is valid, but together they form an over-depth chain.
    const signers = await ethers.getSigners();
    const chain: HardhatEthersSigner[] = signers.slice(1, 19); // 18 members
    for (const s of chain) {
      await (await lock.grant(s.address)).wait();
    }
    // Build front-to-back: chain[0]->chain[1] first (to's chain is 0),
    // then chain[1]->chain[2] (to's chain is 0), etc. Each call sees `to`
    // as a leaf, so every delegate() succeeds.
    for (let i = 0; i < chain.length - 1; i++) {
      await (await delegation.connect(chain[i]).delegate(1, chain[i + 1].address)).wait();
    }
    // Now chain[0]'s chain is 17 edges — past resolveTerminal's 16-iter cap.
    // resolveTerminal must fail closed (return 0) rather than silently
    // returning some intermediate node.
    expect(await delegation.resolveTerminal(chain[0].address, 1)).to.eq(ethers.ZeroAddress);
  });

  it("truncates collectTransitive when maxNodes is smaller than the graph", async function () {
    // dave -> carol -> bob -> alice is a 3-deep graph. Capping at 2 nodes
    // must exercise the assembly-truncation path inside `collectTransitive`
    // and return exactly 2 distinct (non-zero) members.
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();
    await (await delegation.connect(carol).delegate(1, bob.address)).wait();
    await (await delegation.connect(dave).delegate(1, carol.address)).wait();

    const capped = await delegation.collectTransitive(alice.address, 1, 2);
    expect(capped.length).to.eq(2);
    expect(capped).to.not.include(ethers.ZeroAddress);
    const unique = new Set(capped.map((a) => a.toLowerCase()));
    expect(unique.size).to.eq(2);
  });

  it("enumerates transitive delegators and skips non-members", async function () {
    // Graph: dave -> carol -> bob -> alice (terminal alice).
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();
    await (await delegation.connect(carol).delegate(1, bob.address)).wait();
    await (await delegation.connect(dave).delegate(1, carol.address)).wait();

    const collected = await delegation.collectTransitive(alice.address, 1, 16);
    // Order is BFS by layer — bob, then carol, then dave.
    expect([...collected].sort()).to.deep.eq([bob.address, carol.address, dave.address].sort());

    // Revoke carol's key — she should be skipped in future enumerations.
    await (await lock.revoke(carol.address)).wait();
    const afterRevoke = await delegation.collectTransitive(alice.address, 1, 16);
    expect([...afterRevoke].sort()).to.deep.eq([bob.address, dave.address].sort());
  });

  it("countTransitive returns valid-member count, respects maxNodes, and returns 0 for maxNodes=0", async function () {
    // dave -> carol -> bob -> alice (terminal alice, depth 3).
    await (await delegation.connect(bob).delegate(1, alice.address)).wait();
    await (await delegation.connect(carol).delegate(1, bob.address)).wait();
    await (await delegation.connect(dave).delegate(1, carol.address)).wait();

    expect(await delegation.countTransitive(alice.address, 1, 16)).to.eq(3n);

    // maxNodes cap is honored — BFS stops enumerating once count reaches it.
    expect(await delegation.countTransitive(alice.address, 1, 2)).to.eq(2n);

    // maxNodes = 0 must short-circuit to 0 (the `new address[](0)` early return).
    expect(await delegation.countTransitive(alice.address, 1, 0)).to.eq(0n);

    // Non-members are filtered. Revoking carol drops the count by exactly 1;
    // dave is still enumerated because BFS enqueues children regardless of
    // whether the parent was counted.
    await (await lock.revoke(carol.address)).wait();
    expect(await delegation.countTransitive(alice.address, 1, 16)).to.eq(2n);
  });

  it("undelegate is a no-op (no revert, no event) when there is no prior delegation", async function () {
    // Plain member who never delegated.
    await expect(delegation.connect(alice).undelegate(1)).to.not.emit(delegation, "Undelegated");

    // Non-member path — `undelegate` has no onlyMember modifier by design so
    // a key-less caller with no dangling delegation still no-ops cleanly.
    await expect(delegation.connect(outsider).undelegate(1)).to.not.emit(delegation, "Undelegated");
  });

  it("delegate to the same target is a no-op (no duplicate reverse-index entry, no event)", async function () {
    // Guarded by `if (previous == to) return;` — a naive impl would double-push
    // the caller into the reverse index and emit a spurious Delegated event.
    await (await delegation.connect(alice).delegate(1, bob.address)).wait();
    await expect(delegation.connect(alice).delegate(1, bob.address)).to.not.emit(delegation, "Delegated");
    expect(await delegation.delegatorsOf(bob.address, 1)).to.deep.eq([alice.address]);
  });

  it("undelegate lets a former key holder clean up after revocation", async function () {
    // Intentional design: `undelegate` has no onlyMember so a voter whose key
    // was revoked can still undo their delegation. Pin the Undelegated args
    // so the event payload doesn't silently drift.
    await (await delegation.connect(alice).delegate(1, bob.address)).wait();
    await (await lock.revoke(alice.address)).wait();

    await expect(delegation.connect(alice).undelegate(1))
      .to.emit(delegation, "Undelegated")
      .withArgs(alice.address, 1, bob.address);
    expect(await delegation.delegateOf(alice.address, 1)).to.eq(ethers.ZeroAddress);
    expect(await delegation.delegatorsOf(bob.address, 1)).to.deep.eq([]);
  });
});
