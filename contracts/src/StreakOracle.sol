// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

// ─── Interface ────────────────────────────────────────────────────────────────

interface IMiniStreak {
    function recordStreak(
        address player,
        uint256 roundId,
        uint8 dayIndex,
        uint32 txCount,
        uint16 uniqueToCount
    ) external;

    function playerRecords(
        uint256 roundId,
        address player
    )
        external
        view
        returns (
            uint8 streak,
            uint8 lastValidDay,
            uint32 txCount,
            uint16 uniqueToCount,
            bool claimed,
            bool entered
        );
}

/**
 * @title StreakOracle
 * @notice Off-chain data bridge that accepts validated streak proofs from a
 *         trusted backend hot wallet and forwards them to MiniStreak.
 * @dev The trusted submitter is a hot wallet controlled by the oracle service.
 *      Validation rules enforced here:
 *        1. Player must be registered in the round (checked via vault call)
 *        2. dayIndex must be 0-6 (within round window)
 *        3. Max 1 submission per player per day per round (rate limiting)
 */
contract StreakOracle is Ownable {

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Days per round
    uint256 public constant DAYS_IN_ROUND = 7;

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice The MiniStreak contract this oracle feeds into
    IMiniStreak public vault;

    /// @notice The trusted hot wallet address allowed to submit streak proofs
    address public trustedSubmitter;

    /// @notice roundId => player => dayIndex => submitted
    /// @dev Rate limiting: prevents duplicate submissions for the same (player, round, day)
    mapping(uint256 => mapping(address => mapping(uint256 => bool))) public submitted;

    // ─── Events ───────────────────────────────────────────────────────────────

    event StreakSubmitted(
        address indexed player,
        uint256 indexed roundId,
        uint8 dayIndex,
        uint32 txCount,
        uint16 uniqueToCount
    );
    event SubmitterUpdated(address indexed oldSubmitter, address indexed newSubmitter);
    event VaultUpdated(address indexed oldVault, address indexed newVault);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error Unauthorized();
    error InvalidDayIndex(uint256 dayIndex);
    error AlreadySubmitted(address player, uint256 roundId, uint256 dayIndex);
    error PlayerNotRegistered(address player, uint256 roundId);
    error InvalidAddress();

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _vault            The MiniStreak contract address
     * @param _trustedSubmitter The backend oracle hot wallet address
     */
    constructor(address _vault, address _trustedSubmitter) Ownable(msg.sender) {
        if (_vault == address(0) || _trustedSubmitter == address(0)) revert InvalidAddress();
        vault = IMiniStreak(_vault);
        trustedSubmitter = _trustedSubmitter;
    }

    // ─── Submission ───────────────────────────────────────────────────────────

    /**
     * @notice Submit a validated streak proof for a player.
     * @dev Only callable by the trusted submitter hot wallet.
     *
     * Validation:
     *   - Caller must be trustedSubmitter
     *   - dayIndex must be 0–6
     *   - No prior submission for this (player, round, day)
     *   - Player must be registered in the round (checked via vault)
     *
     * @param player         The player's wallet address
     * @param roundId        The round this streak belongs to
     * @param dayIndex       Day within the round (0 = first day, 6 = last day)
     * @param txCount        Number of qualifying transactions for this day
     * @param uniqueToCount  Number of unique recipient addresses for this day
     */
    function submitStreak(
        address player,
        uint256 roundId,
        uint8 dayIndex,
        uint32 txCount,
        uint16 uniqueToCount
    ) external {
        if (msg.sender != trustedSubmitter) revert Unauthorized();
        if (dayIndex >= DAYS_IN_ROUND) revert InvalidDayIndex(dayIndex);
        if (submitted[roundId][player][dayIndex]) {
            revert AlreadySubmitted(player, roundId, dayIndex);
        }

        (, , , , , bool entered) = vault.playerRecords(roundId, player);
        if (!entered) revert PlayerNotRegistered(player, roundId);

        submitted[roundId][player][dayIndex] = true;

        vault.recordStreak(player, roundId, dayIndex, txCount, uniqueToCount);

        emit StreakSubmitted(player, roundId, dayIndex, txCount, uniqueToCount);
    }

    /**
     * @notice Batch submit multiple streak proofs in one tx.
     * @dev Useful for backfilling or catching up on multiple players at once.
     *      Any individual submission that would revert is skipped (continues).
     *      Emits StreakSubmitted only for successful entries.
     *
     * @param players         Array of player addresses
     * @param roundIds        Array of round IDs
     * @param dayIndexes      Array of day indexes
     * @param txCounts        Array of qualifying transaction counts
     * @param uniqueToCounts  Array of unique recipient counts
     */
    function batchSubmitStreaks(
        address[] calldata players,
        uint256[] calldata roundIds,
        uint8[] calldata dayIndexes,
        uint32[] calldata txCounts,
        uint16[] calldata uniqueToCounts
    ) external {
        if (msg.sender != trustedSubmitter) revert Unauthorized();

        uint256 n = players.length;
        require(
            roundIds.length == n && dayIndexes.length == n && txCounts.length == n && uniqueToCounts.length == n,
            "Array length mismatch"
        );

        for (uint256 i = 0; i < n; i++) {
            address player = players[i];
            uint256 roundId = roundIds[i];
            uint8 dayIndex = dayIndexes[i];
            uint32 txCount = txCounts[i];
            uint16 uniqueToCount = uniqueToCounts[i];

            if (dayIndex >= DAYS_IN_ROUND) continue;
            if (submitted[roundId][player][dayIndex]) continue;

            (, , , , , bool entered) = vault.playerRecords(roundId, player);
            if (!entered) continue;

            submitted[roundId][player][dayIndex] = true;

            try vault.recordStreak(player, roundId, dayIndex, txCount, uniqueToCount) {
                emit StreakSubmitted(player, roundId, dayIndex, txCount, uniqueToCount);
            } catch {
                submitted[roundId][player][dayIndex] = false;
            }
        }
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /**
     * @notice Update the trusted submitter hot wallet.
     * @param _submitter New submitter address
     */
    function setTrustedSubmitter(address _submitter) external onlyOwner {
        if (_submitter == address(0)) revert InvalidAddress();
        emit SubmitterUpdated(trustedSubmitter, _submitter);
        trustedSubmitter = _submitter;
    }

    /**
     * @notice Update the vault address.
     * @param _vault New vault contract address
     */
    function setVault(address _vault) external onlyOwner {
        if (_vault == address(0)) revert InvalidAddress();
        emit VaultUpdated(address(vault), _vault);
        vault = IMiniStreak(_vault);
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /**
     * @notice Check if a streak has already been submitted for a given day.
     * @param player    Player address
     * @param roundId   Round ID
     * @param dayIndex  Day index (0-6)
     * @return True if already submitted
     */
    function isSubmitted(
        address player,
        uint256 roundId,
        uint256 dayIndex
    ) external view returns (bool) {
        return submitted[roundId][player][dayIndex];
    }
}
