import {
  _decorator,
  assetManager,
  BlockInputEvents,
  Camera,
  Color,
  Component,
  director,
  EventTouch,
  instantiate,
  MeshRenderer,
  Node,
  Prefab,
  resources,
  Sprite,
  SpriteFrame,
  Texture2D,
  UITransform,
  Vec3,
  view,
} from 'cc';
import { AnimalCardDefinition } from './AnimalCardDefinitions';
import { TerrainPieceType } from './TerrainPieceDefinitions';
import {
  getDocumentedTerrainCode,
  TerrainCellState,
  validateTerrainPlacement,
} from './TerrainPlacementRules';
import type { BoardSnapshotPayload } from './battle/MatchApi';

const { ccclass } = _decorator;

const BOARD_NODE_NAME = 'Game Board';
const BOARD_CELLS_ROOT_NAME = 'LogicalBoardCells';
const BOARD_OVERLAY_ROOT_NAME = 'BoardPlacementOverlay';
const BOARD_OVERLAY_DISMISS_AREA_NAME = 'BoardPlacementOverlayDismissArea';
const ANIMAL_TOKEN_ROOT_NAME = 'AnimalTokenOverlay';
const BOARD_OVERLAY_CAMERA_NAME = 'BoardPlacementOverlayCamera';
const BOARD_OVERLAY_LAYER = 1 << 26;
const BOARD_ANCHOR_HINT = /cell|hex|slot|anchor|tile/i;
const BOARD_RADIUS = 2;
const HEX_SIZE = 0.125;
const CELL_SURFACE_OFFSET = -0.058;
const HIGHLIGHT_GRID_STEP_X = 114;
const HIGHLIGHT_GRID_STEP_Y = 135;
const HIGHLIGHT_GRID_COLUMN_OFFSET_Y = 67.5;
const ANIMAL_TOKEN_SPRITE_FRAME_RESOURCE_PATH = 'textures/animal_cards/animals_spirit/spriteFrame';
const AXIAL_NEIGHBOR_OFFSETS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
] as const;

const PIECE_GRID_SPRITE_FRAME_UUIDS = {
  empty: '9d5f698d-0bc3-4de0-873c-154a287b038f@f9941',
  buildGrade1: '39fd6de6-371e-4540-9287-ccbbc2d1568f@f9941',
  buildGrade2: 'd4bf9458-62ad-4874-b023-3d581e29809b@f9941',
  fieldGrade1: 'cea381ae-59b4-4bdf-a328-3cacee982366@f9941',
  leavesGrade1: '69c0954e-868a-4c76-99b5-27b512978199@f9941',
  leavesGrade2: 'b3b56833-f8b8-43f6-b1e2-5182a143c53f@f9941',
  leavesGrade3: '45162ac6-50ca-4008-b5f0-193d3b7e47f7@f9941',
  mountainGrade1: '72ce9628-8305-47d7-abbe-60f70fe93d50@f9941',
  mountainGrade2: 'e6cf4f84-0fd6-4385-99d4-d1acdb246796@f9941',
  mountainGrade3: 'cdcc5e01-2180-4144-ba3c-1a16e3f9d7f7@f9941',
  riverGrade1: 'c1818e36-9f2a-40c3-bdd5-9f8c6dbdead1@f9941',
  stumpGrade1: '6a4158d6-2ba6-4f51-a674-cc35f8c23270@f9941',
  stumpGrade2: '63ed4823-c52a-4397-aca4-59ec95b90fcf@f9941',
} as const;

const PIECE_GRID_SPRITE_FRAME_UUID_LIST: string[] = [
  PIECE_GRID_SPRITE_FRAME_UUIDS.empty,
  PIECE_GRID_SPRITE_FRAME_UUIDS.buildGrade1,
  PIECE_GRID_SPRITE_FRAME_UUIDS.buildGrade2,
  PIECE_GRID_SPRITE_FRAME_UUIDS.fieldGrade1,
  PIECE_GRID_SPRITE_FRAME_UUIDS.leavesGrade1,
  PIECE_GRID_SPRITE_FRAME_UUIDS.leavesGrade2,
  PIECE_GRID_SPRITE_FRAME_UUIDS.leavesGrade3,
  PIECE_GRID_SPRITE_FRAME_UUIDS.mountainGrade1,
  PIECE_GRID_SPRITE_FRAME_UUIDS.mountainGrade2,
  PIECE_GRID_SPRITE_FRAME_UUIDS.mountainGrade3,
  PIECE_GRID_SPRITE_FRAME_UUIDS.riverGrade1,
  PIECE_GRID_SPRITE_FRAME_UUIDS.stumpGrade1,
  PIECE_GRID_SPRITE_FRAME_UUIDS.stumpGrade2,
];

const MODEL_PREFAB_UUIDS = {
  buildGrade1: '464e2d29-0c6f-4fdd-9926-aa872c073128@7a2bc',
  buildGrade2: 'f105c408-1022-423e-b44c-f5aaf43a94bb@e293d',
  fieldGrade1: 'b609dfcb-1162-4d3f-9cf2-42742f9dbc0e@d716b',
  leavesGrade1: '5f1f163c-09a7-4613-991a-3a1370831431@9c572',
  leavesGrade2: '95aeca52-bf5b-4411-bbce-77338343c20d@a801b',
  leavesGrade3: 'd86dcb5c-18e3-4172-bfa8-d2d1c12c53ef@1e6fb',
  mountainGrade1: 'a2792aaf-7033-4dac-b9f1-1430e8fdd45e@95879',
  mountainGrade2: '22b57683-71ac-466f-9782-84cb6d0b332e@af841',
  mountainGrade3: 'a83885de-ef4a-4312-b45a-338fd514d62b@af841',
  riverGrade1: '5faa64f6-b8e3-47ad-997d-60ed10b548ab@1b935',
  stumpGrade1: '8591a7bb-6ca6-4979-adfd-5a7936e4eca1@f4029',
  stumpGrade2: '3ee5404c-e268-462b-9aed-5b90e311c3ff@0bc58',
} as const;

interface ModelTransformConfig {
  readonly positionZ: number;
  readonly rotationX: number;
  readonly rotationZ: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
}

const MODEL_TRANSFORMS: Record<string, ModelTransformConfig> = {
  [MODEL_PREFAB_UUIDS.buildGrade1]: { positionZ: -0.082, rotationX: -90, rotationZ: 0, scaleX: 0.07, scaleY: 0.07, scaleZ: 0.07 },
  [MODEL_PREFAB_UUIDS.buildGrade2]: { positionZ: -0.125, rotationX: -90, rotationZ: 0, scaleX: 0.08, scaleY: 0.08, scaleZ: 0.08 },
  [MODEL_PREFAB_UUIDS.riverGrade1]: { positionZ: -0.07, rotationX: -90, rotationZ: 30, scaleX: 0.08, scaleY: 0.08, scaleZ: 0.08 },
  [MODEL_PREFAB_UUIDS.fieldGrade1]: { positionZ: -0.07, rotationX: -90, rotationZ: 25, scaleX: 0.08, scaleY: 0.08, scaleZ: 0.08 },
  [MODEL_PREFAB_UUIDS.mountainGrade1]: { positionZ: -0.068, rotationX: -90, rotationZ: 0, scaleX: 0.05, scaleY: 0.05, scaleZ: 0.05 },
  [MODEL_PREFAB_UUIDS.mountainGrade2]: { positionZ: -0.075, rotationX: -90, rotationZ: 0, scaleX: 0.08, scaleY: 0.08, scaleZ: 0.08 },
  [MODEL_PREFAB_UUIDS.mountainGrade3]: { positionZ: -0.12, rotationX: -90, rotationZ: 0, scaleX: 0.1, scaleY: 0.1, scaleZ: 0.1 },
  [MODEL_PREFAB_UUIDS.stumpGrade1]: { positionZ: -0.09, rotationX: -90, rotationZ: 0, scaleX: 0.08, scaleY: 0.08, scaleZ: 0.08 },
  [MODEL_PREFAB_UUIDS.stumpGrade2]: { positionZ: -0.12, rotationX: -90, rotationZ: 0, scaleX: 0.08, scaleY: 0.08, scaleZ: 0.08 },
  [MODEL_PREFAB_UUIDS.leavesGrade1]: { positionZ: -0.075, rotationX: -90, rotationZ: 0, scaleX: 0.07, scaleY: 0.05, scaleZ: 0.07 },
  [MODEL_PREFAB_UUIDS.leavesGrade2]: { positionZ: -0.215, rotationX: -90, rotationZ: 0, scaleX: 0.2, scaleY: 0.2, scaleZ: 0.2 },
  [MODEL_PREFAB_UUIDS.leavesGrade3]: { positionZ: -0.2, rotationX: -90, rotationZ: 0, scaleX: 0.2, scaleY: 0.2, scaleZ: 0.2 },
};

type PlacementListener = (payload: {
  previewIndex: number;
  pieceType: TerrainPieceType;
  q: number;
  r: number;
  resultingStack: TerrainPieceType[];
}) => void;

type AnimalPlacementListener = (payload: {
  card: AnimalCardDefinition;
  q: number;
  r: number;
}) => void;

type RemoteTerrainPlacementHandler = (payload: {
  previewIndex: number;
  pieceType: TerrainPieceType;
  q: number;
  r: number;
}) => Promise<void>;

type RemoteAnimalPlacementHandler = (payload: {
  card: AnimalCardDefinition;
  q: number;
  r: number;
}) => Promise<void>;

interface BoardCellView {
  readonly q: number;
  readonly r: number;
  readonly key: string;
  readonly node: Node;
  readonly gridRow: number | null;
  readonly gridColumn: number | null;
  readonly terrainRoot: Node;
  readonly highlightNode: Node;
  readonly animalTokenNode: Node;
  stack: TerrainPieceType[];
  hasAnimalOccupant: boolean;
  animalOccupantCardId: string | null;
}

@ccclass('TerrainBoardController')
export class TerrainBoardController extends Component {
  private readonly boardCells = new Map<string, BoardCellView>();
  private readonly prefabCache = new Map<string, Prefab>();
  private readonly pieceGridSpriteFrameCache = new Map<string, SpriteFrame>();
  private readonly loadingPieceGridSpriteFrameUuids = new Set<string>();
  private readonly tempWorldPosition = new Vec3();
  private readonly tempScreenPosition = new Vec3();
  private destroying = false;
  private animalTokenSpriteFrame: SpriteFrame | null = null;

  private boardNode: Node | null = null;
  private mainCamera: Camera | null = null;
  private overlayCamera: Camera | null = null;
  private overlayRoot: Node | null = null;
  private animalTokenRoot: Node | null = null;
  private pendingPieceType: TerrainPieceType | null = null;
  private pendingPreviewIndex = -1;
  private pendingAnimalCard: AnimalCardDefinition | null = null;
  private piecePlacementOverlayVisible = false;
  private animalPlacementOverlayVisible = false;
  private placementListener: PlacementListener | null = null;
  private animalPlacementListener: AnimalPlacementListener | null = null;
  private remoteTerrainPlacementHandler: RemoteTerrainPlacementHandler | null = null;
  private remoteAnimalPlacementHandler: RemoteAnimalPlacementHandler | null = null;
  private boardHiddenForAnimalSelection = false;
  private boardHiddenForSettlement = false;
  private initialized = false;

  onLoad() {
    this.preloadPieceGridSpriteFrames();
    this.preloadAnimalTokenSpriteFrame();
    this.ensureBoardReady();
  }

  onDestroy() {
    this.destroying = true;
    this.placementListener = null;
    this.animalPlacementListener = null;
    this.remoteTerrainPlacementHandler = null;
    this.remoteAnimalPlacementHandler = null;
    this.boardCells.clear();
  }

  update() {
    if (!this.initialized) {
      return;
    }

    this.updateHighlightPositions();
  }

  public setPlacementListener(listener: PlacementListener | null) {
    this.placementListener = listener;
  }

  public setAnimalPlacementListener(listener: AnimalPlacementListener | null) {
    this.animalPlacementListener = listener;
  }

  public setRemoteTerrainPlacementHandler(handler: RemoteTerrainPlacementHandler | null) {
    this.remoteTerrainPlacementHandler = handler;
  }

  public setRemoteAnimalPlacementHandler(handler: RemoteAnimalPlacementHandler | null) {
    this.remoteAnimalPlacementHandler = handler;
  }

  public setPendingPiece(pieceType: TerrainPieceType | null, previewIndex = -1) {
    this.pendingPieceType = pieceType;
    this.pendingPreviewIndex = pieceType ? previewIndex : -1;
    if (pieceType) {
      this.piecePlacementOverlayVisible = true;
      this.pendingAnimalCard = null;
      this.animalPlacementOverlayVisible = false;
    } else {
      this.piecePlacementOverlayVisible = false;
    }
    this.refreshHighlights();
  }

  public setPendingAnimalCard(card: AnimalCardDefinition | null) {
    this.pendingAnimalCard = card;
    if (card) {
      this.pendingPieceType = null;
      this.pendingPreviewIndex = -1;
      this.piecePlacementOverlayVisible = false;
    } else {
      this.animalPlacementOverlayVisible = false;
    }
    this.refreshHighlights();
  }

  public showAnimalPlacementOverlay() {
    if (!this.pendingAnimalCard) {
      return;
    }

    this.animalPlacementOverlayVisible = true;
    this.refreshHighlights();
  }

  public hideAnimalPlacementOverlay() {
    if (!this.animalPlacementOverlayVisible) {
      return;
    }

    this.animalPlacementOverlayVisible = false;
    this.refreshHighlights();
  }

  public hidePiecePlacementOverlay() {
    if (!this.piecePlacementOverlayVisible) {
      return;
    }

    this.piecePlacementOverlayVisible = false;
    this.refreshHighlights();
  }

  public setBoardHiddenForAnimalSelection(hidden: boolean) {
    this.boardHiddenForAnimalSelection = hidden;
    this.refreshHighlights();
  }

  public setBoardHiddenForSettlement(hidden: boolean) {
    this.boardHiddenForSettlement = hidden;
    this.refreshHighlights();
  }

  public getLegalPiecePlacements(pieceType: TerrainPieceType): Array<{ q: number; r: number; resultingStack: TerrainPieceType[] }> {
    const placements: Array<{ q: number; r: number; resultingStack: TerrainPieceType[] }> = [];

    for (const cell of this.boardCells.values()) {
      const validation = validateTerrainPlacement(this.toTerrainCellState(cell), pieceType);
      if (!validation.allowed) {
        continue;
      }

      placements.push({
        q: cell.q,
        r: cell.r,
        resultingStack: [...validation.resultingStack],
      });
    }

    return placements;
  }

  public placePieceAt(q: number, r: number, pieceType: TerrainPieceType, previewIndex = -1): boolean {
    const cell = this.findBoardCellByCoordinate(q, r);
    if (!cell) {
      return false;
    }

    const validation = validateTerrainPlacement(this.toTerrainCellState(cell), pieceType);
    if (!validation.allowed) {
      return false;
    }

    cell.stack = [...validation.resultingStack];
    this.applyPieceGridSpriteForCell(cell);
    void this.renderTerrainModel(cell);

    this.pendingPieceType = null;
    this.pendingPreviewIndex = -1;
    this.refreshHighlights();

    this.placementListener?.({
      previewIndex,
      pieceType,
      q,
      r,
      resultingStack: [...cell.stack],
    });

    return true;
  }

  public applyBoardSnapshot(snapshot: BoardSnapshotPayload | null) {
    this.ensureBoardReady();
    if (!this.initialized) {
      return;
    }

    const terrainMap = new Map<string, { stack: TerrainPieceType[] }>();
    const animalMap = new Map<string, { cardId: string }>();

    for (const terrainCell of snapshot?.terrain_cells ?? []) {
      terrainMap.set(this.toCellKey(terrainCell.q, terrainCell.r), {
        stack: [...terrainCell.stack],
      });
    }

    for (const animalCell of snapshot?.animal_cells ?? []) {
      animalMap.set(this.toCellKey(animalCell.q, animalCell.r), {
        cardId: animalCell.card_id,
      });
    }

    for (const cell of this.boardCells.values()) {
      const terrainEntry = terrainMap.get(this.toCellKey(cell.q, cell.r));
      const animalEntry = animalMap.get(this.toCellKey(cell.q, cell.r));
      cell.stack = terrainEntry ? [...terrainEntry.stack] : [];
      cell.hasAnimalOccupant = !!animalEntry;
      cell.animalOccupantCardId = animalEntry?.cardId ?? null;
      this.applyPieceGridSpriteForCell(cell);
      void this.renderTerrainModel(cell);
      this.updateAnimalTokenVisual(cell);
    }

    this.refreshHighlights();
  }

  private ensureBoardReady() {
    if (this.initialized) {
      return;
    }

    const scene = director.getScene();
    if (!scene) {
      return;
    }

    this.boardNode = this.findNodeByName(scene, BOARD_NODE_NAME);
    if (!this.boardNode) {
      console.warn('[TerrainBoardController] Missing Game Board node.');
      return;
    }

    this.mainCamera = this.findMainCamera(scene);
    if (!this.mainCamera) {
      console.warn('[TerrainBoardController] Missing Main Camera component.');
      return;
    }

    this.overlayCamera = this.ensureOverlayCamera();

    this.overlayRoot = this.node.getChildByName(BOARD_OVERLAY_ROOT_NAME);
    if (!this.overlayRoot) {
      this.overlayRoot = new Node(BOARD_OVERLAY_ROOT_NAME);
      this.node.addChild(this.overlayRoot);
    }
    this.overlayRoot.layer = BOARD_OVERLAY_LAYER;
    this.overlayRoot.setPosition(0, -250, 0);
    this.overlayRoot.setRotationFromEuler(0, 0, 0);
    this.overlayRoot.setSiblingIndex(this.node.children.length - 1);
    this.overlayRoot.active = false;

    this.animalTokenRoot = this.node.getChildByName(ANIMAL_TOKEN_ROOT_NAME);
    if (!this.animalTokenRoot) {
      this.animalTokenRoot = new Node(ANIMAL_TOKEN_ROOT_NAME);
      this.node.addChild(this.animalTokenRoot);
    }
    this.animalTokenRoot.layer = BOARD_OVERLAY_LAYER;
    this.animalTokenRoot.setPosition(0, -250, 0);
    this.animalTokenRoot.setRotationFromEuler(0, 0, 0);
    this.animalTokenRoot.setSiblingIndex(this.node.children.length - 1);
    this.animalTokenRoot.active = true;

    this.buildBoardCells();
    this.initialized = true;
    this.refreshHighlights();
  }

  private buildBoardCells() {
    this.boardCells.clear();

    for (const child of [...this.overlayRoot!.children]) {
      if (child.name === BOARD_OVERLAY_DISMISS_AREA_NAME) {
        continue;
      }
      child.destroy();
    }
    for (const child of [...this.animalTokenRoot!.children]) {
      child.destroy();
    }

    const existingAnchors = this.findExistingBoardAnchors();
    if (existingAnchors.length > 0) {
      const axialSequence = this.getAxialSequence();
      console.log(`[TerrainBoardController] Using ${existingAnchors.length} existing board anchor nodes.`);

      for (let index = 0; index < existingAnchors.length; index += 1) {
        const anchorNode = existingAnchors[index];
        const gridCoordinate = this.parseBoardGridCoordinate(anchorNode.name);
        const logicalCoordinate = gridCoordinate ?? axialSequence[index] ?? { q: index, r: 0 };
        const key = this.toCellKey(logicalCoordinate.q, logicalCoordinate.r, index);
        const terrainRoot = this.getOrCreateTerrainRoot(anchorNode);
        this.clearAnchorTerrainVisuals(anchorNode, terrainRoot);
        const highlightNode = this.createHighlightNode(anchorNode.name, logicalCoordinate.q, logicalCoordinate.r);
        const animalTokenNode = this.createAnimalTokenNode(anchorNode.name);

        this.boardCells.set(key, {
          q: logicalCoordinate.q,
          r: logicalCoordinate.r,
          key,
          node: anchorNode,
          gridRow: gridCoordinate?.q ?? null,
          gridColumn: gridCoordinate?.r ?? null,
          terrainRoot,
          highlightNode,
          animalTokenNode,
          stack: [],
          hasAnimalOccupant: false,
          animalOccupantCardId: null,
        });
      }

      this.sortOverlayHighlights();
      this.ensureOverlayDismissArea();

      return;
    }

    let cellsRoot = this.boardNode!.getChildByName(BOARD_CELLS_ROOT_NAME);
    if (!cellsRoot) {
      cellsRoot = new Node(BOARD_CELLS_ROOT_NAME);
      this.boardNode!.addChild(cellsRoot);
    }

    for (const child of [...cellsRoot.children]) {
      child.destroy();
    }

    for (const axial of this.getAxialSequence()) {
      const key = this.toCellKey(axial.q, axial.r);
      const cellNode = new Node(`Cell_${axial.q}_${axial.r}`);
      cellsRoot.addChild(cellNode);
      cellNode.setPosition(this.axialToBoardLocalPosition(axial.q, axial.r));

      const terrainRoot = this.getOrCreateTerrainRoot(cellNode);
      const highlightNode = this.createHighlightNode(cellNode.name, axial.q, axial.r);
      const animalTokenNode = this.createAnimalTokenNode(cellNode.name);

      this.boardCells.set(key, {
        q: axial.q,
        r: axial.r,
        key,
        node: cellNode,
        gridRow: null,
        gridColumn: null,
        terrainRoot,
        highlightNode,
        animalTokenNode,
        stack: [],
        hasAnimalOccupant: false,
        animalOccupantCardId: null,
      });
    }

    this.sortOverlayHighlights();
    this.ensureOverlayDismissArea();
  }

  private ensureOverlayDismissArea() {
    if (!this.overlayRoot) {
      return;
    }

    let dismissArea = this.overlayRoot.getChildByName(BOARD_OVERLAY_DISMISS_AREA_NAME);
    if (!dismissArea) {
      dismissArea = new Node(BOARD_OVERLAY_DISMISS_AREA_NAME);
      dismissArea.layer = BOARD_OVERLAY_LAYER;
      this.overlayRoot.addChild(dismissArea);

      const transform = dismissArea.addComponent(UITransform);
      transform.setContentSize(2400, 2400);

      const sprite = dismissArea.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.color = new Color(255, 255, 255, 0);

      dismissArea.on(Node.EventType.TOUCH_END, this.onOverlayDismissAreaTouched, this);
    }

    dismissArea.setPosition(0, 250, 0);
    dismissArea.setSiblingIndex(0);
  }

  private createHighlightNode(nodeName: string, q: number, r: number): Node {
    const highlightName = this.toPieceGridNodeName(nodeName);
    const highlightNode = new Node(highlightName);
    highlightNode.layer = BOARD_OVERLAY_LAYER;
    this.overlayRoot!.addChild(highlightNode);

    const transform = highlightNode.addComponent(UITransform);
    transform.setContentSize(150, 150);
    highlightNode.active = true;
    highlightNode.addComponent(BlockInputEvents);

    const sprite = highlightNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    const spriteFrame = this.getCachedPieceGridSpriteFrame(PIECE_GRID_SPRITE_FRAME_UUIDS.empty);
    if (spriteFrame) {
      sprite.spriteFrame = spriteFrame;
    }

    const fixedPosition = this.getHighlightFixedPosition(highlightName);
    if (fixedPosition) {
      highlightNode.setPosition(fixedPosition);
    }

    highlightNode.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      event.propagationStopped = true;
      this.onHighlightClicked(q, r);
    }, this);

    return highlightNode;
  }

  private refreshHighlights() {
    if (this.destroying || !this.node?.isValid) {
      return;
    }

    const overlayVisible = (this.pendingPieceType !== null && this.piecePlacementOverlayVisible)
      || (this.pendingAnimalCard !== null && this.animalPlacementOverlayVisible);

    if (this.boardNode?.isValid) {
      this.boardNode.active = !overlayVisible
        && !this.boardHiddenForAnimalSelection
        && !this.boardHiddenForSettlement;
    }

    if (this.overlayRoot?.isValid) {
      this.overlayRoot.active = overlayVisible;

      const dismissArea = this.overlayRoot.getChildByName(BOARD_OVERLAY_DISMISS_AREA_NAME);
      if (dismissArea) {
        dismissArea.active = overlayVisible;
      }
    }

    if (this.animalTokenRoot?.isValid) {
      this.animalTokenRoot.active = overlayVisible;
    }

    for (const cell of this.boardCells.values()) {
      if (!cell.highlightNode?.isValid) {
        continue;
      }
      this.applyPieceGridSpriteForCell(cell);
      this.applyPieceGridAvailabilityVisual(cell);
      cell.highlightNode.active = true;
      this.updateAnimalTokenVisual(cell);
    }
  }

  private updateHighlightPositions() {
    for (const cell of this.boardCells.values()) {
      if (!cell.highlightNode.active) {
        continue;
      }

      const fixedPosition = this.getHighlightFixedPosition(cell.highlightNode.name);
      if (fixedPosition) {
        cell.highlightNode.setPosition(fixedPosition);
      }
    }
  }

  private onHighlightClicked(q: number, r: number) {
    if (!this.pendingPieceType || this.pendingPreviewIndex < 0) {
      if (this.pendingAnimalCard) {
        if (this.remoteAnimalPlacementHandler) {
          void this.remoteAnimalPlacementHandler({
            card: this.pendingAnimalCard,
            q,
            r,
          });
          return;
        }
        this.tryPlaceAnimalAt(q, r);
      }
      return;
    }

    const placedPieceType = this.pendingPieceType;
    const placedPreviewIndex = this.pendingPreviewIndex;
    if (this.remoteTerrainPlacementHandler) {
      void this.remoteTerrainPlacementHandler({
        previewIndex: placedPreviewIndex,
        pieceType: placedPieceType,
        q,
        r,
      });
      return;
    }
    this.placePieceAt(q, r, placedPieceType, placedPreviewIndex);
  }

  private tryPlaceAnimalAt(q: number, r: number) {
    const card = this.pendingAnimalCard;
    if (!card) {
      return;
    }

    const cell = this.findBoardCellByCoordinate(q, r);
    if (!cell || !this.canPlaceAnimalAt(card, cell)) {
      return;
    }

    cell.hasAnimalOccupant = true;
    cell.animalOccupantCardId = card.cardId;
    this.updateAnimalTokenVisual(cell);
    this.refreshHighlights();
    this.animalPlacementListener?.({
      card,
      q,
      r,
    });
  }

  private onOverlayDismissAreaTouched() {
    this.hidePiecePlacementOverlay();
    this.hideAnimalPlacementOverlay();
  }
  private getHighlightFixedPosition(highlightName: string): Vec3 | null {
    const match = highlightName.match(/PieceGrid(\d+)-(\d+)/);
    if (!match) {
      return null;
    }

    const row = Number(match[1]);
    const column = Number(match[2]);

    const columnOffsetFromCenter = 3 - column;
    const x = (row - 3) * HIGHLIGHT_GRID_STEP_X;

    let rowOffsetY = 0;
    if (row === 2 || row === 4) {
      rowOffsetY = -HIGHLIGHT_GRID_COLUMN_OFFSET_Y;
    }

    const y = columnOffsetFromCenter * HIGHLIGHT_GRID_STEP_Y + rowOffsetY;

    return new Vec3(x, y, 0);
  }

  private sortOverlayHighlights() {
    if (!this.overlayRoot) {
      return;
    }

    const highlights = [...this.overlayRoot.children].filter((child) => child.name !== BOARD_OVERLAY_DISMISS_AREA_NAME);
    highlights.sort((left, right) => {
      const leftOrder = this.getHighlightSortOrder(left.name);
      const rightOrder = this.getHighlightSortOrder(right.name);
      return leftOrder - rightOrder;
    });

    const dismissArea = this.overlayRoot.getChildByName(BOARD_OVERLAY_DISMISS_AREA_NAME);
    if (dismissArea) {
      dismissArea.setSiblingIndex(0);
    }

    highlights.forEach((highlightNode, index) => {
      highlightNode.setSiblingIndex(index + 1);
    });
  }

  private getHighlightSortOrder(highlightName: string): number {
    const match = highlightName.match(/PieceGrid(\d+)-(\d+)/);
    if (!match) {
      return Number.MAX_SAFE_INTEGER;
    }

    const row = Number(match[1]);
    const column = Number(match[2]);
    return row * 100 + column;
  }

  private preloadPieceGridSpriteFrames() {
    for (const spriteFrameUuid of PIECE_GRID_SPRITE_FRAME_UUID_LIST) {
      this.loadPieceGridSpriteFrame(spriteFrameUuid);
    }
  }

  private preloadAnimalTokenSpriteFrame() {
    if (this.animalTokenSpriteFrame) {
      return;
    }

    resources.load(ANIMAL_TOKEN_SPRITE_FRAME_RESOURCE_PATH, SpriteFrame, (error, spriteFrame) => {
      if (error || !spriteFrame) {
        console.error('[TerrainBoardController] Failed to load animal token sprite frame.', error);
        return;
      }

      this.animalTokenSpriteFrame = spriteFrame;
      for (const cell of this.boardCells.values()) {
        this.updateAnimalTokenVisual(cell);
      }
    });
  }

  private loadPieceGridSpriteFrame(spriteFrameUuid: string) {
    if (
      this.pieceGridSpriteFrameCache.has(spriteFrameUuid)
      || this.loadingPieceGridSpriteFrameUuids.has(spriteFrameUuid)
    ) {
      return;
    }

    this.loadingPieceGridSpriteFrameUuids.add(spriteFrameUuid);
    assetManager.loadAny(spriteFrameUuid, (error, spriteFrame: SpriteFrame | null) => {
      this.loadingPieceGridSpriteFrameUuids.delete(spriteFrameUuid);

      if (error || !spriteFrame) {
        console.error(`[TerrainBoardController] Failed to load piece grid sprite frame: ${spriteFrameUuid}`, error);
        return;
      }

      this.pieceGridSpriteFrameCache.set(spriteFrameUuid, spriteFrame);
      this.applyAllPieceGridSprites();
    });
  }

  private getCachedPieceGridSpriteFrame(spriteFrameUuid: string): SpriteFrame | null {
    const spriteFrame = this.pieceGridSpriteFrameCache.get(spriteFrameUuid) ?? null;
    if (!spriteFrame) {
      this.loadPieceGridSpriteFrame(spriteFrameUuid);
    }

    return spriteFrame;
  }

  private applyAllPieceGridSprites() {
    for (const cell of this.boardCells.values()) {
      this.applyPieceGridSpriteForCell(cell);
    }
  }

  private applyPieceGridSpriteForCell(cell: BoardCellView) {
    const sprite = cell.highlightNode.getComponent(Sprite);
    if (!sprite) {
      return;
    }

    const spriteFrameUuid = this.resolvePieceGridSpriteFrameUuid(cell.stack);
    const spriteFrame = this.getCachedPieceGridSpriteFrame(spriteFrameUuid);
    if (!spriteFrame) {
      return;
    }

    sprite.spriteFrame = spriteFrame;
  }

  private applyPieceGridAvailabilityVisual(cell: BoardCellView) {
    const sprite = cell.highlightNode.getComponent(Sprite);
    if (!sprite) {
      return;
    }

    if (this.pendingPieceType) {
      const validation = validateTerrainPlacement(this.toTerrainCellState(cell), this.pendingPieceType);
      sprite.color = validation.allowed ? Color.WHITE : new Color(150, 150, 150, 255);
      return;
    }

    if (this.pendingAnimalCard) {
      const canPlace = this.canPlaceAnimalAt(this.pendingAnimalCard, cell);
      sprite.color = canPlace ? new Color(255, 255, 255, 255) : new Color(120, 120, 120, 220);
      return;
    }

    sprite.color = new Color(255, 255, 255, 255);
  }

  private async renderTerrainModel(cell: BoardCellView) {
    const prefabUuid = this.resolveModelPrefabUuid(cell.stack);

    for (const child of [...cell.terrainRoot.children]) {
      child.destroy();
    }

    if (!prefabUuid) {
      return;
    }

    const modelTransform = MODEL_TRANSFORMS[prefabUuid] ?? {
      positionZ: 0,
      rotationX: 0,
      rotationZ: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      scaleZ: 0.2,
    };

    try {
      const prefab = await this.loadPrefab(prefabUuid);
      const terrainInstance = instantiate(prefab);
      terrainInstance.name = 'PlacedTerrainModel';
      terrainInstance.setScale(modelTransform.scaleX, modelTransform.scaleY, modelTransform.scaleZ);
      terrainInstance.setPosition(0, 0, modelTransform.positionZ);
      terrainInstance.setRotationFromEuler(modelTransform.rotationX, 0, modelTransform.rotationZ);
      cell.terrainRoot.addChild(terrainInstance);
    } catch (error) {
      console.error('[TerrainBoardController] Failed to load terrain model.', error);
    }
  }

  private resolveModelPrefabUuid(stack: readonly TerrainPieceType[]): string | null {
    if (stack.length === 0) {
      return null;
    }

    const stackKey = stack.join('|');

    switch (stackKey) {
      case TerrainPieceType.Building:
        return MODEL_PREFAB_UUIDS.buildGrade1;
      case TerrainPieceType.Field:
        return MODEL_PREFAB_UUIDS.fieldGrade1;
      case TerrainPieceType.River:
        return MODEL_PREFAB_UUIDS.riverGrade1;
      case TerrainPieceType.Stump:
        return MODEL_PREFAB_UUIDS.stumpGrade1;
      case `${TerrainPieceType.Stump}|${TerrainPieceType.Stump}`:
        return MODEL_PREFAB_UUIDS.stumpGrade2;
      case TerrainPieceType.Leaves:
        return MODEL_PREFAB_UUIDS.leavesGrade1;
      case `${TerrainPieceType.Stump}|${TerrainPieceType.Leaves}`:
        return MODEL_PREFAB_UUIDS.leavesGrade2;
      case `${TerrainPieceType.Stump}|${TerrainPieceType.Stump}|${TerrainPieceType.Leaves}`:
        return MODEL_PREFAB_UUIDS.leavesGrade3;
      case TerrainPieceType.Mountain:
        return MODEL_PREFAB_UUIDS.mountainGrade1;
      case `${TerrainPieceType.Mountain}|${TerrainPieceType.Mountain}`:
        return MODEL_PREFAB_UUIDS.mountainGrade2;
      case `${TerrainPieceType.Mountain}|${TerrainPieceType.Mountain}|${TerrainPieceType.Mountain}`:
        return MODEL_PREFAB_UUIDS.mountainGrade3;
      case `${TerrainPieceType.Stump}|${TerrainPieceType.Building}`:
      case `${TerrainPieceType.Mountain}|${TerrainPieceType.Building}`:
      case `${TerrainPieceType.Building}|${TerrainPieceType.Building}`:
        return MODEL_PREFAB_UUIDS.buildGrade2;
      default:
        return null;
    }
  }

  private resolvePieceGridSpriteFrameUuid(stack: readonly TerrainPieceType[]): string {
    if (stack.length === 0) {
      return PIECE_GRID_SPRITE_FRAME_UUIDS.empty;
    }

    const topPiece = stack[stack.length - 1];
    if (topPiece === TerrainPieceType.Building) {
      return stack.length >= 2
        ? PIECE_GRID_SPRITE_FRAME_UUIDS.buildGrade2
        : PIECE_GRID_SPRITE_FRAME_UUIDS.buildGrade1;
    }

    const documentedCode = getDocumentedTerrainCode(stack);
    switch (documentedCode) {
      case 'WT':
        return PIECE_GRID_SPRITE_FRAME_UUIDS.riverGrade1;
      case 'BN1':
        return PIECE_GRID_SPRITE_FRAME_UUIDS.stumpGrade1;
      case 'BN2':
        return PIECE_GRID_SPRITE_FRAME_UUIDS.stumpGrade2;
      case 'YL':
      case 'FD':
        return PIECE_GRID_SPRITE_FRAME_UUIDS.fieldGrade1;
      case 'M1':
        return PIECE_GRID_SPRITE_FRAME_UUIDS.mountainGrade1;
      case 'M2':
        return PIECE_GRID_SPRITE_FRAME_UUIDS.mountainGrade2;
      case 'M3':
        return PIECE_GRID_SPRITE_FRAME_UUIDS.mountainGrade3;
      case 'T1':
        return PIECE_GRID_SPRITE_FRAME_UUIDS.leavesGrade1;
      case 'T2':
        return PIECE_GRID_SPRITE_FRAME_UUIDS.leavesGrade2;
      case 'T3':
        return PIECE_GRID_SPRITE_FRAME_UUIDS.leavesGrade3;
      case 'H':
        return PIECE_GRID_SPRITE_FRAME_UUIDS.buildGrade1;
      default:
        break;
    }

    if (
      stack.length === 2
      && stack[0] === TerrainPieceType.Stump
      && stack[1] === TerrainPieceType.Stump
    ) {
      return PIECE_GRID_SPRITE_FRAME_UUIDS.stumpGrade2;
    }

    return PIECE_GRID_SPRITE_FRAME_UUIDS.empty;
  }

  private createAnimalTokenNode(nodeName: string): Node {
    const tokenNode = new Node(`${this.toPieceGridNodeName(nodeName)}_AnimalToken`);
    tokenNode.layer = BOARD_OVERLAY_LAYER;
    this.animalTokenRoot!.addChild(tokenNode);
    tokenNode.active = false;

    const transform = tokenNode.addComponent(UITransform);
    transform.setContentSize(72, 72);

    const sprite = tokenNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = this.animalTokenSpriteFrame;
    sprite.color = Color.WHITE;

    const fixedPosition = this.getHighlightFixedPosition(this.toPieceGridNodeName(nodeName));
    if (fixedPosition) {
      tokenNode.setPosition(fixedPosition);
    }

    return tokenNode;
  }

  private updateAnimalTokenVisual(cell: BoardCellView) {
    const sprite = cell.animalTokenNode.getComponent(Sprite);
    if (!sprite) {
      return;
    }

    if (!cell.hasAnimalOccupant || !cell.animalOccupantCardId) {
      cell.animalTokenNode.active = false;
      sprite.spriteFrame = this.animalTokenSpriteFrame;
      return;
    }

    cell.animalTokenNode.active = true;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = this.animalTokenSpriteFrame;
    sprite.color = Color.WHITE;
  }

  private canPlaceAnimalAt(card: AnimalCardDefinition, anchorCell: BoardCellView): boolean {
    if (anchorCell.hasAnimalOccupant) {
      return false;
    }

    const anchorTerrainCode = getDocumentedTerrainCode(anchorCell.stack);
    if (anchorTerrainCode !== card.placementCell.type) {
      return false;
    }

    if (card.adjacentRequirementTypes && card.adjacentRequirementTypes.length > 0) {
      return card.adjacentRequirementTypes.every((requiredType) => this.hasAdjacentTerrainType(anchorCell, requiredType));
    }

    for (const patternCell of card.patternCells) {
      const targetCell = this.findBoardCellByCoordinate(anchorCell.q + patternCell.q, anchorCell.r + patternCell.r);
      if (!targetCell) {
        return false;
      }

      const terrainCode = getDocumentedTerrainCode(targetCell.stack);
      if (terrainCode !== patternCell.type) {
        return false;
      }
    }

    return true;
  }

  private hasAdjacentTerrainType(anchorCell: BoardCellView, terrainType: AnimalCardDefinition['placementCell']['type']): boolean {
    if (anchorCell.gridRow !== null && anchorCell.gridColumn !== null) {
      return this.getAdjacentGridCells(anchorCell.gridRow, anchorCell.gridColumn).some((neighborCell) => {
        return getDocumentedTerrainCode(neighborCell.stack) === terrainType;
      });
    }

    return AXIAL_NEIGHBOR_OFFSETS.some(({ q, r }) => {
      const neighborCell = this.findBoardCellByCoordinate(anchorCell.q + q, anchorCell.r + r);
      if (!neighborCell) {
        return false;
      }

      return getDocumentedTerrainCode(neighborCell.stack) === terrainType;
    });
  }

  private getAdjacentGridCells(row: number, column: number): BoardCellView[] {
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
      .map(({ rowDelta, columnDelta }) => this.findBoardCellByGridPosition(row + rowDelta, column + columnDelta))
      .filter((cell): cell is BoardCellView => cell !== null);
  }

  private toPieceGridNodeName(nodeName: string): string {
    if (nodeName.includes('Highlight')) {
      return nodeName.replace(/Highlight/g, 'PieceGrid');
    }

    if (nodeName.includes('Node')) {
      return nodeName.replace(/Node/g, 'PieceGrid');
    }

    return nodeName;
  }

  private loadPrefab(prefabUuid: string): Promise<Prefab> {
    const cachedPrefab = this.prefabCache.get(prefabUuid);
    if (cachedPrefab) {
      return Promise.resolve(cachedPrefab);
    }

    return new Promise((resolve, reject) => {
      assetManager.loadAny(prefabUuid, (error, prefab) => {
        if (error || !prefab) {
          reject(error ?? new Error(`Failed to load terrain prefab by UUID: ${prefabUuid}`));
          return;
        }

        const castPrefab = prefab as Prefab;
        this.prefabCache.set(prefabUuid, castPrefab);
        resolve(castPrefab);
      });
    });
  }

  private toTerrainCellState(cell: BoardCellView): TerrainCellState {
    return {
      stack: cell.stack,
      hasAnimalOccupant: cell.hasAnimalOccupant,
    };
  }

  private axialToBoardLocalPosition(q: number, r: number): Vec3 {
    const x = HEX_SIZE * Math.sqrt(3) * (q + r * 0.5);
    const y = HEX_SIZE * 1.5 * r;
    return new Vec3(x, y, CELL_SURFACE_OFFSET);
  }

  private getAxialSequence(): Array<{ q: number; r: number }> {
    const result: Array<{ q: number; r: number }> = [];

    for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r += 1) {
      const qMin = Math.max(-BOARD_RADIUS, -r - BOARD_RADIUS);
      const qMax = Math.min(BOARD_RADIUS, -r + BOARD_RADIUS);
      for (let q = qMin; q <= qMax; q += 1) {
        result.push({ q, r });
      }
    }

    return result;
  }

  private findExistingBoardAnchors(): Node[] {
    const namedMatches: Node[] = [];
    const fallbackMatches: Node[] = [];
    const stack = [...this.boardNode!.children];

    while (stack.length > 0) {
      const currentNode = stack.shift()!;
      if (
        currentNode.name === BOARD_CELLS_ROOT_NAME
        || currentNode.name === 'TerrainRoot'
        || currentNode.name.startsWith('PlacedTerrainModel')
      ) {
        continue;
      }

      stack.unshift(...currentNode.children);

      if (currentNode.getComponent(MeshRenderer)) {
        continue;
      }

      if (BOARD_ANCHOR_HINT.test(currentNode.name)) {
        namedMatches.push(currentNode);
        continue;
      }

      if (currentNode.children.length === 0) {
        fallbackMatches.push(currentNode);
      }
    }

    const result = namedMatches.length > 0 ? namedMatches : fallbackMatches;

    return result.sort((left, right) => {
      const deltaY = right.position.y - left.position.y;
      if (Math.abs(deltaY) > 0.001) {
        return deltaY;
      }

      return left.position.x - right.position.x;
    });
  }

  private getOrCreateTerrainRoot(cellNode: Node): Node {
    let terrainRoot = cellNode.getChildByName('TerrainRoot');
    if (!terrainRoot) {
      terrainRoot = new Node('TerrainRoot');
      cellNode.addChild(terrainRoot);
    }

    terrainRoot.setPosition(0, 0, 0);
    terrainRoot.setRotationFromEuler(0, 0, 0);
    return terrainRoot;
  }

  private clearAnchorTerrainVisuals(cellNode: Node, terrainRoot: Node) {
    for (const child of [...cellNode.children]) {
      if (child === terrainRoot) {
        continue;
      }

      if (this.containsMeshRenderer(child)) {
        child.destroy();
      }
    }
  }

  private containsMeshRenderer(node: Node): boolean {
    if (node.getComponent(MeshRenderer)) {
      return true;
    }

    return node.children.some((child) => this.containsMeshRenderer(child));
  }

  private findBoardCellByCoordinate(q: number, r: number): BoardCellView | null {
    for (const cell of this.boardCells.values()) {
      if (cell.q === q && cell.r === r) {
        return cell;
      }
    }

    return null;
  }

  private findBoardCellByGridPosition(row: number, column: number): BoardCellView | null {
    for (const cell of this.boardCells.values()) {
      if (cell.gridRow === row && cell.gridColumn === column) {
        return cell;
      }
    }

    return null;
  }

  private parseBoardGridCoordinate(nodeName: string): { q: number; r: number } | null {
    const match = nodeName.match(/Node(\d+)-(\d+)/);
    if (!match) {
      return null;
    }

    return {
      q: Number.parseInt(match[1], 10),
      r: Number.parseInt(match[2], 10),
    };
  }

  private toCellKey(q: number, r: number, index?: number): string {
    return index === undefined ? `${q},${r}` : `${q},${r},${index}`;
  }

  private findNodeByName(root: Node, name: string): Node | null {
    if (root.name === name) {
      return root;
    }

    for (const child of root.children) {
      const result = this.findNodeByName(child, name);
      if (result) {
        return result;
      }
    }

    return null;
  }

  private findMainCamera(root: Node): Camera | null {
    const cameraNode = this.findNodeByName(root, 'Main Camera');
    return cameraNode?.getComponent(Camera) ?? null;
  }

  private ensureOverlayCamera(): Camera | null {
    let overlayCameraNode = this.node.getChildByName(BOARD_OVERLAY_CAMERA_NAME);
    if (!overlayCameraNode) {
      overlayCameraNode = new Node(BOARD_OVERLAY_CAMERA_NAME);
      this.node.addChild(overlayCameraNode);
    }

    const sourceCameraNode = this.node.getChildByName('Camera');
    if (sourceCameraNode) {
      overlayCameraNode.setPosition(sourceCameraNode.position);
      overlayCameraNode.setRotation(sourceCameraNode.rotation);
      overlayCameraNode.setScale(sourceCameraNode.scale);
    }

    let overlayCamera = overlayCameraNode.getComponent(Camera);
    if (!overlayCamera) {
      overlayCamera = overlayCameraNode.addComponent(Camera);
    }

    const sourceCamera = sourceCameraNode?.getComponent(Camera);
    if (sourceCamera) {
      overlayCamera.projection = sourceCamera.projection;
      overlayCamera.orthoHeight = sourceCamera.orthoHeight;
      overlayCamera.near = sourceCamera.near;
      overlayCamera.far = sourceCamera.far;
    }

    overlayCamera.priority = Math.max(this.mainCamera?.priority ?? 1, sourceCamera?.priority ?? 0) + 1;
    overlayCamera.visibility = BOARD_OVERLAY_LAYER;
    overlayCamera.clearFlags = 0;

    return overlayCamera;
  }
}
