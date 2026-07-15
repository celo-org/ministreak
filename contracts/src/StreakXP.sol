// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IMiniStreak {
    function currentRoundId() external view returns (uint256);
    function getPlayerStats(uint256 roundId, address player)
        external
        view
        returns (
            uint8 streak,
            uint32 txCount,
            uint16 uniqueToCount,
            uint8 lastValidDay,
            bool claimed,
            bool entered
        );
}

/// @title StreakXP — soulbound, daily-claimable XP for MiniStreak.
/// @notice Entered players claim a flat XP amount once per UTC calendar day.
///         XP is a non-transferable counter; it drives levels/freeze grants
///         off-chain and carries no pot-ranking weight.
contract StreakXP is Ownable {
    IMiniStreak public immutable vault;

    /// @notice Flat XP granted per daily claim.
    uint256 public dailyXp = 10;

    /// @notice Cumulative XP per player.
    mapping(address => uint256) public xp;

    /// @notice Last UTC day index (block.timestamp / 1 days) a player claimed.
    mapping(address => uint32) public lastClaimDay;

    event Claimed(address indexed player, uint32 indexed dayIndex, uint256 amount, uint256 newTotal);
    event DailyXpSet(uint256 dailyXp);

    error NotEntered();
    error AlreadyClaimedToday();

    constructor(address vault_) Ownable(msg.sender) {
        vault = IMiniStreak(vault_);
    }

    /// @notice Claim today's XP. Reverts if the caller is not entered in the
    ///         current round, or has already claimed during this UTC day.
    function claimDaily() external {
        uint256 roundId = vault.currentRoundId();
        (, , , , , bool entered) = vault.getPlayerStats(roundId, msg.sender);
        if (!entered) revert NotEntered();

        uint32 today = uint32(block.timestamp / 1 days);
        if (lastClaimDay[msg.sender] >= today) revert AlreadyClaimedToday();

        lastClaimDay[msg.sender] = today;
        uint256 newTotal = xp[msg.sender] + dailyXp;
        xp[msg.sender] = newTotal;
        emit Claimed(msg.sender, today, dailyXp, newTotal);
    }

    /// @notice True iff `player` is entered in the current round and has not
    ///         yet claimed during this UTC day.
    function canClaim(address player) external view returns (bool) {
        uint256 roundId = vault.currentRoundId();
        (, , , , , bool entered) = vault.getPlayerStats(roundId, player);
        if (!entered) return false;
        return lastClaimDay[player] < uint32(block.timestamp / 1 days);
    }

    function setDailyXp(uint256 dailyXp_) external onlyOwner {
        dailyXp = dailyXp_;
        emit DailyXpSet(dailyXp_);
    }
}
