import { ALL_TERRAIN_PIECE_TYPES, TerrainPieceType } from './TerrainPieceDefinitions';

export interface TerrainCellState {
  readonly stack: readonly TerrainPieceType[];
  readonly hasAnimalOccupant?: boolean;
}

export type DocumentedTerrainCode =
  | 'WT'
  | 'BN1'
  | 'BN2'
  | 'YL'
  | 'FD'
  | 'M1'
  | 'M2'
  | 'M3'
  | 'T1'
  | 'T2'
  | 'T3'
  | 'H';

export interface TerrainPiecePlacementRule {
  readonly pieceType: TerrainPieceType;
  readonly canPlaceOnEmpty: boolean;
  readonly maxResultingHeight: number;
  readonly allowedSupports: readonly TerrainPieceType[];
  readonly summary: string;
}

export interface TerrainStackValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly documentedCode?: DocumentedTerrainCode | null;
}

export interface TerrainPlacementValidationResult {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly resultingStack: TerrainPieceType[];
  readonly resultingHeight: number;
  readonly documentedCode: DocumentedTerrainCode | null;
}

const EMPTY_STACK: TerrainPieceType[] = [];
const MAX_STACK_HEIGHT = 3;
const MAX_STUMP_LAYERS = 2;

export const TERRAIN_PLACEMENT_RULES: Record<TerrainPieceType, TerrainPiecePlacementRule> = {
  [TerrainPieceType.Building]: {
    pieceType: TerrainPieceType.Building,
    canPlaceOnEmpty: true,
    maxResultingHeight: 2,
    allowedSupports: [TerrainPieceType.Building, TerrainPieceType.Mountain, TerrainPieceType.Stump],
    summary: '建筑可直接放在空格作为一级建筑，也可放在单层建筑、山脉或树桩上形成二级建筑。',
  },
  [TerrainPieceType.Field]: {
    pieceType: TerrainPieceType.Field,
    canPlaceOnEmpty: true,
    maxResultingHeight: 1,
    allowedSupports: [],
    summary: '田野只能放在空格，放入后该格不能继续叠放其他地形。',
  },
  [TerrainPieceType.Stump]: {
    pieceType: TerrainPieceType.Stump,
    canPlaceOnEmpty: true,
    maxResultingHeight: MAX_STUMP_LAYERS,
    allowedSupports: [TerrainPieceType.Stump],
    summary: '树桩可单独放置，也可最多堆到 2 层，之后顶层可接树叶或建筑。',
  },
  [TerrainPieceType.Leaves]: {
    pieceType: TerrainPieceType.Leaves,
    canPlaceOnEmpty: true,
    maxResultingHeight: MAX_STACK_HEIGHT,
    allowedSupports: [TerrainPieceType.Stump],
    summary: '树叶可单独放置，也可放在 1 到 2 层树桩上形成双层树/三层树。',
  },
  [TerrainPieceType.Mountain]: {
    pieceType: TerrainPieceType.Mountain,
    canPlaceOnEmpty: true,
    maxResultingHeight: MAX_STACK_HEIGHT,
    allowedSupports: [TerrainPieceType.Mountain],
    summary: '山脉只能与山脉继续堆叠，最多 3 层。',
  },
  [TerrainPieceType.River]: {
    pieceType: TerrainPieceType.River,
    canPlaceOnEmpty: true,
    maxResultingHeight: 1,
    allowedSupports: [],
    summary: '河流只能放在空格，放入后该格不能继续叠放其他地形。',
  },
};

export function validateTerrainStack(stack: readonly TerrainPieceType[]): TerrainStackValidationResult {
  let currentStack = EMPTY_STACK;

  for (let index = 0; index < stack.length; index += 1) {
    const pieceType = stack[index];
    const placementResult = evaluatePlacement(currentStack, pieceType, false);
    if (!placementResult.allowed) {
      return {
        valid: false,
        reason: `Illegal terrain stack at level ${index + 1}: ${placementResult.reason ?? 'unknown rule violation.'}`,
      };
    }

    currentStack = placementResult.resultingStack;
  }

  return {
    valid: true,
    documentedCode: getDocumentedTerrainCode(currentStack),
  };
}

export function validateTerrainPlacement(
  cellState: TerrainCellState,
  pieceType: TerrainPieceType,
): TerrainPlacementValidationResult {
  const stackValidation = validateTerrainStack(cellState.stack);
  if (!stackValidation.valid) {
    return {
      allowed: false,
      reason: `Current cell stack is invalid. ${stackValidation.reason ?? ''}`.trim(),
      resultingStack: [...cellState.stack],
      resultingHeight: cellState.stack.length,
      documentedCode: stackValidation.documentedCode ?? null,
    };
  }

  return evaluatePlacement(cellState.stack, pieceType, !!cellState.hasAnimalOccupant);
}

export function getLegalTerrainPlacements(cellState: TerrainCellState): TerrainPieceType[] {
  const result: TerrainPieceType[] = [];

  for (const pieceType of ALL_TERRAIN_PIECE_TYPES) {
    if (validateTerrainPlacement(cellState, pieceType).allowed) {
      result.push(pieceType);
    }
  }

  return result;
}

export function getDocumentedTerrainCode(stack: readonly TerrainPieceType[]): DocumentedTerrainCode | null {
  if (stack.length === 0) {
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

function evaluatePlacement(
  stack: readonly TerrainPieceType[],
  pieceType: TerrainPieceType,
  hasAnimalOccupant: boolean,
): TerrainPlacementValidationResult {
  const currentStack = [...stack];

  if (hasAnimalOccupant) {
    return rejectPlacement(currentStack, 'Cannot place terrain onto a cell occupied by an animal cube.');
  }

  if (currentStack.length >= MAX_STACK_HEIGHT) {
    return rejectPlacement(currentStack, `Terrain stack already reached the max height of ${MAX_STACK_HEIGHT}.`);
  }

  const topPiece = currentStack[currentStack.length - 1] ?? null;

  switch (pieceType) {
    case TerrainPieceType.Field:
      if (currentStack.length > 0) {
        return rejectPlacement(currentStack, 'Field can only be placed on an empty cell.');
      }
      return acceptPlacement(currentStack, pieceType);

    case TerrainPieceType.River:
      if (currentStack.length > 0) {
        return rejectPlacement(currentStack, 'River can only be placed on an empty cell.');
      }
      return acceptPlacement(currentStack, pieceType);

    case TerrainPieceType.Stump:
      if (currentStack.length === 0) {
        return acceptPlacement(currentStack, pieceType);
      }

      if (currentStack.every((value) => value === TerrainPieceType.Stump) && currentStack.length < MAX_STUMP_LAYERS) {
        return acceptPlacement(currentStack, pieceType);
      }

      return rejectPlacement(currentStack, 'Stump can only stack on stump, and stump layers are capped at 2.');

    case TerrainPieceType.Leaves:
      if (currentStack.length === 0) {
        return acceptPlacement(currentStack, pieceType);
      }

      if (currentStack.every((value) => value === TerrainPieceType.Stump) && currentStack.length <= MAX_STUMP_LAYERS) {
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
        currentStack.length === 1
        && (
          topPiece === TerrainPieceType.Building
          || topPiece === TerrainPieceType.Mountain
          || topPiece === TerrainPieceType.Stump
        )
      ) {
        return acceptPlacement(currentStack, pieceType);
      }

      return rejectPlacement(
        currentStack,
        'Building can only be placed on a single-layer building, mountain, or stump.',
      );
    }

    default:
      return rejectPlacement(currentStack, 'Unknown terrain piece type.');
  }
}

function acceptPlacement(
  currentStack: readonly TerrainPieceType[],
  pieceType: TerrainPieceType,
): TerrainPlacementValidationResult {
  const resultingStack = [...currentStack, pieceType];
  return {
    allowed: true,
    resultingStack,
    resultingHeight: resultingStack.length,
    documentedCode: getDocumentedTerrainCode(resultingStack),
  };
}

function rejectPlacement(
  currentStack: readonly TerrainPieceType[],
  reason: string,
): TerrainPlacementValidationResult {
  return {
    allowed: false,
    reason,
    resultingStack: [...currentStack],
    resultingHeight: currentStack.length,
    documentedCode: getDocumentedTerrainCode(currentStack),
  };
}
