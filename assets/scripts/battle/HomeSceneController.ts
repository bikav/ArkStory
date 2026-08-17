import {
  _decorator,
  Button,
  Color,
  Component,
  director,
  Label,
  resources,
  Sprite,
  SpriteFrame,
} from 'cc';
import { AuthSession } from '../auth/AuthSession';
import { BattleSession } from './BattleSession';
import { MatchApi, MatchmakingStatePayload } from './MatchApi';

const { ccclass } = _decorator;

const MATCH_BUTTON_NAME = 'MatchButton';
const STATUS_LABEL_NAME = 'HomeMatchStatusLabel';
const START_MATCH_BUTTON_BG_PATH = 'textures/start_match_button_bg/spriteFrame';
const CANCEL_MATCH_BUTTON_BG_PATH = 'textures/cancel_match_button_bg/spriteFrame';

@ccclass('HomeSceneController')
export class HomeSceneController extends Component {
  private readonly matchApi = new MatchApi();

  private matchButton: Button | null = null;
  private statusLabel: Label | null = null;
  private currentState: MatchmakingStatePayload | null = null;
  private submitting = false;
  private enteringBattle = false;
  private startMatchButtonSpriteFrame: SpriteFrame | null = null;
  private cancelMatchButtonSpriteFrame: SpriteFrame | null = null;

  onLoad() {
    this.matchButton = this.node.getChildByName(MATCH_BUTTON_NAME)?.getComponent(Button) ?? null;
    this.statusLabel = this.node.getChildByName(STATUS_LABEL_NAME)?.getComponent(Label) ?? null;

    const buttonLabelNode = this.matchButton?.node.getChildByName('MatchButtonLabel') ?? null;
    if (buttonLabelNode?.isValid) {
      buttonLabelNode.destroy();
    }

    const matchButtonNode = this.matchButton?.node;
    if (!matchButtonNode || !this.statusLabel) {
      console.warn('[HomeSceneController] Missing MatchButton or HomeMatchStatusLabel in HomeScene.');
      this.setStatus('HomeScene 节点未绑定完整，请检查 Canvas。', true);
      return;
    }

    matchButtonNode.on(Button.EventType.CLICK, this.onMatchButtonClicked, this);
  }

  start() {
    void this.initializeHomeScene();
  }

  onDestroy() {
    this.unschedule(this.pollMatchmakingStatus);

    const matchButtonNode = this.matchButton?.node;
    if (matchButtonNode?.isValid) {
      matchButtonNode.off(Button.EventType.CLICK, this.onMatchButtonClicked, this);
    }
  }

  private async initializeHomeScene() {
    try {
      await this.preloadButtonSpriteFrames();
    } catch (error) {
      console.warn('[HomeSceneController] Failed to preload match button sprite frames.', error);
    }

    this.refreshButtonVisuals();
    await this.restoreState();
  }

  private async restoreState() {
    const authSession = AuthSession.load();
    if (!authSession) {
      this.setStatus('未检测到登录态，正在返回登录页。', true);
      director.loadScene('LoginScene');
      return;
    }

    this.setStatus(`欢迎回来，${authSession.account}。`, false);
    this.refreshButtonVisuals();

    try {
      const state = await this.matchApi.getStatus();
      this.applyState(state);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : '读取匹配状态失败。', true);
    }
  }

  private async onMatchButtonClicked() {
    if (this.submitting || this.enteringBattle) {
      return;
    }

    const currentStatus = this.currentState?.status ?? 'idle';
    this.submitting = true;
    this.refreshButtonVisuals();

    try {
      let nextState: MatchmakingStatePayload;
      if (currentStatus === 'waiting') {
        nextState = await this.matchApi.cancel();
      } else {
        nextState = await this.matchApi.enqueue();
      }

      this.applyState(nextState);
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : '匹配请求失败。', true);
    } finally {
      this.submitting = false;
      this.refreshButtonVisuals();
    }
  }

  private applyState(state: MatchmakingStatePayload) {
    this.currentState = state;

    if (state.status === 'waiting') {
      BattleSession.clear();
      this.unschedule(this.pollMatchmakingStatus);
      this.schedule(this.pollMatchmakingStatus, 1);
      this.setStatus(`匹配中，已等待 ${this.formatSeconds(state.elapsed_seconds)}。`, false);
      this.refreshButtonVisuals();
      return;
    }

    this.unschedule(this.pollMatchmakingStatus);

    if (state.status === 'matched' && state.match) {
      this.setStatus(`已匹配到对手 ${state.match.opponent?.display_name ?? '未知玩家'}，正在进入对局。`, false);
      this.enterBattle(state);
      return;
    }

    BattleSession.clear();
    this.setStatus('点击按钮开始匹配。', false);
    this.refreshButtonVisuals();
  }

  private pollMatchmakingStatus = async () => {
    if (this.submitting || this.enteringBattle) {
      return;
    }

    try {
      const state = await this.matchApi.getStatus();
      this.applyState(state);
    } catch (error) {
      this.unschedule(this.pollMatchmakingStatus);
      this.setStatus(error instanceof Error ? error.message : '轮询匹配状态失败。', true);
      this.refreshButtonVisuals();
    }
  };

  private enterBattle(state: MatchmakingStatePayload) {
    if (this.enteringBattle || !state.match) {
      return;
    }

    this.enteringBattle = true;
    BattleSession.save(state.match);
    director.loadScene('BattleScene');
  }

  private refreshButtonVisuals() {
    if (!this.matchButton) {
      return;
    }

    this.matchButton.interactable = !this.enteringBattle && !this.submitting;

    const sprite = this.matchButton.node.getComponent(Sprite);
    if (sprite) {
      const isWaiting = this.currentState?.status === 'waiting';
      const targetSpriteFrame = isWaiting
        ? (this.cancelMatchButtonSpriteFrame ?? sprite.spriteFrame)
        : (this.startMatchButtonSpriteFrame ?? sprite.spriteFrame);
      sprite.spriteFrame = targetSpriteFrame;
      this.matchButton.normalSprite = targetSpriteFrame;
      this.matchButton.hoverSprite = targetSpriteFrame;
      this.matchButton.pressedSprite = targetSpriteFrame;
      this.matchButton.disabledSprite = targetSpriteFrame;
      sprite.color = this.submitting
        ? new Color(190, 190, 190, 255)
        : Color.WHITE;
    }
  }

  private async preloadButtonSpriteFrames() {
    const [startSpriteFrame, cancelSpriteFrame] = await Promise.all([
      this.loadSpriteFrame(START_MATCH_BUTTON_BG_PATH),
      this.loadSpriteFrame(CANCEL_MATCH_BUTTON_BG_PATH),
    ]);
    this.startMatchButtonSpriteFrame = startSpriteFrame;
    this.cancelMatchButtonSpriteFrame = cancelSpriteFrame;
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

  private setStatus(message: string, isError: boolean) {
    if (!this.statusLabel) {
      return;
    }

    this.statusLabel.string = message;
    this.statusLabel.color = isError
      ? new Color(255, 180, 180, 255)
      : Color.WHITE;
  }

  private formatSeconds(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const minuteText = minutes < 10 ? `0${minutes}` : `${minutes}`;
    const secondText = seconds < 10 ? `0${seconds}` : `${seconds}`;
    return `${minuteText}:${secondText}`;
  }
}
