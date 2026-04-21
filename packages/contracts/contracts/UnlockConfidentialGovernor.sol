// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title IPublicLock
/// @author ipe-gov
/// @notice Minimal subset of Unlock Protocol's PublicLock interface.
interface IPublicLock {
    /// @notice Returns whether the given address holds a valid (non-expired) key.
    /// @param keyOwner The address to check.
    /// @return valid True if the address owns a valid key.
    function getHasValidKey(address keyOwner) external view returns (bool valid);
}

/// @title UnlockConfidentialGovernor
/// @author ipe-gov
/// @notice NFT-gated DAO voting where ballots are encrypted via FHE.
/// Eligibility is 1-member-1-vote, tied to holding a valid Unlock Protocol key.
contract UnlockConfidentialGovernor is ZamaEthereumConfig {
    /// @notice Unlock Protocol PublicLock used for membership checks.
    IPublicLock public immutable LOCK;

    /// @notice Number of blocks a proposal remains open for voting (~1 day at 12s blocks).
    uint256 public constant VOTING_PERIOD = 7200;

    /// @notice Proposal record.
    /// @dev Fields are arranged to keep the address + small flags sharing a slot.
    struct Proposal {
        address proposer;
        bool finalized;
        uint256 startBlock;
        uint256 endBlock;
        euint32 forVotes;
        euint32 againstVotes;
        euint32 abstainVotes;
    }

    /// @notice Total number of proposals ever created.
    uint256 public proposalCount;

    mapping(uint256 proposalId => Proposal proposal) private _proposals;

    /// @notice Tracks which addresses have voted on which proposals.
    mapping(uint256 proposalId => mapping(address voter => bool voted)) public hasVoted;

    /// @notice Emitted when a new proposal is created.
    /// @param id The proposal id.
    /// @param proposer The member that created the proposal.
    /// @param description Free-form proposal description.
    event ProposalCreated(uint256 indexed id, address indexed proposer, string description);

    /// @notice Emitted when a member casts a (still-encrypted) vote.
    /// @param id The proposal id.
    /// @param voter The member casting the vote.
    event VoteCast(uint256 indexed id, address indexed voter);

    /// @notice Emitted when a proposal's voting window has closed and tallies
    /// have been marked publicly decryptable.
    /// @param id The proposal id.
    event ProposalFinalized(uint256 indexed id);

    /// @notice Caller is not a valid Unlock key holder.
    error NotMember();
    /// @notice Caller has already voted on this proposal.
    error AlreadyVoted();
    /// @notice Voting window has already ended.
    error VotingClosed();
    /// @notice Voting window is still open.
    error VotingOngoing();
    /// @notice Proposal is already finalized.
    error AlreadyFinalized();
    /// @notice Proposal id does not exist.
    error UnknownProposal();

    modifier onlyMember() {
        if (!LOCK.getHasValidKey(msg.sender)) revert NotMember();
        _;
    }

    /// @notice Deploys the governor bound to a specific Unlock PublicLock.
    /// @param lockAddress Address of the Unlock Protocol lock granting membership.
    constructor(address lockAddress) {
        LOCK = IPublicLock(lockAddress);
    }

    /// @notice Creates a new proposal. Caller must hold a valid Unlock key.
    /// @param description Free-form proposal description.
    /// @return id The id of the newly created proposal.
    function propose(string calldata description) external onlyMember returns (uint256 id) {
        id = ++proposalCount;
        Proposal storage p = _proposals[id];
        p.proposer = msg.sender;
        p.startBlock = block.number;
        p.endBlock = block.number + VOTING_PERIOD;
        p.forVotes = FHE.asEuint32(0);
        p.againstVotes = FHE.asEuint32(0);
        p.abstainVotes = FHE.asEuint32(0);

        FHE.allowThis(p.forVotes);
        FHE.allowThis(p.againstVotes);
        FHE.allowThis(p.abstainVotes);

        emit ProposalCreated(id, msg.sender, description);
    }

    /// @notice Casts an encrypted vote on a proposal.
    /// @param id The proposal id.
    /// @param support Encrypted vote value (0 = against, 1 = for, 2 = abstain).
    /// @param inputProof ZK proof that `support` is a well-formed ciphertext.
    function castVote(uint256 id, externalEuint32 support, bytes calldata inputProof) external onlyMember {
        Proposal storage p = _proposals[id];
        if (p.startBlock == 0) revert UnknownProposal();
        if (block.number > p.endBlock) revert VotingClosed();
        if (hasVoted[id][msg.sender]) revert AlreadyVoted();

        euint32 s = FHE.fromExternal(support, inputProof);
        euint32 one = FHE.asEuint32(1);
        euint32 zero = FHE.asEuint32(0);

        ebool isFor = FHE.eq(s, FHE.asEuint32(1));
        ebool isAgainst = FHE.eq(s, FHE.asEuint32(0));
        ebool isAbstain = FHE.eq(s, FHE.asEuint32(2));

        p.forVotes = FHE.add(p.forVotes, FHE.select(isFor, one, zero));
        p.againstVotes = FHE.add(p.againstVotes, FHE.select(isAgainst, one, zero));
        p.abstainVotes = FHE.add(p.abstainVotes, FHE.select(isAbstain, one, zero));

        FHE.allowThis(p.forVotes);
        FHE.allowThis(p.againstVotes);
        FHE.allowThis(p.abstainVotes);

        hasVoted[id][msg.sender] = true;
        emit VoteCast(id, msg.sender);
    }

    /// @notice Marks a proposal as finalized once voting has ended and authorizes
    /// public decryption of the final tallies via the FHE gateway.
    /// @param id The proposal id.
    function finalize(uint256 id) external {
        Proposal storage p = _proposals[id];
        if (p.startBlock == 0) revert UnknownProposal();
        if (block.number < p.endBlock + 1) revert VotingOngoing();
        if (p.finalized) revert AlreadyFinalized();

        p.finalized = true;

        FHE.makePubliclyDecryptable(p.forVotes);
        FHE.makePubliclyDecryptable(p.againstVotes);
        FHE.makePubliclyDecryptable(p.abstainVotes);

        emit ProposalFinalized(id);
    }

    /// @notice Returns the state of a proposal.
    /// @param id The proposal id.
    /// @return proposer The address that created the proposal.
    /// @return startBlock Block number when voting opened.
    /// @return endBlock Block number when voting closes.
    /// @return forVotes Encrypted tally of "for" votes.
    /// @return againstVotes Encrypted tally of "against" votes.
    /// @return abstainVotes Encrypted tally of "abstain" votes.
    /// @return finalized Whether the proposal has been finalized.
    function getProposal(
        uint256 id
    )
        external
        view
        returns (
            address proposer,
            uint256 startBlock,
            uint256 endBlock,
            euint32 forVotes,
            euint32 againstVotes,
            euint32 abstainVotes,
            bool finalized
        )
    {
        Proposal storage p = _proposals[id];
        return (p.proposer, p.startBlock, p.endBlock, p.forVotes, p.againstVotes, p.abstainVotes, p.finalized);
    }
}
