import {
  _decorator,
  BlockInputEvents,
  Button,
  Color,
  Component,
  EventTouch,
  Label,
  LabelOutline,
  Node,
  resources,
  Sprite,
  SpriteFrame,
  UITransform,
} from 'cc';
import {
  AnimalCardDefinition,
  AnimalCardRuntimeState,
  isAnimalCardCompleted,
  PROTOTYPE_WHITE_ANIMAL_CARDS,
} from './AnimalCardDefinitions';
import { TerrainBoardController } from './TerrainBoardController';
import type { MatchAnimalStatePayload } from './battle/MatchApi';

const { ccclass } = _decorator;

const OVERLAY_ROOT_NAME = 'AnimalChoiceOverlay';
const OVERLAY_BACKGROUND_NAME = 'AnimalOverlayBackground';
const OVERLAY_TITLE_NAME = 'AnimalOverlayTitle';
const OVERLAY_CLOSE_BUTTON_NAME = 'AnimalOverlayCloseButton';
const OVERLAY_CLOSE_LABEL_NAME = 'AnimalOverlayCloseLabel';
const MARKET_PANEL_NAME = 'AnimalMarketPanel';
const ACTIVE_PANEL_NAME = 'AnimalActivePanel';
const MARKET_HEADER_NAME = 'AnimalMarketHeader';
const ACTIVE_DISPLAY_AREA_NAME = 'AnimalCardDisplayArea';
const MARKET_VISIBLE_CARD_COUNT = 2;
const MAX_ACTIVE_ANIMAL_CARDS = 4;
const MARKET_CARD_WIDTH = 260;
const MARKET_CARD_HEIGHT = 360;
const MARKET_CARD_SPACING_X = 290;
const ACTIVE_CARD_WIDTH = 160;
const ACTIVE_CARD_HEIGHT = 240;
const ACTIVE_CARD_SPACING_X = 170;
const OVERLAY_WIDTH = 720;
const OVERLAY_HEIGHT = 1280;
const SPIRIT_ICON_LAYER_NAME = 'SpiritIconLayer';
const SPIRIT_ICON_PREFIX = 'SpiritIcon_';
const SPIRIT_ICON_RESOURCE_PATH = 'textures/animal_cards/animals_spirit/spriteFrame';

@ccclass('AnimalCardController')
export class AnimalCardController extends Component {
  private readonly runtimeStates = new Map<string, AnimalCardRuntimeState>();
  private readonly cardSpriteFrames = new Map<string, SpriteFrame>();
  private readonly marketDeck: string[] = [];
  private readonly marketCardIds: string[] = [];
  private spiritSpriteFrame: SpriteFrame | null = null;

  private boardController: TerrainBoardController | null = null;
  private overlayRoot: Node | null = null;
  private closeButtonNode: Node | null = null;
  private marketPanel: Node | null = null;
  private activeDisplayArea: Node | null = null;
  private activePanel: Node | null = null;
  private turnActive = false;
  private recruitedAnimalThisTurn = false;
  private selectedCardId: string | null = null;
  private sharedBattleMode = false;
  private isRequestInFlight = false;
  private remoteRecruitHandler: ((slotIndex: number) => Promise<void>) | null = null;
  private sharedMyState: MatchAnimalStatePayload | null = null;
  private sharedOpponentState: MatchAnimalStatePayload | null = null;
  private viewingOpponentState = false;
  private overlayVisibilityListener: ((visible: boolean) => void) | null = null;

  onLoad() {
    this.initializeRuntimeStates();
    this.initializeMarketDeck();
    this.ensureOverlay();
    this.render();
    void this.preloadCardSpriteFrames();
  }

  onDestroy() {
    if (this.boardController) {
      this.boardController.setAnimalPlacementListener(null);
    }

    if (this.closeButtonNode?.isValid) {
      this.closeButtonNode.off(Button.EventType.CLICK, this.onCloseOverlayClicked, this);
    }

    this.overlayVisibilityListener = null;
    this.boardController = null;
  }

  public initialize(boardController: TerrainBoardController) {
    this.boardController = boardController;
    this.boardController.setAnimalPlacementListener((payload) => {
      this.onAnimalPlaced(payload.card, payload.q, payload.r);
    });
    this.render();
  }

  public enableSharedBattleMode(config: {
    onRecruitCardSlot: (slotIndex: number) => Promise<void>;
  }) {
    this.sharedBattleMode = true;
    this.remoteRecruitHandler = config.onRecruitCardSlot;
  }

  public setOverlayVisibilityListener(listener: ((visible: boolean) => void) | null) {
    this.overlayVisibilityListener = listener;
    this.notifyOverlayVisibilityChanged();
  }

  public applySharedStates(
    myState: MatchAnimalStatePayload,
    opponentState: MatchAnimalStatePayload | null,
    viewingOpponentState = false,
  ) {
    this.sharedMyState = this.cloneSharedState(myState);
    this.sharedOpponentState = opponentState ? this.cloneSharedState(opponentState) : null;
    this.viewingOpponentState = viewingOpponentState;
    this.applyDisplayedSharedState();
  }

  public setViewingOpponentState(viewingOpponentState: boolean) {
    if (this.viewingOpponentState === viewingOpponentState) {
      return;
    }

    this.viewingOpponentState = viewingOpponentState;
    this.selectedCardId = null;
    this.boardController?.setPendingAnimalCard(null);
    this.boardController?.hideAnimalPlacementOverlay();
    this.hideOverlay();
    this.applyDisplayedSharedState();
  }

  private applyDisplayedSharedState() {
    const state = this.viewingOpponentState
      ? (this.sharedOpponentState ?? this.createEmptySharedState())
      : (this.sharedMyState ?? this.createEmptySharedState());

    this.applySharedState(state, !this.viewingOpponentState);
  }

  private applySharedState(state: MatchAnimalStatePayload, allowInteraction: boolean) {
    const previouslyRecruitedCardIds = new Set(
      [...this.runtimeStates.values()]
        .filter((runtimeState) => runtimeState.recruited)
        .map((runtimeState) => runtimeState.definition.cardId),
    );

    this.marketCardIds.length = 0;
    this.marketCardIds.push(...state.market_card_ids);
    this.recruitedAnimalThisTurn = allowInteraction ? state.recruited_this_turn : false;

    for (const runtimeState of this.runtimeStates.values()) {
      runtimeState.recruited = false;
      runtimeState.placedAnchors = [];
    }

    for (const runtimeStatePayload of state.runtime_states) {
      const runtimeState = this.runtimeStates.get(runtimeStatePayload.card_id);
      if (!runtimeState) {
        continue;
      }

      runtimeState.recruited = runtimeStatePayload.recruited;
      runtimeState.placedAnchors = runtimeStatePayload.placed_anchors.map((anchor) => ({
        q: anchor.q,
        r: anchor.r,
      }));
    }

    const newlyRecruitedCardId = state.runtime_states.find((runtimeState) => {
      return runtimeState.recruited && !previouslyRecruitedCardIds.has(runtimeState.card_id);
    })?.card_id ?? null;

    if (this.sharedBattleMode && allowInteraction && this.turnActive && newlyRecruitedCardId) {
      this.selectedCardId = newlyRecruitedCardId;
      const selectedRuntimeState = this.runtimeStates.get(newlyRecruitedCardId) ?? null;
      if (selectedRuntimeState) {
        this.boardController?.setPendingAnimalCard(selectedRuntimeState.definition);
        this.boardController?.hideAnimalPlacementOverlay();
      }
      this.hideOverlay();
    }

    if (!allowInteraction) {
      this.selectedCardId = null;
      this.boardController?.setPendingAnimalCard(null);
      this.boardController?.hideAnimalPlacementOverlay();
      this.hideOverlay();
    } else if (this.selectedCardId) {
      const selectedRuntimeState = this.runtimeStates.get(this.selectedCardId) ?? null;
      if (!selectedRuntimeState || !selectedRuntimeState.recruited || isAnimalCardCompleted(selectedRuntimeState)) {
        this.selectedCardId = null;
        this.boardController?.setPendingAnimalCard(null);
        this.boardController?.hideAnimalPlacementOverlay();
      } else if (this.turnActive) {
        this.boardController?.setPendingAnimalCard(selectedRuntimeState.definition);
      }
    }

    this.render();
  }

  private createEmptySharedState(): MatchAnimalStatePayload {
    return {
      market_card_ids: [],
      recruited_this_turn: false,
      runtime_states: [],
    };
  }

  private cloneSharedState(state: MatchAnimalStatePayload): MatchAnimalStatePayload {
    return {
      market_card_ids: [...state.market_card_ids],
      recruited_this_turn: state.recruited_this_turn,
      runtime_states: state.runtime_states.map((runtimeState) => ({
        card_id: runtimeState.card_id,
        recruited: runtimeState.recruited,
        placed_anchors: runtimeState.placed_anchors.map((anchor) => ({
          q: anchor.q,
          r: anchor.r,
        })),
      })),
    };
  }

  public beginTurn() {
    this.turnActive = true;
    this.recruitedAnimalThisTurn = false;
    this.selectedCardId = null;
    this.boardController?.setPendingAnimalCard(null);
    this.boardController?.hideAnimalPlacementOverlay();
    this.hideOverlay();
    this.render();
  }

  public endTurn() {
    this.turnActive = false;
    this.recruitedAnimalThisTurn = false;
    this.selectedCardId = null;
    this.boardController?.setPendingAnimalCard(null);
    this.boardController?.hideAnimalPlacementOverlay();
    this.hideOverlay();
    this.render();
  }

  private initializeRuntimeStates() {
    this.runtimeStates.clear();
    for (const definition of PROTOTYPE_WHITE_ANIMAL_CARDS) {
      this.runtimeStates.set(definition.cardId, {
        definition,
        placedAnchors: [],
        recruited: false,
      });
    }
  }

  private initializeMarketDeck() {
    this.marketDeck.length = 0;
    this.marketCardIds.length = 0;
    this.marketDeck.push(...PROTOTYPE_WHITE_ANIMAL_CARDS.map((definition) => definition.cardId));
    this.shuffle(this.marketDeck);
    this.refillMarketCards();
  }

  private refillMarketCards() {
    while (this.marketCardIds.length < MARKET_VISIBLE_CARD_COUNT && this.marketDeck.length > 0) {
      const nextCardId = this.marketDeck.shift();
      if (nextCardId) {
        this.marketCardIds.push(nextCardId);
      }
    }
  }

  private async preloadCardSpriteFrames() {
    const tasks = PROTOTYPE_WHITE_ANIMAL_CARDS.map(async (definition) => {
      try {
        const spriteFrame = await this.loadSpriteFrame(definition.artResourcePath);
        this.cardSpriteFrames.set(definition.cardId, spriteFrame);
      } catch (error) {
        console.warn(`[AnimalCardController] Failed to load animal card art for ${definition.cardId}.`, error);
      }
    });

    tasks.push((async () => {
      try {
        this.spiritSpriteFrame = await this.loadSpriteFrame(SPIRIT_ICON_RESOURCE_PATH);
      } catch (error) {
        console.warn('[AnimalCardController] Failed to load animal spirit icon.', error);
      }
    })());

    await Promise.all(tasks);
    this.render();
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

  public showOverlay() {
    if (this.sharedBattleMode && this.viewingOpponentState) {
      return;
    }

    this.ensureOverlay();
    if (!this.overlayRoot) {
      return;
    }

    this.overlayRoot.active = true;
    this.overlayRoot.setSiblingIndex(this.node.children.length - 1);
    this.notifyOverlayVisibilityChanged();
    this.render();
  }

  public hideOverlay() {
    if (this.overlayRoot) {
      this.overlayRoot.active = false;
    }
    this.notifyOverlayVisibilityChanged();
  }

  public toggleOverlay() {
    if (this.overlayRoot?.active) {
      this.hideOverlay();
      return;
    }

    this.showOverlay();
  }

  private onCloseOverlayClicked() {
    this.hideOverlay();
  }

  private notifyOverlayVisibilityChanged() {
    this.overlayVisibilityListener?.(this.overlayRoot?.active ?? false);
  }

  private ensureOverlay() {
    this.overlayRoot = this.node.getChildByName(OVERLAY_ROOT_NAME);
    if (!this.overlayRoot) {
      this.overlayRoot = new Node(OVERLAY_ROOT_NAME);
      this.overlayRoot.layer = this.node.layer;
      this.node.addChild(this.overlayRoot);

      const overlayTransform = this.overlayRoot.addComponent(UITransform);
      overlayTransform.setContentSize(OVERLAY_WIDTH, OVERLAY_HEIGHT);
      this.overlayRoot.setPosition(0, 0, 0);
      this.overlayRoot.active = false;
    }

    this.ensureOverlayBackground();
    this.ensureOverlayTitle();
    this.ensureCloseButton();
    this.ensurePanels();
  }

  private ensureOverlayBackground() {
    if (!this.overlayRoot) {
      return;
    }

    let backgroundNode = this.overlayRoot.getChildByName(OVERLAY_BACKGROUND_NAME);
    if (!backgroundNode) {
      backgroundNode = new Node(OVERLAY_BACKGROUND_NAME);
      backgroundNode.layer = this.node.layer;
      this.overlayRoot.addChild(backgroundNode);
    }

    let transform = backgroundNode.getComponent(UITransform);
    if (!transform) {
      transform = backgroundNode.addComponent(UITransform);
    }
    transform.setContentSize(OVERLAY_WIDTH, OVERLAY_HEIGHT);

    // Some mobile GPUs render garbage pixels for a fully transparent Sprite with
    // a null SpriteFrame. Keep this node as a pure input blocker instead.
    const backgroundSprite = backgroundNode.getComponent(Sprite);
    if (backgroundSprite) {
      backgroundSprite.destroy();
    }

    if (!backgroundNode.getComponent(BlockInputEvents)) {
      backgroundNode.addComponent(BlockInputEvents);
    }

    backgroundNode.setPosition(0, 0, 0);
    backgroundNode.setSiblingIndex(0);
  }

  private ensureOverlayTitle() {
    if (!this.overlayRoot) {
      return;
    }

    let titleNode = this.overlayRoot.getChildByName(OVERLAY_TITLE_NAME);
    if (!titleNode) {
      titleNode = new Node(OVERLAY_TITLE_NAME);
      titleNode.layer = this.node.layer;
      this.overlayRoot.addChild(titleNode);

      const transform = titleNode.addComponent(UITransform);
      transform.setContentSize(320, 44);

      const label = titleNode.addComponent(Label);
      label.fontSize = 30;
      label.lineHeight = 36;
      label.color = new Color(255, 244, 220, 255);

      const outline = titleNode.addComponent(LabelOutline);
      outline.width = 3;
      outline.color = new Color(30, 30, 30, 255);
    }

    const label = titleNode.getComponent(Label)!;
    label.string = '动物选牌';
    titleNode.setPosition(0, 520, 0);
  }

  private ensureCloseButton() {
    if (!this.overlayRoot) {
      return;
    }

    this.closeButtonNode = this.overlayRoot.getChildByName(OVERLAY_CLOSE_BUTTON_NAME);
    if (!this.closeButtonNode) {
      this.closeButtonNode = new Node(OVERLAY_CLOSE_BUTTON_NAME);
      this.closeButtonNode.layer = this.node.layer;
      this.overlayRoot.addChild(this.closeButtonNode);

      const transform = this.closeButtonNode.addComponent(UITransform);
      transform.setContentSize(120, 54);

      const sprite = this.closeButtonNode.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.color = new Color(80, 80, 80, 220);

      this.closeButtonNode.addComponent(Button);

      const labelNode = new Node(OVERLAY_CLOSE_LABEL_NAME);
      labelNode.layer = this.node.layer;
      this.closeButtonNode.addChild(labelNode);

      const labelTransform = labelNode.addComponent(UITransform);
      labelTransform.setContentSize(120, 54);

      const label = labelNode.addComponent(Label);
      label.string = '关闭';
      label.fontSize = 28;
      label.lineHeight = 34;
      label.color = new Color(255, 255, 255, 255);

      const outline = labelNode.addComponent(LabelOutline);
      outline.width = 3;
      outline.color = new Color(30, 30, 30, 255);

      this.closeButtonNode.on(Button.EventType.CLICK, this.onCloseOverlayClicked, this);
    }

    this.closeButtonNode.setPosition(255, 520, 0);
  }

  private ensurePanels() {
    if (!this.overlayRoot) {
      return;
    }

    this.marketPanel = this.overlayRoot.getChildByName(MARKET_PANEL_NAME);
    if (!this.marketPanel) {
      this.marketPanel = new Node(MARKET_PANEL_NAME);
      this.marketPanel.layer = this.node.layer;
      this.overlayRoot.addChild(this.marketPanel);
    }
    this.marketPanel.setPosition(0, 235, 0);

    this.activeDisplayArea = this.node.getChildByName(ACTIVE_DISPLAY_AREA_NAME);
    if (!this.activeDisplayArea) {
      this.activeDisplayArea = new Node(ACTIVE_DISPLAY_AREA_NAME);
      this.activeDisplayArea.layer = this.node.layer;
      this.node.addChild(this.activeDisplayArea);
      const displayAreaTransform = this.activeDisplayArea.addComponent(UITransform);
      displayAreaTransform.setContentSize(720, 340);
      this.activeDisplayArea.setPosition(0, -470, 0);
    }

    this.activePanel = this.activeDisplayArea.getChildByName(ACTIVE_PANEL_NAME);
    if (!this.activePanel) {
      this.activePanel = new Node(ACTIVE_PANEL_NAME);
      this.activePanel.layer = this.node.layer;
      this.activeDisplayArea.addChild(this.activePanel);
    }
    this.activePanel.setPosition(0, 0, 0);

    this.ensureHeader(this.marketPanel, MARKET_HEADER_NAME, '动物候选', 220);
  }

  private ensureHeader(parent: Node, nodeName: string, text: string, y: number) {
    let headerNode = parent.getChildByName(nodeName);
    if (!headerNode) {
      headerNode = new Node(nodeName);
      headerNode.layer = this.node.layer;
      parent.addChild(headerNode);
      const transform = headerNode.addComponent(UITransform);
      transform.setContentSize(320, 36);
      const label = headerNode.addComponent(Label);
      label.fontSize = 26;
      label.lineHeight = 30;
      label.color = new Color(255, 244, 220, 255);
      const outline = headerNode.addComponent(LabelOutline);
      outline.width = 3;
      outline.color = new Color(30, 30, 30, 255);
    }

    const label = headerNode.getComponent(Label)!;
    label.string = text;
    headerNode.setPosition(0, y, 0);
  }

  private render() {
    if (!this.marketPanel || !this.activePanel) {
      return;
    }

    this.renderMarketCards();
    this.renderActiveCards();
  }

  private renderMarketCards() {
    for (let index = 0; index < MARKET_VISIBLE_CARD_COUNT; index += 1) {
      const cardNode = this.getOrCreateCardNode(
        this.marketPanel!,
        `MarketSlot_${index}`,
        MARKET_CARD_WIDTH,
        MARKET_CARD_HEIGHT,
      );
      cardNode.off(Node.EventType.TOUCH_END, this.onMarketCardTouched, this);
      cardNode.setPosition(this.getHorizontalSlotX(index, MARKET_VISIBLE_CARD_COUNT, MARKET_CARD_SPACING_X), 0, 0);

      const cardId = this.marketCardIds[index] ?? null;
      if (!cardId) {
        this.applyEmptyCardVisual(cardNode);
        continue;
      }

      const runtimeState = this.runtimeStates.get(cardId)!;
      const activeCount = this.getActiveRuntimeStates().length;
      const viewOnly = this.sharedBattleMode && this.viewingOpponentState;
      const canRecruit = this.turnActive
        && !viewOnly
        && !this.recruitedAnimalThisTurn
        && !runtimeState.recruited
        && activeCount < MAX_ACTIVE_ANIMAL_CARDS;

      this.applyCardVisual(
        cardNode,
        runtimeState.definition,
        canRecruit ? Color.WHITE : new Color(180, 180, 180, 255),
        null,
      );
      if (canRecruit) {
        cardNode.on(Node.EventType.TOUCH_END, this.onMarketCardTouched, this);
      }
    }
  }

  private renderActiveCards() {
    const activeStates = this.getActiveRuntimeStates();

    for (let index = 0; index < MAX_ACTIVE_ANIMAL_CARDS; index += 1) {
      const cardNode = this.getOrCreateCardNode(
        this.activePanel!,
        `Active_${index}`,
        ACTIVE_CARD_WIDTH,
        ACTIVE_CARD_HEIGHT,
      );
      cardNode.off(Node.EventType.TOUCH_END, this.onActiveCardTouched, this);
      cardNode.setPosition(this.getHorizontalSlotX(index, MAX_ACTIVE_ANIMAL_CARDS, ACTIVE_CARD_SPACING_X), 0, 0);

      const runtimeState = activeStates[index] ?? null;

      if (!runtimeState) {
        this.applyEmptyCardVisual(cardNode);
        continue;
      }

      const isCompleted = isAnimalCardCompleted(runtimeState);
      const viewOnly = this.sharedBattleMode && this.viewingOpponentState;
      const isSelected = !viewOnly && this.selectedCardId === runtimeState.definition.cardId;
      const canSelect = !viewOnly && this.turnActive && !isCompleted;
      const displayColor = isCompleted
        ? new Color(185, 255, 185, 255)
        : ((viewOnly || isSelected || canSelect) ? Color.WHITE : new Color(180, 180, 180, 255));

      this.applyCardVisual(
        cardNode,
        runtimeState.definition,
        displayColor,
        runtimeState,
      );

      if (canSelect) {
        cardNode.on(Node.EventType.TOUCH_END, this.onActiveCardTouched, this);
      }
    }
  }

  private getOrCreateCardNode(parent: Node, nodeName: string, width: number, height: number): Node {
    let cardNode = parent.getChildByName(nodeName);
    if (!cardNode) {
      cardNode = new Node(nodeName);
      cardNode.layer = this.node.layer;
      parent.addChild(cardNode);

      const transform = cardNode.addComponent(UITransform);
      transform.setContentSize(width, height);

      const sprite = cardNode.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.color = new Color(90, 90, 90, 255);
    }

    const transform = cardNode.getComponent(UITransform)!;
    transform.setContentSize(width, height);

    return cardNode;
  }

  private applyCardVisual(
    cardNode: Node,
    definition: AnimalCardDefinition,
    cardColor: Color,
    runtimeState: AnimalCardRuntimeState | null,
  ) {
    const sprite = cardNode.getComponent(Sprite)!;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = this.cardSpriteFrames.get(definition.cardId) ?? null;
    sprite.color = cardColor;
    cardNode.active = true;
    this.updateSpiritIcons(cardNode, runtimeState);
  }

  private applyEmptyCardVisual(cardNode: Node) {
    const sprite = cardNode.getComponent(Sprite)!;
    sprite.spriteFrame = null;
    sprite.color = new Color(95, 95, 95, 255);
    cardNode.active = true;
    this.updateSpiritIcons(cardNode, null);
  }

  private updateSpiritIcons(cardNode: Node, runtimeState: AnimalCardRuntimeState | null) {
    const iconLayer = this.getOrCreateSpiritIconLayer(cardNode);
    if (!runtimeState || !runtimeState.recruited) {
      iconLayer.active = false;
      return;
    }

    iconLayer.active = true;
    const transform = cardNode.getComponent(UITransform)!;
    const width = transform.width;
    const height = transform.height;
    const iconSize = Math.round(Math.min(width, height) * 0.12);
    const iconX = width * 0.4;
    const topY = height * 0.42;
    const spacingY = height * 0.17;
    const spiritIconCount = Math.max(0, runtimeState.definition.spiritIconCount);
    const remainingSpiritCount = Math.max(0, spiritIconCount - runtimeState.placedAnchors.length);

    for (let index = 0; index < spiritIconCount; index += 1) {
      const iconNode = this.getOrCreateSpiritIconNode(iconLayer, index);
      const iconTransform = iconNode.getComponent(UITransform)!;
      const iconSprite = iconNode.getComponent(Sprite)!;
      iconTransform.setContentSize(iconSize, iconSize);
      iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
      iconSprite.spriteFrame = this.spiritSpriteFrame;
      iconSprite.color = Color.WHITE;
      iconNode.setPosition(iconX, topY - spacingY * index, 0);
      iconNode.active = index < remainingSpiritCount;
    }

    for (let index = spiritIconCount; ; index += 1) {
      const extraNode = iconLayer.getChildByName(`${SPIRIT_ICON_PREFIX}${index}`);
      if (!extraNode) {
        break;
      }
      extraNode.active = false;
    }
  }

  private getOrCreateSpiritIconLayer(cardNode: Node): Node {
    let iconLayer = cardNode.getChildByName(SPIRIT_ICON_LAYER_NAME);
    if (!iconLayer) {
      iconLayer = new Node(SPIRIT_ICON_LAYER_NAME);
      iconLayer.layer = this.node.layer;
      cardNode.addChild(iconLayer);
      const transform = iconLayer.addComponent(UITransform);
      const cardTransform = cardNode.getComponent(UITransform)!;
      transform.setContentSize(cardTransform.width, cardTransform.height);
      iconLayer.setPosition(0, 0, 0);
    }

    const transform = iconLayer.getComponent(UITransform)!;
    const cardTransform = cardNode.getComponent(UITransform)!;
    transform.setContentSize(cardTransform.width, cardTransform.height);
    return iconLayer;
  }

  private getOrCreateSpiritIconNode(parent: Node, index: number): Node {
    const nodeName = `${SPIRIT_ICON_PREFIX}${index}`;
    let iconNode = parent.getChildByName(nodeName);
    if (!iconNode) {
      iconNode = new Node(nodeName);
      iconNode.layer = this.node.layer;
      parent.addChild(iconNode);
      iconNode.addComponent(UITransform);
      iconNode.addComponent(Sprite);
    }

    return iconNode;
  }

  private getHorizontalSlotX(index: number, slotCount: number, spacingX: number): number {
    return (index - (slotCount - 1) * 0.5) * spacingX;
  }

  private async onMarketCardTouched(event: EventTouch) {
    if (!this.turnActive || (this.sharedBattleMode && this.viewingOpponentState)) {
      return;
    }

    const targetNode = event.currentTarget as Node | null;
    if (!targetNode) {
      return;
    }

    const slotIndex = Number.parseInt(targetNode.name.replace('MarketSlot_', ''), 10);
    if (Number.isNaN(slotIndex)) {
      return;
    }

    const cardId = this.marketCardIds[slotIndex] ?? null;
    const runtimeState = cardId ? this.runtimeStates.get(cardId) ?? null : null;
    if (!runtimeState || runtimeState.recruited) {
      return;
    }

    if (this.sharedBattleMode) {
      if (!this.remoteRecruitHandler || this.isRequestInFlight) {
        return;
      }

      this.isRequestInFlight = true;
      try {
        await this.remoteRecruitHandler(slotIndex);
      } catch (error) {
        console.error('[AnimalCardController] Failed to recruit shared animal card.', error);
      } finally {
        this.isRequestInFlight = false;
      }
      return;
    }

    if (this.getActiveRuntimeStates().length >= MAX_ACTIVE_ANIMAL_CARDS) {
      return;
    }

    if (this.recruitedAnimalThisTurn) {
      return;
    }

    runtimeState.recruited = true;
    this.recruitedAnimalThisTurn = true;
    this.selectedCardId = runtimeState.definition.cardId;
    this.boardController?.setPendingAnimalCard(runtimeState.definition);
    this.boardController?.hideAnimalPlacementOverlay();
    this.marketCardIds.splice(slotIndex, 1);
    this.refillMarketCards();
    this.render();
    this.hideOverlay();
  }

  private onActiveCardTouched(event: EventTouch) {
    if (!this.turnActive || (this.sharedBattleMode && this.viewingOpponentState)) {
      return;
    }

    const targetNode = event.currentTarget as Node | null;
    if (!targetNode) {
      return;
    }

    const index = Number.parseInt(targetNode.name.replace('Active_', ''), 10);
    if (Number.isNaN(index)) {
      return;
    }

    const runtimeState = this.getActiveRuntimeStates()[index];
    if (!runtimeState || isAnimalCardCompleted(runtimeState)) {
      return;
    }

    const wasSelected = this.selectedCardId === runtimeState.definition.cardId;
    this.selectedCardId = runtimeState.definition.cardId;
    this.boardController?.setPendingAnimalCard(runtimeState.definition);
    if (wasSelected) {
      this.boardController?.showAnimalPlacementOverlay();
    } else {
      this.boardController?.hideAnimalPlacementOverlay();
    }
    this.render();
    this.hideOverlay();
  }

  private onAnimalPlaced(card: AnimalCardDefinition, q: number, r: number) {
    const runtimeState = this.runtimeStates.get(card.cardId);
    if (!runtimeState) {
      return;
    }

    runtimeState.placedAnchors.push({ q, r });
    const isCompleted = isAnimalCardCompleted(runtimeState);
    this.selectedCardId = isCompleted ? null : runtimeState.definition.cardId;
    if (this.turnActive && !isCompleted && this.selectedCardId === runtimeState.definition.cardId) {
      this.boardController?.setPendingAnimalCard(runtimeState.definition);
    } else {
      this.boardController?.setPendingAnimalCard(null);
    }
    this.hideOverlay();
    console.log(
      `[AnimalCardController] Placed animal ${card.cardId} at (${q}, ${r}). Progress ${runtimeState.placedAnchors.length}/${card.cubeSlots}`,
    );
    this.render();
  }

  private getActiveRuntimeStates(): AnimalCardRuntimeState[] {
    return [...this.runtimeStates.values()].filter((runtimeState) => runtimeState.recruited);
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
