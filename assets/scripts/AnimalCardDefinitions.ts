import { TerrainPieceType } from './TerrainPieceDefinitions';

export type TerrainPatternCode = 'WT' | 'BN1' | 'BN2' | 'YL' | 'FD' | 'M1' | 'M2' | 'M3' | 'T1' | 'T2' | 'T3' | 'H';
export type AnimalCardRarity = 'white' | 'blue' | 'gold' | 'red';

export interface AnimalPatternCell {
  readonly q: number;
  readonly r: number;
  readonly type: TerrainPatternCode;
}

export interface AnimalCardDefinition {
  readonly cardId: string;
  readonly name: string;
  readonly artResourcePath: string;
  readonly rarity: AnimalCardRarity;
  readonly cost: number;
  readonly cubeSlots: number;
  readonly spiritIconCount: number;
  readonly scoreSteps: readonly number[];
  readonly placementCell: AnimalPatternCell;
  readonly patternCells: readonly AnimalPatternCell[];
  readonly adjacentRequirementTypes?: readonly TerrainPatternCode[];
  readonly tags: readonly string[];
  readonly shortLabel: string;
  readonly summary: string;
}

export interface AnimalCardRuntimeState {
  readonly definition: AnimalCardDefinition;
  placedAnchors: Array<{ q: number; r: number }>;
  recruited: boolean;
}

export const PROTOTYPE_WHITE_ANIMAL_CARDS: readonly AnimalCardDefinition[] = [
  {
    cardId: 'W01',
    name: '林间兔',
    artResourcePath: 'textures/W01_LinJianTu/spriteFrame',
    rarity: 'white',
    cost: 1,
    cubeSlots: 3,
    spiritIconCount: 3,
    scoreSteps: [0, 2, 4, 6],
    placementCell: { q: 0, r: 0, type: 'T1' },
    patternCells: [
      { q: 0, r: 0, type: 'T1' },
      { q: 1, r: 0, type: 'BN1' },
    ],
    adjacentRequirementTypes: ['BN1'],
    tags: ['tree', 'basic'],
    shortLabel: '兔',
    summary: '放在一层树上，只要相邻任意一格有一层树桩即可。',
  },
  {
    cardId: 'W02',
    name: '溪流蛙',
    artResourcePath: 'textures/W02_XiLiuWa/spriteFrame',
    rarity: 'white',
    cost: 1,
    cubeSlots: 3,
    spiritIconCount: 3,
    scoreSteps: [0, 2, 4, 6],
    placementCell: { q: 0, r: 0, type: 'WT' },
    patternCells: [
      { q: 0, r: 0, type: 'WT' },
      { q: 1, r: 0, type: 'T1' },
    ],
    adjacentRequirementTypes: ['T1'],
    tags: ['water', 'basic'],
    shortLabel: '蛙',
    summary: '放在河流上，只要相邻任意一格有一层树即可。',
  },
  {
    cardId: 'W03',
    name: '旧墙猫',
    artResourcePath: 'textures/W03_JiuQiangMao/spriteFrame',
    rarity: 'white',
    cost: 1,
    cubeSlots: 3,
    spiritIconCount: 3,
    scoreSteps: [0, 3, 5, 7],
    placementCell: { q: 0, r: 0, type: 'H' },
    patternCells: [
      { q: 0, r: 0, type: 'H' },
      { q: 1, r: 0, type: 'BN1' },
    ],
    adjacentRequirementTypes: ['BN1'],
    tags: ['building', 'basic'],
    shortLabel: '猫',
    summary: '放在建筑上，只要相邻任意一格有一层树桩即可。',
  },
];

export function getAnimalProgressScore(definition: AnimalCardDefinition, placedCubeCount: number): number {
  const clampedIndex = Math.max(0, Math.min(placedCubeCount, definition.scoreSteps.length - 1));
  return definition.scoreSteps[clampedIndex];
}

export function getAnimalCompletionText(runtimeState: AnimalCardRuntimeState): string {
  return `${runtimeState.placedAnchors.length}/${runtimeState.definition.cubeSlots}`;
}

export function isAnimalCardCompleted(runtimeState: AnimalCardRuntimeState): boolean {
  return runtimeState.placedAnchors.length >= runtimeState.definition.cubeSlots;
}

export function isTerrainCodeBuildLike(code: TerrainPatternCode | null): boolean {
  return code === 'H';
}

export function terrainPieceTypeMatchesAnimalTag(pieceType: TerrainPieceType, tag: string): boolean {
  switch (tag) {
    case 'tree':
      return pieceType === TerrainPieceType.Leaves;
    case 'water':
      return pieceType === TerrainPieceType.River;
    case 'field':
      return pieceType === TerrainPieceType.Field;
    case 'mountain':
      return pieceType === TerrainPieceType.Mountain;
    case 'building':
      return pieceType === TerrainPieceType.Building;
    default:
      return false;
  }
}
