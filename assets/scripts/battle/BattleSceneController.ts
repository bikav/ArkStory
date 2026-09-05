import { _decorator, assetManager, AssetManager, Button, Color, Component, director, EventTouch, Label, Node, Sprite, SpriteFrame, UITransform, sys } from 'cc';
import { AuthSession } from '../auth/AuthSession';
import { TerrainDraftController } from '../TerrainDraftController';
import { BattleSession } from './BattleSession';
import { MatchApi, MatchStateEnvelopePayload, MatchSummaryPayload } from './MatchApi';

const { ccclass } = _decorator;
const SETTLEMENT_BG_PATH = 'textures/settlement_bg';
const SETTLEMENT_SUCCESS_BG_PATH = 'textures/success_bg';
const SETTLEMENT_FAILURE_BG_PATH = 'textures/failure_bg';
const SETTLEMENT_TIE_BG_PATH = 'textures/tie_bg';
const SETTLEMENT_RETURN_BUTTON_BG_PATH = 'textures/return_home_button_bg';
const DEFAULT_AVATAR_TYPE = 'builtin';
const DEFAULT_AVATAR_VALUE = 'default_mine_avatar';
const SETTLEMENT_BG_UUID = '72dd6018-0af6-473f-8da5-3eff49a746cd@f9941';
const SETTLEMENT_SUCCESS_BG_UUID = 'c83ce65e-008b-4db8-ba68-51aae50594ea@f9941';
const SETTLEMENT_FAILURE_BG_UUID = '90b19c56-c05a-4dbb-8732-cbac5f42bfc8@f9941';
const SETTLEMENT_TIE_BG_UUID = '789044c6-b1fd-458b-9d4d-46c2ea3012ea@f9941';
const SETTLEMENT_RETURN_BUTTON_BG_UUID = '50c91fef-4915-4ee8-8d70-f184adc03abe@f9941';
const DEFAULT_AVATAR_SPRITE_FRAME_UUID = '6ce94a50-35ee-4b2c-bdba-1b53e34bb414@f9941';

@ccclass('BattleSceneController')
export class BattleSceneController extends Component {
  private readonly matchApi = new MatchApi();

  private terrainDraftController: TerrainDraftController | null = null;
  private matchId: number | null = null;
  private playerId: number | null = null;
  private switchChessboardButtonNode: Node | null = null;
  private switchChessboardButton: Button | null = null;
  private switchChessboardButtonLabel: Label | null = null;
  private isPolling = false;
  private leaveSubmitted = false;
  private lastKnownStateVersion = 0;
  private settlementBgNode: Node | null = null;
  private settlementResultSprite: Sprite | null = null;
  private settlementAvatarSprite: Sprite | null = null;
  private settlementNicknameLabel: Label | null = null;
  private settlementTerrainScoreLabel: Label | null = null;
  private settlementAnimalScoreLabel: Label | null = null;
  private settlementReturnButtonNode: Node | null = null;
  private settlementBackgroundSpriteFrame: SpriteFrame | null = null;
  private settlementSuccessSpriteFrame: SpriteFrame | null = null;
  private settlementFailureSpriteFrame: SpriteFrame | null = null;
  private settlementTieSpriteFrame: SpriteFrame | null = null;
  private settlementReturnButtonSpriteFrame: SpriteFrame | null = null;
  private settlementDefaultAvatarSpriteFrame: SpriteFrame | null = null;
  private resourcesBundlePromise: Promise<AssetManager.Bundle> | null = null;
  private readonly handlePageHide = () => {
    void this.leaveCurrentMatch('page_hide', true);
  };
  private readonly handleBeforeUnload = () => {
    void this.leaveCurrentMatch('before_unload', true);
  };

  onLoad() {
    this.terrainDraftController = this.getComponent(TerrainDraftController);

    const authSession = AuthSession.load();
    const battleSession = BattleSession.load();
    if (!authSession || !battleSession) {
      director.loadScene('HomeScene');
      return;
    }

    this.matchId = battleSession.match_id;
    this.playerId = authSession.player_id;
    this.terrainDraftController?.enableSharedBattleMode({
      playerId: authSession.player_id,
      onSelectSlot: async (slotIndex) => this.matchApi.selectMatchSlot(this.matchId!, slotIndex),
      onPlacePiece: async ({ previewIndex, q, r }) => {
        return this.matchApi.placeTerrainPiece(this.matchId!, previewIndex, q, r);
      },
      onRecruitAnimal: async (slotIndex) => this.matchApi.recruitAnimal(this.matchId!, slotIndex),
      onPlaceAnimal: async ({ cardId, q, r }) => {
        return this.matchApi.placeAnimal(this.matchId!, cardId, q, r);
      },
      onEndTurn: async () => this.matchApi.endTurn(this.matchId!),
    });
    this.bindSwitchChessboardButton();
    this.refreshSwitchChessboardButton();

    if (sys.isBrowser) {
      globalThis.addEventListener('pagehide', this.handlePageHide);
      globalThis.addEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  start() {
    if (!this.matchId || !this.playerId || !this.terrainDraftController) {
      return;
    }

    void this.loadInitialState();
  }

  onDestroy() {
    this.unschedule(this.pollMatchState);
    if (sys.isBrowser) {
      globalThis.removeEventListener('pagehide', this.handlePageHide);
      globalThis.removeEventListener('beforeunload', this.handleBeforeUnload);
    }
    if (this.switchChessboardButtonNode?.isValid) {
      this.switchChessboardButtonNode.off(Button.EventType.CLICK, this.onSwitchChessboardButtonClicked, this);
      this.switchChessboardButtonNode.off(Node.EventType.TOUCH_END, this.onSwitchChessboardButtonClicked, this);
    }
    if (this.settlementReturnButtonNode?.isValid) {
      this.settlementReturnButtonNode.off(Button.EventType.CLICK, this.onReturnHomeButtonClicked, this);
      this.settlementReturnButtonNode.off(Node.EventType.TOUCH_END, this.onReturnHomeButtonTouched, this);
    }
    void this.leaveCurrentMatch('scene_destroy');
  }

  private async loadInitialState() {
    try {
      const stateEnvelope = await this.matchApi.getMatchState(this.matchId!);
      this.applyMatchStateEnvelope(stateEnvelope);
      this.schedule(this.pollMatchState, 1);
    } catch (error) {
      console.error('[BattleSceneController] Failed to load initial match state.', error);
      BattleSession.clear();
      director.loadScene('HomeScene');
    }
  }

  private pollMatchState = async () => {
    if (this.isPolling || !this.matchId) {
      return;
    }

    this.isPolling = true;

    try {
      const stateEnvelope = await this.matchApi.getMatchState(this.matchId, this.lastKnownStateVersion);
      this.applyMatchStateEnvelope(stateEnvelope);
    } catch (error) {
      console.error('[BattleSceneController] Failed to poll match state.', error);
      if (error instanceof Error && /未找到对应对局|读取对局状态失败|登录态已失效/.test(error.message)) {
        BattleSession.clear();
        director.loadScene('HomeScene');
      }
    } finally {
      this.isPolling = false;
    }
  };

  private applyMatchStateEnvelope(stateEnvelope: MatchStateEnvelopePayload) {
    this.lastKnownStateVersion = stateEnvelope.state_version;
    if (stateEnvelope.unchanged || !stateEnvelope.match) {
      return;
    }

    this.applyMatchState(stateEnvelope.match);
  }

  private applyMatchState(state: MatchSummaryPayload) {
    this.lastKnownStateVersion = state.state_version;
    BattleSession.save(state);
    this.terrainDraftController?.applySharedMatchState(state);
    this.refreshSwitchChessboardButton();
    void this.refreshSettlement(state);
  }

  private async leaveCurrentMatch(reason: string, keepalive = false) {
    if (this.leaveSubmitted || !this.matchId) {
      return;
    }

    this.leaveSubmitted = true;

    try {
      await this.matchApi.leaveMatch(this.matchId, reason, keepalive);
    } catch (error) {
      console.warn('[BattleSceneController] Failed to leave current match.', error);
    } finally {
      BattleSession.clear();
    }
  }

  private bindSwitchChessboardButton() {
    this.switchChessboardButtonNode = this.findNodeByName(this.node, 'SwitchChessboardButton');
    this.switchChessboardButton = this.switchChessboardButtonNode?.getComponent(Button) ?? null;
    this.switchChessboardButtonLabel = this.findLabelInNode(this.switchChessboardButtonNode);

    if (this.switchChessboardButtonNode?.isValid) {
      this.switchChessboardButtonNode.off(Button.EventType.CLICK, this.onSwitchChessboardButtonClicked, this);
      this.switchChessboardButtonNode.off(Node.EventType.TOUCH_END, this.onSwitchChessboardButtonClicked, this);

      if (this.switchChessboardButton) {
        this.switchChessboardButtonNode.on(Button.EventType.CLICK, this.onSwitchChessboardButtonClicked, this);
      } else {
        // BattleScene.scene currently uses a Sprite node without a Button component for this control.
        this.switchChessboardButtonNode.on(Node.EventType.TOUCH_END, this.onSwitchChessboardButtonClicked, this);
      }
    }
  }

  private onSwitchChessboardButtonClicked() {
    const isShowingOpponentBoard = this.terrainDraftController?.toggleBoardPerspective() ?? false;
    this.refreshSwitchChessboardButton(isShowingOpponentBoard);
  }

  private refreshSwitchChessboardButton(isShowingOpponentBoard?: boolean) {
    const canToggle = this.terrainDraftController?.canToggleBoardPerspective() ?? false;
    const showingOpponentBoard = isShowingOpponentBoard
      ?? (this.terrainDraftController?.isShowingOpponentBoard() ?? false);
    const settlementVisible = this.settlementBgNode?.active ?? false;

    if (this.switchChessboardButton) {
      this.switchChessboardButton.interactable = canToggle && !settlementVisible;
    }

    if (this.switchChessboardButtonNode) {
      this.switchChessboardButtonNode.active = canToggle && !settlementVisible;
    }

    if (this.switchChessboardButtonLabel) {
      this.switchChessboardButtonLabel.string = showingOpponentBoard ? '查看自己棋盘' : '查看对手棋盘';
    }
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

  private findLabelInNode(root: Node | null): Label | null {
    if (!root) {
      return null;
    }

    const label = root.getComponent(Label);
    if (label) {
      return label;
    }

    for (const child of root.children) {
      const result = this.findLabelInNode(child);
      if (result) {
        return result;
      }
    }

    return null;
  }

  private async refreshSettlement(state: MatchSummaryPayload) {
    if (state.room_status !== 3) {
      this.terrainDraftController?.setBoardHiddenForSettlement(false);
      if (this.settlementBgNode) {
        this.settlementBgNode.active = false;
      }
      this.refreshSwitchChessboardButton();
      return;
    }

    try {
      await this.ensureSettlementUi();
    } catch (error) {
      console.error('[BattleSceneController] Failed to prepare settlement UI.', error);
    }

    this.applySettlementState(state);
  }

  private async ensureSettlementUi() {
    if (!this.settlementBgNode) {
      this.createSettlementUi();
    }

    if (!this.settlementBackgroundSpriteFrame) {
      this.settlementBackgroundSpriteFrame = await this.loadSettlementSpriteFrame(SETTLEMENT_BG_PATH, SETTLEMENT_BG_UUID);
    }
    if (!this.settlementSuccessSpriteFrame) {
      this.settlementSuccessSpriteFrame = await this.loadSettlementSpriteFrame(SETTLEMENT_SUCCESS_BG_PATH, SETTLEMENT_SUCCESS_BG_UUID);
    }
    if (!this.settlementFailureSpriteFrame) {
      this.settlementFailureSpriteFrame = await this.loadSettlementSpriteFrame(SETTLEMENT_FAILURE_BG_PATH, SETTLEMENT_FAILURE_BG_UUID);
    }
    if (!this.settlementTieSpriteFrame) {
      this.settlementTieSpriteFrame = await this.loadSettlementSpriteFrame(SETTLEMENT_TIE_BG_PATH, SETTLEMENT_TIE_BG_UUID);
    }
    if (!this.settlementReturnButtonSpriteFrame) {
      this.settlementReturnButtonSpriteFrame = await this.loadSettlementSpriteFrame(
        SETTLEMENT_RETURN_BUTTON_BG_PATH,
        SETTLEMENT_RETURN_BUTTON_BG_UUID,
      );
    }
    if (!this.settlementDefaultAvatarSpriteFrame) {
      try {
        this.settlementDefaultAvatarSpriteFrame = await this.loadSpriteFrameByUuid(DEFAULT_AVATAR_SPRITE_FRAME_UUID);
      } catch (error) {
        console.warn('[BattleSceneController] Failed to load default settlement avatar sprite frame.', error);
      }
    }

    if (this.settlementReturnButtonNode) {
      const sprite = this.settlementReturnButtonNode.getComponent(Sprite);
      if (sprite && this.settlementReturnButtonSpriteFrame) {
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.settlementReturnButtonSpriteFrame;
        sprite.color = Color.WHITE;
      } else if (sprite) {
        sprite.color = new Color(64, 64, 64, 255);
      }
    }

    if (this.settlementBgNode) {
      const sprite = this.settlementBgNode.getComponent(Sprite);
      if (sprite && this.settlementBackgroundSpriteFrame) {
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = this.settlementBackgroundSpriteFrame;
        sprite.color = Color.WHITE;
      }
    }
  }

  private createSettlementUi() {
    const rootNode = new Node('SettlementBG');
    rootNode.layer = this.node.layer;
    this.node.addChild(rootNode);
    rootNode.setPosition(0, 0, 0);
    const rootTransform = rootNode.addComponent(UITransform);
    rootTransform.setContentSize(720, 1280);

    const backgroundSprite = rootNode.addComponent(Sprite);
    backgroundSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    backgroundSprite.color = new Color(0, 0, 0, 220);

    const resultNode = new Node('SettlementResultBG');
    resultNode.layer = this.node.layer;
    rootNode.addChild(resultNode);
    resultNode.setPosition(0, 420, 0);
    const resultTransform = resultNode.addComponent(UITransform);
    resultTransform.setContentSize(385, 180);
    const resultSprite = resultNode.addComponent(Sprite);
    resultSprite.sizeMode = Sprite.SizeMode.CUSTOM;

    const avatarNode = new Node('AvatarSprite');
    avatarNode.layer = this.node.layer;
    rootNode.addChild(avatarNode);
    avatarNode.setPosition(0, 180, 0);
    const avatarTransform = avatarNode.addComponent(UITransform);
    avatarTransform.setContentSize(160, 160);
    const avatarSprite = avatarNode.addComponent(Sprite);
    avatarSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    avatarSprite.color = Color.WHITE;

    const nicknameLabel = this.createSettlementLabel(rootNode, 'NicknameLabel', '默认玩家', 0, 25, 40, true);
    const terrainScoreLabel = this.createSettlementLabel(rootNode, 'TerrainScoreLabel', '地形得分 0', -150, -155, 34);
    const animalScoreLabel = this.createSettlementLabel(rootNode, 'AnimalScoreLabel', '动物得分 0', 150, -155, 34);

    const returnButtonNode = new Node('ReturnHomeButton');
    returnButtonNode.layer = this.node.layer;
    rootNode.addChild(returnButtonNode);
    returnButtonNode.setPosition(0, -420, 0);
    const returnButtonTransform = returnButtonNode.addComponent(UITransform);
    returnButtonTransform.setContentSize(320, 110);
    const returnButtonSprite = returnButtonNode.addComponent(Sprite);
    returnButtonSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    returnButtonSprite.color = new Color(64, 64, 64, 255);
    const returnButton = returnButtonNode.addComponent(Button);
    returnButton.transition = Button.Transition.NONE;
    returnButtonNode.on(Button.EventType.CLICK, this.onReturnHomeButtonClicked, this);
    returnButtonNode.on(Node.EventType.TOUCH_END, this.onReturnHomeButtonTouched, this);

    rootNode.active = false;
    this.settlementBgNode = rootNode;
    this.settlementResultSprite = resultSprite;
    this.settlementAvatarSprite = avatarSprite;
    this.settlementNicknameLabel = nicknameLabel;
    this.settlementTerrainScoreLabel = terrainScoreLabel;
    this.settlementAnimalScoreLabel = animalScoreLabel;
    this.settlementReturnButtonNode = returnButtonNode;
  }

  private createSettlementLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    centered = false,
  ): Label {
    const labelNode = new Node(name);
    labelNode.layer = this.node.layer;
    parent.addChild(labelNode);
    labelNode.setPosition(x, y, 0);
    const transform = labelNode.addComponent(UITransform);
    transform.setContentSize(280, 80);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 6;
    label.color = Color.WHITE;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    return label;
  }

  private applySettlementState(state: MatchSummaryPayload) {
    if (!this.settlementBgNode || !this.settlementResultSprite) {
      return;
    }

    this.terrainDraftController?.hideAnimalSelectionOverlay();
    this.settlementBgNode.setSiblingIndex(this.node.children.length - 1);

    this.settlementResultSprite.spriteFrame = state.my_result_type === 'win'
      ? (this.settlementSuccessSpriteFrame ?? null)
      : (state.my_result_type === 'draw'
        ? (this.settlementTieSpriteFrame ?? null)
        : (this.settlementFailureSpriteFrame ?? null));
    this.settlementResultSprite.color = this.settlementResultSprite.spriteFrame
      ? Color.WHITE
      : new Color(0, 0, 0, 220);

    const authSession = AuthSession.load();
    const nickname = authSession?.display_name?.trim()
      || authSession?.account?.trim()
      || '默认玩家';
    const avatarType = state.my_avatar_type?.trim()
      || authSession?.avatar_type?.trim()
      || DEFAULT_AVATAR_TYPE;
    const avatarValue = state.my_avatar_value?.trim()
      || authSession?.avatar_value?.trim()
      || DEFAULT_AVATAR_VALUE;

    if (this.settlementAvatarSprite) {
      this.settlementAvatarSprite.spriteFrame = this.resolveSettlementAvatarSpriteFrame(avatarType, avatarValue);
    }
    if (this.settlementNicknameLabel) {
      this.settlementNicknameLabel.string = nickname;
    }
    if (this.settlementTerrainScoreLabel) {
      this.settlementTerrainScoreLabel.string = `地形得分\n${state.my_terrain_score}`;
    }
    if (this.settlementAnimalScoreLabel) {
      this.settlementAnimalScoreLabel.string = `动物得分\n${state.my_score}`;
    }

    this.terrainDraftController?.setBoardHiddenForSettlement(true);
    this.settlementBgNode.active = true;
    this.refreshSwitchChessboardButton();
  }

  private async onReturnHomeButtonClicked() {
    BattleSession.clear();
    void this.leaveCurrentMatch('match_finished_return_home', true);
    director.loadScene('HomeScene');
  }

  private onReturnHomeButtonTouched(event: EventTouch) {
    event.propagationStopped = true;
    void this.onReturnHomeButtonClicked();
  }

  private loadSpriteFrameFromBundle(bundle: AssetManager.Bundle, path: string): Promise<SpriteFrame> {
    return new Promise((resolve, reject) => {
      bundle.load(path, SpriteFrame, (error, spriteFrame) => {
        if (error || !spriteFrame) {
          reject(error ?? new Error(`Failed to load sprite frame: ${path}`));
          return;
        }

        resolve(spriteFrame);
      });
    });
  }

  private loadSpriteFrameByUuid(uuid: string): Promise<SpriteFrame> {
    return new Promise((resolve, reject) => {
      assetManager.loadAny(uuid, (error, asset) => {
        if (error || !(asset instanceof SpriteFrame)) {
          reject(error ?? new Error(`Failed to load sprite frame by uuid: ${uuid}`));
          return;
        }

        resolve(asset);
      });
    });
  }

  private async getResourcesBundle(): Promise<AssetManager.Bundle> {
    if (!this.resourcesBundlePromise) {
      this.resourcesBundlePromise = new Promise((resolve, reject) => {
        assetManager.loadBundle('resources', (error, bundle) => {
          if (error || !bundle) {
            reject(error ?? new Error('Failed to load resources bundle.'));
            return;
          }

          resolve(bundle);
        });
      });
    }

    return this.resourcesBundlePromise;
  }

  private async loadSettlementSpriteFrame(path: string, uuid: string): Promise<SpriteFrame | null> {
    try {
      const bundle = await this.getResourcesBundle();
      try {
        return await this.loadSpriteFrameFromBundle(bundle, path);
      } catch (bundleError) {
        console.warn(`[BattleSceneController] Failed to load sprite frame from bundle: ${path}`, bundleError);
      }
    } catch (bundleInitError) {
      console.warn('[BattleSceneController] Failed to load resources bundle.', bundleInitError);
    }

    try {
      return await this.loadSpriteFrameByUuid(uuid);
    } catch (uuidError) {
      console.warn(`[BattleSceneController] Failed to load sprite frame by uuid: ${uuid}`, uuidError);
      return null;
    }
  }

  private resolveSettlementAvatarSpriteFrame(avatarType: string, avatarValue: string): SpriteFrame | null {
    const normalizedAvatarType = avatarType.trim().toLowerCase();
    const normalizedAvatarValue = avatarValue.trim().toLowerCase();

    if (normalizedAvatarType === DEFAULT_AVATAR_TYPE && normalizedAvatarValue === DEFAULT_AVATAR_VALUE) {
      return this.settlementDefaultAvatarSpriteFrame;
    }

    return this.settlementDefaultAvatarSpriteFrame;
  }
}
