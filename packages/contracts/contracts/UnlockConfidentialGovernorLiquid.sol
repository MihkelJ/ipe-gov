// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IPublicLockV15} from "@unlock-protocol/contracts/dist/PublicLock/IPublicLockV15.sol";

import {LiquidDelegation} from "./LiquidDelegation.sol";

/// @title UnlockConfidentialGovernorLiquid
/// @author ipe-gov
/// @notice Liquid-democracy variant of UnlockConfidentialGovernor. Adds
/// per-proposal transitive delegation (via `LiquidDelegation`) and a direct
/// vote that overrides a prior delegate-cast. Vote ballots remain FHE-encrypted
/// end-to-end; only aggregate tallies are revealed at finalize.
contract UnlockConfidentialGovernorLiquid is ZamaEthereumConfig {
    /// @notice Unlock Protocol PublicLock used for membership checks.
    IPublicLockV15 public immutable LOCK;
    /// @notice Delegation registry used to resolve delegator chains.
    LiquidDelegation public immutable DELEGATION;
    /// @notice Minimum number of blocks a proposal may stay open for voting.
    uint256 public immutable MIN_VOTING_PERIOD;
    /// @notice Maximum number of blocks a proposal may stay open for voting.
    uint256 public immutable MAX_VOTING_PERIOD;

    /// @notice Upper bound on delegators claimable per `castVoteAsDelegate`
    /// call. Keeps gas predictable; delegates with more transitive followers
    /// than this are expected to claim them across multiple transactions.
    uint256 public constant MAX_DELEGATORS_PER_CALL = 64;

    /// @notice Proposal record.
    struct Proposal {
        address proposer;
        bool finalized;
        uint256 startBlock;
        uint256 endBlock;
        euint32 forVotes;
        euint32 againstVotes;
        euint32 abstainVotes;
        string descriptionCid;
    }

    /// @notice Total number of proposals ever created.
    uint256 public proposalCount;
    mapping(uint256 proposalId => Proposal proposal) private _proposals;

    /// @notice True once `voter` has cast a direct (own) vote on `proposalId`.
    mapping(uint256 proposalId => mapping(address voter => bool voted)) public hasDirectlyVoted;

    /// @notice Non-zero when `voter`'s vote has been credited via someone
    /// else's `castVoteAsDelegate` call. Cleared on direct-vote override.
    mapping(uint256 proposalId => mapping(address voter => address delegate)) public countedBy;

    /// @dev Per-voter 1-hot encrypted contribution vector, stored at the time
    /// the vote (direct or delegate) is credited. Used by the override path to
    /// subtract the exact share from aggregate tallies via FHE.sub.
    mapping(uint256 proposalId => mapping(address voter => euint32 vec)) private _voterVecFor;
    mapping(uint256 proposalId => mapping(address voter => euint32 vec)) private _voterVecAgainst;
    mapping(uint256 proposalId => mapping(address voter => euint32 vec)) private _voterVecAbstain;

    /// @notice Emitted when a new proposal is created.
    /// @param id The proposal id.
    /// @param proposer The member that created the proposal.
    /// @param descriptionCid IPFS CID of the pinned proposal description.
    /// @param startBlock Block at which voting opened (inclusive).
    /// @param endBlock Block at which voting closes (inclusive).
    /// @param votingPeriodBlocks Per-proposal voting window chosen by the proposer.
    event ProposalCreated(
        uint256 indexed id,
        address indexed proposer,
        string descriptionCid,
        uint256 startBlock,
        uint256 endBlock,
        uint256 votingPeriodBlocks
    );

    /// @notice Emitted when a member casts a (still-encrypted) vote.
    /// @param id The proposal id.
    /// @param voter The member casting the vote.
    event VoteCast(uint256 indexed id, address indexed voter);

    /// @notice Emitted when a delegator is credited via someone else's delegate-cast.
    /// @param id The proposal id.
    /// @param delegator The member whose vote was credited.
    /// @param delegate The delegate that credited the vote.
    event VoteCastViaDelegate(uint256 indexed id, address indexed delegator, address indexed delegate);

    /// @notice Emitted when a direct `castVote` supersedes a prior delegate-credited vote.
    /// @dev Always followed by a `VoteCast` for the same voter in the same tx.
    /// Indexers use this to distinguish an override from a first-time direct vote.
    /// @param id The proposal id.
    /// @param voter The voter who reclaimed their vote.
    /// @param previousDelegate The delegate whose `castVoteAsDelegate` had originally credited the vote.
    event VoteOverridden(uint256 indexed id, address indexed voter, address indexed previousDelegate);

    /// @notice Emitted when a proposal's voting window has closed and tallies
    /// have been marked publicly decryptable.
    /// @param id The proposal id.
    event ProposalFinalized(uint256 indexed id);

    /// @notice Caller is not a valid Unlock key holder.
    error NotMember();
    /// @notice Caller has already cast a direct vote on this proposal.
    error AlreadyVoted();
    /// @notice Voting window has already ended.
    error VotingClosed();
    /// @notice Voting window is still open.
    error VotingOngoing();
    /// @notice Proposal is already finalized.
    error AlreadyFinalized();
    /// @notice Proposal id does not exist.
    error UnknownProposal();
    /// @notice A delegator supplied to `castVoteAsDelegate` failed validation.
    /// @param delegator The offending delegator address.
    error InvalidDelegator(address delegator);
    /// @notice Too many delegators supplied in a single call.
    error TooManyDelegators();
    /// @notice Thrown when the delegation contract's lock does not match
    /// this governor's lock — the two must agree or membership checks
    /// between validation (governor) and delegation (registry) diverge.
    error LockMismatch();
    /// @notice The supplied voting period was outside the configured bounds.
    /// @param supplied Voting period (blocks) the proposer requested.
    /// @param min Minimum allowed voting period.
    /// @param max Maximum allowed voting period.
    error InvalidVotingPeriod(uint256 supplied, uint256 min, uint256 max);
    /// @notice Constructor was called with min == 0 or min > max.
    error InvalidVotingBounds();

    modifier onlyMember() {
        if (!LOCK.getHasValidKey(msg.sender)) revert NotMember();
        _;
    }

    /// @notice Deploys the governor bound to a specific lock and delegation contract.
    /// @param lockAddress Address of the Unlock Protocol lock granting membership.
    /// @param delegationAddress Address of the `LiquidDelegation` registry.
    /// @param minVotingPeriodBlocks Minimum per-proposal voting window (in blocks).
    /// @param maxVotingPeriodBlocks Maximum per-proposal voting window (in blocks).
    constructor(
        address lockAddress,
        address delegationAddress,
        uint256 minVotingPeriodBlocks,
        uint256 maxVotingPeriodBlocks
    ) {
        if (minVotingPeriodBlocks == 0 || minVotingPeriodBlocks > maxVotingPeriodBlocks) {
            revert InvalidVotingBounds();
        }
        LOCK = IPublicLockV15(lockAddress);
        DELEGATION = LiquidDelegation(delegationAddress);
        MIN_VOTING_PERIOD = minVotingPeriodBlocks;
        MAX_VOTING_PERIOD = maxVotingPeriodBlocks;
        if (address(DELEGATION.LOCK()) != lockAddress) revert LockMismatch();
    }

    /// @notice True if `voter`'s vote has been accounted for on `id`, either
    /// directly or via delegation.
    /// @param id The proposal id.
    /// @param voter The address to query.
    /// @return True if the voter has been counted (direct or via delegate).
    function hasVoted(uint256 id, address voter) public view returns (bool) {
        return hasDirectlyVoted[id][voter] || countedBy[id][voter] != address(0);
    }

    /// @notice Creates a new proposal. Caller must hold a valid Unlock key.
    /// @param descriptionCid IPFS CID of the pinned proposal description JSON.
    /// @param votingPeriodBlocks Number of blocks the proposal stays open. Must
    /// fall in `[MIN_VOTING_PERIOD, MAX_VOTING_PERIOD]`.
    /// @return id The id of the newly created proposal.
    function propose(
        string calldata descriptionCid,
        uint256 votingPeriodBlocks
    ) external onlyMember returns (uint256 id) {
        if (votingPeriodBlocks < MIN_VOTING_PERIOD || votingPeriodBlocks > MAX_VOTING_PERIOD) {
            revert InvalidVotingPeriod(votingPeriodBlocks, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD);
        }

        id = ++proposalCount;
        Proposal storage p = _proposals[id];
        p.proposer = msg.sender;
        p.startBlock = block.number;
        p.endBlock = block.number + votingPeriodBlocks;
        p.forVotes = FHE.asEuint32(0);
        p.againstVotes = FHE.asEuint32(0);
        p.abstainVotes = FHE.asEuint32(0);
        p.descriptionCid = descriptionCid;

        FHE.allowThis(p.forVotes);
        FHE.allowThis(p.againstVotes);
        FHE.allowThis(p.abstainVotes);

        emit ProposalCreated(id, msg.sender, descriptionCid, p.startBlock, p.endBlock, votingPeriodBlocks);
    }

    /// @notice Cast a direct vote. If the caller was previously credited via
    /// a delegate, that prior contribution is subtracted before the new one is
    /// added — a direct vote always wins.
    /// @param id The proposal id.
    /// @param support Encrypted vote value (0 = against, 1 = for, 2 = abstain).
    /// @param inputProof ZK proof that `support` is a well-formed ciphertext.
    function castVote(uint256 id, externalEuint32 support, bytes calldata inputProof) external onlyMember {
        Proposal storage p = _proposals[id];
        if (p.startBlock == 0) revert UnknownProposal();
        if (block.number > p.endBlock) revert VotingClosed();
        if (hasDirectlyVoted[id][msg.sender]) revert AlreadyVoted();

        euint32 s = FHE.fromExternal(support, inputProof);
        (euint32 vFor, euint32 vAgainst, euint32 vAbstain) = _oneHot(s);
        // Grant this contract persistent access to the 1-hot ciphertexts so
        // they remain readable if the voter later overrides via `castVote`
        // again (no-op today but defensive) and so stored slots survive.
        FHE.allowThis(vFor);
        FHE.allowThis(vAgainst);
        FHE.allowThis(vAbstain);

        // Reverse any prior delegate-credited contribution for this voter.
        address previousDelegate = countedBy[id][msg.sender];
        if (previousDelegate != address(0)) {
            p.forVotes = FHE.sub(p.forVotes, _voterVecFor[id][msg.sender]);
            p.againstVotes = FHE.sub(p.againstVotes, _voterVecAgainst[id][msg.sender]);
            p.abstainVotes = FHE.sub(p.abstainVotes, _voterVecAbstain[id][msg.sender]);
            delete countedBy[id][msg.sender];
            emit VoteOverridden(id, msg.sender, previousDelegate);
        }

        _credit(p, id, msg.sender, vFor, vAgainst, vAbstain);
        hasDirectlyVoted[id][msg.sender] = true;
        _allowTallies(p);

        emit VoteCast(id, msg.sender);
    }

    /// @notice Cast as a delegate. Adds one contribution per valid delegator
    /// in `delegators`. Does NOT cast the caller's own vote — the caller must
    /// call `castVote` separately to record their own choice. Each delegator
    /// must currently be a member, must not have voted or been counted yet,
    /// and must have a delegation chain whose terminal resolves to
    /// `msg.sender` on this proposal. Callable multiple times on the same
    /// proposal so delegates with more than `MAX_DELEGATORS_PER_CALL`
    /// transitive followers can claim them in batches.
    /// @param id The proposal id.
    /// @param support Encrypted vote value (0 = against, 1 = for, 2 = abstain).
    /// @param inputProof ZK proof that `support` is a well-formed ciphertext.
    /// @param delegators Addresses whose votes the caller is claiming.
    function castVoteAsDelegate(
        uint256 id,
        externalEuint32 support,
        bytes calldata inputProof,
        address[] calldata delegators
    ) external onlyMember {
        Proposal storage p = _proposals[id];
        if (p.startBlock == 0) revert UnknownProposal();
        if (block.number > p.endBlock) revert VotingClosed();
        if (delegators.length > MAX_DELEGATORS_PER_CALL) revert TooManyDelegators();

        euint32 s = FHE.fromExternal(support, inputProof);
        (euint32 vFor, euint32 vAgainst, euint32 vAbstain) = _oneHot(s);

        // All delegators share the same per-proposal-per-call 1-hot vector;
        // granting the governor persistent permission once per bucket lets
        // the later override path call `FHE.sub` on that stored handle from
        // any delegator's slot.
        FHE.allowThis(vFor);
        FHE.allowThis(vAgainst);
        FHE.allowThis(vAbstain);

        for (uint256 i = 0; i < delegators.length; ++i) {
            address d = delegators[i];
            _validateDelegator(id, d);
            _credit(p, id, d, vFor, vAgainst, vAbstain);
            countedBy[id][d] = msg.sender;
            emit VoteCastViaDelegate(id, d, msg.sender);
        }

        _allowTallies(p);
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
    /// @return descriptionCid IPFS CID of the pinned proposal description.
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
            bool finalized,
            string memory descriptionCid
        )
    {
        Proposal storage p = _proposals[id];
        return (
            p.proposer,
            p.startBlock,
            p.endBlock,
            p.forVotes,
            p.againstVotes,
            p.abstainVotes,
            p.finalized,
            p.descriptionCid
        );
    }

    // -------- internal helpers --------

    function _oneHot(euint32 s) private returns (euint32 vFor, euint32 vAgainst, euint32 vAbstain) {
        euint32 one = FHE.asEuint32(1);
        euint32 zero = FHE.asEuint32(0);
        ebool isFor = FHE.eq(s, one);
        ebool isAgainst = FHE.eq(s, zero);
        // Anything that isn't FOR (1) or AGAINST (0) — the canonical abstain
        // value 2 OR any out-of-range value — buckets to abstain. Without this,
        // a delegate submitting an invalid `support` ciphertext would silently
        // null their followers' contributions while still locking them via
        // `countedBy`.
        ebool isAbstain = FHE.not(FHE.or(isFor, isAgainst));
        vFor = FHE.select(isFor, one, zero);
        vAgainst = FHE.select(isAgainst, one, zero);
        vAbstain = FHE.select(isAbstain, one, zero);
    }

    function _credit(
        Proposal storage p,
        uint256 id,
        address voter,
        euint32 vFor,
        euint32 vAgainst,
        euint32 vAbstain
    ) private {
        p.forVotes = FHE.add(p.forVotes, vFor);
        p.againstVotes = FHE.add(p.againstVotes, vAgainst);
        p.abstainVotes = FHE.add(p.abstainVotes, vAbstain);

        // Store the 1-hot vector for later reversal via `FHE.sub` if this
        // voter overrides. Permission on these handles is granted once per
        // batch by the caller (see `castVote` / `castVoteAsDelegate`).
        _voterVecFor[id][voter] = vFor;
        _voterVecAgainst[id][voter] = vAgainst;
        _voterVecAbstain[id][voter] = vAbstain;
    }

    function _validateDelegator(uint256 id, address d) private view {
        if (d == address(0) || d == msg.sender) revert InvalidDelegator(d);
        if (!LOCK.getHasValidKey(d)) revert InvalidDelegator(d);
        if (hasDirectlyVoted[id][d]) revert InvalidDelegator(d);
        if (countedBy[id][d] != address(0)) revert InvalidDelegator(d);
        if (DELEGATION.resolveTerminal(d, id) != msg.sender) revert InvalidDelegator(d);
    }

    function _allowTallies(Proposal storage p) private {
        FHE.allowThis(p.forVotes);
        FHE.allowThis(p.againstVotes);
        FHE.allowThis(p.abstainVotes);
    }
}
