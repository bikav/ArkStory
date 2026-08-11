import { _decorator, Button, Component, director, Label, Node, sys } from 'cc';
import { AuthSession } from '../auth/AuthSession';
import { TerrainDraftController } from '../TerrainDraftController';
import { BattleSession } from './BattleSession';
import { MatchApi, MatchStateEnvelopePayload, MatchSummaryPayload } from './MatchApi';

const { ccclass } = _decorator;

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

    if (this.switchChessboardButton) {
      this.switchChessboardButton.interactable = canToggle;
    }

    if (this.switchChessboardButtonNode) {
      this.switchChessboardButtonNode.active = canToggle;
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
}
