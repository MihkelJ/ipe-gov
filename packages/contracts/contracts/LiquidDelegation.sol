// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPublicLockV15} from "@unlock-protocol/contracts/dist/PublicLock/IPublicLockV15.sol";

/// @title LiquidDelegation
/// @author ipe-gov
/// @notice Per-proposal, revocable, transitive vote delegation for Unlock-gated
/// governance. Delegation graph is public in this v1; votes themselves remain
/// encrypted on the governor contract.
contract LiquidDelegation {
    /// @notice Unlock Protocol PublicLock used for membership checks.
    IPublicLockV15 public immutable LOCK;

    /// @notice Maximum chain length walked by `resolveTerminal` / cycle checks
    /// and respected by the governor when it resolves delegations. Bounds gas.
    uint256 public constant MAX_CHAIN_DEPTH = 16;

    /// @notice `delegateOf[voter][proposalId]` is who `voter` delegates to for
    /// that proposal (address(0) if not delegating).
    mapping(address voter => mapping(uint256 proposalId => address delegatee)) public delegateOf;

    /// @dev Reverse index: `_delegators[delegatee][proposalId]` lists everyone
    /// currently delegating to `delegatee` on that proposal.
    mapping(address delegatee => mapping(uint256 proposalId => address[] delegators)) private _delegators;

    /// @dev 1-based index into `_delegators` for O(1) removal.
    mapping(address delegatee => mapping(uint256 proposalId => mapping(address voter => uint256 index1)))
        private _delegatorIndex;

    /// @notice Emitted when a voter sets or changes their delegate for a proposal.
    /// @param voter Address whose delegation was updated.
    /// @param proposalId The proposal this delegation applies to.
    /// @param to The new delegate.
    /// @param from The previous delegate (address(0) if none).
    event Delegated(address indexed voter, uint256 indexed proposalId, address indexed to, address from);

    /// @notice Emitted when a voter revokes their delegation for a proposal.
    /// @param voter Address whose delegation was cleared.
    /// @param proposalId The proposal the delegation was cleared on.
    /// @param from The previous delegate.
    event Undelegated(address indexed voter, uint256 indexed proposalId, address indexed from);

    /// @notice Caller is not a valid Unlock key holder.
    error NotMember();
    /// @notice Target delegate is invalid (self, zero, or non-member).
    error InvalidDelegate();
    /// @notice Delegation would create a cycle.
    error DelegationCycle();
    /// @notice Delegation would push the chain past `MAX_CHAIN_DEPTH`.
    error ChainTooDeep();

    modifier onlyMember() {
        if (!LOCK.getHasValidKey(msg.sender)) revert NotMember();
        _;
    }

    /// @notice Deploys the delegation registry bound to an Unlock PublicLock.
    /// @param lockAddress Address of the Unlock Protocol lock granting membership.
    constructor(address lockAddress) {
        LOCK = IPublicLockV15(lockAddress);
    }

    /// @notice Set `to` as the caller's delegate on `proposalId`. Overwrites
    /// any existing delegation for this proposal.
    /// @param proposalId The proposal whose vote is being delegated.
    /// @param to The intended delegate. Must be a current Unlock key holder,
    /// distinct from the caller, and must not create a cycle.
    function delegate(uint256 proposalId, address to) external onlyMember {
        if (to == address(0) || to == msg.sender) revert InvalidDelegate();
        if (!LOCK.getHasValidKey(to)) revert InvalidDelegate();

        _checkChain(proposalId, to);

        address previous = delegateOf[msg.sender][proposalId];
        if (previous == to) return;
        if (previous != address(0)) _removeFromReverseIndex(previous, proposalId, msg.sender);

        delegateOf[msg.sender][proposalId] = to;
        _delegators[to][proposalId].push(msg.sender);
        _delegatorIndex[to][proposalId][msg.sender] = _delegators[to][proposalId].length;

        emit Delegated(msg.sender, proposalId, to, previous);
    }

    /// @dev Walk `to`'s chain, rejecting both cycles back to the caller and
    /// chains that would grow beyond what `resolveTerminal` can traverse
    /// (`MAX_CHAIN_DEPTH` iterations). Prepending caller adds one hop, so
    /// `to`'s chain must terminate within `MAX_CHAIN_DEPTH - 1` follows.
    function _checkChain(uint256 proposalId, address to) private view {
        address cursor = to;
        for (uint256 i = 0; i < MAX_CHAIN_DEPTH - 1; ++i) {
            address next = delegateOf[cursor][proposalId];
            if (next == address(0)) return;
            if (next == msg.sender) revert DelegationCycle();
            cursor = next;
        }
        revert ChainTooDeep();
    }

    /// @notice Clear the caller's delegation for `proposalId`, if any.
    /// @param proposalId The proposal to clear the delegation on.
    function undelegate(uint256 proposalId) external {
        address previous = delegateOf[msg.sender][proposalId];
        if (previous == address(0)) return;

        delete delegateOf[msg.sender][proposalId];
        _removeFromReverseIndex(previous, proposalId, msg.sender);

        emit Undelegated(msg.sender, proposalId, previous);
    }

    /// @notice Direct delegators of `delegatee` for a proposal (one hop, no
    /// membership filtering). The governor is expected to filter by membership
    /// and chain resolution at vote time.
    /// @param delegatee Address receiving the delegations.
    /// @param proposalId The proposal to query.
    /// @return List of addresses that directly delegate to `delegatee`.
    function delegatorsOf(address delegatee, uint256 proposalId) external view returns (address[] memory) {
        return _delegators[delegatee][proposalId];
    }

    /// @notice Walk `voter`'s delegation chain up to `MAX_CHAIN_DEPTH` and
    /// return the terminal (last) address. Returns `voter` itself when `voter`
    /// has no delegation. Returns `address(0)` when the chain exceeds
    /// `MAX_CHAIN_DEPTH` — callers MUST treat this as an invalid delegation
    /// rather than assume the last-seen cursor is the terminal (otherwise a
    /// position-16 node could falsely claim downstream delegators).
    /// @param voter Address to start the walk from.
    /// @param proposalId The proposal to resolve the chain on.
    /// @return Terminal address of the chain, or `address(0)` on over-depth.
    function resolveTerminal(address voter, uint256 proposalId) public view returns (address) {
        address cursor = voter;
        for (uint256 i = 0; i < MAX_CHAIN_DEPTH; ++i) {
            address next = delegateOf[cursor][proposalId];
            if (next == address(0)) return cursor;
            cursor = next;
        }
        return address(0);
    }

    /// @notice Count members whose delegation chain resolves to `delegatee`
    /// on `proposalId`. Excludes `delegatee` itself. Non-members (lost keys)
    /// are skipped. Bounded BFS capped at `maxNodes` to keep gas predictable.
    /// @param delegatee Address receiving (transitive) delegations.
    /// @param proposalId The proposal to query.
    /// @param maxNodes Maximum number of nodes to enumerate.
    /// @return Number of valid transitive delegators (up to `maxNodes`).
    function countTransitive(address delegatee, uint256 proposalId, uint256 maxNodes) external view returns (uint256) {
        return collectTransitive(delegatee, proposalId, maxNodes).length;
    }

    /// @notice Enumerate transitive delegators whose chain terminates at
    /// `delegatee` on `proposalId`. BFS bounded by `maxNodes` (both queue and
    /// output). Filters out addresses that no longer hold a valid key.
    /// @param delegatee Address receiving (transitive) delegations.
    /// @param proposalId The proposal to query.
    /// @param maxNodes Maximum number of nodes to enumerate.
    /// @return out Array of transitive delegators (may be shorter than `maxNodes`).
    function collectTransitive(
        address delegatee,
        uint256 proposalId,
        uint256 maxNodes
    ) public view returns (address[] memory out) {
        if (maxNodes == 0) return new address[](0);

        address[] memory buffer = new address[](maxNodes);
        uint256 count;

        address[] memory layer = _delegators[delegatee][proposalId];
        uint256 depth;

        while (layer.length > 0 && depth < MAX_CHAIN_DEPTH && count < maxNodes) {
            uint256 nextCountEstimate;
            for (uint256 i = 0; i < layer.length; ++i) {
                nextCountEstimate += _delegators[layer[i]][proposalId].length;
            }
            address[] memory nextLayer = new address[](nextCountEstimate);
            uint256 nextIdx;

            for (uint256 i = 0; i < layer.length && count < maxNodes; ++i) {
                address v = layer[i];
                if (LOCK.getHasValidKey(v)) {
                    buffer[count] = v;
                    ++count;
                }
                address[] memory children = _delegators[v][proposalId];
                for (uint256 j = 0; j < children.length; ++j) {
                    nextLayer[nextIdx] = children[j];
                    ++nextIdx;
                }
            }
            // If the `count < maxNodes` guard cut the inner loop short, the
            // trailing slots of `nextLayer` are zero-addresses — truncate so
            // the next iteration doesn't walk them.
            // solhint-disable-next-line no-inline-assembly
            assembly {
                mstore(nextLayer, nextIdx)
            }
            layer = nextLayer;
            ++depth;
        }

        out = new address[](count);
        for (uint256 i = 0; i < count; ++i) out[i] = buffer[i];
    }

    function _removeFromReverseIndex(address delegatee, uint256 proposalId, address voter) private {
        address[] storage arr = _delegators[delegatee][proposalId];
        uint256 idx1 = _delegatorIndex[delegatee][proposalId][voter];
        if (idx1 == 0) return;
        uint256 idx = idx1 - 1;
        uint256 lastIdx = arr.length - 1;
        if (idx != lastIdx) {
            address moved = arr[lastIdx];
            arr[idx] = moved;
            _delegatorIndex[delegatee][proposalId][moved] = idx + 1;
        }
        arr.pop();
        delete _delegatorIndex[delegatee][proposalId][voter];
    }
}
