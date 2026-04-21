// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @notice Minimal subset of Unlock Protocol's PublicLock interface.
interface IPublicLock {
    function getHasValidKey(address keyOwner) external view returns (bool);
}

/// @title UnlockConfidentialGovernor
/// @notice NFT-gated DAO voting where ballots are encrypted via FHE.
/// Eligibility is 1-member-1-vote, tied to holding a valid Unlock Protocol key.
contract UnlockConfidentialGovernor is ZamaEthereumConfig {
    IPublicLock public immutable lock;
    uint256 public constant VOTING_PERIOD = 7200; // ~1 day @ 12s blocks

    struct Proposal {
        address proposer;
        uint256 startBlock;
        uint256 endBlock;
        euint32 forVotes;
        euint32 againstVotes;
        euint32 abstainVotes;
        bool finalized;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) private _proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed id, address indexed proposer, string description);
    event VoteCast(uint256 indexed id, address indexed voter);
    event ProposalFinalized(uint256 indexed id);

    error NotMember();
    error AlreadyVoted();
    error VotingClosed();
    error VotingOngoing();
    error AlreadyFinalized();
    error UnknownProposal();

    modifier onlyMember() {
        if (!lock.getHasValidKey(msg.sender)) revert NotMember();
        _;
    }

    constructor(address lockAddress) {
        lock = IPublicLock(lockAddress);
    }

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

    /// @param support encrypted 0=against, 1=for, 2=abstain
    function castVote(
        uint256 id,
        externalEuint32 support,
        bytes calldata inputProof
    ) external onlyMember {
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

    /// @notice Marks a proposal as finalized once voting ends and authorizes
    /// public decryption of the final tallies via the FHE gateway.
    /// Off-chain clients can then request decryption of the three handles.
    function finalize(uint256 id) external {
        Proposal storage p = _proposals[id];
        if (p.startBlock == 0) revert UnknownProposal();
        if (block.number <= p.endBlock) revert VotingOngoing();
        if (p.finalized) revert AlreadyFinalized();

        p.finalized = true;

        FHE.makePubliclyDecryptable(p.forVotes);
        FHE.makePubliclyDecryptable(p.againstVotes);
        FHE.makePubliclyDecryptable(p.abstainVotes);

        emit ProposalFinalized(id);
    }

    function getProposal(uint256 id)
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
