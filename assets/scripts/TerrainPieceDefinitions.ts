import { Color } from 'cc';

export enum TerrainPieceType {
  Building = 'building',
  Field = 'field',
  Stump = 'stump',
  Leaves = 'leaves',
  Mountain = 'mountain',
  River = 'river',
}

export const ALL_TERRAIN_PIECE_TYPES: TerrainPieceType[] = [
  TerrainPieceType.Building,
  TerrainPieceType.Field,
  TerrainPieceType.Stump,
  TerrainPieceType.Leaves,
  TerrainPieceType.Mountain,
  TerrainPieceType.River,
];

export interface TerrainPieceDefinition {
  type: TerrainPieceType;
  label: string;
  colorName: string;
  texturePath: string;
  count: number;
  tint: Color;
}

// 数量取自 docs/动物园和声_项目设计书_v2.md 的地形池配置。
export const TERRAIN_PIECE_DEFINITIONS: Record<TerrainPieceType, TerrainPieceDefinition> = {
  [TerrainPieceType.Building]: {
    type: TerrainPieceType.Building,
    label: '建筑',
    colorName: '红色',
    texturePath: 'textures/piece_build/spriteFrame',
    count: 15,
    tint: new Color(220, 86, 86, 255),
  },
  [TerrainPieceType.Field]: {
    type: TerrainPieceType.Field,
    label: '田野',
    colorName: '黄色',
    texturePath: 'textures/piece_field/spriteFrame',
    count: 19,
    tint: new Color(226, 194, 74, 255),
  },
  [TerrainPieceType.Stump]: {
    type: TerrainPieceType.Stump,
    label: '树桩',
    colorName: '棕色',
    texturePath: 'textures/piece_stump/spriteFrame',
    count: 21,
    tint: new Color(145, 101, 63, 255),
  },
  [TerrainPieceType.Leaves]: {
    type: TerrainPieceType.Leaves,
    label: '树叶',
    colorName: '绿色',
    texturePath: 'textures/piece_leaves/spriteFrame',
    count: 19,
    tint: new Color(84, 170, 86, 255),
  },
  [TerrainPieceType.Mountain]: {
    type: TerrainPieceType.Mountain,
    label: '山脉',
    colorName: '灰色',
    texturePath: 'textures/piece_mountain/spriteFrame',
    count: 23,
    tint: new Color(145, 145, 145, 255),
  },
  [TerrainPieceType.River]: {
    type: TerrainPieceType.River,
    label: '河流',
    colorName: '蓝色',
    texturePath: 'textures/piece_river/spriteFrame',
    count: 23,
    tint: new Color(74, 137, 226, 255),
  },
};

export const TERRAIN_PIECE_DRAW_ORDER: TerrainPieceType[] = [
  TerrainPieceType.Building,
  TerrainPieceType.Field,
  TerrainPieceType.Stump,
  TerrainPieceType.Leaves,
  TerrainPieceType.Mountain,
  TerrainPieceType.River,
];

export function createTerrainPiecePool(): TerrainPieceType[] {
  const pool: TerrainPieceType[] = [];

  for (const pieceType of TERRAIN_PIECE_DRAW_ORDER) {
    const definition = TERRAIN_PIECE_DEFINITIONS[pieceType];
    for (let index = 0; index < definition.count; index += 1) {
      pool.push(pieceType);
    }
  }

  return pool;
}
