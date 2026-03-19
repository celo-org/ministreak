import { BigInt, BigDecimal, Bytes } from "@graphprotocol/graph-ts";
import {
  RoundStarted,
  PlayerEntered,
  StreakRecorded,
  RoundResolved,
  RoundRefunded,
  RefundClaimed,
} from "../generated/MiniStreak/MiniStreak";
import { Round, Player, PlayerRound, DailyStreak } from "../generated/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

const USDT_DECIMALS = BigDecimal.fromString("1000000"); // 1e6
const ZERO_BD = BigDecimal.fromString("0");
const ZERO_BI = BigInt.fromI32(0);
const ONE_BI = BigInt.fromI32(1);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUsdt(raw: BigInt): BigDecimal {
  return raw.toBigDecimal().div(USDT_DECIMALS);
}

function getOrCreatePlayer(address: Bytes, timestamp: BigInt): Player {
  const id = address.toHexString().toLowerCase();
  let player = Player.load(id);
  if (!player) {
    player = new Player(id);
    player.address = address;
    player.totalRoundsEntered = ZERO_BI;
    player.totalWinnings = ZERO_BD;
    player.totalWinningsRaw = ZERO_BI;
    player.bestStreak = ZERO_BI;
    player.firstSeenAt = timestamp;
    player.save();
  }
  return player;
}

function getOrCreatePlayerRound(
  roundId: BigInt,
  playerAddress: Bytes
): PlayerRound {
  const id = roundId.toString() + "-" + playerAddress.toHexString().toLowerCase();
  let pr = PlayerRound.load(id);
  if (!pr) {
    pr = new PlayerRound(id);
    pr.player = playerAddress.toHexString().toLowerCase();
    pr.round = roundId.toString();
    pr.streak = ZERO_BI;
    pr.txCount = 0;
    pr.uniqueToCount = 0;
    pr.rank = null;
    pr.payout = null;
    pr.payoutRaw = null;
    pr.save();
  }
  return pr;
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

export function handleRoundStarted(event: RoundStarted): void {
  const roundId = event.params.roundId;
  const id = roundId.toString();

  let round = new Round(id);
  round.roundId = roundId;
  round.startTime = event.params.startTime;
  round.endTime = event.params.endTime;
  round.pot = ZERO_BD;
  round.potRaw = ZERO_BI;
  round.status = "Open";
  round.playerCount = ZERO_BI;
  round.winner = null;
  round.createdAt = event.block.timestamp;
  round.resolvedAt = null;
  round.txHash = event.transaction.hash;
  round.save();
}

export function handlePlayerEntered(event: PlayerEntered): void {
  const roundId = event.params.roundId;
  const playerAddress = event.params.player;
  const newPot = event.params.pot;

  // Update round
  const roundEntity = Round.load(roundId.toString());
  if (!roundEntity) return;
  roundEntity.pot = formatUsdt(newPot);
  roundEntity.potRaw = newPot;
  roundEntity.playerCount = roundEntity.playerCount.plus(ONE_BI);
  roundEntity.save();

  // Create or update player
  const player = getOrCreatePlayer(playerAddress, event.block.timestamp);
  player.totalRoundsEntered = player.totalRoundsEntered.plus(ONE_BI);
  player.save();

  // Create player-round record
  const pr = getOrCreatePlayerRound(roundId, playerAddress);
  pr.txCount = 1; // entry counts as first tx
  pr.uniqueToCount = 0;
  pr.save();
}

export function handleStreakRecorded(event: StreakRecorded): void {
  const roundId = event.params.roundId;
  const playerAddress = event.params.player;
  const dayIndex = event.params.dayIndex;
  const txCount = event.params.txCount;
  const uniqueToCount = event.params.uniqueToCount;
  const newStreak = event.params.newStreak;

  // Update PlayerRound
  const pr = getOrCreatePlayerRound(roundId, playerAddress);
  pr.streak = BigInt.fromI32(newStreak);
  pr.txCount = pr.txCount + txCount;
  pr.uniqueToCount = pr.uniqueToCount + uniqueToCount;
  pr.save();

  // Update Player best streak
  const player = Player.load(playerAddress.toHexString().toLowerCase());
  if (player) {
    const newStreakBI = BigInt.fromI32(newStreak);
    if (newStreakBI.gt(player.bestStreak)) {
      player.bestStreak = newStreakBI;
      player.save();
    }
  }

  // Create DailyStreak
  const dsId =
    roundId.toString() +
    "-" +
    playerAddress.toHexString().toLowerCase() +
    "-" +
    dayIndex.toString();

  let ds = new DailyStreak(dsId);
  ds.player = playerAddress.toHexString().toLowerCase();
  ds.round = roundId.toString();
  ds.playerRound = pr.id;
  ds.dayIndex = BigInt.fromI32(dayIndex);
  ds.txCount = txCount;
  ds.uniqueToCount = uniqueToCount;
  ds.newStreak = BigInt.fromI32(newStreak);
  ds.timestamp = event.block.timestamp;
  ds.txHash = event.transaction.hash;
  ds.save();
}

export function handleRoundResolved(event: RoundResolved): void {
  const roundId = event.params.roundId;
  const first = event.params.first;
  const second = event.params.second;
  const third = event.params.third;
  const pot = event.params.pot;
  const protocolFee = event.params.protocolFee;

  const roundEntity = Round.load(roundId.toString());
  if (!roundEntity) return;

  roundEntity.status = "Resolved";
  roundEntity.winner = first.toHexString().toLowerCase();
  roundEntity.resolvedAt = event.block.timestamp;
  roundEntity.save();

  const distributable = pot.minus(protocolFee);

  // Calculate payouts based on which ranks exist
  const hasSecond = second.toHexString() != "0x0000000000000000000000000000000000000000";
  const hasThird = third.toHexString() != "0x0000000000000000000000000000000000000000";

  // Helper to update a winner's PlayerRound
  function updateWinner(
    winnerAddress: Bytes,
    rank: BigInt,
    payoutRaw: BigInt
  ): void {
    const pr = getOrCreatePlayerRound(roundId, winnerAddress);
    pr.rank = rank;
    pr.payoutRaw = payoutRaw;
    pr.payout = formatUsdt(payoutRaw);
    pr.save();

    const player = Player.load(winnerAddress.toHexString().toLowerCase());
    if (player) {
      player.totalWinningsRaw = player.totalWinningsRaw.plus(payoutRaw);
      player.totalWinnings = formatUsdt(player.totalWinningsRaw);
      player.save();
    }
  }

  if (hasSecond && hasThird) {
    // 50/30/20
    updateWinner(first, ONE_BI, distributable.times(BigInt.fromI32(50)).div(BigInt.fromI32(100)));
    updateWinner(second, BigInt.fromI32(2), distributable.times(BigInt.fromI32(30)).div(BigInt.fromI32(100)));
    updateWinner(third, BigInt.fromI32(3), distributable.times(BigInt.fromI32(20)).div(BigInt.fromI32(100)));
  } else if (hasSecond) {
    // 62.5/37.5
    updateWinner(first, ONE_BI, distributable.times(BigInt.fromI32(625)).div(BigInt.fromI32(1000)));
    updateWinner(second, BigInt.fromI32(2), distributable.times(BigInt.fromI32(375)).div(BigInt.fromI32(1000)));
  } else {
    // winner takes all
    updateWinner(first, ONE_BI, distributable);
  }
}

export function handleRoundRefunded(event: RoundRefunded): void {
  const roundId = event.params.roundId;

  const roundEntity = Round.load(roundId.toString());
  if (!roundEntity) return;

  roundEntity.status = "Refunded";
  roundEntity.resolvedAt = event.block.timestamp;
  roundEntity.save();
}

export function handleRefundClaimed(event: RefundClaimed): void {
  // No schema update needed — just log data available in tx history
  // Could track a RefundClaim entity if needed in the future
}
