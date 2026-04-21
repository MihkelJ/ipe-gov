// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only stand-in for Unlock Protocol's PublicLock.
contract MockPublicLock {
    mapping(address => bool) public valid;

    function grant(address who) external {
        valid[who] = true;
    }

    function revoke(address who) external {
        valid[who] = false;
    }

    function getHasValidKey(address who) external view returns (bool) {
        return valid[who];
    }
}
