// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @dev Minimal MiniStreak stand-in for StreakXP unit tests.
contract MockMiniStreak {
    uint256 public currentRoundId = 1;
    mapping(uint256 => mapping(address => bool)) public enteredOf;

    function setCurrentRoundId(uint256 id) external { currentRoundId = id; }
    function setEntered(uint256 roundId, address player, bool v) external {
        enteredOf[roundId][player] = v;
    }

    function getPlayerStats(uint256 roundId, address player)
        external
        view
        returns (uint8, uint32, uint16, uint8, bool, bool)
    {
        return (0, 0, 0, 0, false, enteredOf[roundId][player]);
    }
}
