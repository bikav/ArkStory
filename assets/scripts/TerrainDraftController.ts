import {
  _decorator,
  Button,
  Color,
  Component,
  EventTouch,
  Label,
  Node,
  resources,
  Sprite,
  SpriteFrame,
  UITransform,
} from 'cc';
import type { BoardSnapshotPayload, MatchSummaryPayload } from './battle/MatchApi';
import {
  createTerrainPiecePool,
  TERRAIN_PIECE_DEFINITIONS,
  TERRAIN_PIECE_DRAW_ORDER,
  TerrainPieceType,
} from './TerrainPieceDefinitions';
import { AnimalCardController } from './AnimalCardController';
import { TerrainBoardController } from './TerrainBoardController';

const { ccclass } = _decorator;

const GROUP_COUNT = 4;
const PIECES_PER_GROUP = 3;
const BATTLE_COUNTDOWN_SECONDS = 60;
const SLOT_ICON_NAMES = ['PieceIcon0', 'PieceIcon1', 'PieceIcon2'];
const SLOT_ICON_LAYOUT = [
  { x: 0, y: 28, size: 54 },
  { x: -34, y: -22, size: 54 },
  { x: 34, y: -22, size: 54 },
];
const CONFIRMED_ICON_LAYOUT = [
  { x: -180, y: 0, size: 120 },
  { x: 0, y: 0, size: 120 },
  { x: 180, y: 0, size: 120 },
];
const SWITCH_ENEMY_CHESSBOARD_BG_PATH = 'textures/switch_enemy_chessboard_bg/spriteFrame';
const SWITCH_OUR_CHESSBOARD_BG_PATH = 'textures/switch_our_chessboard_bg/spriteFrame';
const SWITCH_ENEMY_CHESSBOARD_TIP_PATH = 'textures/switch_enemy_chessboard_tip/spriteFrame';

@ccclass('TerrainDraftController')
export class TerrainDraftController extends Component {
  private readonly pieceDeck: TerrainPieceType[] = [];
  private readonly slotGroups: TerrainPieceType[][] = [];
  private readonly slotNodes: Node[] = [];
  private readonly spriteFrames = new Map<TerrainPieceType, SpriteFrame>();

  private countdownBgNode: Node | null = null;
  private countdownLabel: Label | null = null;
  private scoreboardBgNode: Node | null = null;
  private scoreLabel: Label | null = null;
  private countdownRemainingSeconds = BATTLE_COUNTDOWN_SECONDS;
  private sharedBattleMode = false;
  private sharedPlayerId: number | null = null;
  private activeTurnPlayerId: number | null = null;
  private sharedTurnDeadlineMs: number | null = null;
  private remoteSelectSlotHandler: ((slotIndex: number) => Promise<MatchSummaryPayload>) | null = null;
  private remotePlacePieceHandler: ((payload: {
    previewIndex: number;
    q: number;
    r: number;
  }) => Promise<MatchSummaryPayload>) | null = null;
  private remoteRecruitAnimalHandler: ((slotIndex: number) => Promise<MatchSummaryPayload>) | null = null;
  private remotePlaceAnimalHandler: ((payload: {
    cardId: string;
    q: number;
    r: number;
  }) => Promise<MatchSummaryPayload>) | null = null;
  private remoteEndTurnHandler: (() => Promise<MatchSummaryPayload>) | null = null;
  private activeTurnSlotIndex = -1;
  private topPieceRow: Node | null = null;
  private switchChessboardButtonNode: Node | null = null;
  private switchChessboardButtonSprite: Sprite | null = null;
  private confirmButtonNode: Node | null = null;
  private confirmButton: Button | null = null;
  private choiceAnimalButtonNode: Node | null = null;
  private choiceAnimalButton: Button | null = null;
  private endTurnButtonNode: Node | null = null;
  private endTurnButton: Button | null = null;
  private confirmedPreviewNode: Node | null = null;
  private enemyChessboardTipNode: Node | null = null;
  private boardController: TerrainBoardController | null = null;
  private animalCardController: AnimalCardController | null = null;
  private confirmedPieces: Array<TerrainPieceType | null> = [];
  private selectedConfirmedPieceIndex = -1;
  private selectedSlotIndex = -1;
  private isReady = false;
  private isRequestInFlight = false;
  private isAutoEndingTurn = false;
  private wasMyTurn = false;
  private pendingSharedMatchState: MatchSummaryPayload | null = null;
  private latestMyBoardSnapshot: BoardSnapshotPayload | null = null;
  private latestOpponentBoardSnapshot: BoardSnapshotPayload | null = null;
  private latestRoomStatus = 0;
  private latestMyScore = 0;
  private latestOpponentScore = 0;
  private latestMyFinalScore = 0;
  private latestOpponentFinalScore = 0;
  private latestMyResultType: MatchSummaryPayload['my_result_type'] = 'pending';
  private viewingOpponentBoard = false;
  private switchEnemyChessboardBgSpriteFrame: SpriteFrame | null = null;
  private switchOurChessboardBgSpriteFrame: SpriteFrame | null = null;
  private switchEnemyChessboardTipSpriteFrame: SpriteFrame | null = null;

  onLoad() {
    this.countdownBgNode = this.node.getChildByName('CountdownBG');
    this.scoreboardBgNode = this.node.getChildByName('ScoreboardBG');
    this.scoreLabel = this.scoreboardBgNode?.getChildByName('Score')?.getComponent(Label) ?? null;
    this.topPieceRow = this.node.getChildByName('TopPieceRow');
    this.switchChessboardButtonNode = this.node.getChildByName('SwitchChessboardButton');
    this.switchChessboardButtonSprite = this.switchChessboardButtonNode?.getComponent(Sprite) ?? null;
    this.confirmButtonNode = this.node.getChildByName('ChoicePieceButton');
    this.confirmButton = this.confirmButtonNode?.getComponent(Button) ?? null;
    this.choiceAnimalButtonNode = this.node.getChildByName('ChoiceAnimalButton');
    this.choiceAnimalButton = this.choiceAnimalButtonNode?.getComponent(Button) ?? null;
    this.endTurnButtonNode = this.node.getChildByName('EndTurnButton');
    this.endTurnButton = this.endTurnButtonNode?.getComponent(Button) ?? null;
    this.boardController = this.getComponent(TerrainBoardController) ?? this.addComponent(TerrainBoardController);
    this.boardController.setPlacementListener((payload) => {
      this.onBoardPiecePlaced(payload.previewIndex, payload.pieceType, payload.q, payload.r, payload.resultingStack);
    });
    this.animalCardController = this.getComponent(AnimalCardController) ?? this.addComponent(AnimalCardController);
    this.animalCardController.initialize(this.boardController);
    this.animalCardController.setOverlayVisibilityListener((visible) => {
      this.boardController?.setBoardHiddenForAnimalSelection(visible);
    });

    if (this.confirmButtonNode) {
      this.confirmButtonNode.active = false;
      this.confirmButtonNode.on(Button.EventType.CLICK, this.onConfirmSelection, this);
    }

    if (this.choiceAnimalButtonNode) {
      this.choiceAnimalButtonNode.on(Button.EventType.CLICK, this.onChoiceAnimalButtonClicked, this);
    }

    if (this.endTurnButtonNode) {
      this.endTurnButtonNode.on(Button.EventType.CLICK, this.onEndTurnButtonClicked, this);
    }

    this.ensureCountdownLabel();
    this.refreshScoreDisplay();
  }

  onDestroy() {
    this.unschedule(this.tickCountdown);
    this.unschedule(this.syncSharedCountdown);

    if (this.boardController) {
      this.boardController.setPlacementListener(null);
    }

    if (this.animalCardController) {
      this.animalCardController.setOverlayVisibilityListener(null);
    }

    if (this.confirmButtonNode?.isValid) {
      this.confirmButtonNode.off(Button.EventType.CLICK, this.onConfirmSelection, this);
    }

    if (this.choiceAnimalButtonNode?.isValid) {
      this.choiceAnimalButtonNode.off(Button.EventType.CLICK, this.onChoiceAnimalButtonClicked, this);
    }

    if (this.endTurnButtonNode?.isValid) {
      this.endTurnButtonNode.off(Button.EventType.CLICK, this.onEndTurnButtonClicked, this);
    }

    for (const slotNode of this.slotNodes) {
      if (slotNode?.isValid) {
        slotNode.off(Node.EventType.TOUCH_END, this.onSlotTouched, this);
      }
    }
  }

  start() {
    void this.initializeDraft();
  }

  private async initializeDraft() {
    if (!this.topPieceRow || !this.confirmButtonNode) {
      console.warn('[TerrainDraftController] Missing TopPieceRow or ChoicePieceButton node in Canvas.');
      return;
    }

    await this.loadSpriteFrames();

    this.collectSlotNodes();
    this.ensureConfirmedPreviewNode();
    this.ensureEnemyChessboardTipNode();

    if (this.sharedBattleMode) {
      this.initializeEmptyGroups();
    } else {
      this.resetDeck();
      this.dealInitialGroups();
    }

    this.renderAllSlots();
    this.updateSelection(-1);
    this.refreshEndTurnButtonState();

    this.isReady = true;
    this.refreshEndTurnButtonState();

    if (this.sharedBattleMode) {
      if (this.pendingSharedMatchState) {
        const pendingState = this.pendingSharedMatchState;
        this.pendingSharedMatchState = null;
        this.applySharedMatchStateInternal(pendingState);
      }
    } else {
      this.startCountdown();
    }
  }

  public enableSharedBattleMode(config: {
    playerId: number;
    onSelectSlot: (slotIndex: number) => Promise<MatchSummaryPayload>;
    onPlacePiece: (payload: {
      previewIndex: number;
      q: number;
      r: number;
    }) => Promise<MatchSummaryPayload>;
    onRecruitAnimal: (slotIndex: number) => Promise<MatchSummaryPayload>;
    onPlaceAnimal: (payload: {
      cardId: string;
      q: number;
      r: number;
    }) => Promise<MatchSummaryPayload>;
    onEndTurn: () => Promise<MatchSummaryPayload>;
  }) {
    this.sharedBattleMode = true;
    this.sharedPlayerId = config.playerId;
    this.remoteSelectSlotHandler = config.onSelectSlot;
    this.remotePlacePieceHandler = config.onPlacePiece;
    this.remoteRecruitAnimalHandler = config.onRecruitAnimal;
    this.remotePlaceAnimalHandler = config.onPlaceAnimal;
    this.remoteEndTurnHandler = config.onEndTurn;
    this.boardController?.setRemoteTerrainPlacementHandler(async (payload) => {
      await this.requestSharedPlacePiece(payload.previewIndex, payload.q, payload.r);
    });
    this.boardController?.setRemoteAnimalPlacementHandler(async (payload) => {
      await this.requestSharedPlaceAnimal(payload.card.cardId, payload.q, payload.r);
    });
    this.animalCardController?.enableSharedBattleMode({
      onRecruitCardSlot: async (slotIndex) => {
        await this.requestSharedRecruitAnimal(slotIndex);
      },
    });
    this.unschedule(this.tickCountdown);
    this.unschedule(this.syncSharedCountdown);
  }

  public applySharedMatchState(state: MatchSummaryPayload) {
    if (!this.isReady) {
      this.latestRoomStatus = state.room_status;
      this.activeTurnPlayerId = state.turn_player_id;
      this.sharedTurnDeadlineMs = state.turn_deadline_at
        ? new Date(state.turn_deadline_at).getTime()
        : null;
      this.latestMyBoardSnapshot = state.my_board_snapshot;
      this.latestOpponentBoardSnapshot = state.opponent_board_public_snapshot;
      this.latestMyScore = state.my_score ?? 0;
      this.latestOpponentScore = state.opponent_score ?? 0;
      this.latestMyFinalScore = state.my_final_score ?? 0;
      this.latestOpponentFinalScore = state.opponent_final_score ?? 0;
      this.latestMyResultType = state.my_result_type ?? 'pending';
      if (!this.latestOpponentBoardSnapshot) {
        this.viewingOpponentBoard = false;
      }
      this.pendingSharedMatchState = state;
      return;
    }

    this.applySharedMatchStateInternal(state);
  }

  private applySharedMatchStateInternal(state: MatchSummaryPayload) {
    const previousWasMyTurn = this.wasMyTurn;
    const previousSelectedSlotIndex = this.selectedSlotIndex;
    const previousSelectedConfirmedPieceIndex = this.selectedConfirmedPieceIndex;
    const normalizedGroups = state.terrain_market_snapshot.slot_groups.map((group) => [...group]);
    const remainingPieceIndexSet = new Set(state.terrain_market_snapshot.remaining_piece_indices);

    this.slotGroups.length = 0;
    this.slotGroups.push(...normalizedGroups);
    this.latestRoomStatus = state.room_status;
    this.activeTurnPlayerId = state.turn_player_id;
    this.activeTurnSlotIndex = state.terrain_market_snapshot.active_slot_index ?? -1;
    this.sharedTurnDeadlineMs = state.turn_deadline_at
      ? new Date(state.turn_deadline_at).getTime()
      : null;
    this.isAutoEndingTurn = false;
    this.latestMyBoardSnapshot = state.my_board_snapshot;
    this.latestOpponentBoardSnapshot = state.opponent_board_public_snapshot;
    this.latestMyScore = state.my_score ?? 0;
    this.latestOpponentScore = state.opponent_score ?? 0;
    this.latestMyFinalScore = state.my_final_score ?? 0;
    this.latestOpponentFinalScore = state.opponent_final_score ?? 0;
    this.latestMyResultType = state.my_result_type ?? 'pending';
    if (!this.latestOpponentBoardSnapshot) {
      this.viewingOpponentBoard = false;
    }

    const myTurn = this.isMyTurn();
    this.wasMyTurn = myTurn;

    if (myTurn && !previousWasMyTurn) {
      this.animalCardController?.beginTurn();
    }
    if (!myTurn && previousWasMyTurn) {
      this.animalCardController?.endTurn();
    }

    this.refreshDisplayedBoardSnapshot();
    this.refreshScoreDisplay();
    this.animalCardController?.applySharedStates(
      state.my_animal_state,
      state.opponent_animal_state,
      this.viewingOpponentBoard,
    );

    if (!myTurn) {
      this.clearPendingTurnSelection();
    } else if (this.activeTurnSlotIndex >= 0) {
      const activeGroup = this.slotGroups[this.activeTurnSlotIndex] ?? [];
      this.confirmedPieces = activeGroup.map((pieceType, index) => (remainingPieceIndexSet.has(index) ? pieceType : null));
      const hasSelectedConfirmedPiece = (
        previousSelectedConfirmedPieceIndex >= 0
        && previousSelectedConfirmedPieceIndex < this.confirmedPieces.length
        && !!this.confirmedPieces[previousSelectedConfirmedPieceIndex]
      );
      if (
        !hasSelectedConfirmedPiece
      ) {
        this.selectedConfirmedPieceIndex = -1;
        this.boardController?.setPendingPiece(null);
      } else {
        this.selectedConfirmedPieceIndex = previousSelectedConfirmedPieceIndex;
        this.boardController?.setPendingPiece(
          this.confirmedPieces[this.selectedConfirmedPieceIndex]!,
          this.selectedConfirmedPieceIndex,
        );
      }
      this.selectedSlotIndex = -1;
      this.renderConfirmedPreview(
        this.confirmedPieces,
        hasSelectedConfirmedPiece ? previousSelectedConfirmedPieceIndex : -1,
      );
      if (this.confirmButtonNode) {
        this.confirmButtonNode.active = false;
      }
    } else if (myTurn && this.activeTurnSlotIndex < 0) {
      this.confirmedPieces = [];
      this.selectedConfirmedPieceIndex = -1;
      this.boardController?.setPendingPiece(null);
      if (this.confirmedPreviewNode) {
        this.confirmedPreviewNode.active = false;
      }
      const canKeepSelectedSlot = (
        previousSelectedSlotIndex >= 0
        && previousSelectedSlotIndex < this.slotGroups.length
      );
      this.selectedSlotIndex = canKeepSelectedSlot ? previousSelectedSlotIndex : -1;
      if (this.confirmButtonNode) {
        this.confirmButtonNode.active = this.selectedSlotIndex >= 0;
      }
    }

    if (this.isReady) {
      this.renderAllSlots();
      this.refreshCountdownFromSharedDeadline();
      this.refreshEndTurnButtonState();
      this.refreshPerspectiveVisibility();
      if (this.confirmButtonNode && !myTurn) {
        this.confirmButtonNode.active = false;
      }
    }

    this.unschedule(this.syncSharedCountdown);
    this.schedule(this.syncSharedCountdown, 1);
  }

  public canToggleBoardPerspective(): boolean {
    return this.sharedBattleMode && !!this.latestOpponentBoardSnapshot;
  }

  public isShowingOpponentBoard(): boolean {
    return this.viewingOpponentBoard;
  }

  public setBoardHiddenForSettlement(hidden: boolean) {
    this.boardController?.setBoardHiddenForSettlement(hidden);
  }

  public hideAnimalSelectionOverlay() {
    this.animalCardController?.hideOverlay();
  }

  public toggleBoardPerspective(): boolean {
    if (!this.canToggleBoardPerspective()) {
      this.viewingOpponentBoard = false;
      this.refreshDisplayedBoardSnapshot();
      this.refreshScoreDisplay();
      this.animalCardController?.setViewingOpponentState(false);
      this.refreshPerspectiveVisibility();
      return false;
    }

    this.viewingOpponentBoard = !this.viewingOpponentBoard;
    this.clearBoardInteractionSelection();
    this.refreshDisplayedBoardSnapshot();
    this.refreshScoreDisplay();
    this.animalCardController?.setViewingOpponentState(this.viewingOpponentBoard);
    this.refreshEndTurnButtonState();
    this.refreshPerspectiveVisibility();
    return this.viewingOpponentBoard;
  }

  private async loadSpriteFrames() {
    const loadTasks = TERRAIN_PIECE_DRAW_ORDER.map((pieceType) => {
      const { texturePath } = TERRAIN_PIECE_DEFINITIONS[pieceType];

      return this.loadSpriteFrame(texturePath).then((spriteFrame) => {
        this.spriteFrames.set(pieceType, spriteFrame);
      });
    });

    await Promise.all(loadTasks);

    this.switchEnemyChessboardBgSpriteFrame = await this.loadSpriteFrame(SWITCH_ENEMY_CHESSBOARD_BG_PATH);
    this.switchOurChessboardBgSpriteFrame = await this.loadSpriteFrame(SWITCH_OUR_CHESSBOARD_BG_PATH);
    this.switchEnemyChessboardTipSpriteFrame = await this.loadSpriteFrame(SWITCH_ENEMY_CHESSBOARD_TIP_PATH);
  }

  private loadSpriteFrame(path: string): Promise<SpriteFrame> {
    return new Promise((resolve, reject) => {
      resources.load(path, SpriteFrame, (error, spriteFrame) => {
        if (error || !spriteFrame) {
          reject(error ?? new Error(`Failed to load sprite frame: ${path}`));
          return;
        }

        resolve(spriteFrame);
      });
    });
  }

  private ensureCountdownLabel() {
    if (!this.countdownBgNode) {
      console.warn('[TerrainDraftController] Missing CountdownBG node in Canvas.');
      return;
    }

    const labelNode = this.countdownBgNode.getChildByName('CountdownLabel') ?? new Node('CountdownLabel');
    if (!labelNode.parent) {
      labelNode.layer = this.countdownBgNode.layer;
      this.countdownBgNode.addChild(labelNode);
    }
    labelNode.setPosition(0, 0, 0);

    const transform = labelNode.getComponent(UITransform) ?? labelNode.addComponent(UITransform);
    const parentTransform = this.countdownBgNode.getComponent(UITransform);
    transform.setContentSize(parentTransform?.contentSize ?? this.countdownBgNode.getComponent(UITransform)?.contentSize ?? transform.contentSize);

    const label = labelNode.getComponent(Label) ?? labelNode.addComponent(Label);
    label.fontSize = 40;
    label.lineHeight = 44;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = false;
    label.string = this.formatCountdown(this.countdownRemainingSeconds);

    this.countdownLabel = label;
  }

  private refreshScoreDisplay(displayedScore?: number) {
    if (!this.scoreLabel) {
      return;
    }

    const score = displayedScore ?? (
      this.latestRoomStatus === 3
        ? (this.viewingOpponentBoard ? this.latestOpponentFinalScore : this.latestMyFinalScore)
        : (this.viewingOpponentBoard ? this.latestOpponentScore : this.latestMyScore)
    );
    this.scoreLabel.string = `${score}`;
  }

  private startCountdown() {
    this.unschedule(this.tickCountdown);
    this.countdownRemainingSeconds = BATTLE_COUNTDOWN_SECONDS;
    this.animalCardController?.beginTurn();
    this.refreshCountdownDisplay();
    this.refreshEndTurnButtonState();
    this.schedule(this.tickCountdown, 1);
  }

  private tickCountdown = () => {
    if (this.countdownRemainingSeconds <= 0) {
      this.unschedule(this.tickCountdown);
      return;
    }

    this.countdownRemainingSeconds -= 1;
    this.refreshCountdownDisplay();

    if (this.countdownRemainingSeconds <= 0) {
      this.resolveLocalTurnTimeout();
    }
  };

  private syncSharedCountdown = () => {
    if (!this.sharedBattleMode) {
      return;
    }

    this.refreshCountdownFromSharedDeadline();

    if (
      this.countdownRemainingSeconds <= 0
      && this.isMyTurn()
      && !this.isAutoEndingTurn
      && !this.isRequestInFlight
    ) {
      this.isAutoEndingTurn = true;
      void this.handleSharedTurnTimeout();
    }
  };

  private refreshCountdownDisplay() {
    if (!this.countdownLabel) {
      return;
    }

    if (this.sharedBattleMode && this.latestRoomStatus === 3) {
      this.countdownLabel.string = this.latestMyResultType === 'win'
        ? '胜利'
        : (this.latestMyResultType === 'lose' ? '失败' : '平局');
      return;
    }

    this.countdownLabel.string = this.formatCountdown(this.countdownRemainingSeconds);
  }

  private formatCountdown(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const minuteText = minutes < 10 ? `0${minutes}` : `${minutes}`;
    const secondText = seconds < 10 ? `0${seconds}` : `${seconds}`;
    return `${minuteText}:${secondText}`;
  }

  private collectSlotNodes() {
    this.slotNodes.length = 0;

    for (let index = 1; index <= GROUP_COUNT; index += 1) {
      const slotNode = this.topPieceRow!.getChildByName(`PieceSlot${index}`);
      if (!slotNode) {
        throw new Error(`Missing PieceSlot${index} under TopPieceRow.`);
      }

      slotNode.on(Node.EventType.TOUCH_END, this.onSlotTouched, this);
      this.slotNodes.push(slotNode);
    }
  }

  private resetDeck() {
    this.pieceDeck.length = 0;
    this.pieceDeck.push(...createTerrainPiecePool());
    this.shuffle(this.pieceDeck);
  }

  private dealInitialGroups() {
    this.slotGroups.length = 0;

    for (let index = 0; index < GROUP_COUNT; index += 1) {
      this.slotGroups.push(this.drawPieces(PIECES_PER_GROUP));
    }

    this.logRemainingPieces('Initial deal');
  }

  private initializeEmptyGroups() {
    this.slotGroups.length = 0;
    for (let index = 0; index < GROUP_COUNT; index += 1) {
      this.slotGroups.push([]);
    }
  }

  private drawPieces(count: number): TerrainPieceType[] {
    if (this.pieceDeck.length < count) {
      throw new Error(`Terrain piece deck is exhausted. Need ${count}, current ${this.pieceDeck.length}.`);
    }

    return this.pieceDeck.splice(0, count);
  }

  private renderAllSlots() {
    for (let slotIndex = 0; slotIndex < this.slotNodes.length; slotIndex += 1) {
      this.renderSlot(slotIndex);
    }
  }

  private renderSlot(slotIndex: number) {
    const slotNode = this.slotNodes[slotIndex];
    const group = this.slotGroups[slotIndex] ?? [];
    const backgroundSprite = slotNode.getComponent(Sprite);
    const isLockedForTurn = slotIndex === this.activeTurnSlotIndex;
    const isSelected = slotIndex === this.selectedSlotIndex;
    const isInteractive = !this.sharedBattleMode || this.isMyTurn();

    if (backgroundSprite) {
      backgroundSprite.color = isSelected
        ? new Color(255, 220, 170, 255)
        : (isLockedForTurn
          ? new Color(210, 210, 210, 255)
          : (isInteractive ? Color.WHITE : new Color(185, 185, 185, 255)));
    }

    slotNode.setScale(isSelected ? 1.06 : 1, isSelected ? 1.06 : 1, 1);

    for (let iconIndex = 0; iconIndex < PIECES_PER_GROUP; iconIndex += 1) {
      const pieceType = group[iconIndex];
      const layout = SLOT_ICON_LAYOUT[iconIndex];
      const iconNode = this.getOrCreatePieceIcon(
        slotNode,
        SLOT_ICON_NAMES[iconIndex],
        layout.x,
        layout.y,
        layout.size,
      );
      this.applyPieceIconVisual(iconNode, pieceType, layout.size);
    }
  }

  private ensureConfirmedPreviewNode() {
    if (this.confirmedPreviewNode) {
      return;
    }

    this.confirmedPreviewNode = new Node('ConfirmedPiecePreview');
    this.confirmedPreviewNode.layer = this.node.layer;
    this.node.addChild(this.confirmedPreviewNode);
    this.confirmedPreviewNode.setPosition(this.confirmButtonNode!.position.clone());

    const transform = this.confirmedPreviewNode.addComponent(UITransform);
    transform.setContentSize(230, 230);
    this.confirmedPreviewNode.active = false;
  }

  private ensureEnemyChessboardTipNode() {
    if (this.enemyChessboardTipNode) {
      return;
    }

    this.enemyChessboardTipNode = new Node('SwitchEnemyChessboardTip');
    this.enemyChessboardTipNode.layer = this.node.layer;
    this.node.addChild(this.enemyChessboardTipNode);
    this.enemyChessboardTipNode.setPosition(0, 210, 0);

    const transform = this.enemyChessboardTipNode.addComponent(UITransform);
    transform.setContentSize(240, 100);

    const sprite = this.enemyChessboardTipNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    if (this.switchEnemyChessboardTipSpriteFrame) {
      sprite.spriteFrame = this.switchEnemyChessboardTipSpriteFrame;
    }

    this.enemyChessboardTipNode.active = false;
  }

  private renderConfirmedPreview(group: Array<TerrainPieceType | null>, selectedIndex = -1) {
    this.ensureConfirmedPreviewNode();
    this.confirmedPieces = [...group];
    while (this.confirmedPieces.length < PIECES_PER_GROUP) {
      this.confirmedPieces.push(null);
    }
    this.selectedConfirmedPieceIndex = selectedIndex >= 0 ? selectedIndex : -1;

    this.confirmedPreviewNode!.active = true;
    for (let iconIndex = 0; iconIndex < PIECES_PER_GROUP; iconIndex += 1) {
      const pieceType = this.confirmedPieces[iconIndex];
      const layout = CONFIRMED_ICON_LAYOUT[iconIndex];
      const iconNode = this.getOrCreatePieceIcon(
        this.confirmedPreviewNode!,
        `ConfirmedIcon${iconIndex}`,
        layout.x,
        layout.y,
        layout.size,
      );
      iconNode.off(Node.EventType.TOUCH_END, this.onConfirmedPieceTouched, this);
      iconNode.on(Node.EventType.TOUCH_END, this.onConfirmedPieceTouched, this);
      iconNode.setScale(1, 1, 1);

      if (!pieceType) {
        const iconSprite = iconNode.getComponent(Sprite)!;
        iconSprite.spriteFrame = null;
        iconNode.active = false;
        continue;
      }

      iconNode.active = true;
      this.applyPieceIconVisual(iconNode, pieceType, layout.size);
    }

    this.refreshConfirmedPreviewVisuals();
  }

  private getOrCreatePieceIcon(parent: Node, nodeName: string, x: number, y: number, size = 64): Node {
    let iconNode = parent.getChildByName(nodeName);
    if (!iconNode) {
      iconNode = new Node(nodeName);
      iconNode.layer = this.node.layer;
      parent.addChild(iconNode);
      const transform = iconNode.addComponent(UITransform);
      transform.setContentSize(size, size);
      const sprite = iconNode.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    }

    iconNode.setPosition(x, y, 0);
    const transform = iconNode.getComponent(UITransform)!;
    transform.setContentSize(size, size);
    return iconNode;
  }

  private applyPieceIconVisual(iconNode: Node, pieceType: TerrainPieceType, size: number) {
    const iconSprite = iconNode.getComponent(Sprite)!;
    iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    iconSprite.spriteFrame = this.spriteFrames.get(pieceType) ?? null;
    iconSprite.color = Color.WHITE;

    const transform = iconNode.getComponent(UITransform)!;
    transform.setContentSize(size, size);
  }

  private onSlotTouched(event: EventTouch) {
    if (
      !this.isReady
      || this.activeTurnSlotIndex >= 0
      || !this.isMyTurn()
      || this.isRequestInFlight
      || this.viewingOpponentBoard
    ) {
      return;
    }

    const targetNode = event.currentTarget as Node | null;
    if (!targetNode) {
      return;
    }

    const slotIndex = this.slotNodes.findIndex((slotNode) => slotNode === targetNode);
    if (slotIndex < 0) {
      return;
    }

    this.updateSelection(slotIndex);
  }

  private updateSelection(slotIndex: number) {
    this.selectedSlotIndex = slotIndex;
    if (this.confirmButtonNode) {
      this.confirmButtonNode.active = slotIndex >= 0 && this.activeTurnSlotIndex < 0 && this.isMyTurn();
    }

    if (slotIndex >= 0 && this.confirmedPreviewNode) {
      this.confirmedPreviewNode.active = false;
      this.selectedConfirmedPieceIndex = -1;
      this.boardController?.setPendingPiece(null);
    }

    this.renderAllSlots();
    this.refreshEndTurnButtonState();
  }

  private onConfirmSelection() {
    if (!this.isReady || this.selectedSlotIndex < 0 || this.activeTurnSlotIndex >= 0) {
      return;
    }

    if (this.sharedBattleMode) {
      void this.requestSharedSlotSelection(this.selectedSlotIndex);
      return;
    }

    this.confirmLocalSlotSelection(this.selectedSlotIndex);
  }

  private onChoiceAnimalButtonClicked() {
    this.animalCardController?.toggleOverlay();
  }

  private onEndTurnButtonClicked() {
    if (!this.canEndTurn()) {
      return;
    }

    if (this.sharedBattleMode) {
      void this.requestSharedEndTurn();
      return;
    }

    this.completeTurn();
  }

  private onConfirmedPieceTouched(event: EventTouch) {
    if (this.sharedBattleMode && (!this.isMyTurn() || this.viewingOpponentBoard)) {
      return;
    }

    const targetNode = event.currentTarget as Node | null;
    if (!targetNode || !this.confirmedPreviewNode) {
      return;
    }

    const previewIndex = Number.parseInt(targetNode.name.replace('ConfirmedIcon', ''), 10);
    if (Number.isNaN(previewIndex)) {
      return;
    }

    const pieceType = this.confirmedPieces[previewIndex];
    if (!pieceType) {
      return;
    }

    this.selectedConfirmedPieceIndex = previewIndex;
    this.boardController?.setPendingPiece(pieceType, previewIndex);
    this.refreshConfirmedPreviewVisuals();
  }

  private onBoardPiecePlaced(
    previewIndex: number,
    pieceType: TerrainPieceType,
    q: number,
    r: number,
    resultingStack: TerrainPieceType[],
  ) {
    if (previewIndex < 0 || previewIndex >= this.confirmedPieces.length) {
      return;
    }

    this.confirmedPieces[previewIndex] = null;
    this.selectedConfirmedPieceIndex = -1;
    this.boardController?.setPendingPiece(null);
    this.refreshConfirmedPreviewVisuals();
    if (this.confirmedPreviewNode) {
      this.confirmedPreviewNode.active = this.confirmedPieces.some((value) => value !== null);
    }

    console.log(
      `[TerrainDraftController] Placed ${pieceType} at (${q}, ${r}). Result stack: ${resultingStack.join(' -> ')}`,
    );
    this.refreshEndTurnButtonState();
  }

  private refreshConfirmedPreviewVisuals() {
    if (!this.confirmedPreviewNode) {
      return;
    }

    for (let iconIndex = 0; iconIndex < PIECES_PER_GROUP; iconIndex += 1) {
      const iconNode = this.confirmedPreviewNode.getChildByName(`ConfirmedIcon${iconIndex}`);
      if (!iconNode) {
        continue;
      }

      const pieceType = this.confirmedPieces[iconIndex];
      const iconSprite = iconNode.getComponent(Sprite)!;

      if (!pieceType) {
        iconNode.active = false;
        continue;
      }

      iconNode.active = true;
      iconSprite.color = iconIndex === this.selectedConfirmedPieceIndex
        ? new Color(255, 230, 190, 255)
        : Color.WHITE;
      iconNode.setScale(iconIndex === this.selectedConfirmedPieceIndex ? 1.08 : 1, iconIndex === this.selectedConfirmedPieceIndex ? 1.08 : 1, 1);
    }
  }

  private logRemainingPieces(context: string) {
    console.log(`[TerrainDraftController] ${context}. Remaining deck pieces: ${this.pieceDeck.length}`);
  }

  private refreshEndTurnButtonState() {
    if (!this.endTurnButtonNode) {
      return;
    }

    const canEndTurn = this.canEndTurn();
    const buttonSprite = this.endTurnButtonNode.getComponent(Sprite);
    if (buttonSprite) {
      buttonSprite.color = canEndTurn
        ? Color.WHITE
        : new Color(160, 160, 160, 255);
    }
    if (this.endTurnButton) {
      this.endTurnButton.interactable = canEndTurn && !this.isRequestInFlight;
    }

    if (this.choiceAnimalButton) {
      this.choiceAnimalButton.interactable = !this.isRequestInFlight;
    }

    if (this.confirmButton) {
      this.confirmButton.interactable = !!this.confirmButtonNode?.active && !this.isRequestInFlight;
    }
  }

  private canEndTurn(): boolean {
    if (!this.isReady || this.activeTurnSlotIndex < 0 || this.isRequestInFlight) {
      return false;
    }

    if (this.sharedBattleMode && !this.isMyTurn()) {
      return false;
    }

    return !this.hasRemainingConfirmedPieces();
  }

  private hasRemainingConfirmedPieces(): boolean {
    return this.confirmedPieces.some((pieceType) => pieceType !== null);
  }

  private getRandomAvailableSlotIndex(): number {
    const availableSlotIndices: number[] = [];

    for (let slotIndex = 0; slotIndex < this.slotGroups.length; slotIndex += 1) {
      const group = this.slotGroups[slotIndex] ?? [];
      if (group.length > 0) {
        availableSlotIndices.push(slotIndex);
      }
    }

    if (availableSlotIndices.length === 0) {
      return -1;
    }

    const randomIndex = Math.floor(Math.random() * availableSlotIndices.length);
    return availableSlotIndices[randomIndex] ?? -1;
  }

  private buildConfirmedGroupForSlot(slotIndex: number): Array<TerrainPieceType | null> {
    const confirmedGroup = [...(this.slotGroups[slotIndex] ?? [])];
    const paddedGroup: Array<TerrainPieceType | null> = [...confirmedGroup];
    while (paddedGroup.length < PIECES_PER_GROUP) {
      paddedGroup.push(null);
    }
    return paddedGroup;
  }

  private lockLocalTurnSlot(slotIndex: number, options?: { renderPreview?: boolean; refreshUi?: boolean }): boolean {
    if (
      !this.isReady
      || slotIndex < 0
      || slotIndex >= this.slotGroups.length
      || this.activeTurnSlotIndex >= 0
    ) {
      return false;
    }

    const confirmedGroup = this.buildConfirmedGroupForSlot(slotIndex);
    if (!confirmedGroup.some((pieceType) => pieceType !== null)) {
      return false;
    }

    this.activeTurnSlotIndex = slotIndex;
    this.selectedSlotIndex = -1;
    this.selectedConfirmedPieceIndex = -1;
    this.confirmedPieces = confirmedGroup;
    this.logRemainingPieces(`Locked slot ${slotIndex + 1} for current turn`);

    this.boardController?.setPendingPiece(null);
    if (this.confirmButtonNode) {
      this.confirmButtonNode.active = false;
    }

    const renderPreview = options?.renderPreview ?? true;
    if (renderPreview) {
      this.renderConfirmedPreview(confirmedGroup);
    } else if (this.confirmedPreviewNode) {
      this.confirmedPreviewNode.active = false;
    }

    if (options?.refreshUi ?? true) {
      this.renderAllSlots();
      this.refreshEndTurnButtonState();
    }

    return true;
  }

  private confirmLocalSlotSelection(slotIndex: number): boolean {
    return this.lockLocalTurnSlot(slotIndex, {
      renderPreview: true,
      refreshUi: true,
    });
  }

  private getTimeoutSlotIndex(): number {
    const selectedGroup = this.slotGroups[this.selectedSlotIndex] ?? [];
    if (this.selectedSlotIndex >= 0 && selectedGroup.length > 0) {
      return this.selectedSlotIndex;
    }

    return this.getRandomAvailableSlotIndex();
  }

  private resolveLocalTurnTimeout() {
    if (this.activeTurnSlotIndex < 0) {
      const timeoutSlotIndex = this.getTimeoutSlotIndex();
      const selected = timeoutSlotIndex >= 0 && this.lockLocalTurnSlot(timeoutSlotIndex, {
        renderPreview: false,
        refreshUi: false,
      });

      if (!selected) {
        console.warn('[TerrainDraftController] No piece slot available for local timeout auto-selection.');
      }
    }

    this.completeTurn();
  }

  private autoPlaceRemainingConfirmedPieces() {
    if (!this.boardController || !this.hasRemainingConfirmedPieces()) {
      return;
    }

    for (let previewIndex = 0; previewIndex < this.confirmedPieces.length; previewIndex += 1) {
      const pieceType = this.confirmedPieces[previewIndex];
      if (!pieceType) {
        continue;
      }

      const legalPlacements = this.boardController.getLegalPiecePlacements(pieceType);
      if (legalPlacements.length === 0) {
        console.warn(`[TerrainDraftController] No legal placement found for timed-out piece ${pieceType}.`);
        continue;
      }

      const randomPlacement = legalPlacements[Math.floor(Math.random() * legalPlacements.length)];
      const placed = this.boardController.placePieceAt(randomPlacement.q, randomPlacement.r, pieceType, previewIndex);
      if (!placed) {
        console.warn(
          `[TerrainDraftController] Failed to auto-place timed-out piece ${pieceType} at (${randomPlacement.q}, ${randomPlacement.r}).`,
        );
      }
    }
  }

  private completeTurn() {
    this.unschedule(this.tickCountdown);

    if (this.hasRemainingConfirmedPieces()) {
      this.autoPlaceRemainingConfirmedPieces();
    }

    this.animalCardController?.endTurn();
    this.boardController?.setPendingPiece(null);

    if (this.activeTurnSlotIndex >= 0) {
      this.slotGroups[this.activeTurnSlotIndex] = this.drawPieces(PIECES_PER_GROUP);
      this.logRemainingPieces(`Refreshed slot ${this.activeTurnSlotIndex + 1} for next turn`);
    }

    this.activeTurnSlotIndex = -1;
    this.selectedSlotIndex = -1;
    this.selectedConfirmedPieceIndex = -1;
    this.confirmedPieces = [];

    if (this.confirmButtonNode) {
      this.confirmButtonNode.active = false;
    }
    if (this.confirmedPreviewNode) {
      this.confirmedPreviewNode.active = false;
    }

    this.renderAllSlots();
    this.refreshEndTurnButtonState();
    this.startCountdown();
  }

  private clearPendingTurnSelection() {
    this.selectedSlotIndex = -1;
    this.selectedConfirmedPieceIndex = -1;
    this.confirmedPieces = [];
    this.boardController?.setPendingPiece(null);
    if (this.confirmButtonNode) {
      this.confirmButtonNode.active = false;
    }
    if (this.confirmedPreviewNode) {
      this.confirmedPreviewNode.active = false;
    }
  }

  private clearBoardInteractionSelection() {
    this.selectedConfirmedPieceIndex = -1;
    this.boardController?.setPendingPiece(null);
    this.boardController?.hidePiecePlacementOverlay();
    this.boardController?.setPendingAnimalCard(null);
    this.boardController?.hideAnimalPlacementOverlay();
    this.refreshConfirmedPreviewVisuals();
  }

  private isMyTurn(): boolean {
    if (!this.sharedBattleMode) {
      return true;
    }

    return this.sharedPlayerId !== null && this.activeTurnPlayerId === this.sharedPlayerId;
  }

  private refreshCountdownFromSharedDeadline() {
    if (!this.sharedBattleMode) {
      return;
    }

    if (!this.sharedTurnDeadlineMs) {
      this.countdownRemainingSeconds = 0;
      this.refreshCountdownDisplay();
      return;
    }

    this.countdownRemainingSeconds = Math.max(
      0,
      Math.ceil((this.sharedTurnDeadlineMs - Date.now()) / 1000),
    );
    this.refreshCountdownDisplay();
  }

  private refreshDisplayedBoardSnapshot() {
    const snapshot = this.viewingOpponentBoard
      ? (this.latestOpponentBoardSnapshot ?? this.latestMyBoardSnapshot)
      : this.latestMyBoardSnapshot;
    this.boardController?.applyBoardSnapshot(snapshot);
  }

  private refreshPerspectiveVisibility() {
    const showingOpponentBoard = this.sharedBattleMode && this.viewingOpponentBoard;
    const myTurn = this.isMyTurn();
    const hasConfirmedPieces = this.confirmedPieces.some((pieceType) => pieceType !== null);

    if (this.switchChessboardButtonSprite) {
      this.switchChessboardButtonSprite.spriteFrame = showingOpponentBoard
        ? (this.switchOurChessboardBgSpriteFrame ?? this.switchChessboardButtonSprite.spriteFrame)
        : (this.switchEnemyChessboardBgSpriteFrame ?? this.switchChessboardButtonSprite.spriteFrame);
    }

    if (this.choiceAnimalButtonNode) {
      this.choiceAnimalButtonNode.active = !showingOpponentBoard;
    }

    if (this.confirmButtonNode) {
      this.confirmButtonNode.active = !showingOpponentBoard
        && this.activeTurnSlotIndex < 0
        && this.selectedSlotIndex >= 0
        && myTurn;
    }

    if (this.confirmedPreviewNode) {
      this.confirmedPreviewNode.active = !showingOpponentBoard
        && hasConfirmedPieces
        && this.activeTurnSlotIndex >= 0;
    }

    if (this.enemyChessboardTipNode) {
      const sprite = this.enemyChessboardTipNode.getComponent(Sprite);
      if (sprite && this.switchEnemyChessboardTipSpriteFrame) {
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.switchEnemyChessboardTipSpriteFrame;
      }
      this.enemyChessboardTipNode.active = showingOpponentBoard;
    }
  }

  private async handleSharedTurnTimeout() {
    try {
      await this.requestSharedEndTurn();
    } catch (error) {
      console.error('[TerrainDraftController] Failed to resolve shared turn timeout.', error);
    } finally {
      this.isAutoEndingTurn = false;
    }
  }

  private async requestSharedSlotSelection(slotIndex: number) {
    if (!this.remoteSelectSlotHandler || this.isRequestInFlight || !this.isMyTurn()) {
      return;
    }

    this.isRequestInFlight = true;
    this.refreshEndTurnButtonState();

    try {
      const state = await this.remoteSelectSlotHandler(slotIndex);
      this.applySharedMatchState(state);
    } catch (error) {
      console.error('[TerrainDraftController] Failed to select shared terrain slot.', error);
    } finally {
      this.isRequestInFlight = false;
      this.refreshEndTurnButtonState();
    }
  }

  private async requestSharedEndTurn(): Promise<boolean> {
    if (!this.remoteEndTurnHandler || this.isRequestInFlight || !this.isMyTurn()) {
      return false;
    }

    this.isRequestInFlight = true;
    this.refreshEndTurnButtonState();

    try {
      const state = await this.remoteEndTurnHandler();
      this.applySharedMatchState(state);
      return true;
    } catch (error) {
      console.error('[TerrainDraftController] Failed to end shared turn.', error);
      return false;
    } finally {
      this.isRequestInFlight = false;
      this.refreshEndTurnButtonState();
    }
  }

  private async requestSharedPlacePiece(previewIndex: number, q: number, r: number): Promise<boolean> {
    if (!this.remotePlacePieceHandler || this.isRequestInFlight || !this.isMyTurn()) {
      return false;
    }

    this.isRequestInFlight = true;
    this.refreshEndTurnButtonState();

    try {
      const state = await this.remotePlacePieceHandler({
        previewIndex,
        q,
        r,
      });
      this.applySharedMatchState(state);
      return true;
    } catch (error) {
      console.error('[TerrainDraftController] Failed to place shared terrain piece.', error);
      return false;
    } finally {
      this.isRequestInFlight = false;
      this.refreshEndTurnButtonState();
    }
  }

  private async requestSharedRecruitAnimal(slotIndex: number) {
    if (!this.remoteRecruitAnimalHandler || this.isRequestInFlight || !this.isMyTurn()) {
      return;
    }

    this.isRequestInFlight = true;
    this.refreshEndTurnButtonState();

    try {
      const state = await this.remoteRecruitAnimalHandler(slotIndex);
      this.applySharedMatchState(state);
    } catch (error) {
      console.error('[TerrainDraftController] Failed to recruit shared animal card.', error);
    } finally {
      this.isRequestInFlight = false;
      this.refreshEndTurnButtonState();
    }
  }

  private async requestSharedPlaceAnimal(cardId: string, q: number, r: number) {
    if (!this.remotePlaceAnimalHandler || this.isRequestInFlight || !this.isMyTurn()) {
      return;
    }

    this.isRequestInFlight = true;
    this.refreshEndTurnButtonState();

    try {
      const state = await this.remotePlaceAnimalHandler({
        cardId,
        q,
        r,
      });
      this.applySharedMatchState(state);
    } catch (error) {
      console.error('[TerrainDraftController] Failed to place shared animal.', error);
    } finally {
      this.isRequestInFlight = false;
      this.refreshEndTurnButtonState();
    }
  }

  private shuffle<T>(items: T[]) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = items[index];
      items[index] = items[swapIndex];
      items[swapIndex] = current;
    }
  }
}
