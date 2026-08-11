const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const {
  createRuntimeState,
  createRequestContextMiddleware,
  buildHealthPayload,
  buildReadyPayload,
} = require('./runtime/serverRuntime');
const { createMatchCleanupScheduler } = require('./runtime/matchCleanupScheduler');
const { registerProcessLifecycle } = require('./runtime/processLifecycle');
const { createSlidingWindowLimiter } = require('./runtime/requestLimiter');
const {
  buildEmptyBoardSnapshot,
  normalizeBoardSnapshot,
  buildBoardPublicSnapshot,
  getLegalTerrainPlacements,
  applyTerrainPlacementToBoard,
  createInitialAnimalCandidateState,
  createInitialAnimalOngoingState,
  normalizeAnimalStates,
  serializeAnimalStates,
  toAnimalStatePayload,
  recruitAnimalFromMarket,
  placeAnimalOnBoard,
} = require('./matchRules');

dotenv.config();

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const ACCESS_TOKEN_TTL_HOURS = Number.parseInt(process.env.ACCESS_TOKEN_TTL_HOURS ?? '24', 10);
const REFRESH_TOKEN_TTL_DAYS = Number.parseInt(process.env.REFRESH_TOKEN_TTL_DAYS ?? '30', 10);
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT ?? '128kb';
const DB_CONNECTION_LIMIT = Number.parseInt(process.env.DB_CONNECTION_LIMIT ?? '20', 10);
const DB_QUEUE_LIMIT = Number.parseInt(process.env.DB_QUEUE_LIMIT ?? '0', 10);
const LOCAL_PLATFORM = 'local_account';
const CLIENT_VERSION = '1.0.0';
const DEFAULT_MATCH_TYPE = 'casual';
const DEFAULT_MATCH_ESTIMATED_WAIT_SECONDS = 15;
const DEFAULT_TURN_SECONDS = 90;
const ROOM_TOKEN_TTL_HOURS = 6;
const MATCH_STALE_TIMEOUT_MINUTES = 10;
const MATCH_DISCONNECT_TIMEOUT_SECONDS = 8;
const MATCH_CLEANUP_INTERVAL_MS = Number.parseInt(process.env.MATCH_CLEANUP_INTERVAL_MS ?? '5000', 10);
const HEARTBEAT_WRITE_INTERVAL_MS = Number.parseInt(process.env.HEARTBEAT_WRITE_INTERVAL_MS ?? '3000', 10);
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = Number.parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? '10000', 10);
const MATCH_GROUP_COUNT = 4;
const MATCH_PIECES_PER_GROUP = 3;
const TERRAIN_PIECE_COUNTS = {
  building: 15,
  field: 19,
  stump: 21,
  leaves: 19,
  mountain: 23,
  river: 23,
};

const app = express();
app.use(cors());
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number.parseInt(process.env.DB_PORT ?? '3306', 10),
  database: process.env.DB_NAME ?? 'zoo_harmony',
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: DB_CONNECTION_LIMIT,
  queueLimit: DB_QUEUE_LIMIT,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  namedPlaceholders: true,
});

const runtimeState = createRuntimeState();

function ok(res, data = {}, message = 'ok') {
  res.json({
    code: 0,
    message,
    data,
  });
}

function fail(res, code, message, status = 400) {
  res.status(status).json({
    code,
    message,
    data: null,
  });
}

function normalizeAccount(account) {
  return String(account ?? '').trim().toLowerCase();
}

function validateCredentials(account, password) {
  if (!account) {
    return '账号不能为空。';
  }
  if (!/^[a-z0-9_]{4,24}$/.test(account)) {
    return '账号只支持 4-24 位字母、数字和下划线。';
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 32) {
    return '密码长度需要在 6 到 32 位之间。';
  }
  return null;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, expectedHash) {
  const actualHash = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function toMysqlDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function buildSessionPayload(sessionRow, playerRow, isNewPlayer = false) {
  return {
    player_id: playerRow.player_id,
    access_token: sessionRow.access_token,
    refresh_token: sessionRow.refresh_token,
    expire_at: sessionRow.expire_at,
    refresh_expire_at: sessionRow.refresh_expire_at,
    is_new_player: isNewPlayer,
    platform: LOCAL_PLATFORM,
    account: playerRow.account_name,
    display_name: playerRow.display_name,
  };
}

function getRequestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? '';
}

const authRateLimiter = createSlidingWindowLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 20,
  keyGenerator: (req) => `auth:${getRequestIp(req)}`,
  fail,
  code: 1098,
  message: '认证请求过于频繁，请稍后再试。',
});

const matchmakingRateLimiter = createSlidingWindowLimiter({
  windowMs: 10 * 1000,
  maxRequests: 10,
  keyGenerator: (req) => `matchmaking:${req.auth?.playerId ?? getRequestIp(req)}`,
  fail,
  code: 2098,
  message: '匹配请求过于频繁，请稍后再试。',
});

const matchActionRateLimiter = createSlidingWindowLimiter({
  windowMs: 1000,
  maxRequests: 12,
  keyGenerator: (req) => `match-action:${req.auth?.playerId ?? getRequestIp(req)}:${req.path}`,
  fail,
  code: 3098,
  message: '对局操作过于频繁，请稍后再试。',
});

const matchStateRateLimiter = createSlidingWindowLimiter({
  windowMs: 1000,
  maxRequests: 4,
  keyGenerator: (req) => `match-state:${req.auth?.playerId ?? getRequestIp(req)}:${req.params.matchId ?? ''}`,
  fail,
  code: 3099,
  message: '对局状态请求过于频繁，请稍后再试。',
});

app.use(createRequestContextMiddleware({ runtimeState, fail }));

async function getActiveSeasonId(connection) {
  const [rows] = await connection.execute(
    `SELECT season_id
       FROM season_info
      WHERE season_status = 1
      ORDER BY start_time ASC
      LIMIT 1`,
  );
  return rows[0]?.season_id ?? null;
}

async function createSession(connection, playerId, req, clientVersion) {
  const now = new Date();
  const expireAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  const refreshExpireAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const accessToken = generateToken();
  const refreshToken = generateToken();

  await connection.execute(
    `UPDATE player_session
        SET session_status = 2,
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE player_id = ?
        AND session_status = 1`,
    [playerId],
  );

  await connection.execute(
    `INSERT INTO player_session (
        player_id,
        platform,
        device_id,
        client_version,
        access_token,
        refresh_token,
        session_status,
        login_ip,
        last_seen_at,
        expire_at,
        refresh_expire_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP(3), ?, ?)`,
    [
      playerId,
      LOCAL_PLATFORM,
      String(req.body.device_id ?? 'cocos_editor'),
      clientVersion,
      accessToken,
      refreshToken,
      getRequestIp(req),
      toMysqlDate(expireAt),
      toMysqlDate(refreshExpireAt),
    ],
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expire_at: expireAt.toISOString(),
    refresh_expire_at: refreshExpireAt.toISOString(),
  };
}

async function loadPlayerForAccount(connection, normalizedAccount) {
  const [rows] = await connection.execute(
    `SELECT pa.player_id,
            pa.login_status,
            lac.account_name,
            lac.password_salt,
            lac.password_hash,
            pp.display_name
       FROM local_account_credential lac
       INNER JOIN player_account pa
               ON pa.player_id = lac.player_id
       INNER JOIN player_profile pp
               ON pp.player_id = pa.player_id
      WHERE lac.account_name = ?
      LIMIT 1`,
    [normalizedAccount],
  );
  return rows[0] ?? null;
}

async function getOrCreateDefaultDeck(connection, playerId) {
  const [existingRows] = await connection.execute(
    `SELECT deck_id,
            deck_name,
            is_active,
            deck_status
       FROM player_deck
      WHERE player_id = ?
      ORDER BY is_active DESC,
               deck_status DESC,
               updated_at DESC,
               deck_id ASC
      LIMIT 1`,
    [playerId],
  );

  const existingDeck = existingRows[0];
  if (existingDeck) {
    if (existingDeck.is_active !== 1 || existingDeck.deck_status !== 1) {
      await connection.execute(
        `UPDATE player_deck
            SET is_active = 1,
                deck_status = 1,
                updated_at = CURRENT_TIMESTAMP(3)
          WHERE deck_id = ?`,
        [existingDeck.deck_id],
      );
    }

    return {
      deck_id: existingDeck.deck_id,
      deck_name: existingDeck.deck_name,
    };
  }

  await connection.execute(
    `UPDATE player_deck
        SET is_active = 0,
            updated_at = CURRENT_TIMESTAMP(3)
      WHERE player_id = ?`,
    [playerId],
  );

  const [deckResult] = await connection.execute(
    `INSERT INTO player_deck (
        player_id,
        deck_name,
        is_active,
        deck_status
      ) VALUES (?, ?, 1, 1)`,
    [playerId, '默认牌组'],
  );

  return {
    deck_id: deckResult.insertId,
    deck_name: '默认牌组',
  };
}

function createTerrainPiecePoolSnapshot() {
  const pool = [];

  for (const [pieceType, count] of Object.entries(TERRAIN_PIECE_COUNTS)) {
    for (let index = 0; index < count; index += 1) {
      pool.push(pieceType);
    }
  }

  return pool;
}

function shuffleArray(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = items[index];
    items[index] = items[swapIndex];
    items[swapIndex] = current;
  }
}

function drawTerrainPiecesFromBag(bag, count) {
  return bag.splice(0, Math.min(count, bag.length));
}

function createTerrainMarketSnapshotFromBag(bag) {
  const slotGroups = [];

  for (let index = 0; index < MATCH_GROUP_COUNT; index += 1) {
    slotGroups.push(drawTerrainPiecesFromBag(bag, MATCH_PIECES_PER_GROUP));
  }

  return {
    slot_groups: slotGroups,
    active_slot_index: null,
    remaining_piece_indices: [],
  };
}

function normalizeTerrainMarketSnapshot(rawSnapshot) {
  if (!rawSnapshot) {
    return {
      slot_groups: Array.from({ length: MATCH_GROUP_COUNT }, () => []),
      active_slot_index: null,
      remaining_piece_indices: [],
    };
  }

  if (Array.isArray(rawSnapshot)) {
    return {
      slot_groups: rawSnapshot.map((group) => Array.isArray(group) ? group : []).slice(0, MATCH_GROUP_COUNT),
      active_slot_index: null,
      remaining_piece_indices: [],
    };
  }

  const slotGroups = Array.isArray(rawSnapshot.slot_groups)
    ? rawSnapshot.slot_groups.map((group) => Array.isArray(group) ? group : []).slice(0, MATCH_GROUP_COUNT)
    : [];

  while (slotGroups.length < MATCH_GROUP_COUNT) {
    slotGroups.push([]);
  }

  const remainingPieceIndices = Array.isArray(rawSnapshot.remaining_piece_indices)
    ? rawSnapshot.remaining_piece_indices
      .filter((value) => Number.isInteger(value) && value >= 0 && value < MATCH_PIECES_PER_GROUP)
      .sort((left, right) => left - right)
    : [];

  return {
    slot_groups: slotGroups,
    active_slot_index: Number.isInteger(rawSnapshot.active_slot_index) ? rawSnapshot.active_slot_index : null,
    remaining_piece_indices: [...new Set(remainingPieceIndices)],
  };
}

function parseJsonValue(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return null;
  }

  if (typeof rawValue === 'string') {
    return JSON.parse(rawValue);
  }

  return rawValue;
}

async function cleanupExpiredMatchState(executor) {
  const staleCutoff = new Date(Date.now() - MATCH_STALE_TIMEOUT_MINUTES * 60 * 1000);
  const staleCutoffText = toMysqlDate(staleCutoff);
  const [staleRows] = await executor.execute(
    `SELECT match_id
       FROM match_room
      WHERE room_status IN (0, 1, 2)
        AND COALESCE(last_action_at, start_time, created_at) < ?`,
    [staleCutoffText],
  );

  const staleMatchIds = staleRows.map((row) => row.match_id);
  if (staleMatchIds.length === 0) {
    return 0;
  }
  await deleteMatchesAndInvalidateQueues(executor, staleMatchIds);

  console.log(
    `[match-cleanup] Removed ${staleMatchIds.length} stale match(es): ${staleMatchIds.join(', ')}`,
  );
  return staleMatchIds.length;
}

async function cleanupDanglingMatchmakingQueue(executor) {
  const [result] = await executor.execute(
    `UPDATE matchmaking_queue mq
        LEFT JOIN match_room mr
               ON mr.match_id = mq.match_id
        SET mq.queue_status = 4,
            mq.match_id = NULL,
            mq.cancel_time = CURRENT_TIMESTAMP(3)
      WHERE mq.queue_status = 1
        AND (
          mq.match_id IS NULL
          OR mr.match_id IS NULL
          OR mr.room_status IN (3, 4)
        )`,
  );

  return Number(result?.affectedRows ?? 0);
}

async function deleteMatchesAndInvalidateQueues(executor, matchIds) {
  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    return 0;
  }

  const inClause = matchIds.map(() => '?').join(', ');

  await executor.execute(
    `UPDATE matchmaking_queue
        SET queue_status = 4,
            match_id = NULL,
            cancel_time = CURRENT_TIMESTAMP(3)
      WHERE match_id IN (${inClause})
        AND queue_status IN (0, 1)`,
    matchIds,
  );

  await executor.execute(
    `DELETE FROM match_room
      WHERE match_id IN (${inClause})`,
    matchIds,
  );

  return matchIds.length;
}

async function cleanupDisconnectedMatches(executor) {
  const disconnectCutoff = new Date(Date.now() - MATCH_DISCONNECT_TIMEOUT_SECONDS * 1000);
  const disconnectCutoffText = toMysqlDate(disconnectCutoff);

  await executor.execute(
    `UPDATE match_player
        SET is_connected = 0,
            disconnect_deadline_at = COALESCE(disconnect_deadline_at, CURRENT_TIMESTAMP(3))
      WHERE is_connected = 1
        AND last_heartbeat_at IS NOT NULL
        AND last_heartbeat_at < ?`,
    [disconnectCutoffText],
  );

  const [rows] = await executor.execute(
    `SELECT mr.match_id
       FROM match_room mr
      WHERE mr.room_status IN (0, 1, 2)
        AND NOT EXISTS (
          SELECT 1
            FROM match_player mp
           WHERE mp.match_id = mr.match_id
             AND mp.is_connected = 1
        )`,
  );

  const disconnectedMatchIds = rows.map((row) => row.match_id);
  if (disconnectedMatchIds.length === 0) {
    return 0;
  }

  await deleteMatchesAndInvalidateQueues(executor, disconnectedMatchIds);
  console.log(
    `[match-disconnect-cleanup] Removed ${disconnectedMatchIds.length} abandoned match(es): ${disconnectedMatchIds.join(', ')}`,
  );
  return disconnectedMatchIds.length;
}

async function performMatchStateCleanup(executor) {
  await cleanupDanglingMatchmakingQueue(executor);
  await cleanupDisconnectedMatches(executor);
  await cleanupExpiredMatchState(executor);
}

const matchCleanupScheduler = createMatchCleanupScheduler({
  runtimeState,
  cleanupIntervalMs: MATCH_CLEANUP_INTERVAL_MS,
  performCleanup: async () => performMatchStateCleanup(pool),
});

async function touchMatchPlayerConnection(executor, matchId, playerId) {
  const heartbeatCutoff = toMysqlDate(new Date(Date.now() - HEARTBEAT_WRITE_INTERVAL_MS));
  await executor.execute(
    `UPDATE match_player
        SET is_connected = 1,
            last_heartbeat_at = CURRENT_TIMESTAMP(3),
            disconnect_deadline_at = NULL
      WHERE match_id = ?
        AND player_id = ?
        AND (
          is_connected <> 1
          OR last_heartbeat_at IS NULL
          OR last_heartbeat_at < ?
        )`,
    [matchId, playerId, heartbeatCutoff],
  );
}

async function deleteMatchRoomAndInvalidateQueue(executor, matchId) {
  await deleteMatchesAndInvalidateQueues(executor, [matchId]);
}

async function markPlayerLeftMatch(executor, matchId, playerId) {
  await executor.execute(
    `UPDATE match_player
        SET is_connected = 0,
            last_heartbeat_at = CURRENT_TIMESTAMP(3),
            disconnect_deadline_at = CURRENT_TIMESTAMP(3)
      WHERE match_id = ?
        AND player_id = ?`,
    [matchId, playerId],
  );

  const [countRows] = await executor.execute(
    `SELECT COUNT(*) AS connected_count
       FROM match_player
      WHERE match_id = ?
        AND is_connected = 1`,
    [matchId],
  );

  const connectedCount = Number(countRows[0]?.connected_count ?? 0);
  if (connectedCount <= 0) {
    await deleteMatchRoomAndInvalidateQueue(executor, matchId);
    return {
      deleted: true,
      remaining_connected_players: 0,
    };
  }

  return {
    deleted: false,
    remaining_connected_players: connectedCount,
  };
}

async function createMatchFromQueueEntries(connection, queueEntries) {
  if (queueEntries.length < 2) {
    return null;
  }

  const firstQueue = queueEntries[0];
  const secondQueue = queueEntries[1];
  const seasonId = firstQueue.season_id ?? secondQueue.season_id ?? null;
  const firstPlayerId = firstQueue.player_id;
  const secondPlayerId = secondQueue.player_id;
  const randomSeed = generateToken();
  const turnDeadlineAt = new Date(Date.now() + DEFAULT_TURN_SECONDS * 1000);
  const roomTokenExpireAt = new Date(Date.now() + ROOM_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  const terrainBagSnapshot = createTerrainPiecePoolSnapshot();
  shuffleArray(terrainBagSnapshot);
  const terrainMarketSnapshot = createTerrainMarketSnapshotFromBag(terrainBagSnapshot);

  const [matchResult] = await connection.execute(
    `INSERT INTO match_room (
        queue_id,
        match_type,
        season_id,
        room_status,
        first_player_id,
        turn_player_id,
        random_seed,
        terrain_bag_snapshot,
        terrain_market_snapshot,
        terrain_bag_remaining,
        turn_deadline_at,
        last_action_at,
        start_time
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
    [
      firstQueue.queue_id,
      firstQueue.match_type,
      seasonId,
      firstPlayerId,
      firstPlayerId,
      randomSeed,
      JSON.stringify(terrainBagSnapshot),
      JSON.stringify(terrainMarketSnapshot),
      terrainBagSnapshot.length,
      toMysqlDate(turnDeadlineAt),
    ],
  );

  const matchId = matchResult.insertId;
  const playerRows = [
    {
      matchId,
      playerId: firstPlayerId,
      seatNo: 1,
      deckId: firstQueue.deck_id,
    },
    {
      matchId,
      playerId: secondPlayerId,
      seatNo: 2,
      deckId: secondQueue.deck_id,
    },
  ];

  for (const playerRow of playerRows) {
    const candidateCardState = createInitialAnimalCandidateState();
    const ongoingCardState = createInitialAnimalOngoingState();
    const boardSnapshot = buildEmptyBoardSnapshot(playerRow.playerId, playerRow.seatNo);

    await connection.execute(
      `INSERT INTO match_player (
          match_id,
          player_id,
          seat_no,
          deck_id,
          deck_snapshot_json,
          opening_option_json,
          candidate_card_json,
          ongoing_card_json,
          board_snapshot_json,
          board_public_snapshot_json,
          room_token,
          room_token_expire_at,
          last_heartbeat_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
      [
        playerRow.matchId,
        playerRow.playerId,
        playerRow.seatNo,
        playerRow.deckId,
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify(candidateCardState),
        JSON.stringify(ongoingCardState),
        JSON.stringify(boardSnapshot),
        JSON.stringify(buildBoardPublicSnapshot(boardSnapshot)),
        generateToken(),
        toMysqlDate(roomTokenExpireAt),
      ],
    );
  }

  for (const queueEntry of queueEntries) {
    await connection.execute(
      `UPDATE matchmaking_queue
          SET queue_status = 1,
              match_id = ?,
              matched_time = CURRENT_TIMESTAMP(3)
        WHERE queue_id = ?`,
      [matchId, queueEntry.queue_id],
    );
  }

  return matchId;
}

async function tryMatchWaitingPlayers(connection, matchType) {
  const [queueRows] = await connection.execute(
    `SELECT queue_id,
            player_id,
            season_id,
            deck_id,
            match_type,
            enqueue_time
       FROM matchmaking_queue
      WHERE match_type = ?
        AND queue_status = 0
      ORDER BY enqueue_time ASC,
               queue_id ASC
      LIMIT 2
      FOR UPDATE`,
    [matchType],
  );

  if (queueRows.length < 2) {
    return null;
  }

  return createMatchFromQueueEntries(connection, queueRows);
}

async function loadMatchSummary(executor, matchId, playerId) {
  const [rows] = await executor.execute(
    `SELECT mr.match_id,
            mr.match_type,
            mr.room_status,
            mr.turn_no,
            mr.step_status,
            mr.state_version,
            mr.turn_player_id,
            mr.turn_deadline_at,
            mr.terrain_market_snapshot,
            mr.terrain_bag_remaining,
            mp.seat_no,
            mp.board_snapshot_json,
            mp.candidate_card_json,
            mp.ongoing_card_json,
            opponent.board_public_snapshot_json AS opponent_board_public_snapshot_json,
            opponent.candidate_card_json AS opponent_candidate_card_json,
            opponent.ongoing_card_json AS opponent_ongoing_card_json,
            opponent.player_id AS opponent_player_id,
            opponent_profile.display_name AS opponent_display_name,
            opponent_account.account_name AS opponent_account
       FROM match_room mr
       INNER JOIN match_player mp
               ON mp.match_id = mr.match_id
              AND mp.player_id = ?
       LEFT JOIN match_player opponent
              ON opponent.match_id = mr.match_id
             AND opponent.player_id <> mp.player_id
       LEFT JOIN player_profile opponent_profile
              ON opponent_profile.player_id = opponent.player_id
       LEFT JOIN local_account_credential opponent_account
              ON opponent_account.player_id = opponent.player_id
      WHERE mr.match_id = ?
      LIMIT 1`,
    [playerId, matchId],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  let terrainMarketSnapshot = null;
  try {
    terrainMarketSnapshot = normalizeTerrainMarketSnapshot(
      parseJsonValue(row.terrain_market_snapshot),
    );
  } catch (error) {
    console.warn('[loadMatchSummary] Failed to parse terrain market snapshot.', error);
    terrainMarketSnapshot = normalizeTerrainMarketSnapshot(null);
  }

  let myBoardSnapshot = null;
  try {
    myBoardSnapshot = normalizeBoardSnapshot(
      parseJsonValue(row.board_snapshot_json),
      playerId,
      row.seat_no,
    );
  } catch (error) {
    console.warn('[loadMatchSummary] Failed to parse player board snapshot.', error);
    myBoardSnapshot = buildEmptyBoardSnapshot(playerId, row.seat_no);
  }

  let opponentBoardPublicSnapshot = null;
  try {
    opponentBoardPublicSnapshot = row.opponent_board_public_snapshot_json
      ? normalizeBoardSnapshot(
        parseJsonValue(row.opponent_board_public_snapshot_json),
        row.opponent_player_id ?? 0,
        row.seat_no === 1 ? 2 : 1,
      )
      : null;
  } catch (error) {
    console.warn('[loadMatchSummary] Failed to parse opponent public board snapshot.', error);
    opponentBoardPublicSnapshot = null;
  }

  let animalState = null;
  try {
    animalState = normalizeAnimalStates(
      parseJsonValue(row.candidate_card_json),
      parseJsonValue(row.ongoing_card_json),
    );
  } catch (error) {
    console.warn('[loadMatchSummary] Failed to parse animal card state.', error);
    animalState = normalizeAnimalStates(
      createInitialAnimalCandidateState(),
      createInitialAnimalOngoingState(),
    );
  }

  let opponentAnimalState = null;
  try {
    opponentAnimalState = row.opponent_player_id
      ? normalizeAnimalStates(
        parseJsonValue(row.opponent_candidate_card_json),
        parseJsonValue(row.opponent_ongoing_card_json),
      )
      : null;
  } catch (error) {
    console.warn('[loadMatchSummary] Failed to parse opponent animal card state.', error);
    opponentAnimalState = row.opponent_player_id
      ? normalizeAnimalStates(
        createInitialAnimalCandidateState(),
        createInitialAnimalOngoingState(),
      )
      : null;
  }

  const opponentAnimalStatePayload = opponentAnimalState
    ? {
      ...toAnimalStatePayload(opponentAnimalState, row.turn_no),
      market_card_ids: [],
      recruited_this_turn: false,
    }
    : null;

  return {
    match_id: row.match_id,
    match_type: row.match_type,
    room_status: row.room_status,
    turn_no: row.turn_no,
    step_status: row.step_status,
    state_version: row.state_version,
    turn_player_id: row.turn_player_id,
    turn_deadline_at: row.turn_deadline_at,
    terrain_bag_remaining: row.terrain_bag_remaining,
    terrain_market_snapshot: terrainMarketSnapshot,
    seat_no: row.seat_no,
    my_player_id: playerId,
    is_my_turn: row.turn_player_id === playerId,
    my_board_snapshot: myBoardSnapshot,
    opponent_board_public_snapshot: opponentBoardPublicSnapshot,
    my_animal_state: toAnimalStatePayload(animalState, row.turn_no),
    opponent_animal_state: opponentAnimalStatePayload,
    opponent: row.opponent_player_id ? {
      player_id: row.opponent_player_id,
      account: row.opponent_account,
      display_name: row.opponent_display_name,
    } : null,
  };
}

async function loadMatchmakingState(executor, playerId) {
  const [queueRows] = await executor.execute(
    `SELECT queue_id,
            queue_status,
            match_id,
            match_type,
            enqueue_time,
            matched_time
       FROM matchmaking_queue
      WHERE player_id = ?
        AND queue_status IN (0, 1)
      ORDER BY queue_id DESC
      LIMIT 1`,
    [playerId],
  );

  const queueRow = queueRows[0];
  if (!queueRow) {
    return {
      status: 'idle',
      queue_id: null,
      match_id: null,
      elapsed_seconds: 0,
      match: null,
    };
  }

  if (queueRow.queue_status === 0) {
    const enqueueTime = new Date(queueRow.enqueue_time).getTime();
    return {
      status: 'waiting',
      queue_id: queueRow.queue_id,
      match_id: null,
      enqueue_time: queueRow.enqueue_time,
      elapsed_seconds: Math.max(0, Math.floor((Date.now() - enqueueTime) / 1000)),
      match: null,
    };
  }

  const match = queueRow.match_id
    ? await loadMatchSummary(executor, queueRow.match_id, playerId)
    : null;

  return {
    status: match ? 'matched' : 'idle',
    queue_id: queueRow.queue_id,
    match_id: queueRow.match_id,
    enqueue_time: queueRow.enqueue_time,
    matched_time: queueRow.matched_time,
    elapsed_seconds: 0,
    match,
  };
}

async function loadMatchStateForPlayer(executor, matchId, playerId) {
  await touchMatchPlayerConnection(executor, matchId, playerId);
  return loadMatchSummary(executor, matchId, playerId);
}

async function loadMatchStateVersion(executor, matchId, playerId) {
  const [rows] = await executor.execute(
    `SELECT mr.match_id,
            mr.state_version
       FROM match_room mr
       INNER JOIN match_player mp
               ON mp.match_id = mr.match_id
              AND mp.player_id = ?
      WHERE mr.match_id = ?
      LIMIT 1`,
    [playerId, matchId],
  );

  return rows[0] ?? null;
}

async function authMiddleware(req, res, next) {
  const authorization = req.headers.authorization ?? '';
  const tokenMatch = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!tokenMatch) {
    fail(res, 1007, '缺少访问令牌。', 401);
    return;
  }

  const accessToken = tokenMatch[1];

  try {
    const [rows] = await pool.execute(
      `SELECT ps.player_id,
              ps.session_status,
              ps.expire_at,
              lac.account_name,
              pp.display_name
         FROM player_session ps
         INNER JOIN player_account pa
                 ON pa.player_id = ps.player_id
         INNER JOIN local_account_credential lac
                 ON lac.player_id = pa.player_id
         INNER JOIN player_profile pp
                 ON pp.player_id = pa.player_id
        WHERE ps.access_token = ?
        LIMIT 1`,
      [accessToken],
    );

    const session = rows[0];
    if (!session || session.session_status !== 1) {
      fail(res, 1008, '登录态无效，请重新登录。', 401);
      return;
    }

    if (new Date(session.expire_at).getTime() <= Date.now()) {
      fail(res, 1009, '登录态已过期，请重新登录。', 401);
      return;
    }

    req.auth = {
      playerId: session.player_id,
      accountName: session.account_name,
      displayName: session.display_name,
      accessToken,
    };
    next();
  } catch (error) {
    console.error('[authMiddleware] Failed to validate access token.', error);
    fail(res, 1999, '鉴权服务校验失败。', 500);
  }
}

app.get('/api/v1/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    ok(res, buildHealthPayload({
      runtimeState,
      dbConnectionLimit: DB_CONNECTION_LIMIT,
    }));
  } catch (error) {
    console.error('[health] Database connection failed.', error);
    fail(res, 1998, '数据库连接失败。', 500);
  }
});

app.get('/api/v1/ready', (_req, res) => {
  if (runtimeState.shuttingDown) {
    fail(res, 1996, '服务正在下线。', 503);
    return;
  }

  ok(res, buildReadyPayload({ runtimeState }));
});

app.post('/api/v1/auth/register', authRateLimiter, async (req, res) => {
  const normalizedAccount = normalizeAccount(req.body.account);
  const rawPassword = String(req.body.password ?? '');
  const clientVersion = String(req.body.client_version ?? CLIENT_VERSION);
  const validationMessage = validateCredentials(normalizedAccount, rawPassword);

  if (validationMessage) {
    fail(res, 1001, validationMessage);
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const existingPlayer = await loadPlayerForAccount(connection, normalizedAccount);
    if (existingPlayer) {
      await connection.rollback();
      fail(res, 1002, '该账号已存在。');
      return;
    }

    const [playerResult] = await connection.execute(
      `INSERT INTO player_account (
          primary_platform,
          platform_user_id,
          nickname,
          last_login_time
        ) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))`,
      [LOCAL_PLATFORM, normalizedAccount, normalizedAccount],
    );

    const playerId = playerResult.insertId;
    const passwordSalt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(rawPassword, passwordSalt);

    await connection.execute(
      `INSERT INTO local_account_credential (
          player_id,
          account_name,
          password_salt,
          password_hash
        ) VALUES (?, ?, ?, ?)`,
      [playerId, normalizedAccount, passwordSalt, passwordHash],
    );

    await connection.execute(
      `INSERT INTO player_profile (
          player_id,
          display_name
        ) VALUES (?, ?)`,
      [playerId, normalizedAccount],
    );

    await connection.execute(
      `INSERT INTO player_resource (player_id)
       VALUES (?)`,
      [playerId],
    );

    const activeSeasonId = await getActiveSeasonId(connection);
    if (activeSeasonId) {
      await connection.execute(
        `INSERT INTO player_rank (
            player_id,
            season_id
          ) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP(3)`,
        [playerId, activeSeasonId],
      );
    }

    const sessionRow = await createSession(connection, playerId, req, clientVersion);
    await connection.commit();

    ok(
      res,
      buildSessionPayload(
        sessionRow,
        {
          player_id: playerId,
          account_name: normalizedAccount,
          display_name: normalizedAccount,
        },
        true,
      ),
      'register success',
    );
  } catch (error) {
    await connection.rollback();
    console.error('[register] Failed to create account.', error);
    fail(res, 1999, '注册失败，请检查数据库配置。', 500);
  } finally {
    connection.release();
  }
});

app.post('/api/v1/auth/login', authRateLimiter, async (req, res) => {
  const normalizedAccount = normalizeAccount(req.body.account);
  const rawPassword = String(req.body.password ?? '');
  const clientVersion = String(req.body.client_version ?? CLIENT_VERSION);
  const validationMessage = validateCredentials(normalizedAccount, rawPassword);

  if (validationMessage) {
    fail(res, 1003, validationMessage);
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const player = await loadPlayerForAccount(connection, normalizedAccount);
    if (!player) {
      await connection.rollback();
      fail(res, 1004, '账号不存在。');
      return;
    }

    if (player.login_status !== 1) {
      await connection.rollback();
      fail(res, 1005, '账号当前不可登录。');
      return;
    }

    if (!verifyPassword(rawPassword, player.password_salt, player.password_hash)) {
      await connection.rollback();
      fail(res, 1006, '账号或密码错误。');
      return;
    }

    await connection.execute(
      `UPDATE player_account
          SET last_login_time = CURRENT_TIMESTAMP(3),
              updated_at = CURRENT_TIMESTAMP(3)
        WHERE player_id = ?`,
      [player.player_id],
    );

    const sessionRow = await createSession(connection, player.player_id, req, clientVersion);
    await connection.commit();

    ok(res, buildSessionPayload(sessionRow, player, false), 'login success');
  } catch (error) {
    await connection.rollback();
    console.error('[login] Failed to login.', error);
    fail(res, 1999, '登录失败，请检查数据库配置。', 500);
  } finally {
    connection.release();
  }
});

app.get('/api/v1/player/profile', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT pa.player_id,
              lac.account_name,
              pp.display_name,
              pp.signature,
              pr.gold_coin,
              pr.gem,
              pr.card_shard
         FROM player_account pa
         INNER JOIN local_account_credential lac
                 ON lac.player_id = pa.player_id
         INNER JOIN player_profile pp
                 ON pp.player_id = pa.player_id
         INNER JOIN player_resource pr
                 ON pr.player_id = pa.player_id
        WHERE pa.player_id = ?`,
      [req.auth.playerId],
    );

    const profile = rows[0];
    if (!profile) {
      fail(res, 1010, '玩家资料不存在。', 404);
      return;
    }

    ok(res, profile);
  } catch (error) {
    console.error('[profile] Failed to query player profile.', error);
    fail(res, 1999, '读取玩家资料失败。', 500);
  }
});

app.post('/api/v1/matchmaking/enqueue', authMiddleware, matchmakingRateLimiter, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await performMatchStateCleanup(connection);

    const currentState = await loadMatchmakingState(connection, req.auth.playerId);
    if (currentState.status === 'waiting' || currentState.status === 'matched') {
      await connection.commit();
      ok(res, currentState, 'matchmaking state reused');
      return;
    }

    const activeSeasonId = await getActiveSeasonId(connection);
    const deck = await getOrCreateDefaultDeck(connection, req.auth.playerId);
    const matchType = String(req.body.match_type ?? DEFAULT_MATCH_TYPE);
    const clientVersion = String(req.body.client_version ?? CLIENT_VERSION);

    const [queueResult] = await connection.execute(
      `INSERT INTO matchmaking_queue (
          player_id,
          match_type,
          season_id,
          deck_id,
          queue_status,
          estimated_wait_seconds,
          platform,
          client_version
        ) VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        req.auth.playerId,
        matchType,
        activeSeasonId,
        deck.deck_id,
        DEFAULT_MATCH_ESTIMATED_WAIT_SECONDS,
        LOCAL_PLATFORM,
        clientVersion,
      ],
    );

    await tryMatchWaitingPlayers(connection, matchType);

    const state = await loadMatchmakingState(connection, req.auth.playerId);
    await connection.commit();

    ok(
      res,
      {
        ...state,
        deck_id: deck.deck_id,
      },
      queueResult.insertId === state.queue_id ? 'matchmaking enqueued' : 'matchmaking matched',
    );
  } catch (error) {
    await connection.rollback();
    console.error('[matchmaking/enqueue] Failed to enqueue player.', error);
    fail(res, 2001, '进入匹配失败，请稍后重试。', 500);
  } finally {
    connection.release();
  }
});

app.get('/api/v1/matchmaking/status', authMiddleware, async (req, res) => {
  try {
    const state = await loadMatchmakingState(pool, req.auth.playerId);
    ok(res, state);
  } catch (error) {
    console.error('[matchmaking/status] Failed to query state.', error);
    fail(res, 2002, '读取匹配状态失败。', 500);
  }
});

app.post('/api/v1/matchmaking/cancel', authMiddleware, matchmakingRateLimiter, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await performMatchStateCleanup(connection);

    const [queueRows] = await connection.execute(
      `SELECT queue_id,
              queue_status
         FROM matchmaking_queue
        WHERE player_id = ?
          AND queue_status IN (0, 1)
        ORDER BY queue_id DESC
        LIMIT 1
        FOR UPDATE`,
      [req.auth.playerId],
    );

    const queueRow = queueRows[0];
    if (!queueRow) {
      await connection.commit();
      ok(res, { status: 'idle' }, 'matchmaking already idle');
      return;
    }

    if (queueRow.queue_status === 1) {
      await connection.commit();
      fail(res, 2003, '当前对局已匹配成功，无法取消。');
      return;
    }

    await connection.execute(
      `UPDATE matchmaking_queue
          SET queue_status = 2,
              cancel_time = CURRENT_TIMESTAMP(3)
        WHERE queue_id = ?`,
      [queueRow.queue_id],
    );

    await connection.commit();
    ok(res, { status: 'idle' }, 'matchmaking canceled');
  } catch (error) {
    await connection.rollback();
    console.error('[matchmaking/cancel] Failed to cancel queue.', error);
    fail(res, 2004, '取消匹配失败。', 500);
  } finally {
    connection.release();
  }
});

app.get('/api/v1/matches/:matchId/state', authMiddleware, matchStateRateLimiter, async (req, res) => {
  const matchId = Number.parseInt(req.params.matchId, 10);
  const sinceVersion = Number.parseInt(String(req.query.since_version ?? ''), 10);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    fail(res, 3001, '对局 ID 无效。');
    return;
  }

  try {
    await touchMatchPlayerConnection(pool, matchId, req.auth.playerId);

    const versionInfo = await loadMatchStateVersion(pool, matchId, req.auth.playerId);
    if (!versionInfo) {
      fail(res, 3002, '未找到对应对局。', 404);
      return;
    }

    if (Number.isInteger(sinceVersion) && sinceVersion > 0 && versionInfo.state_version === sinceVersion) {
      ok(res, {
        unchanged: true,
        match_id: versionInfo.match_id,
        state_version: versionInfo.state_version,
      }, 'match state unchanged');
      return;
    }

    const matchState = await loadMatchSummary(pool, matchId, req.auth.playerId);
    if (!matchState) {
      fail(res, 3002, '未找到对应对局。', 404);
      return;
    }

    ok(res, {
      unchanged: false,
      match_id: matchState.match_id,
      state_version: matchState.state_version,
      match: matchState,
    });
  } catch (error) {
    console.error('[matches/state] Failed to load match state.', error);
    fail(res, 3003, '读取对局状态失败。', 500);
  }
});

app.post('/api/v1/matches/:matchId/select-slot', authMiddleware, matchActionRateLimiter, async (req, res) => {
  const matchId = Number.parseInt(req.params.matchId, 10);
  const slotIndex = Number.parseInt(String(req.body.slot_index ?? ''), 10);

  if (!Number.isInteger(matchId) || matchId <= 0) {
    fail(res, 3004, '对局 ID 无效。');
    return;
  }

  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MATCH_GROUP_COUNT) {
    fail(res, 3005, '地形组索引无效。');
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await performMatchStateCleanup(connection);

    const [rows] = await connection.execute(
      `SELECT mr.match_id,
              mr.room_status,
              mr.turn_player_id,
              mr.turn_deadline_at,
              mr.terrain_market_snapshot
         FROM match_room mr
         INNER JOIN match_player mp
                 ON mp.match_id = mr.match_id
                AND mp.player_id = ?
        WHERE mr.match_id = ?
        LIMIT 1
        FOR UPDATE`,
      [req.auth.playerId, matchId],
    );

    const room = rows[0];
    if (!room) {
      await connection.rollback();
      fail(res, 3006, '未找到对应对局。', 404);
      return;
    }

    if (room.room_status !== 1) {
      await connection.rollback();
      fail(res, 3007, '当前对局不在进行中。');
      return;
    }

    if (room.turn_player_id !== req.auth.playerId) {
      await connection.rollback();
      fail(res, 3008, '当前不是你的回合。');
      return;
    }

    const marketSnapshot = normalizeTerrainMarketSnapshot(
      parseJsonValue(room.terrain_market_snapshot),
    );

    if (marketSnapshot.active_slot_index !== null && marketSnapshot.active_slot_index !== slotIndex) {
      await connection.rollback();
      fail(res, 3009, '本回合已经锁定了其他地形组。');
      return;
    }

    marketSnapshot.active_slot_index = slotIndex;
    marketSnapshot.remaining_piece_indices = Array.from(
      { length: Math.min(MATCH_PIECES_PER_GROUP, marketSnapshot.slot_groups[slotIndex]?.length ?? 0) },
      (_value, index) => index,
    );

    await connection.execute(
      `UPDATE match_room
          SET terrain_market_snapshot = ?,
              step_status = 'place_terrain',
              state_version = state_version + 1,
              last_action_at = CURRENT_TIMESTAMP(3)
        WHERE match_id = ?`,
      [JSON.stringify(marketSnapshot), matchId],
    );

    const matchState = await loadMatchStateForPlayer(connection, matchId, req.auth.playerId);
    await connection.commit();
    ok(res, matchState, 'slot selected');
  } catch (error) {
    await connection.rollback();
    console.error('[matches/select-slot] Failed to select slot.', error);
    fail(res, 3010, '锁定地形组失败。', 500);
  } finally {
    connection.release();
  }
});

app.post('/api/v1/matches/:matchId/place-piece', authMiddleware, matchActionRateLimiter, async (req, res) => {
  const matchId = Number.parseInt(req.params.matchId, 10);
  const previewIndex = Number.parseInt(String(req.body.preview_index ?? ''), 10);
  const q = Number.parseInt(String(req.body.q ?? ''), 10);
  const r = Number.parseInt(String(req.body.r ?? ''), 10);

  if (!Number.isInteger(matchId) || matchId <= 0) {
    fail(res, 3011, '对局 ID 无效。');
    return;
  }

  if (!Number.isInteger(previewIndex) || previewIndex < 0 || previewIndex >= MATCH_PIECES_PER_GROUP) {
    fail(res, 3012, '地形预览索引无效。');
    return;
  }

  if (!Number.isInteger(q) || !Number.isInteger(r)) {
    fail(res, 3013, '棋盘坐标无效。');
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await performMatchStateCleanup(connection);

    const [rows] = await connection.execute(
      `SELECT mr.match_id,
              mr.room_status,
              mr.turn_player_id,
              mr.step_status,
              mr.terrain_market_snapshot,
              mp.board_snapshot_json,
              mp.seat_no
         FROM match_room mr
         INNER JOIN match_player mp
                 ON mp.match_id = mr.match_id
                AND mp.player_id = ?
        WHERE mr.match_id = ?
        LIMIT 1
        FOR UPDATE`,
      [req.auth.playerId, matchId],
    );

    const room = rows[0];
    if (!room) {
      await connection.rollback();
      fail(res, 3014, '未找到对应对局。', 404);
      return;
    }

    if (room.room_status !== 1) {
      await connection.rollback();
      fail(res, 3015, '当前对局不在进行中。');
      return;
    }

    if (room.turn_player_id !== req.auth.playerId) {
      await connection.rollback();
      fail(res, 3016, '当前不是你的回合。');
      return;
    }

    const marketSnapshot = normalizeTerrainMarketSnapshot(
      parseJsonValue(room.terrain_market_snapshot),
    );
    if (marketSnapshot.active_slot_index === null || marketSnapshot.active_slot_index < 0) {
      await connection.rollback();
      fail(res, 3017, '当前回合还没有锁定地形组。');
      return;
    }

    if (!marketSnapshot.remaining_piece_indices.includes(previewIndex)) {
      await connection.rollback();
      fail(res, 3018, '这块地形本回合已经放置过了。');
      return;
    }

    const pieceType = marketSnapshot.slot_groups[marketSnapshot.active_slot_index]?.[previewIndex] ?? null;
    if (!pieceType) {
      await connection.rollback();
      fail(res, 3019, '当前地形预览不存在。');
      return;
    }

    const boardSnapshot = normalizeBoardSnapshot(
      parseJsonValue(room.board_snapshot_json),
      req.auth.playerId,
      room.seat_no,
    );
    const placementResult = applyTerrainPlacementToBoard(boardSnapshot, q, r, pieceType);
    if (!placementResult.allowed) {
      await connection.rollback();
      fail(res, 3020, `当前地形不能放在这个格子：${placementResult.reason ?? '规则校验失败。'}`);
      return;
    }

    marketSnapshot.remaining_piece_indices = marketSnapshot.remaining_piece_indices.filter((value) => value !== previewIndex);
    const nextStepStatus = marketSnapshot.remaining_piece_indices.length > 0 ? 'place_terrain' : 'optional_animal';

    await connection.execute(
      `UPDATE match_player
          SET board_snapshot_json = ?,
              board_public_snapshot_json = ?
        WHERE match_id = ?
          AND player_id = ?`,
      [
        JSON.stringify(boardSnapshot),
        JSON.stringify(buildBoardPublicSnapshot(boardSnapshot)),
        matchId,
        req.auth.playerId,
      ],
    );

    await connection.execute(
      `UPDATE match_room
          SET terrain_market_snapshot = ?,
              step_status = ?,
              state_version = state_version + 1,
              last_action_at = CURRENT_TIMESTAMP(3)
        WHERE match_id = ?`,
      [JSON.stringify(marketSnapshot), nextStepStatus, matchId],
    );

    const matchState = await loadMatchStateForPlayer(connection, matchId, req.auth.playerId);
    await connection.commit();
    ok(res, matchState, 'terrain placed');
  } catch (error) {
    await connection.rollback();
    console.error('[matches/place-piece] Failed to place terrain piece.', error);
    fail(res, 3021, '放置地形失败。', 500);
  } finally {
    connection.release();
  }
});

app.post('/api/v1/matches/:matchId/recruit-animal', authMiddleware, matchActionRateLimiter, async (req, res) => {
  const matchId = Number.parseInt(req.params.matchId, 10);
  const slotIndex = Number.parseInt(String(req.body.slot_index ?? ''), 10);

  if (!Number.isInteger(matchId) || matchId <= 0) {
    fail(res, 3022, '对局 ID 无效。');
    return;
  }

  if (!Number.isInteger(slotIndex) || slotIndex < 0) {
    fail(res, 3023, '动物候选索引无效。');
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await performMatchStateCleanup(connection);

    const [rows] = await connection.execute(
      `SELECT mr.match_id,
              mr.room_status,
              mr.turn_no,
              mr.turn_player_id,
              mp.candidate_card_json,
              mp.ongoing_card_json
         FROM match_room mr
         INNER JOIN match_player mp
                 ON mp.match_id = mr.match_id
                AND mp.player_id = ?
        WHERE mr.match_id = ?
        LIMIT 1
        FOR UPDATE`,
      [req.auth.playerId, matchId],
    );

    const room = rows[0];
    if (!room) {
      await connection.rollback();
      fail(res, 3024, '未找到对应对局。', 404);
      return;
    }

    if (room.room_status !== 1) {
      await connection.rollback();
      fail(res, 3025, '当前对局不在进行中。');
      return;
    }

    if (room.turn_player_id !== req.auth.playerId) {
      await connection.rollback();
      fail(res, 3026, '当前不是你的回合。');
      return;
    }

    const animalState = normalizeAnimalStates(
      parseJsonValue(room.candidate_card_json),
      parseJsonValue(room.ongoing_card_json),
    );
    const recruitResult = recruitAnimalFromMarket(animalState, slotIndex, room.turn_no);
    if (!recruitResult.ok) {
      await connection.rollback();
      fail(res, 3027, recruitResult.reason ?? '当前动物牌不可领取。');
      return;
    }

    const serializedAnimalState = serializeAnimalStates(animalState);
    await connection.execute(
      `UPDATE match_player
          SET candidate_card_json = ?,
              ongoing_card_json = ?
        WHERE match_id = ?
          AND player_id = ?`,
      [
        JSON.stringify(serializedAnimalState.candidate),
        JSON.stringify(serializedAnimalState.ongoing),
        matchId,
        req.auth.playerId,
      ],
    );

    await connection.execute(
      `UPDATE match_room
          SET state_version = state_version + 1,
              last_action_at = CURRENT_TIMESTAMP(3)
        WHERE match_id = ?`,
      [matchId],
    );

    const matchState = await loadMatchStateForPlayer(connection, matchId, req.auth.playerId);
    await connection.commit();
    ok(res, matchState, 'animal recruited');
  } catch (error) {
    await connection.rollback();
    console.error('[matches/recruit-animal] Failed to recruit animal card.', error);
    fail(res, 3028, '领取动物牌失败。', 500);
  } finally {
    connection.release();
  }
});

app.post('/api/v1/matches/:matchId/place-animal', authMiddleware, matchActionRateLimiter, async (req, res) => {
  const matchId = Number.parseInt(req.params.matchId, 10);
  const cardId = String(req.body.card_id ?? '').trim();
  const q = Number.parseInt(String(req.body.q ?? ''), 10);
  const r = Number.parseInt(String(req.body.r ?? ''), 10);

  if (!Number.isInteger(matchId) || matchId <= 0) {
    fail(res, 3029, '对局 ID 无效。');
    return;
  }

  if (!cardId) {
    fail(res, 3030, '动物牌 ID 不能为空。');
    return;
  }

  if (!Number.isInteger(q) || !Number.isInteger(r)) {
    fail(res, 3031, '棋盘坐标无效。');
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await performMatchStateCleanup(connection);

    const [rows] = await connection.execute(
      `SELECT mr.match_id,
              mr.room_status,
              mr.turn_no,
              mr.turn_player_id,
              mp.board_snapshot_json,
              mp.candidate_card_json,
              mp.ongoing_card_json,
              mp.seat_no
         FROM match_room mr
         INNER JOIN match_player mp
                 ON mp.match_id = mr.match_id
                AND mp.player_id = ?
        WHERE mr.match_id = ?
        LIMIT 1
        FOR UPDATE`,
      [req.auth.playerId, matchId],
    );

    const room = rows[0];
    if (!room) {
      await connection.rollback();
      fail(res, 3032, '未找到对应对局。', 404);
      return;
    }

    if (room.room_status !== 1) {
      await connection.rollback();
      fail(res, 3033, '当前对局不在进行中。');
      return;
    }

    if (room.turn_player_id !== req.auth.playerId) {
      await connection.rollback();
      fail(res, 3034, '当前不是你的回合。');
      return;
    }

    const boardSnapshot = normalizeBoardSnapshot(
      parseJsonValue(room.board_snapshot_json),
      req.auth.playerId,
      room.seat_no,
    );
    const animalState = normalizeAnimalStates(
      parseJsonValue(room.candidate_card_json),
      parseJsonValue(room.ongoing_card_json),
    );
    const placementResult = placeAnimalOnBoard(boardSnapshot, animalState, cardId, q, r);
    if (!placementResult.ok) {
      await connection.rollback();
      fail(res, 3035, placementResult.reason ?? '当前动物牌不能放在这个格子。');
      return;
    }

    const serializedAnimalState = serializeAnimalStates(animalState);
    await connection.execute(
      `UPDATE match_player
          SET board_snapshot_json = ?,
              board_public_snapshot_json = ?,
              candidate_card_json = ?,
              ongoing_card_json = ?,
              placed_cube_count = ?,
              animal_score = ?
        WHERE match_id = ?
          AND player_id = ?`,
      [
        JSON.stringify(boardSnapshot),
        JSON.stringify(buildBoardPublicSnapshot(boardSnapshot)),
        JSON.stringify(serializedAnimalState.candidate),
        JSON.stringify(serializedAnimalState.ongoing),
        Object.values(animalState.runtime_states).reduce((sum, runtimeState) => sum + runtimeState.placed_anchors.length, 0),
        Object.values(animalState.runtime_states).reduce((sum, runtimeState) => sum + runtimeState.placed_anchors.length, 0),
        matchId,
        req.auth.playerId,
      ],
    );

    await connection.execute(
      `UPDATE match_room
          SET state_version = state_version + 1,
              last_action_at = CURRENT_TIMESTAMP(3)
        WHERE match_id = ?`,
      [matchId],
    );

    const matchState = await loadMatchStateForPlayer(connection, matchId, req.auth.playerId);
    await connection.commit();
    ok(res, matchState, 'animal placed');
  } catch (error) {
    await connection.rollback();
    console.error('[matches/place-animal] Failed to place animal.', error);
    fail(res, 3036, '放置动物失败。', 500);
  } finally {
    connection.release();
  }
});

app.post('/api/v1/matches/:matchId/end-turn', authMiddleware, matchActionRateLimiter, async (req, res) => {
  const matchId = Number.parseInt(req.params.matchId, 10);

  if (!Number.isInteger(matchId) || matchId <= 0) {
    fail(res, 3011, '对局 ID 无效。');
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await performMatchStateCleanup(connection);

    const [rows] = await connection.execute(
      `SELECT mr.match_id,
              mr.room_status,
              mr.turn_no,
              mr.turn_player_id,
              mr.terrain_market_snapshot,
              mr.terrain_bag_snapshot,
              mp.board_snapshot_json,
              mp.seat_no,
              opponent.player_id AS opponent_player_id
         FROM match_room mr
         INNER JOIN match_player mp
                 ON mp.match_id = mr.match_id
                AND mp.player_id = ?
         LEFT JOIN match_player opponent
                ON opponent.match_id = mr.match_id
               AND opponent.player_id <> mp.player_id
        WHERE mr.match_id = ?
        LIMIT 1
        FOR UPDATE`,
      [req.auth.playerId, matchId],
    );

    const room = rows[0];
    if (!room) {
      await connection.rollback();
      fail(res, 3012, '未找到对应对局。', 404);
      return;
    }

    if (room.room_status !== 1) {
      await connection.rollback();
      fail(res, 3013, '当前对局不在进行中。');
      return;
    }

    if (room.turn_player_id !== req.auth.playerId) {
      await connection.rollback();
      fail(res, 3014, '当前不是你的回合。');
      return;
    }

    const marketSnapshot = normalizeTerrainMarketSnapshot(
      parseJsonValue(room.terrain_market_snapshot),
    );
    const bagSnapshot = Array.isArray(room.terrain_bag_snapshot)
      ? room.terrain_bag_snapshot
      : (parseJsonValue(room.terrain_bag_snapshot) ?? []);
    const activeSlotIndex = marketSnapshot.active_slot_index;
    const boardSnapshot = normalizeBoardSnapshot(
      parseJsonValue(room.board_snapshot_json),
      req.auth.playerId,
      room.seat_no,
    );

    if (activeSlotIndex === null || activeSlotIndex < 0) {
      await connection.rollback();
      fail(res, 3037, '当前回合还没有锁定地形组。');
      return;
    }

    const remainingPieceIndices = [...marketSnapshot.remaining_piece_indices];
    for (const previewIndex of remainingPieceIndices) {
      const pieceType = marketSnapshot.slot_groups[activeSlotIndex]?.[previewIndex] ?? null;
      if (!pieceType) {
        continue;
      }

      const legalPlacements = getLegalTerrainPlacements(boardSnapshot, pieceType);
      if (legalPlacements.length === 0) {
        continue;
      }

      const randomPlacement = legalPlacements[Math.floor(Math.random() * legalPlacements.length)];
      const autoPlaceResult = applyTerrainPlacementToBoard(boardSnapshot, randomPlacement.q, randomPlacement.r, pieceType);
      if (!autoPlaceResult.allowed) {
        continue;
      }
    }

    if (activeSlotIndex !== null && activeSlotIndex >= 0 && activeSlotIndex < marketSnapshot.slot_groups.length) {
      marketSnapshot.slot_groups[activeSlotIndex] = drawTerrainPiecesFromBag(bagSnapshot, MATCH_PIECES_PER_GROUP);
    }

    marketSnapshot.active_slot_index = null;
    marketSnapshot.remaining_piece_indices = [];

    const nextPlayerId = room.opponent_player_id ?? req.auth.playerId;
    const nextDeadlineAt = new Date(Date.now() + DEFAULT_TURN_SECONDS * 1000);

    await connection.execute(
      `UPDATE match_player
          SET board_snapshot_json = ?,
              board_public_snapshot_json = ?
        WHERE match_id = ?
          AND player_id = ?`,
      [
        JSON.stringify(boardSnapshot),
        JSON.stringify(buildBoardPublicSnapshot(boardSnapshot)),
        matchId,
        req.auth.playerId,
      ],
    );

    await connection.execute(
      `UPDATE match_room
          SET turn_no = ?,
              turn_player_id = ?,
              turn_deadline_at = ?,
              terrain_market_snapshot = ?,
              terrain_bag_snapshot = ?,
              terrain_bag_remaining = ?,
              step_status = 'pick_terrain_group',
              state_version = state_version + 1,
              last_action_at = CURRENT_TIMESTAMP(3)
        WHERE match_id = ?`,
      [
        room.turn_no + 1,
        nextPlayerId,
        toMysqlDate(nextDeadlineAt),
        JSON.stringify(marketSnapshot),
        JSON.stringify(bagSnapshot),
        bagSnapshot.length,
        matchId,
      ],
    );

    const matchState = await loadMatchStateForPlayer(connection, matchId, req.auth.playerId);
    await connection.commit();
    ok(res, matchState, 'turn ended');
  } catch (error) {
    await connection.rollback();
    console.error('[matches/end-turn] Failed to end turn.', error);
    fail(res, 3038, '结束回合失败。', 500);
  } finally {
    connection.release();
  }
});

app.post('/api/v1/matches/:matchId/leave', authMiddleware, matchActionRateLimiter, async (req, res) => {
  const matchId = Number.parseInt(req.params.matchId, 10);

  if (!Number.isInteger(matchId) || matchId <= 0) {
    fail(res, 3016, '对局 ID 无效。');
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await performMatchStateCleanup(connection);

    const [rows] = await connection.execute(
      `SELECT mr.match_id
         FROM match_room mr
         INNER JOIN match_player mp
                 ON mp.match_id = mr.match_id
                AND mp.player_id = ?
        WHERE mr.match_id = ?
        LIMIT 1
        FOR UPDATE`,
      [req.auth.playerId, matchId],
    );

    const room = rows[0];
    if (!room) {
      await connection.commit();
      ok(
        res,
        {
          deleted: true,
          remaining_connected_players: 0,
        },
        'match already removed',
      );
      return;
    }

    const result = await markPlayerLeftMatch(connection, matchId, req.auth.playerId);
    await connection.commit();
    ok(res, result, result.deleted ? 'match removed after all players left' : 'player left match');
  } catch (error) {
    await connection.rollback();
    console.error('[matches/leave] Failed to leave match.', error);
    fail(res, 3017, '离开对局失败。', 500);
  } finally {
    connection.release();
  }
});

const server = app.listen(PORT, () => {
  console.log(`[arkstory-auth-server] Listening on http://127.0.0.1:${PORT}`);
});

matchCleanupScheduler.start();

registerProcessLifecycle({
  server,
  pool,
  runtimeState,
  cleanupScheduler: matchCleanupScheduler,
  shutdownTimeoutMs: GRACEFUL_SHUTDOWN_TIMEOUT_MS,
});
