const MATCH_ANIMAL_MARKET_COUNT = 2;
const MAX_ACTIVE_ANIMAL_CARDS = 4;
const BOARD_GRID_COLUMNS_BY_ROW = {
  1: [1, 2, 3, 4, 5],
  2: [1, 2, 3, 4],
  3: [1, 2, 3, 4, 5],
  4: [1, 2, 3, 4],
  5: [1, 2, 3, 4, 5],
};

const TerrainPieceType = {
  Building: 'building',
  Field: 'field',
  Stump: 'stump',
  Leaves: 'leaves',
  Mountain: 'mountain',
  River: 'river',
};

const ALL_BOARD_COORDINATES = buildBoardCoordinates();
const PROTOTYPE_WHITE_ANIMAL_CARDS = {
  W01: {
    cardId: 'W01',
    cubeSlots: 3,
    scoreSteps: [0, 2, 4, 6],
    placementCell: { q: 0, r: 0, type: 'T1' },
    patternCells: [
      { q: 0, r: 0, type: 'T1' },
      { q: 1, r: 0, type: 'BN1' },
    ],
    adjacentRequirementTypes: ['BN1'],
  },
  W02: {
    cardId: 'W02',
    cubeSlots: 3,
    scoreSteps: [0, 2, 4, 6],
    placementCell: { q: 0, r: 0, type: 'WT' },
    patternCells: [
      { q: 0, r: 0, type: 'WT' },
      { q: 1, r: 0, type: 'T1' },
    ],
    adjacentRequirementTypes: ['T1'],
  },
  W03: {
    cardId: 'W03',
    cubeSlots: 3,
    scoreSteps: [0, 3, 5, 7],
    placementCell: { q: 0, r: 0, type: 'H' },
    patternCells: [
      { q: 0, r: 0, type: 'H' },
      { q: 1, r: 0, type: 'BN1' },
    ],
    adjacentRequirementTypes: ['BN1'],
  },
};

function buildBoardCoordinates() {
  const result = [];
  for (const [rowText, columns] of Object.entries(BOARD_GRID_COLUMNS_BY_ROW)) {
    const row = Number.parseInt(rowText, 10);
    for (const column of columns) {
      result.push({ q: row, r: column });
    }
  }
  return result;
}

function shuffleArray(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = items[index];
    items[index] = items[swapIndex];
    items[swapIndex] = current;
  }
}

function toCoordinateKey(q, r) {
  return `${q},${r}`;
}

function isValidBoardCoordinate(q, r) {
  const validColumns = BOARD_GRID_COLUMNS_BY_ROW[q];
  return Array.isArray(validColumns) && validColumns.includes(r);
}

function buildEmptyBoardSnapshot(playerId, seatNo) {
  return {
    version: 1,
    owner_player_id: playerId,
    seat_no: seatNo,
    terrain_cells: [],
    animal_cells: [],
  };
}

function normalizeBoardSnapshot(rawSnapshot, playerId, seatNo) {
  const fallback = buildEmptyBoardSnapshot(playerId, seatNo);
  if (!rawSnapshot || typeof rawSnapshot !== 'object') {
    return fallback;
  }

  const terrainMap = new Map();
  const animalMap = new Map();
  const terrainCells = Array.isArray(rawSnapshot.terrain_cells) ? rawSnapshot.terrain_cells : [];
  const animalCells = Array.isArray(rawSnapshot.animal_cells) ? rawSnapshot.animal_cells : [];

  for (const cell of terrainCells) {
    if (!cell || !Number.isInteger(cell.q) || !Number.isInteger(cell.r) || !isValidBoardCoordinate(cell.q, cell.r)) {
      continue;
    }

    const stack = Array.isArray(cell.stack) ? cell.stack.filter((pieceType) => typeof pieceType === 'string') : [];
    if (stack.length === 0) {
      continue;
    }

    terrainMap.set(toCoordinateKey(cell.q, cell.r), {
      q: cell.q,
      r: cell.r,
      stack: [...stack],
    });
  }

  for (const cell of animalCells) {
    if (
      !cell
      || !Number.isInteger(cell.q)
      || !Number.isInteger(cell.r)
      || !isValidBoardCoordinate(cell.q, cell.r)
      || typeof cell.card_id !== 'string'
      || cell.card_id.length === 0
    ) {
      continue;
    }

    animalMap.set(toCoordinateKey(cell.q, cell.r), {
      q: cell.q,
      r: cell.r,
      card_id: cell.card_id,
    });
  }

  return {
    version: Number.isInteger(rawSnapshot.version) ? rawSnapshot.version : 1,
    owner_player_id: Number.isInteger(rawSnapshot.owner_player_id) ? rawSnapshot.owner_player_id : playerId,
    seat_no: Number.isInteger(rawSnapshot.seat_no) ? rawSnapshot.seat_no : seatNo,
    terrain_cells: [...terrainMap.values()],
    animal_cells: [...animalMap.values()],
  };
}

function cloneBoardSnapshot(snapshot) {
  return {
    version: snapshot.version,
    owner_player_id: snapshot.owner_player_id,
    seat_no: snapshot.seat_no,
    terrain_cells: snapshot.terrain_cells.map((cell) => ({
      q: cell.q,
      r: cell.r,
      stack: [...cell.stack],
    })),
    animal_cells: snapshot.animal_cells.map((cell) => ({
      q: cell.q,
      r: cell.r,
      card_id: cell.card_id,
    })),
  };
}

function buildBoardPublicSnapshot(snapshot) {
  return cloneBoardSnapshot(snapshot);
}

function getTerrainCell(snapshot, q, r) {
  return snapshot.terrain_cells.find((cell) => cell.q === q && cell.r === r) ?? null;
}

function getAnimalCell(snapshot, q, r) {
  return snapshot.animal_cells.find((cell) => cell.q === q && cell.r === r) ?? null;
}

function upsertTerrainCell(snapshot, q, r, stack) {
  const existingCell = getTerrainCell(snapshot, q, r);
  if (stack.length === 0) {
    if (existingCell) {
      snapshot.terrain_cells = snapshot.terrain_cells.filter((cell) => cell !== existingCell);
    }
    return;
  }

  if (existingCell) {
    existingCell.stack = [...stack];
    return;
  }

  snapshot.terrain_cells.push({
    q,
    r,
    stack: [...stack],
  });
}

function upsertAnimalCell(snapshot, q, r, cardId) {
  const existingCell = getAnimalCell(snapshot, q, r);
  if (!cardId) {
    if (existingCell) {
      snapshot.animal_cells = snapshot.animal_cells.filter((cell) => cell !== existingCell);
    }
    return;
  }

  if (existingCell) {
    existingCell.card_id = cardId;
    return;
  }

  snapshot.animal_cells.push({
    q,
    r,
    card_id: cardId,
  });
}

function getCellState(snapshot, q, r) {
  const terrainCell = getTerrainCell(snapshot, q, r);
  const animalCell = getAnimalCell(snapshot, q, r);
  return {
    stack: terrainCell ? [...terrainCell.stack] : [],
    hasAnimalOccupant: !!animalCell,
  };
}

function getDocumentedTerrainCode(stack) {
  if (!Array.isArray(stack) || stack.length === 0) {
    return null;
  }

  if (stack.length === 1) {
    switch (stack[0]) {
      case TerrainPieceType.Building:
        return 'H';
      case TerrainPieceType.River:
        return 'WT';
      case TerrainPieceType.Stump:
        return 'BN1';
      case TerrainPieceType.Field:
        return 'FD';
      case TerrainPieceType.Mountain:
        return 'M1';
      case TerrainPieceType.Leaves:
        return 'T1';
      default:
        return null;
    }
  }

  if (stack.length === 2) {
    if (stack[0] === TerrainPieceType.Mountain && stack[1] === TerrainPieceType.Mountain) {
      return 'M2';
    }
    if (stack[0] === TerrainPieceType.Stump && stack[1] === TerrainPieceType.Leaves) {
      return 'T2';
    }
    if (stack[0] === TerrainPieceType.Stump && stack[1] === TerrainPieceType.Stump) {
      return 'BN2';
    }
    if (stack[1] === TerrainPieceType.Building) {
      return 'H';
    }
    return null;
  }

  if (stack.length === 3) {
    if (
      stack[0] === TerrainPieceType.Mountain
      && stack[1] === TerrainPieceType.Mountain
      && stack[2] === TerrainPieceType.Mountain
    ) {
      return 'M3';
    }
    if (
      stack[0] === TerrainPieceType.Stump
      && stack[1] === TerrainPieceType.Stump
      && stack[2] === TerrainPieceType.Leaves
    ) {
      return 'T3';
    }
    if (stack[2] === TerrainPieceType.Building) {
      return 'H';
    }
  }

  return null;
}

function rejectPlacement(currentStack, reason) {
  return {
    allowed: false,
    reason,
    resultingStack: [...currentStack],
  };
}

function acceptPlacement(currentStack, pieceType) {
  return {
    allowed: true,
    resultingStack: [...currentStack, pieceType],
  };
}

function validateTerrainPlacement(cellState, pieceType) {
  const currentStack = Array.isArray(cellState.stack) ? [...cellState.stack] : [];
  const maxStackHeight = 3;
  const maxStumpLayers = 2;
  const maxBuildingLayers = 2;

  if (cellState.hasAnimalOccupant) {
    return rejectPlacement(currentStack, 'Cannot place terrain onto a cell occupied by an animal cube.');
  }

  if (currentStack.length >= maxStackHeight) {
    return rejectPlacement(currentStack, `Terrain stack already reached the max height of ${maxStackHeight}.`);
  }

  const topPiece = currentStack[currentStack.length - 1] ?? null;

  switch (pieceType) {
    case TerrainPieceType.Field:
      return currentStack.length === 0
        ? acceptPlacement(currentStack, pieceType)
        : rejectPlacement(currentStack, 'Field can only be placed on an empty cell.');
    case TerrainPieceType.River:
      return currentStack.length === 0
        ? acceptPlacement(currentStack, pieceType)
        : rejectPlacement(currentStack, 'River can only be placed on an empty cell.');
    case TerrainPieceType.Stump:
      if (currentStack.length === 0) {
        return acceptPlacement(currentStack, pieceType);
      }
      if (currentStack.every((value) => value === TerrainPieceType.Stump) && currentStack.length < maxStumpLayers) {
        return acceptPlacement(currentStack, pieceType);
      }
      return rejectPlacement(currentStack, 'Stump can only stack on stump, and stump layers are capped at 2.');
    case TerrainPieceType.Leaves:
      if (currentStack.length === 0) {
        return acceptPlacement(currentStack, pieceType);
      }
      if (currentStack.every((value) => value === TerrainPieceType.Stump) && currentStack.length <= maxStumpLayers) {
        return acceptPlacement(currentStack, pieceType);
      }
      return rejectPlacement(currentStack, 'Leaves can only be placed on top of 1 to 2 stump layers, or directly on an empty cell.');
    case TerrainPieceType.Mountain:
      if (currentStack.length === 0) {
        return acceptPlacement(currentStack, pieceType);
      }
      if (currentStack.every((value) => value === TerrainPieceType.Mountain)) {
        return acceptPlacement(currentStack, pieceType);
      }
      return rejectPlacement(currentStack, 'Mountain can only stack on mountain.');
    case TerrainPieceType.Building: {
      if (currentStack.length === 0) {
        return acceptPlacement(currentStack, pieceType);
      }
      if (
        topPiece !== TerrainPieceType.Building
        && topPiece !== TerrainPieceType.Mountain
        && topPiece !== TerrainPieceType.Stump
      ) {
        return rejectPlacement(currentStack, 'Building can only be placed on top of building, mountain, or stump.');
      }
      const buildingLayerCount = currentStack.filter((value) => value === TerrainPieceType.Building).length;
      if (buildingLayerCount >= maxBuildingLayers) {
        return rejectPlacement(currentStack, `Building layers are capped at ${maxBuildingLayers}.`);
      }
      return acceptPlacement(currentStack, pieceType);
    }
    default:
      return rejectPlacement(currentStack, 'Unknown terrain piece type.');
  }
}

function getLegalTerrainPlacements(snapshot, pieceType) {
  const placements = [];

  for (const coordinate of ALL_BOARD_COORDINATES) {
    const validation = validateTerrainPlacement(getCellState(snapshot, coordinate.q, coordinate.r), pieceType);
    if (!validation.allowed) {
      continue;
    }

    placements.push({
      q: coordinate.q,
      r: coordinate.r,
      resultingStack: [...validation.resultingStack],
    });
  }

  return placements;
}

function applyTerrainPlacementToBoard(snapshot, q, r, pieceType) {
  if (!isValidBoardCoordinate(q, r)) {
    return {
      allowed: false,
      reason: 'Board coordinate is out of range.',
      resultingStack: [],
      snapshot,
    };
  }

  const validation = validateTerrainPlacement(getCellState(snapshot, q, r), pieceType);
  if (!validation.allowed) {
    return {
      ...validation,
      snapshot,
    };
  }

  upsertTerrainCell(snapshot, q, r, validation.resultingStack);
  return {
    ...validation,
    snapshot,
  };
}

function createInitialAnimalCandidateState() {
  const deckOrder = Object.keys(PROTOTYPE_WHITE_ANIMAL_CARDS);
  shuffleArray(deckOrder);
  const marketCardIds = deckOrder.splice(0, MATCH_ANIMAL_MARKET_COUNT);

  return {
    deck_order: deckOrder,
    market_card_ids: marketCardIds,
    last_recruit_turn_no: null,
  };
}

function createInitialAnimalOngoingState() {
  const runtimeStates = {};

  for (const cardId of Object.keys(PROTOTYPE_WHITE_ANIMAL_CARDS)) {
    runtimeStates[cardId] = {
      recruited: false,
      placed_anchors: [],
    };
  }

  return {
    runtime_states: runtimeStates,
  };
}

function normalizeAnimalStates(rawCandidateState, rawOngoingState) {
  const candidateState = rawCandidateState && typeof rawCandidateState === 'object'
    ? rawCandidateState
    : {};
  const ongoingState = rawOngoingState && typeof rawOngoingState === 'object'
    ? rawOngoingState
    : {};

  const runtimeStates = {};
  for (const [cardId] of Object.entries(PROTOTYPE_WHITE_ANIMAL_CARDS)) {
    const rawRuntime = ongoingState.runtime_states?.[cardId];
    runtimeStates[cardId] = {
      recruited: rawRuntime?.recruited === true,
      placed_anchors: Array.isArray(rawRuntime?.placed_anchors)
        ? rawRuntime.placed_anchors
          .filter((anchor) => anchor && Number.isInteger(anchor.q) && Number.isInteger(anchor.r))
          .map((anchor) => ({ q: anchor.q, r: anchor.r }))
        : [],
    };
  }

  const deckOrder = Array.isArray(candidateState.deck_order)
    ? candidateState.deck_order.filter((cardId) => typeof cardId === 'string' && PROTOTYPE_WHITE_ANIMAL_CARDS[cardId])
    : [];
  const marketCardIds = Array.isArray(candidateState.market_card_ids)
    ? candidateState.market_card_ids
      .filter((cardId) => typeof cardId === 'string' && PROTOTYPE_WHITE_ANIMAL_CARDS[cardId])
      .slice(0, MATCH_ANIMAL_MARKET_COUNT)
    : [];

  while (marketCardIds.length < MATCH_ANIMAL_MARKET_COUNT && deckOrder.length > 0) {
    const nextCardId = deckOrder.shift();
    if (nextCardId) {
      marketCardIds.push(nextCardId);
    }
  }

  return {
    deck_order: deckOrder,
    market_card_ids: marketCardIds,
    last_recruit_turn_no: Number.isInteger(candidateState.last_recruit_turn_no)
      ? candidateState.last_recruit_turn_no
      : null,
    runtime_states: runtimeStates,
  };
}

function serializeAnimalStates(animalState) {
  return {
    candidate: {
      deck_order: [...animalState.deck_order],
      market_card_ids: [...animalState.market_card_ids],
      last_recruit_turn_no: animalState.last_recruit_turn_no,
    },
    ongoing: {
      runtime_states: Object.fromEntries(
        Object.entries(animalState.runtime_states).map(([cardId, runtimeState]) => [
          cardId,
          {
            recruited: runtimeState.recruited === true,
            placed_anchors: runtimeState.placed_anchors.map((anchor) => ({ q: anchor.q, r: anchor.r })),
          },
        ]),
      ),
    },
  };
}

function toAnimalStatePayload(animalState, currentTurnNo) {
  return {
    market_card_ids: [...animalState.market_card_ids],
    recruited_this_turn: animalState.last_recruit_turn_no === currentTurnNo,
    runtime_states: Object.entries(animalState.runtime_states).map(([cardId, runtimeState]) => ({
      card_id: cardId,
      recruited: runtimeState.recruited === true,
      placed_anchors: runtimeState.placed_anchors.map((anchor) => ({ q: anchor.q, r: anchor.r })),
    })),
  };
}

function getAnimalDefinition(cardId) {
  return PROTOTYPE_WHITE_ANIMAL_CARDS[cardId] ?? null;
}

function getAnimalAccumulatedScore(cardDefinition, placedCubeCount) {
  const scoreSteps = Array.isArray(cardDefinition?.scoreSteps) ? cardDefinition.scoreSteps : [];
  const clampedIndex = Math.max(0, Math.min(placedCubeCount, scoreSteps.length - 1));
  let totalScore = 0;

  for (let index = 1; index <= clampedIndex; index += 1) {
    totalScore += Number.isFinite(scoreSteps[index]) ? scoreSteps[index] : 0;
  }

  return totalScore;
}

function calculateAnimalScore(animalState) {
  if (!animalState || typeof animalState !== 'object' || !animalState.runtime_states) {
    return 0;
  }

  let totalScore = 0;

  for (const [cardId, runtimeState] of Object.entries(animalState.runtime_states)) {
    if (!runtimeState || runtimeState.recruited !== true) {
      continue;
    }

    const cardDefinition = getAnimalDefinition(cardId);
    if (!cardDefinition) {
      continue;
    }

    totalScore += getAnimalAccumulatedScore(cardDefinition, runtimeState.placed_anchors.length);
  }

  return totalScore;
}

function getTopTerrainPiece(stack) {
  return Array.isArray(stack) && stack.length > 0
    ? stack[stack.length - 1]
    : null;
}

function isMountainStack(stack) {
  return Array.isArray(stack)
    && stack.length >= 1
    && stack.length <= 3
    && stack.every((pieceType) => pieceType === TerrainPieceType.Mountain);
}

function countRemainingEmptyCells(snapshot) {
  const occupiedCells = new Set(
    (Array.isArray(snapshot?.terrain_cells) ? snapshot.terrain_cells : [])
      .filter((cell) => Number.isInteger(cell?.q) && Number.isInteger(cell?.r))
      .map((cell) => toCoordinateKey(cell.q, cell.r)),
  );

  return ALL_BOARD_COORDINATES.reduce((count, coordinate) => {
    return occupiedCells.has(toCoordinateKey(coordinate.q, coordinate.r))
      ? count
      : count + 1;
  }, 0);
}

function scoreTrees(snapshot) {
  let score = 0;

  for (const cell of snapshot.terrain_cells) {
    const stack = Array.isArray(cell?.stack) ? cell.stack : [];
    if (stack.length === 1 && stack[0] === TerrainPieceType.Leaves) {
      score += 1;
      continue;
    }

    if (
      stack.length === 2
      && stack[0] === TerrainPieceType.Stump
      && stack[1] === TerrainPieceType.Leaves
    ) {
      score += 3;
      continue;
    }

    if (
      stack.length === 3
      && stack[0] === TerrainPieceType.Stump
      && stack[1] === TerrainPieceType.Stump
      && stack[2] === TerrainPieceType.Leaves
    ) {
      score += 7;
    }
  }

  return score;
}

function scoreMountains(snapshot) {
  let score = 0;
  const mountainCells = (Array.isArray(snapshot?.terrain_cells) ? snapshot.terrain_cells : [])
    .filter((cell) => isMountainStack(cell?.stack));

  for (const cell of mountainCells) {
    const hasNeighborMountain = getBoardNeighborCoordinates(cell.q, cell.r).some((coordinate) => {
      const neighborCell = getTerrainCell(snapshot, coordinate.q, coordinate.r);
      return isMountainStack(neighborCell?.stack);
    });

    if (!hasNeighborMountain) {
      continue;
    }

    if (cell.stack.length === 1) {
      score += 1;
    } else if (cell.stack.length === 2) {
      score += 3;
    } else if (cell.stack.length === 3) {
      score += 7;
    }
  }

  return score;
}

function scoreFields(snapshot) {
  let score = 0;
  const visited = new Set();

  for (const coordinate of ALL_BOARD_COORDINATES) {
    const key = toCoordinateKey(coordinate.q, coordinate.r);
    if (visited.has(key)) {
      continue;
    }

    const startCell = getTerrainCell(snapshot, coordinate.q, coordinate.r);
    if (getTopTerrainPiece(startCell?.stack) !== TerrainPieceType.Field) {
      continue;
    }

    const queue = [coordinate];
    visited.add(key);
    let componentSize = 0;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      componentSize += 1;

      for (const neighbor of getBoardNeighborCoordinates(current.q, current.r)) {
        const neighborKey = toCoordinateKey(neighbor.q, neighbor.r);
        if (visited.has(neighborKey)) {
          continue;
        }

        const neighborCell = getTerrainCell(snapshot, neighbor.q, neighbor.r);
        if (getTopTerrainPiece(neighborCell?.stack) !== TerrainPieceType.Field) {
          continue;
        }

        visited.add(neighborKey);
        queue.push(neighbor);
      }
    }

    if (componentSize >= 2) {
      score += 5;
    }
  }

  return score;
}

function scoreBuildings(snapshot) {
  let score = 0;

  for (const cell of snapshot.terrain_cells) {
    const stack = Array.isArray(cell?.stack) ? cell.stack : [];
    if (stack.length < 2 || getTopTerrainPiece(stack) !== TerrainPieceType.Building) {
      continue;
    }

    const foundationType = stack[stack.length - 2];
    if (
      foundationType !== TerrainPieceType.Stump
      && foundationType !== TerrainPieceType.Mountain
      && foundationType !== TerrainPieceType.Building
    ) {
      continue;
    }

    const adjacentTopColors = new Set();
    for (const neighbor of getBoardNeighborCoordinates(cell.q, cell.r)) {
      const neighborCell = getTerrainCell(snapshot, neighbor.q, neighbor.r);
      const topPiece = getTopTerrainPiece(neighborCell?.stack);
      if (topPiece) {
        adjacentTopColors.add(topPiece);
      }
    }

    if (adjacentTopColors.size >= 3) {
      score += 5;
    }
  }

  return score;
}

function getRiverScoreByLength(length) {
  if (length <= 1) {
    return 0;
  }
  if (length === 2) {
    return 2;
  }
  if (length === 3) {
    return 5;
  }
  if (length === 4) {
    return 8;
  }
  if (length === 5) {
    return 11;
  }
  if (length === 6) {
    return 15;
  }
  return 15 + (length - 6) * 4;
}

function buildRiverComponent(snapshot, startCoordinate, visited) {
  const queue = [startCoordinate];
  const component = [];
  visited.add(toCoordinateKey(startCoordinate.q, startCoordinate.r));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    component.push(current);

    for (const neighbor of getBoardNeighborCoordinates(current.q, current.r)) {
      const neighborKey = toCoordinateKey(neighbor.q, neighbor.r);
      if (visited.has(neighborKey)) {
        continue;
      }

      const neighborCell = getTerrainCell(snapshot, neighbor.q, neighbor.r);
      if (getTopTerrainPiece(neighborCell?.stack) !== TerrainPieceType.River) {
        continue;
      }

      visited.add(neighborKey);
      queue.push(neighbor);
    }
  }

  return component;
}

function getLongestRiverPathLength(snapshot, riverCells) {
  if (riverCells.length <= 1) {
    return riverCells.length;
  }

  const riverCellKeys = new Set(riverCells.map((cell) => toCoordinateKey(cell.q, cell.r)));
  let longestLength = 0;

  const dfs = (coordinate, pathVisited, currentLength) => {
    longestLength = Math.max(longestLength, currentLength);

    for (const neighbor of getBoardNeighborCoordinates(coordinate.q, coordinate.r)) {
      const neighborKey = toCoordinateKey(neighbor.q, neighbor.r);
      if (!riverCellKeys.has(neighborKey) || pathVisited.has(neighborKey)) {
        continue;
      }

      pathVisited.add(neighborKey);
      dfs(neighbor, pathVisited, currentLength + 1);
      pathVisited.delete(neighborKey);
    }
  };

  for (const cell of riverCells) {
    const startKey = toCoordinateKey(cell.q, cell.r);
    const pathVisited = new Set([startKey]);
    dfs(cell, pathVisited, 1);
  }

  return longestLength;
}

function scoreRivers(snapshot) {
  let longestRiverLength = 0;
  const visited = new Set();

  for (const coordinate of ALL_BOARD_COORDINATES) {
    const key = toCoordinateKey(coordinate.q, coordinate.r);
    if (visited.has(key)) {
      continue;
    }

    const startCell = getTerrainCell(snapshot, coordinate.q, coordinate.r);
    if (getTopTerrainPiece(startCell?.stack) !== TerrainPieceType.River) {
      continue;
    }

    const component = buildRiverComponent(snapshot, coordinate, visited);
    longestRiverLength = Math.max(
      longestRiverLength,
      getLongestRiverPathLength(snapshot, component),
    );
  }

  return getRiverScoreByLength(longestRiverLength);
}

function calculateTerrainScore(snapshot) {
  const treeScore = scoreTrees(snapshot);
  const mountainScore = scoreMountains(snapshot);
  const fieldScore = scoreFields(snapshot);
  const buildingScore = scoreBuildings(snapshot);
  const riverScore = scoreRivers(snapshot);

  return {
    total: treeScore + mountainScore + fieldScore + buildingScore + riverScore,
    breakdown: {
      trees: treeScore,
      mountains: mountainScore,
      fields: fieldScore,
      buildings: buildingScore,
      rivers: riverScore,
    },
  };
}

function getActiveAnimalCount(animalState) {
  return Object.values(animalState.runtime_states).filter((runtimeState) => runtimeState.recruited === true).length;
}

function refillAnimalMarket(animalState) {
  while (animalState.market_card_ids.length < MATCH_ANIMAL_MARKET_COUNT && animalState.deck_order.length > 0) {
    const nextCardId = animalState.deck_order.shift();
    if (nextCardId) {
      animalState.market_card_ids.push(nextCardId);
    }
  }
}

function recruitAnimalFromMarket(animalState, slotIndex, currentTurnNo) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= animalState.market_card_ids.length) {
    return {
      ok: false,
      reason: 'Animal market slot is invalid.',
      cardId: null,
      animalState,
    };
  }

  if (animalState.last_recruit_turn_no === currentTurnNo) {
    return {
      ok: false,
      reason: 'You have already recruited an animal card this turn.',
      cardId: null,
      animalState,
    };
  }

  if (getActiveAnimalCount(animalState) >= MAX_ACTIVE_ANIMAL_CARDS) {
    return {
      ok: false,
      reason: 'Active animal card slots are full.',
      cardId: null,
      animalState,
    };
  }

  const cardId = animalState.market_card_ids[slotIndex] ?? null;
  if (!cardId || !animalState.runtime_states[cardId] || animalState.runtime_states[cardId].recruited === true) {
    return {
      ok: false,
      reason: 'Selected animal card is not available.',
      cardId: null,
      animalState,
    };
  }

  animalState.runtime_states[cardId].recruited = true;
  animalState.last_recruit_turn_no = currentTurnNo;
  animalState.market_card_ids.splice(slotIndex, 1);
  refillAnimalMarket(animalState);

  return {
    ok: true,
    reason: null,
    cardId,
    animalState,
  };
}

function hasAdjacentTerrainType(snapshot, anchorQ, anchorR, terrainType) {
  return getBoardNeighborCoordinates(anchorQ, anchorR).some((coordinate) => {
    const neighborCell = getTerrainCell(snapshot, coordinate.q, coordinate.r);
    if (!neighborCell) {
      return false;
    }

    return getDocumentedTerrainCode(neighborCell.stack) === terrainType;
  });
}

function getBoardNeighborCoordinates(row, column) {
  const offsets = row % 2 === 1
    ? [
      { rowDelta: 0, columnDelta: -1 },
      { rowDelta: 0, columnDelta: 1 },
      { rowDelta: -1, columnDelta: -1 },
      { rowDelta: -1, columnDelta: 0 },
      { rowDelta: 1, columnDelta: -1 },
      { rowDelta: 1, columnDelta: 0 },
    ]
    : [
      { rowDelta: 0, columnDelta: -1 },
      { rowDelta: 0, columnDelta: 1 },
      { rowDelta: -1, columnDelta: 0 },
      { rowDelta: -1, columnDelta: 1 },
      { rowDelta: 1, columnDelta: 0 },
      { rowDelta: 1, columnDelta: 1 },
    ];

  return offsets
    .map(({ rowDelta, columnDelta }) => ({
      q: row + rowDelta,
      r: column + columnDelta,
    }))
    .filter((coordinate) => isValidBoardCoordinate(coordinate.q, coordinate.r));
}

function canPlaceAnimalAt(snapshot, cardDefinition, q, r) {
  if (!isValidBoardCoordinate(q, r)) {
    return false;
  }

  if (getAnimalCell(snapshot, q, r)) {
    return false;
  }

  const anchorTerrain = getTerrainCell(snapshot, q, r);
  const anchorTerrainCode = anchorTerrain ? getDocumentedTerrainCode(anchorTerrain.stack) : null;
  if (anchorTerrainCode !== cardDefinition.placementCell.type) {
    return false;
  }

  if (Array.isArray(cardDefinition.adjacentRequirementTypes) && cardDefinition.adjacentRequirementTypes.length > 0) {
    return cardDefinition.adjacentRequirementTypes.every((requiredType) => {
      return hasAdjacentTerrainType(snapshot, q, r, requiredType);
    });
  }

  return cardDefinition.patternCells.every((patternCell) => {
    const targetCell = getTerrainCell(snapshot, q + patternCell.q, r + patternCell.r);
    if (!targetCell) {
      return false;
    }

    return getDocumentedTerrainCode(targetCell.stack) === patternCell.type;
  });
}

function placeAnimalOnBoard(snapshot, animalState, cardId, q, r) {
  const cardDefinition = getAnimalDefinition(cardId);
  if (!cardDefinition) {
    return {
      ok: false,
      reason: 'Animal card does not exist.',
      snapshot,
      animalState,
    };
  }

  const runtimeState = animalState.runtime_states[cardId];
  if (!runtimeState || runtimeState.recruited !== true) {
    return {
      ok: false,
      reason: 'Animal card has not been recruited.',
      snapshot,
      animalState,
    };
  }

  if (runtimeState.placed_anchors.length >= cardDefinition.cubeSlots) {
    return {
      ok: false,
      reason: 'Animal card is already completed.',
      snapshot,
      animalState,
    };
  }

  if (!canPlaceAnimalAt(snapshot, cardDefinition, q, r)) {
    return {
      ok: false,
      reason: 'Animal cannot be placed on the selected cell.',
      snapshot,
      animalState,
    };
  }

  upsertAnimalCell(snapshot, q, r, cardId);
  runtimeState.placed_anchors.push({ q, r });

  return {
    ok: true,
    reason: null,
    snapshot,
    animalState,
  };
}

module.exports = {
  ALL_BOARD_COORDINATES,
  MAX_ACTIVE_ANIMAL_CARDS,
  TerrainPieceType,
  PROTOTYPE_WHITE_ANIMAL_CARDS,
  buildEmptyBoardSnapshot,
  normalizeBoardSnapshot,
  cloneBoardSnapshot,
  buildBoardPublicSnapshot,
  getLegalTerrainPlacements,
  applyTerrainPlacementToBoard,
  createInitialAnimalCandidateState,
  createInitialAnimalOngoingState,
  normalizeAnimalStates,
  serializeAnimalStates,
  toAnimalStatePayload,
  calculateAnimalScore,
  calculateTerrainScore,
  countRemainingEmptyCells,
  recruitAnimalFromMarket,
  placeAnimalOnBoard,
};
