// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MiniStreak
 * @notice Weekly transaction streak competition on Celo. Players pay 0.1 USDT to enter,
 *         maintain daily on-chain activity to build streaks, and win a share of the pot.
 * @dev Uses AccessControl for ORACLE_ROLE (StreakOracle) and KEEPER_ROLE (Chainlink Automation).
 *      All token amounts are in 6-decimal USDT (1_000_000 = 1 USDT).
 */
contract MiniStreak is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Roles ────────────────────────────────────────────────────────────────

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Entry fee in USDT (0.1 USDT = 100_000 with 6 decimals)
    uint256 public constant ENTRY_FEE = 100_000;

    /// @notice Protocol fee basis points (500 = 5%)
    uint256 public constant PROTOCOL_FEE_BPS = 500;

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice Minimum players required for a valid round
    uint256 public constant MIN_PLAYERS = 3;

    /// @notice Round duration in seconds (7 days)
    uint256 public constant ROUND_DURATION = 7 days;

    /// @notice Number of days in a round
    uint256 public constant DAYS_IN_ROUND = 7;

    // ─── Types ────────────────────────────────────────────────────────────────

    enum RoundStatus {
        Open,       // accepting entries, tracking streaks
        Closed,     // entry closed, awaiting resolution
        Resolved,   // payouts distributed
        Refunded    // <3 players — all fees returned
    }

    struct Round {
        uint256 startTime;
        uint256 endTime;
        uint256 pot;           // total USDT in pot (after entry fees accumulate)
        RoundStatus status;
        uint256 playerCount;
        address[3] winners;    // top 3 addresses (zero = no winner at that rank)
    }

    struct PlayerRecord {
        uint8 streak;          // current consecutive-day streak count
        uint8 lastValidDay;    // last day index (0-6); 255 = sentinel (no day submitted yet)
        uint32 txCount;        // cumulative transaction count this round
        uint16 uniqueToCount;  // unique "to" addresses interacted with
        bool claimed;          // refund claimed flag
        bool entered;          // has this player entered this round
    }

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice The USDT token contract
    IERC20 public immutable usdt;

    /// @notice Treasury address that receives the protocol fee
    address public treasury;

    /// @notice Current active round ID
    uint256 public currentRoundId;

    /// @notice roundId => Round
    mapping(uint256 => Round) public rounds;

    /// @notice roundId => list of player addresses
    mapping(uint256 => address[]) private roundPlayers;

    /// @notice roundId => player => PlayerRecord
    mapping(uint256 => mapping(address => PlayerRecord)) public playerRecords;

    // ─── Events ───────────────────────────────────────────────────────────────

    event PlayerEntered(uint256 indexed roundId, address indexed player, uint256 pot);
    event StreakRecorded(
        uint256 indexed roundId,
        address indexed player,
        uint8 dayIndex,
        uint32 txCount,
        uint16 uniqueToCount,
        uint8 newStreak
    );
    event RoundResolved(
        uint256 indexed roundId,
        address indexed first,
        address indexed second,
        address third,
        uint256 pot,
        uint256 protocolFee
    );
    event RoundRefunded(uint256 indexed roundId, uint256 playerCount, uint256 potReturned);
    event RefundClaimed(uint256 indexed roundId, address indexed player, uint256 amount);
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error AlreadyEntered();
    error RoundNotOpen();
    error RoundNotClosed();
    error RoundNotRefunded();
    error RoundAlreadyResolved();
    error NotRegistered();
    error InvalidDayIndex();
    error DayAlreadySubmitted();
    error RefundAlreadyClaimed();
    error TransferFailed();
    error InvalidTreasury();
    error InvalidRoundId();

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _usdt     Address of the USDT ERC-20 token
     * @param _treasury Address that receives the 5% protocol fee
     */
    constructor(address _usdt, address _treasury) {
        if (_usdt == address(0) || _treasury == address(0)) revert InvalidTreasury();

        usdt = IERC20(_usdt);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(KEEPER_ROLE, msg.sender); // owner can also resolve

        // Start round 1 immediately
        _startNewRound();
    }

    // ─── Player Actions ───────────────────────────────────────────────────────

    /**
     * @notice Enter the current round by paying 0.1 USDT entry fee.
     * @dev Caller must have approved this contract to spend 0.1 USDT before calling.
     * @param roundId The round to enter (must equal currentRoundId and be Open)
     */
    function enterRound(uint256 roundId) external nonReentrant whenNotPaused {
        if (roundId != currentRoundId) revert InvalidRoundId();

        Round storage round = rounds[roundId];
        if (round.status != RoundStatus.Open) revert RoundNotOpen();
        if (block.timestamp >= round.endTime) revert RoundNotOpen();

        PlayerRecord storage record = playerRecords[roundId][msg.sender];
        if (record.entered) revert AlreadyEntered();

        // Transfer 0.1 USDT from player to this contract
        usdt.safeTransferFrom(msg.sender, address(this), ENTRY_FEE);

        record.entered = true;
        record.txCount = 1;
        record.lastValidDay = 255; // sentinel: no day submitted yet

        round.pot += ENTRY_FEE;
        round.playerCount++;
        roundPlayers[roundId].push(msg.sender);

        emit PlayerEntered(roundId, msg.sender, round.pot);
    }

    /**
     * @notice Claim a refund for a refunded round (fewer than 3 players).
     * @param roundId The refunded round ID
     */
    function claimRefund(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];
        if (round.status != RoundStatus.Refunded) revert RoundNotRefunded();

        PlayerRecord storage record = playerRecords[roundId][msg.sender];
        if (!record.entered) revert NotRegistered();
        if (record.claimed) revert RefundAlreadyClaimed();

        record.claimed = true;
        usdt.safeTransfer(msg.sender, ENTRY_FEE);

        emit RefundClaimed(roundId, msg.sender, ENTRY_FEE);
    }

    // ─── Oracle Functions ─────────────────────────────────────────────────────

    /**
     * @notice Record a validated streak transaction for a player.
     * @dev Only callable by addresses with ORACLE_ROLE (the StreakOracle contract).
     *      Rate-limiting (one per day per player) is enforced here as well as in StreakOracle.
     * @param player        The player's wallet address
     * @param roundId       The round this streak belongs to
     * @param dayIndex      Day number within the round (0 = Monday, 6 = Sunday)
     * @param txCount       The number of qualifying transactions for this day
     * @param uniqueToCount The number of unique "to" addresses interacted with
     */
    function recordStreak(
        address player,
        uint256 roundId,
        uint8 dayIndex,
        uint32 txCount,
        uint16 uniqueToCount
    ) external onlyRole(ORACLE_ROLE) {
        if (dayIndex >= DAYS_IN_ROUND) revert InvalidDayIndex();

        Round storage round = rounds[roundId];
        if (round.status == RoundStatus.Resolved || round.status == RoundStatus.Refunded) {
            revert RoundAlreadyResolved();
        }

        PlayerRecord storage record = playerRecords[roundId][player];
        if (!record.entered) revert NotRegistered();

        if (record.lastValidDay == dayIndex) revert DayAlreadySubmitted();

        if (record.lastValidDay == 255) {
            record.streak = 1;
        } else if (dayIndex == record.lastValidDay + 1) {
            record.streak++;
        } else {
            record.streak = 1;
        }

        record.lastValidDay = dayIndex;
        record.txCount += txCount;
        record.uniqueToCount += uniqueToCount;

        emit StreakRecorded(roundId, player, dayIndex, txCount, uniqueToCount, record.streak);
    }

    // ─── Keeper / Resolution ──────────────────────────────────────────────────

    /**
     * @notice Resolve the round: compute rankings, distribute payouts, start next round.
     * @dev Callable by KEEPER_ROLE (Chainlink Automation) or DEFAULT_ADMIN_ROLE (owner).
     *      Should be called after round.endTime has passed.
     * @param roundId The round to resolve
     */
    function resolveRound(uint256 roundId) external nonReentrant {
        if (
            !hasRole(KEEPER_ROLE, msg.sender) &&
            !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)
        ) revert AccessControlUnauthorizedAccount(msg.sender, KEEPER_ROLE);

        Round storage round = rounds[roundId];
        if (round.status != RoundStatus.Open && round.status != RoundStatus.Closed) {
            revert RoundAlreadyResolved();
        }
        // Mark closed first to prevent reentrant resolution calls
        round.status = RoundStatus.Closed;

        address[] storage players = roundPlayers[roundId];

        // If fewer than MIN_PLAYERS — refund everyone
        if (players.length < MIN_PLAYERS) {
            round.status = RoundStatus.Refunded;
            emit RoundRefunded(roundId, players.length, round.pot);
            _startNewRound();
            return;
        }

        // Sort players by (streak DESC, txCount DESC, uniqueToCount DESC) to find top 3
        (address first, address second, address third) = _rankTop3(roundId, players);

        // Calculate protocol fee
        uint256 protocolFee = (round.pot * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 distributable = round.pot - protocolFee;

        round.status = RoundStatus.Resolved;
        round.winners = [first, second, third];

        // Transfer protocol fee to treasury
        if (protocolFee > 0) {
            usdt.safeTransfer(treasury, protocolFee);
        }

        // Distribute payouts based on how many real winners we have
        _distributePrizes(distributable, first, second, third);

        emit RoundResolved(roundId, first, second, third, round.pot, protocolFee);

        // Start the next round
        _startNewRound();
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    /**
     * @notice Get all players registered in a round.
     */
    function getRoundPlayers(uint256 roundId) external view returns (address[] memory) {
        return roundPlayers[roundId];
    }

    /**
     * @notice Get a player's stats for a specific round.
     */
    function getPlayerStats(
        uint256 roundId,
        address player
    )
        external
        view
        returns (
            uint8 streak,
            uint32 txCount,
            uint16 uniqueToCount,
            uint8 lastValidDay,
            bool claimed,
            bool entered
        )
    {
        PlayerRecord storage r = playerRecords[roundId][player];
        return (r.streak, r.txCount, r.uniqueToCount, r.lastValidDay, r.claimed, r.entered);
    }

    /**
     * @notice Get the current active round ID.
     */
    function getCurrentRoundId() external view returns (uint256) {
        return currentRoundId;
    }

    /**
     * @notice Get the status of a round.
     */
    function getRoundStatus(uint256 roundId) external view returns (RoundStatus) {
        return rounds[roundId].status;
    }

    /**
     * @notice Returns a sorted leaderboard for the given round.
     * @return addresses      Sorted player addresses (highest rank first)
     * @return streaks        Corresponding streak counts
     * @return txCounts       Corresponding cumulative transaction counts
     * @return uniqueToCounts Corresponding unique "to" address counts
     * @return ranks          1-based rank numbers
     */
    function getLeaderboard(
        uint256 roundId
    )
        external
        view
        returns (
            address[] memory addresses,
            uint8[] memory streaks,
            uint32[] memory txCounts,
            uint16[] memory uniqueToCounts,
            uint256[] memory ranks
        )
    {
        address[] storage players = roundPlayers[roundId];
        uint256 n = players.length;

        addresses = new address[](n);
        streaks = new uint8[](n);
        txCounts = new uint32[](n);
        uniqueToCounts = new uint16[](n);
        ranks = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            addresses[i] = players[i];
            PlayerRecord storage r = playerRecords[roundId][players[i]];
            streaks[i] = r.streak;
            txCounts[i] = r.txCount;
            uniqueToCounts[i] = r.uniqueToCount;
        }

        for (uint256 i = 1; i < n; i++) {
            for (uint256 j = i; j > 0; j--) {
                if (_isBetter(streaks[j], txCounts[j], uniqueToCounts[j], streaks[j - 1], txCounts[j - 1], uniqueToCounts[j - 1])) {
                    (addresses[j], addresses[j - 1]) = (addresses[j - 1], addresses[j]);
                    (streaks[j], streaks[j - 1]) = (streaks[j - 1], streaks[j]);
                    (txCounts[j], txCounts[j - 1]) = (txCounts[j - 1], txCounts[j]);
                    (uniqueToCounts[j], uniqueToCounts[j - 1]) = (uniqueToCounts[j - 1], uniqueToCounts[j]);
                } else {
                    break;
                }
            }
        }

        uint256 currentRank = 1;
        for (uint256 i = 0; i < n; i++) {
            if (
                i > 0 &&
                streaks[i] == streaks[i - 1] &&
                txCounts[i] == txCounts[i - 1] &&
                uniqueToCounts[i] == uniqueToCounts[i - 1]
            ) {
                ranks[i] = ranks[i - 1];
            } else {
                ranks[i] = currentRank;
            }
            currentRank++;
        }

        return (addresses, streaks, txCounts, uniqueToCounts, ranks);
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────

    /**
     * @notice Update the treasury address.
     */
    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_treasury == address(0)) revert InvalidTreasury();
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    /**
     * @notice Pause the contract (emergency stop).
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    /**
     * @dev Start a new round. Called after construction and after each resolution.
     */
    function _startNewRound() internal {
        currentRoundId++;
        uint256 start = block.timestamp;
        uint256 end = start + ROUND_DURATION;

        rounds[currentRoundId] = Round({
            startTime: start,
            endTime: end,
            pot: 0,
            status: RoundStatus.Open,
            playerCount: 0,
            winners: [address(0), address(0), address(0)]
        });

        emit RoundStarted(currentRoundId, start, end);
    }

    /**
     * @dev Returns true if player A is ranked higher than player B.
     *      Primary sort: streak (higher wins). Tiebreaker 1: txCount (higher wins).
     *      Tiebreaker 2: uniqueToCount (higher wins).
     */
    function _isBetter(
        uint8 streakA,
        uint32 txCountA,
        uint16 uniqueToA,
        uint8 streakB,
        uint32 txCountB,
        uint16 uniqueToB
    ) internal pure returns (bool) {
        if (streakA != streakB) return streakA > streakB;
        if (txCountA != txCountB) return txCountA > txCountB;
        return uniqueToA > uniqueToB;
    }

    /**
     * @dev Find the top 3 players by (streak DESC, txCount DESC, uniqueToCount DESC).
     *      Returns address(0) for unfilled positions.
     */
    function _rankTop3(
        uint256 roundId,
        address[] storage players
    )
        internal
        view
        returns (
            address first,
            address second,
            address third
        )
    {
        uint256 n = players.length;

        uint8 s1; uint32 t1; uint16 u1;
        uint8 s2; uint32 t2; uint16 u2;
        uint8 s3; uint32 t3; uint16 u3;

        for (uint256 i = 0; i < n; i++) {
            address p = players[i];
            PlayerRecord storage rec = playerRecords[roundId][p];
            uint8 s = rec.streak;
            uint32 t = rec.txCount;
            uint16 u = rec.uniqueToCount;

            if (_isBetter(s, t, u, s1, t1, u1)) {
                third = second; s3 = s2; t3 = t2; u3 = u2;
                second = first; s2 = s1; t2 = t1; u2 = u1;
                first = p; s1 = s; t1 = t; u1 = u;
            } else if (_isBetter(s, t, u, s2, t2, u2)) {
                third = second; s3 = s2; t3 = t2; u3 = u2;
                second = p; s2 = s; t2 = t; u2 = u;
            } else if (_isBetter(s, t, u, s3, t3, u3)) {
                third = p; s3 = s; t3 = t; u3 = u;
            }
        }

        return (first, second, third);
    }

    /**
     * @dev Distribute prizes. Handles cases where 2nd and/or 3rd place are address(0)
     *      by redistributing proportionally.
     *
     *      Normal split (3 winners):  1st=50%, 2nd=30%, 3rd=20%
     *      2 winners:                 1st=62.5% (50/80 of pot), 2nd=37.5% (30/80)
     *      1 winner:                  1st=100%
     */
    function _distributePrizes(
        uint256 pot,
        address first,
        address second,
        address third
    ) internal {
        if (first == address(0)) return; // no players at all (impossible if MIN_PLAYERS enforced)

        bool hasSecond = second != address(0);
        bool hasThird = third != address(0);

        if (hasSecond && hasThird) {
            // Full 3-way split: 50% / 30% / 20%
            usdt.safeTransfer(first, (pot * 50) / 100);
            usdt.safeTransfer(second, (pot * 30) / 100);
            usdt.safeTransfer(third, (pot * 20) / 100);
        } else if (hasSecond) {
            // 2-way split: 50/80 and 30/80 (proportional)
            usdt.safeTransfer(first, (pot * 625) / 1000);
            usdt.safeTransfer(second, (pot * 375) / 1000);
        } else {
            // Only 1 winner — gets everything
            usdt.safeTransfer(first, pot);
        }
    }
}
