# MiniStreak — How the game works currently

Reference for the live contracts on Celo mainnet plus the off-chain oracle service that powers streak tracking. Source: `contracts/src/MiniStreak.sol`, `contracts/src/StreakOracle.sol`, `oracle-service/src/*`.

## Deployments

| Network | Contract | Address |
|---|---|---|
| Celo Mainnet (42220) | MiniStreak | `0xcd125da0EC85c8414D39fa94011b607C2A5f17e5` |
| Celo Mainnet (42220) | StreakOracle | `0x2c08420187F96a69E0aB64a1507282786E4f474e` |


## Game rules

| Rule | Value |
|---|---|
| Token | USDT (6 decimals) |
| Entry fee | 0.10 USDT (`100_000`) |
| Round window | 7 days (Monday 00:00 → Sunday 23:59 UTC) |
| Qualifying daily activity | Any outgoing tx (not a self-send), one per UTC day |
| Streak math | +1 per consecutive day; reset to 1 on a skip |
| Ranking | streak desc → txCount desc → uniqueToCount desc |
| Min players for payout | 3 (else refund) |
| Protocol fee | 5% of pot to treasury |
| Payout split (3 winners) | 50 / 30 / 20 |


## `MiniStreak.sol` — the vault

`AccessControl + Pausable + ReentrancyGuard + SafeERC20`. Holds USDT, tracks state, computes payouts.

**Roles**
- `DEFAULT_ADMIN_ROLE` — deployer. Manages roles, treasury, pause, resolution.
- `KEEPER_ROLE` — granted to deployer at construction (Chainlink Automation slot; unused in production).
- `ORACLE_ROLE` — granted to `StreakOracle`. The only path to `recordStreak`.

**Constants**
- `ENTRY_FEE = 100_000`
- `PROTOCOL_FEE_BPS = 500`
- `BPS_DENOMINATOR = 10_000`
- `MIN_PLAYERS = 3`
- `ROUND_DURATION = 7 days`
- `DAYS_IN_ROUND = 7`

**Types**
```solidity
enum RoundStatus { Open, Closed, Resolved, Refunded }

struct Round {
    uint256 startTime;
    uint256 endTime;
    uint256 pot;
    RoundStatus status;
    uint256 playerCount;
    address[3] winners;
}

struct PlayerRecord {
    uint8  streak;
    uint8  lastValidDay;   // 0-6; 255 sentinel = none yet
    uint32 txCount;
    uint16 uniqueToCount;
    bool   claimed;        // refund-claimed flag
    bool   entered;
}
```

**Storage**
- `IERC20 public immutable usdt;`
- `address public treasury;`
- `uint256 public currentRoundId;`
- `mapping(uint256 => Round) public rounds;`
- `mapping(uint256 => address[]) private roundPlayers;`
- `mapping(uint256 => mapping(address => PlayerRecord)) public playerRecords;`

**Constructor**
Grants admin + keeper roles to deployer, stores USDT and treasury, calls `_startNewRound()` so round 1 is Open immediately.

### Functions

**`enterRound(uint256 roundId)`**
- Caller pre-approves `ENTRY_FEE` USDT to the vault.
- Reverts if `roundId != currentRoundId`, status ≠ `Open`, past `endTime`, or already entered.
- `safeTransferFrom` 0.10 USDT → vault.
- Sets `entered = true`, `txCount = 1` (the entry tx counts), `lastValidDay = 255`.
- Increments `pot`, `playerCount`. Appends to `roundPlayers[roundId]`.
- Emits `PlayerEntered(roundId, player, pot)`.

**`recordStreak(player, roundId, dayIndex, txCount, uniqueToCount)`**
- `ORACLE_ROLE` only.
- Reverts if `dayIndex >= 7`, status is `Resolved`/`Refunded`, player not `entered`, or `lastValidDay == dayIndex` (same-day re-submit).
- Streak math:
  - `lastValidDay == 255` → `streak = 1`
  - `dayIndex == lastValidDay + 1` → `streak++`
  - Otherwise → `streak = 1` (skip resets)
- Updates `lastValidDay`, adds `txCount`, adds `uniqueToCount`.
- Emits `StreakRecorded(roundId, player, dayIndex, txCount, uniqueToCount, newStreak)`.

**`resolveRound(uint256 roundId)`**
- Permission: `KEEPER_ROLE` OR `DEFAULT_ADMIN_ROLE`. Not permissionless.
- Reverts if status is not `Open`/`Closed`. Sets status to `Closed` immediately as a reentrancy guard.
- If `roundPlayers[roundId].length < MIN_PLAYERS`: sets status to `Refunded`, emits `RoundRefunded`, calls `_startNewRound()`, returns. **Players must call `claimRefund(roundId)` to recover their USDT** — no push.
- Otherwise:
  - `_rankTop3` finds the top 3 by (streak desc, txCount desc, uniqueToCount desc).
  - `protocolFee = pot * 500 / 10000` → `safeTransfer` to treasury.
  - `distributable = pot - protocolFee` → `_distributePrizes`:
    - 3 winners: 50 / 30 / 20.
    - 2 winners: 62.5 / 37.5.
    - 1 winner: 100.
  - Sets status to `Resolved`, fills `winners[3]`.
  - Emits `RoundResolved(roundId, first, second, third, pot, protocolFee)`.
- Calls `_startNewRound()` in both paths.

**`claimRefund(uint256 roundId)`**
- Only when status is `Refunded` and `record.claimed == false`.
- `safeTransfer` `ENTRY_FEE` back to caller. Sets `claimed = true`.
- Emits `RefundClaimed(roundId, player, amount)`.

**Admin**
- `setTreasury(address)` — admin only; reverts on zero address.
- `pause()` / `unpause()` — admin only. `pause` blocks `enterRound` only (not `recordStreak`, `resolveRound`, or `claimRefund`).

**Views**
- `getCurrentRoundId()`
- `getRoundStatus(roundId)`
- `getRoundPlayers(roundId)`
- `getPlayerStats(roundId, player)` → `(streak, txCount, uniqueToCount, lastValidDay, claimed, entered)`
- `getLeaderboard(roundId)` → on-chain insertion sort returning addresses + streaks + txCounts + uniqueToCounts + 1-based ranks (ties share a rank, then the counter advances).

**Internal helpers**
- `_startNewRound()` — increments `currentRoundId`, opens a 7-day window from `block.timestamp`. Called from the constructor and at the end of every `resolveRound`. **If admin never calls `resolveRound`, no new round opens.**
- `_rankTop3` — single-pass top-3 selection. Returns `address(0)` for unfilled positions.
- `_isBetter` — comparator: streak → txCount → uniqueToCount.
- `_distributePrizes` — implements the 3 / 2 / 1 winner split.

### Events

```solidity
event PlayerEntered(uint256 indexed roundId, address indexed player, uint256 pot);
event StreakRecorded(uint256 indexed roundId, address indexed player, uint8 dayIndex, uint32 txCount, uint16 uniqueToCount, uint8 newStreak);
event RoundResolved(uint256 indexed roundId, address indexed first, address indexed second, address third, uint256 pot, uint256 protocolFee);
event RoundRefunded(uint256 indexed roundId, uint256 playerCount, uint256 potReturned);
event RefundClaimed(uint256 indexed roundId, address indexed player, uint256 amount);
event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime);
event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
```

## `StreakOracle.sol` — the trusted submitter

`Ownable`. Bridge between the off-chain oracle hot wallet and the vault.

**State**
- `IMiniStreak public vault;`
- `address public trustedSubmitter;`
- `mapping(uint256 => mapping(address => mapping(uint256 => bool))) public submitted;` — `(roundId, player, dayIndex)` dedupe.

**`submitStreak(player, roundId, dayIndex, txCount, uniqueToCount)`**
- Reverts if `msg.sender != trustedSubmitter`.
- Reverts if `dayIndex >= 7`.
- Reverts if `submitted[roundId][player][dayIndex]` already true.
- Reads `vault.playerRecords` to confirm player is `entered`; otherwise reverts.
- Sets `submitted[...] = true`, calls `vault.recordStreak(...)`.
- Emits `StreakSubmitted(player, roundId, dayIndex, txCount, uniqueToCount)`.

**`batchSubmitStreaks(players[], roundIds[], dayIndexes[], txCounts[], uniqueToCounts[])`**
- Same caller check, then loops with soft-fail (skip bad entries instead of reverting the whole batch).
- Wraps `vault.recordStreak` in `try / catch`. On failure, rolls the `submitted` flag back to false so the entry can be retried.

**Admin**
- `setTrustedSubmitter(address)` — owner only.
- `setVault(address)` — owner only.

**View**
- `isSubmitted(player, roundId, dayIndex)` → bool.

## Off-chain oracle service — how streaks get on-chain

Lives in `oracle-service/`. Two deployment modes:
1. Long-running Node process via `npm run dev` / `npm run start` — `src/index.ts` runs once at boot and then on a `node-cron` schedule (`CRON_SCHEDULE`, default `0 * * * *` — top of every hour).
2. Vercel cron — `frontend/app/api/oracle/route.ts` exposes the same logic behind `/api/oracle`, triggered daily at `0 23 * * *` per `frontend/vercel.json`.

Both modes execute the same pipeline.

### Each run

1. **Balance check** (`submitter.checkAndAlertBalance`)
   - Reads the oracle hot wallet's CELO balance.
   - Posts a Slack-style webhook alert if balance < `MIN_CELO_BALANCE` (default 0.1 CELO) and `WEBHOOK_ALERT_URL` is set.

2. **Round discovery** (`scanner.getCurrentRound`)
   - Reads `MiniStreak.getCurrentRoundId()`.
   - Reads `rounds(roundId)` for `startTime` / `endTime`.
   - Reads `MiniStreak.getRoundPlayers(roundId)`.

3. **Per-player scan** (`scanner.scanPlayerToday`)
   - Computes today's UTC window: `[startOfDayUTC, startOfDayUTC + 86399]`.
   - Computes `dayIndex = floor((todayStart - round.startTime) / 86400)`. Skips if outside `[0, 6]`.
   - Calls Blockscout's REST API (`/api/v2/addresses/{addr}/transactions?filter=from`) and paginates backwards until it finds a tx older than `todayStart`, collecting every tx whose timestamp is inside today's window.
   - Filters out self-sends (`tx.to.toLowerCase() === player.toLowerCase()` or null `to`).
   - Counts the surviving txs (`txCount`) and the size of the unique-`to` set (`uniqueToCount`).
   - Returns `{ player, roundId, dayIndex, txCount, uniqueToCount }` or `null` if nothing qualifies.

4. **Dedupe** (`db.isAlreadySubmitted`)
   - The service writes a flat JSON store at `oracle.json` (despite the `.db` config name) keyed on `(roundId, player.toLowerCase(), dayIndex)`.
   - Any (round, player, day) tuple already on disk is skipped before submission.

5. **Submission** (`submitter.submitStreak`)
   - One `eth_sendTransaction` per qualifying tuple — individual rather than batched for cleaner retry granularity (the batch helper exists but is unused in the default path).
   - Simulates first via `publicClient.simulateContract` so reverts surface early.
   - Sends a Celo legacy tx (`type: legacy`, `gasPrice = gasPrice * 1.2`, no EIP-1559).
   - Waits for receipt; throws if status ≠ `success`.
   - On success, calls `db.recordSubmission` to write the tuple plus tx hash to disk.

6. **Run metadata**
   - `db.startOracleRun` / `finishOracleRun` log each run's playersScanned, streaksSubmitted, and any aggregated error string.

### What this means for the contract behaviour

- **Streak credit is deterministic from on-chain data only.** The vault's `recordStreak` does the streak math (consecutive vs reset, increments, sentinel handling). The oracle just decides *which day* counts and *how many qualifying txs / unique recipients* a player had that day.
- **At most one submission per (player, round, day)** — enforced in three places: oracle JSON store, `StreakOracle.submitted` mapping, and the vault's `lastValidDay == dayIndex` check.
- **Late-day data is impossible after `resolveRound`.** `recordStreak` reverts once status is `Resolved` or `Refunded`. So Day-6 (Sunday) data must land before the admin calls resolve, otherwise that day silently doesn't count.
- **Round advancement is gated on the admin.** Because `_startNewRound()` only fires inside `resolveRound`, the protocol stalls indefinitely if the admin doesn't run resolve after `endTime`. The oracle does not call `resolveRound`.

### Configuration (`oracle-service/.env`)

| Var | Purpose |
|---|---|
| `ORACLE_PRIVATE_KEY` | Hot wallet that calls `StreakOracle.submitStreak` |
| `CELO_RPC_URL` | RPC endpoint (Forno mainnet or Sepolia) |
| `VAULT_ADDRESS` / `ORACLE_ADDRESS` | Deployed contract addresses |
| `DB_PATH` | Local dedupe store (default `./oracle.db`, stored as JSON) |
| `WEBHOOK_ALERT_URL` | Optional Slack-style webhook for low-balance pings |
| `MIN_CELO_BALANCE` | Threshold for the low-balance alert (default 0.1) |
| `BLOCKS_LOOKBACK` | Defined but not used by the current Blockscout-paginating scanner |
| `CRON_SCHEDULE` | node-cron expression (default hourly) |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` |
