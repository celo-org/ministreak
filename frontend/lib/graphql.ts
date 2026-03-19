/**
 * graphql.ts
 * GraphQL queries for The Graph subgraph.
 */

const GRAPH_API_URL =
  process.env.NEXT_PUBLIC_GRAPH_API_URL ||
  "https://api.studio.thegraph.com/query/0/celo-grind/version/latest";

// ─── Fetch Helper ─────────────────────────────────────────────────────────────

async function graphqlFetch<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(GRAPH_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 30 }, // 30s cache for Next.js
  });

  if (!res.ok) throw new Error(`GraphQL request failed: ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data as T;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GraphRound {
  id: string;
  roundId: string;
  startTime: string;
  endTime: string;
  pot: string;
  status: string;
  playerCount: string;
  winner: { id: string } | null;
  resolvedAt: string | null;
}

export interface GraphPlayerRound {
  id: string;
  streak: string;
  txCount: string;
  uniqueToCount: string;
  rank: string | null;
  payout: string | null;
  player: {
    id: string;
    address: string;
  };
}

export interface GraphDailyStreak {
  dayIndex: string;
  txCount: string;
  uniqueToCount: string;
  newStreak: string;
  timestamp: string;
}

export interface GraphPlayer {
  id: string;
  totalRoundsEntered: string;
  totalWinnings: string;
  bestStreak: string;
  playerRounds: Array<{
    round: { id: string; roundId: string; status: string };
    streak: string;
    txCount: string;
    uniqueToCount: string;
    rank: string | null;
    payout: string | null;
  }>;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const LEADERBOARD_QUERY = `
  query Leaderboard($roundId: ID!) {
    round(id: $roundId) {
      id
      roundId
      startTime
      endTime
      pot
      status
      playerCount
      winner { id }
      resolvedAt
      playerRounds(orderBy: streak, orderDirection: desc, first: 100) {
        id
        streak
        txCount
        uniqueToCount
        rank
        payout
        player { id address }
      }
    }
  }
`;

const PAST_ROUNDS_QUERY = `
  query PastRounds($first: Int!, $skip: Int!) {
    rounds(
      orderBy: roundId
      orderDirection: desc
      first: $first
      skip: $skip
      where: { status_in: ["Resolved", "Refunded"] }
    ) {
      id
      roundId
      startTime
      endTime
      pot
      status
      playerCount
      winner { id }
      resolvedAt
    }
  }
`;

const PLAYER_STATS_QUERY = `
  query PlayerStats($playerId: ID!) {
    player(id: $playerId) {
      id
      totalRoundsEntered
      totalWinnings
      bestStreak
      playerRounds(orderBy: round__roundId, orderDirection: desc, first: 10) {
        round { id roundId status }
        streak
        txCount
        uniqueToCount
        rank
        payout
      }
    }
  }
`;

const PLAYER_DAILY_STREAKS_QUERY = `
  query PlayerDailyStreaks($playerRoundId: ID!) {
    playerRound(id: $playerRoundId) {
      dailyStreaks(orderBy: dayIndex, orderDirection: asc) {
        dayIndex
        txCount
        uniqueToCount
        newStreak
        timestamp
      }
    }
  }
`;

const CURRENT_ROUND_QUERY = `
  query CurrentRound($roundId: ID!) {
    round(id: $roundId) {
      id
      roundId
      startTime
      endTime
      pot
      status
      playerCount
      playerRounds(orderBy: streak, orderDirection: desc, first: 5) {
        id
        streak
        txCount
        uniqueToCount
        player { id address }
      }
    }
  }
`;

// ─── Exported fetch functions ─────────────────────────────────────────────────

export async function fetchLeaderboard(roundId: string) {
  return graphqlFetch<{
    round: (GraphRound & { playerRounds: GraphPlayerRound[] }) | null;
  }>(LEADERBOARD_QUERY, { roundId });
}

export async function fetchPastRounds(first = 10, skip = 0) {
  return graphqlFetch<{ rounds: GraphRound[] }>(PAST_ROUNDS_QUERY, {
    first,
    skip,
  });
}

export async function fetchPlayerStats(playerAddress: string) {
  return graphqlFetch<{ player: GraphPlayer | null }>(PLAYER_STATS_QUERY, {
    playerId: playerAddress.toLowerCase(),
  });
}

export async function fetchPlayerDailyStreaks(
  roundId: string,
  playerAddress: string
) {
  const playerRoundId = `${roundId}-${playerAddress.toLowerCase()}`;
  return graphqlFetch<{
    playerRound: { dailyStreaks: GraphDailyStreak[] } | null;
  }>(PLAYER_DAILY_STREAKS_QUERY, { playerRoundId });
}

export async function fetchCurrentRound(roundId: string) {
  return graphqlFetch<{
    round:
      | (GraphRound & {
          playerRounds: Array<{
            id: string;
            streak: string;
            txCount: string;
            uniqueToCount: string;
            player: { id: string; address: string };
          }>;
        })
      | null;
  }>(CURRENT_ROUND_QUERY, { roundId });
}
