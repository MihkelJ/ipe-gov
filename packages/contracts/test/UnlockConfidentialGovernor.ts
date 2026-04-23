import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, network } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  MockPublicLock,
  MockPublicLock__factory,
  UnlockConfidentialGovernor,
  UnlockConfidentialGovernor__factory,
} from "../types";

async function deployFixture() {
  const lockFactory = (await ethers.getContractFactory("MockPublicLock")) as MockPublicLock__factory;
  const lock = (await lockFactory.deploy()) as MockPublicLock;
  const lockAddress = await lock.getAddress();

  const govFactory = (await ethers.getContractFactory(
    "UnlockConfidentialGovernor",
  )) as UnlockConfidentialGovernor__factory;
  const governor = (await govFactory.deploy(lockAddress, 7200)) as UnlockConfidentialGovernor;
  const governorAddress = await governor.getAddress();

  return { lock, lockAddress, governor, governorAddress };
}

async function encryptSupport(governorAddress: string, voter: string, support: number) {
  return fhevm.createEncryptedInput(governorAddress, voter).add32(support).encrypt();
}

async function mineBlocks(n: number) {
  await network.provider.send("hardhat_mine", ["0x" + n.toString(16)]);
}

describe("UnlockConfidentialGovernor", function () {
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let carol: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;
  let lock: MockPublicLock;
  let governor: UnlockConfidentialGovernor;
  let governorAddress: string;

  before(async function () {
    const signers = await ethers.getSigners();
    [, alice, bob, carol, outsider] = signers;
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("Tests require the FHEVM mock; skipping.");
      this.skip();
    }

    const fixture = await deployFixture();
    lock = fixture.lock;
    governor = fixture.governor;
    governorAddress = fixture.governorAddress;

    for (const m of [alice, bob, carol]) {
      await (await lock.grant(m.address)).wait();
    }
  });

  it("rejects non-members from proposing", async function () {
    await expect(governor.connect(outsider).propose("hello")).to.be.revertedWithCustomError(governor, "NotMember");
  });

  it("allows a member to create a proposal", async function () {
    const tx = await governor.connect(alice).propose("upgrade treasury rules");
    await expect(tx).to.emit(governor, "ProposalCreated").withArgs(1n, alice.address, "upgrade treasury rules");
    expect(await governor.proposalCount()).to.eq(1n);
  });

  it("rejects non-member votes", async function () {
    await (await governor.connect(alice).propose("p1")).wait();
    const enc = await encryptSupport(governorAddress, outsider.address, 1);
    await expect(governor.connect(outsider).castVote(1, enc.handles[0], enc.inputProof)).to.be.revertedWithCustomError(
      governor,
      "NotMember",
    );
  });

  it("counts encrypted votes and reveals only the tally on finalize", async function () {
    await (await governor.connect(alice).propose("p1")).wait();

    const encAliceFor = await encryptSupport(governorAddress, alice.address, 1);
    await (await governor.connect(alice).castVote(1, encAliceFor.handles[0], encAliceFor.inputProof)).wait();

    const encBobFor = await encryptSupport(governorAddress, bob.address, 1);
    await (await governor.connect(bob).castVote(1, encBobFor.handles[0], encBobFor.inputProof)).wait();

    const encCarolAgainst = await encryptSupport(governorAddress, carol.address, 0);
    await (await governor.connect(carol).castVote(1, encCarolAgainst.handles[0], encCarolAgainst.inputProof)).wait();

    expect(await governor.hasVoted(1, alice.address)).to.eq(true);
    expect(await governor.hasVoted(1, bob.address)).to.eq(true);

    // Double vote is rejected
    await expect(
      governor.connect(alice).castVote(1, encAliceFor.handles[0], encAliceFor.inputProof),
    ).to.be.revertedWithCustomError(governor, "AlreadyVoted");

    // Cannot finalize while voting is open
    await expect(governor.finalize(1)).to.be.revertedWithCustomError(governor, "VotingOngoing");

    const period = await governor.VOTING_PERIOD();
    await mineBlocks(Number(period) + 1);

    await (await governor.finalize(1)).wait();

    const [, , , forVotes, againstVotes, abstainVotes, finalized, descriptionCid] = await governor.getProposal(1);
    expect(finalized).to.eq(true);
    expect(descriptionCid).to.eq("p1");

    const f = await fhevm.publicDecryptEuint(FhevmType.euint32, forVotes);
    const a = await fhevm.publicDecryptEuint(FhevmType.euint32, againstVotes);
    const ab = await fhevm.publicDecryptEuint(FhevmType.euint32, abstainVotes);

    expect(f).to.eq(2n);
    expect(a).to.eq(1n);
    expect(ab).to.eq(0n);
  });
});
