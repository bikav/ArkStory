import {
  _decorator,
  assetManager,
  BlockInputEvents,
  Button,
  Color,
  Component,
  director,
  EditBox,
  EventTouch,
  Label,
  Node,
  resources,
  Sprite,
  SpriteFrame,
  Toggle,
  UITransform,
} from 'cc';
import { AuthSession } from '../auth/AuthSession';
import { BattleSession } from './BattleSession';
import {
  MatchApi,
  MatchmakingStatePayload,
  PlayerProfilePayload,
} from './MatchApi';

const { ccclass } = _decorator;

const MATCH_BUTTON_NAME = 'MatchButton';
const STATUS_LABEL_NAME = 'HomeMatchStatusLabel';
const START_MATCH_BUTTON_BG_PATH = 'textures/homepage/start_match_button_bg/spriteFrame';
const CANCEL_MATCH_BUTTON_BG_PATH = 'textures/homepage/cancel_match_button_bg/spriteFrame';
const NAVIGATION_BUTTON_NAMES = [
  'NavigationBarButton01',
  'NavigationBarButton02',
  'NavigationBarButton03',
  'NavigationBarButton04',
  'NavigationBarButton05',
] as const;
const HOME_PAGE_NAMES = [
  'HomePage01',
  'HomePage02',
  'HomePage03',
  'HomePage04',
  'HomePage05',
] as const;
const NAVIGATION_BASE_XS = [-255, -125, 0, 125, 255] as const;
const NAVIGATION_DEFAULT_Y = -550;
const NAVIGATION_ACTIVE_Y = -540;
const NAVIGATION_DEFAULT_WIDTH = 120;
const NAVIGATION_DEFAULT_HEIGHT = 160;
const NAVIGATION_ACTIVE_WIDTH = 140;
const NAVIGATION_ACTIVE_HEIGHT = 180;
const NAVIGATION_SIDE_OFFSET = 10;
const PROFILE_PAGE_INDEX = 4;
const MATCH_PAGE_INDEX = 2;
const PROFILE_NICKNAME_LABEL = 'NicknameLabel';
const PROFILE_NICKNAME_BUTTON = 'NicknameButton';
const PROFILE_NICKNAME_EDITBOX = 'NicknameEditBox';
const PROFILE_USERNAME_LABEL = 'UsernameLabel';
const PROFILE_EMAIL_LABEL = 'EmailLabel';
const PROFILE_EMAIL_BUTTON = 'EmailButton';
const PROFILE_EMAIL_EDITBOX = 'EmailEditBox';
const PROFILE_REGION_LABEL = 'RegionLabel';
const PROFILE_REGION_BUTTON = 'RegionButton';
const PROFILE_REGISTRATION_DATE_LABEL = 'RegistrationDateLabel';
const PROFILE_EXIT_BUTTON = 'ExitButton';
const PROFILE_MESSAGE_TOGGLE = 'MessageToggle';
const PROFILE_SOUND_TOGGLE = 'SoundToggle';
const TOGGLE_CHECKMARK_NAME = 'Checkmark';
const TOGGLE_OPEN_BG_PATH = 'textures/homepage/open_toggle_bg/spriteFrame';
const TOGGLE_CLOSE_BG_PATH = 'textures/homepage/close_toggle_bg/spriteFrame';
const TOGGLE_OPEN_BG_UUID = '8cbfde65-e9c6-43d0-a53a-352ed3ed234f@f9941';
const TOGGLE_CLOSE_BG_UUID = '5ef5a6a3-a957-4c46-8289-1e89e96ee094@f9941';
const TOGGLE_CHECKMARK_OPEN_X = 0;
const TOGGLE_CHECKMARK_CLOSE_X = -25;
const REGION_MENU_OVERLAY = 'RegionMenuOverlay';
const REGION_OPTIONS = [
  '华北',
  '华东',
  '华南',
  '华中',
  '西南',
  '西北',
  '东北',
  '港澳台',
] as const;
const PROFILE_NICKNAME_PLACEHOLDER = 'Nickname';
const PROFILE_EMAIL_PLACEHOLDER = '未设置邮箱';
const PROFILE_REGION_PLACEHOLDER = '请选择所在地区';
const PROFILE_REGISTRATION_PLACEHOLDER = '--';

@ccclass('HomeSceneController')
export class HomeSceneController extends Component {
  private readonly matchApi = new MatchApi();

  private matchButton: Button | null = null;
  private statusLabel: Label | null = null;
  private readonly navigationButtons: Button[] = [];
  private readonly navigationButtonNodes: Node[] = [];
  private readonly pageRoots: Array<Node | null> = [];
  private activePageIndex = 2;
  private profilePageRoot: Node | null = null;
  private nicknameLabelNode: Node | null = null;
  private nicknameLabel: Label | null = null;
  private nicknameButton: Button | null = null;
  private nicknameEditBoxNode: Node | null = null;
  private nicknameEditBox: EditBox | null = null;
  private usernameLabel: Label | null = null;
  private emailLabelNode: Node | null = null;
  private emailLabel: Label | null = null;
  private emailButton: Button | null = null;
  private emailEditBoxNode: Node | null = null;
  private emailEditBox: EditBox | null = null;
  private regionLabel: Label | null = null;
  private regionButton: Button | null = null;
  private exitButton: Button | null = null;
  private messageToggleButton: Button | null = null;
  private soundToggleButton: Button | null = null;
  private messageToggle: Toggle | null = null;
  private soundToggle: Toggle | null = null;
  private messageToggleCheckmark: Node | null = null;
  private soundToggleCheckmark: Node | null = null;
  private registrationDateLabel: Label | null = null;
  private regionMenuOverlay: Node | null = null;
  private profileData: PlayerProfilePayload | null = null;
  private activeProfileEdit: 'nickname' | 'email' | null = null;
  private currentState: MatchmakingStatePayload | null = null;
  private submitting = false;
  private enteringBattle = false;
  private messageToggleEnabled = true;
  private soundToggleEnabled = true;
  private startMatchButtonSpriteFrame: SpriteFrame | null = null;
  private cancelMatchButtonSpriteFrame: SpriteFrame | null = null;
  private toggleOpenSpriteFrame: SpriteFrame | null = null;
  private toggleCloseSpriteFrame: SpriteFrame | null = null;

  onLoad() {
    this.collectNavigationButtons();
    this.collectHomePages();
    this.collectProfilePageNodes();
    this.matchButton = this.pageRoots[MATCH_PAGE_INDEX]?.getChildByName(MATCH_BUTTON_NAME)?.getComponent(Button)
      ?? this.node.getChildByName(MATCH_BUTTON_NAME)?.getComponent(Button)
      ?? null;
    this.statusLabel = this.pageRoots[MATCH_PAGE_INDEX]?.getChildByName(STATUS_LABEL_NAME)?.getComponent(Label)
      ?? this.node.getChildByName(STATUS_LABEL_NAME)?.getComponent(Label)
      ?? null;

    const buttonLabelNode = this.matchButton?.node.getChildByName('MatchButtonLabel') ?? null;
    if (buttonLabelNode?.isValid) {
      buttonLabelNode.destroy();
    }

    const matchButtonNode = this.matchButton?.node;
    if (!matchButtonNode || !this.statusLabel) {
      console.warn('[HomeSceneController] Missing MatchButton or HomeMatchStatusLabel in HomeScene.');
    } else {
      matchButtonNode.on(Button.EventType.CLICK, this.onMatchButtonClicked, this);
    }

    this.bindNavigationButtons();
    this.bindProfilePageEvents();
    this.applyActivePage(this.activePageIndex);
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

    for (let index = 0; index < this.navigationButtonNodes.length; index += 1) {
      const buttonNode = this.navigationButtonNodes[index];
      if (!buttonNode?.isValid) {
        continue;
      }
      buttonNode.off(Button.EventType.CLICK, this.onNavigationButtonClicked, this);
    }

    this.nicknameButton?.node.off(Button.EventType.CLICK, this.onNicknameButtonClicked, this);
    this.emailButton?.node.off(Button.EventType.CLICK, this.onEmailButtonClicked, this);
    this.regionButton?.node.off(Button.EventType.CLICK, this.onRegionButtonClicked, this);
    this.exitButton?.node.off(Button.EventType.CLICK, this.onExitButtonClicked, this);
    this.messageToggleButton?.node.off(Button.EventType.CLICK, this.onMessageToggleClicked, this);
    this.soundToggleButton?.node.off(Button.EventType.CLICK, this.onSoundToggleClicked, this);
    this.nicknameEditBox?.node.off(EditBox.EventType.EDITING_DID_ENDED, this.onNicknameEditFinished, this);
    this.nicknameEditBox?.node.off(EditBox.EventType.EDITING_RETURN, this.onNicknameEditFinished, this);
    this.emailEditBox?.node.off(EditBox.EventType.EDITING_DID_ENDED, this.onEmailEditFinished, this);
    this.emailEditBox?.node.off(EditBox.EventType.EDITING_RETURN, this.onEmailEditFinished, this);
    this.regionMenuOverlay?.off(Node.EventType.TOUCH_END, this.onRegionOverlayTouched, this);
  }

  private async initializeHomeScene() {
    try {
      await this.preloadButtonSpriteFrames();
    } catch (error) {
      console.warn('[HomeSceneController] Failed to preload button sprite frames.', error);
    }

    this.refreshButtonVisuals();
    this.refreshProfileToggles();
    await this.restoreState();
    await this.restoreProfilePage();
  }

  private collectNavigationButtons() {
    this.navigationButtons.length = 0;
    this.navigationButtonNodes.length = 0;

    for (const buttonName of NAVIGATION_BUTTON_NAMES) {
      const buttonNode = this.node.getChildByName(buttonName);
      const button = buttonNode?.getComponent(Button) ?? null;
      if (!buttonNode || !button) {
        console.warn(`[HomeSceneController] Missing navigation button node: ${buttonName}`);
        continue;
      }

      this.navigationButtonNodes.push(buttonNode);
      this.navigationButtons.push(button);
    }
  }

  private bindNavigationButtons() {
    for (let index = 0; index < this.navigationButtonNodes.length; index += 1) {
      const buttonNode = this.navigationButtonNodes[index];
      buttonNode.off(Button.EventType.CLICK, this.onNavigationButtonClicked, this);
      buttonNode.on(Button.EventType.CLICK, this.onNavigationButtonClicked, this);
    }
  }

  private collectHomePages() {
    this.pageRoots.length = HOME_PAGE_NAMES.length;

    for (let index = 0; index < HOME_PAGE_NAMES.length; index += 1) {
      const pageName = HOME_PAGE_NAMES[index];
      const pageRoot = this.node.getChildByName(pageName);
      if (!pageRoot) {
        console.warn(`[HomeSceneController] Missing page node: ${pageName}`);
        this.pageRoots[index] = null;
        continue;
      }
      this.pageRoots[index] = pageRoot;
    }
  }

  private collectProfilePageNodes() {
    this.profilePageRoot = this.pageRoots[PROFILE_PAGE_INDEX] ?? null;
    if (!this.profilePageRoot) {
      console.warn('[HomeSceneController] Missing HomePage05 root.');
      return;
    }

    this.nicknameLabelNode = this.findNodeRecursive(this.profilePageRoot, PROFILE_NICKNAME_LABEL);
    this.nicknameLabel = this.nicknameLabelNode?.getComponent(Label) ?? null;
    this.nicknameButton = this.findNodeRecursive(this.profilePageRoot, PROFILE_NICKNAME_BUTTON)?.getComponent(Button) ?? null;
    this.nicknameEditBoxNode = this.findNodeRecursive(this.profilePageRoot, PROFILE_NICKNAME_EDITBOX);
    this.nicknameEditBox = this.nicknameEditBoxNode?.getComponent(EditBox) ?? null;
    this.usernameLabel = this.findNodeRecursive(this.profilePageRoot, PROFILE_USERNAME_LABEL)?.getComponent(Label) ?? null;
    this.emailLabelNode = this.findNodeRecursive(this.profilePageRoot, PROFILE_EMAIL_LABEL);
    this.emailLabel = this.emailLabelNode?.getComponent(Label) ?? null;
    this.emailButton = this.findNodeRecursive(this.profilePageRoot, PROFILE_EMAIL_BUTTON)?.getComponent(Button) ?? null;
    this.emailEditBoxNode = this.findNodeRecursive(this.profilePageRoot, PROFILE_EMAIL_EDITBOX);
    this.emailEditBox = this.emailEditBoxNode?.getComponent(EditBox) ?? null;
    this.regionLabel = this.findNodeRecursive(this.profilePageRoot, PROFILE_REGION_LABEL)?.getComponent(Label) ?? null;
    this.regionButton = this.findNodeRecursive(this.profilePageRoot, PROFILE_REGION_BUTTON)?.getComponent(Button) ?? null;
    this.registrationDateLabel = this.findNodeRecursive(this.profilePageRoot, PROFILE_REGISTRATION_DATE_LABEL)?.getComponent(Label) ?? null;
    this.exitButton = this.findNodeRecursive(this.profilePageRoot, PROFILE_EXIT_BUTTON)?.getComponent(Button) ?? null;
    const messageToggleNode = this.findNodeRecursive(this.profilePageRoot, PROFILE_MESSAGE_TOGGLE);
    const soundToggleNode = this.findNodeRecursive(this.profilePageRoot, PROFILE_SOUND_TOGGLE);
    this.messageToggle = messageToggleNode?.getComponent(Toggle) ?? null;
    this.soundToggle = soundToggleNode?.getComponent(Toggle) ?? null;
    this.messageToggleButton = this.messageToggle ?? messageToggleNode?.getComponent(Button) ?? null;
    this.soundToggleButton = this.soundToggle ?? soundToggleNode?.getComponent(Button) ?? null;
    this.messageToggleCheckmark = this.messageToggleButton?.node.getChildByName(TOGGLE_CHECKMARK_NAME) ?? null;
    this.soundToggleCheckmark = this.soundToggleButton?.node.getChildByName(TOGGLE_CHECKMARK_NAME) ?? null;
    this.detachToggleCheckmarkControl(this.messageToggle);
    this.detachToggleCheckmarkControl(this.soundToggle);
  }

  private bindProfilePageEvents() {
    this.nicknameButton?.node.off(Button.EventType.CLICK, this.onNicknameButtonClicked, this);
    this.nicknameButton?.node.on(Button.EventType.CLICK, this.onNicknameButtonClicked, this);

    this.emailButton?.node.off(Button.EventType.CLICK, this.onEmailButtonClicked, this);
    this.emailButton?.node.on(Button.EventType.CLICK, this.onEmailButtonClicked, this);

    this.regionButton?.node.off(Button.EventType.CLICK, this.onRegionButtonClicked, this);
    this.regionButton?.node.on(Button.EventType.CLICK, this.onRegionButtonClicked, this);
    this.exitButton?.node.off(Button.EventType.CLICK, this.onExitButtonClicked, this);
    this.exitButton?.node.on(Button.EventType.CLICK, this.onExitButtonClicked, this);
    this.messageToggleButton?.node.off(Button.EventType.CLICK, this.onMessageToggleClicked, this);
    this.messageToggleButton?.node.on(Button.EventType.CLICK, this.onMessageToggleClicked, this);
    this.soundToggleButton?.node.off(Button.EventType.CLICK, this.onSoundToggleClicked, this);
    this.soundToggleButton?.node.on(Button.EventType.CLICK, this.onSoundToggleClicked, this);

    this.nicknameEditBox?.node.off(EditBox.EventType.EDITING_DID_ENDED, this.onNicknameEditFinished, this);
    this.nicknameEditBox?.node.off(EditBox.EventType.EDITING_RETURN, this.onNicknameEditFinished, this);
    this.nicknameEditBox?.node.on(EditBox.EventType.EDITING_DID_ENDED, this.onNicknameEditFinished, this);
    this.nicknameEditBox?.node.on(EditBox.EventType.EDITING_RETURN, this.onNicknameEditFinished, this);

    this.emailEditBox?.node.off(EditBox.EventType.EDITING_DID_ENDED, this.onEmailEditFinished, this);
    this.emailEditBox?.node.off(EditBox.EventType.EDITING_RETURN, this.onEmailEditFinished, this);
    this.emailEditBox?.node.on(EditBox.EventType.EDITING_DID_ENDED, this.onEmailEditFinished, this);
    this.emailEditBox?.node.on(EditBox.EventType.EDITING_RETURN, this.onEmailEditFinished, this);
  }

  private onNavigationButtonClicked(event?: EventTouch) {
    const targetNode = (event?.target as Node | null) ?? null;
    if (!targetNode) {
      return;
    }

    const targetIndex = this.navigationButtonNodes.findIndex((node) => node === targetNode);
    if (targetIndex < 0) {
      return;
    }

    this.applyActivePage(targetIndex);
  }

  private applyActivePage(pageIndex: number) {
    this.activePageIndex = Math.max(0, Math.min(pageIndex, HOME_PAGE_NAMES.length - 1));
    this.refreshNavigationButtonLayout();
    this.refreshPageVisibility();
  }

  private refreshNavigationButtonLayout() {
    for (let index = 0; index < this.navigationButtonNodes.length; index += 1) {
      const buttonNode = this.navigationButtonNodes[index];
      if (!buttonNode?.isValid) {
        continue;
      }

      const transform = buttonNode.getComponent(UITransform);
      if (!transform) {
        continue;
      }

      const isActive = index === this.activePageIndex;
      const x = NAVIGATION_BASE_XS[index] + this.getNavigationOffset(index);
      const y = isActive ? NAVIGATION_ACTIVE_Y : NAVIGATION_DEFAULT_Y;
      const width = isActive ? NAVIGATION_ACTIVE_WIDTH : NAVIGATION_DEFAULT_WIDTH;
      const height = isActive ? NAVIGATION_ACTIVE_HEIGHT : NAVIGATION_DEFAULT_HEIGHT;

      buttonNode.setPosition(x, y, 0);
      transform.setContentSize(width, height);

      const button = this.navigationButtons[index];
      if (button) {
        button.zoomScale = isActive ? 1 : 1.05;
      }
    }
  }

  private getNavigationOffset(buttonIndex: number): number {
    if (buttonIndex === this.activePageIndex) {
      return 0;
    }

    return buttonIndex < this.activePageIndex
      ? -NAVIGATION_SIDE_OFFSET
      : NAVIGATION_SIDE_OFFSET;
  }

  private refreshPageVisibility() {
    for (let index = 0; index < this.pageRoots.length; index += 1) {
      const pageRoot = this.pageRoots[index];
      if (pageRoot?.isValid) {
        pageRoot.active = index === this.activePageIndex;
      }
    }
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

  private async restoreProfilePage() {
    const authSession = AuthSession.load();
    if (!authSession) {
      return;
    }

    this.applyProfileFallback(authSession.account, authSession.display_name);

    try {
      const profile = await this.matchApi.getPlayerProfile();
      this.profileData = profile;
      this.applyProfileData(profile);
    } catch (error) {
      console.warn('[HomeSceneController] Failed to restore player profile.', error);
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

  private applyProfileFallback(account: string, displayName: string) {
    if (this.nicknameLabel) {
      this.nicknameLabel.string = this.getNicknameDisplayText(displayName, account);
    }
    if (this.usernameLabel) {
      this.usernameLabel.string = account;
    }
    if (this.emailLabel) {
      this.emailLabel.string = PROFILE_EMAIL_PLACEHOLDER;
    }
    if (this.regionLabel) {
      this.regionLabel.string = PROFILE_REGION_PLACEHOLDER;
    }
    if (this.registrationDateLabel) {
      this.registrationDateLabel.string = PROFILE_REGISTRATION_PLACEHOLDER;
    }
  }

  private applyProfileData(profile: PlayerProfilePayload) {
    if (this.nicknameLabel) {
      this.nicknameLabel.string = this.getNicknameDisplayText(profile.display_name, profile.account_name);
    }
    if (this.usernameLabel) {
      this.usernameLabel.string = profile.account_name;
    }
    if (this.emailLabel) {
      this.emailLabel.string = profile.email?.trim() || PROFILE_EMAIL_PLACEHOLDER;
    }
    if (this.regionLabel) {
      this.regionLabel.string = profile.region?.trim() || PROFILE_REGION_PLACEHOLDER;
    }
    if (this.registrationDateLabel) {
      const formatted = this.formatRegistrationDate(profile.registration_date);
      this.registrationDateLabel.string = formatted || PROFILE_REGISTRATION_PLACEHOLDER;
    }
  }

  private onNicknameButtonClicked(_event?: EventTouch) {
    this.beginProfileEdit('nickname');
  }

  private onEmailButtonClicked(_event?: EventTouch) {
    this.beginProfileEdit('email');
  }

  private onRegionButtonClicked(_event?: EventTouch) {
    this.toggleRegionMenu(true);
  }

  private async onExitButtonClicked() {
    this.unschedule(this.pollMatchmakingStatus);

    try {
      await this.matchApi.logout();
    } catch (error) {
      console.warn('[HomeSceneController] Failed to logout from backend session.', error);
    } finally {
      this.currentState = null;
      this.profileData = null;
      this.activeProfileEdit = null;
      BattleSession.clear();
      AuthSession.clear();
      director.loadScene('LoginScene');
    }
  }

  private onMessageToggleClicked() {
    this.messageToggleEnabled = !this.messageToggleEnabled;
    this.applyToggleState(this.messageToggle, this.messageToggleButton, this.messageToggleCheckmark, this.messageToggleEnabled);
    console.log(this.messageToggleEnabled ? '消息通知已开启' : '消息通知已关闭');
  }

  private onSoundToggleClicked() {
    this.soundToggleEnabled = !this.soundToggleEnabled;
    this.applyToggleState(this.soundToggle, this.soundToggleButton, this.soundToggleCheckmark, this.soundToggleEnabled);
    console.log(this.soundToggleEnabled ? '音效已开启' : '音效已关闭');
  }

  private beginProfileEdit(field: 'nickname' | 'email') {
    if (field === 'nickname') {
      if (!this.nicknameLabelNode || !this.nicknameEditBoxNode || !this.nicknameEditBox) {
        return;
      }

      this.activeProfileEdit = 'nickname';
      const profileDisplayName = this.profileData?.display_name?.trim() ?? '';
      const profileAccountName = this.profileData?.account_name?.trim() ?? '';
      this.nicknameEditBox.string = profileDisplayName && profileDisplayName !== profileAccountName
        ? profileDisplayName
        : '';
      this.nicknameLabelNode.active = false;
      this.nicknameEditBoxNode.active = true;
      return;
    }

    if (!this.emailLabelNode || !this.emailEditBoxNode || !this.emailEditBox) {
      return;
    }

    this.activeProfileEdit = 'email';
    this.emailEditBox.string = this.profileData?.email ?? '';
    this.emailLabelNode.active = false;
    this.emailEditBoxNode.active = true;
  }

  private onNicknameEditFinished() {
    if (this.activeProfileEdit !== 'nickname') {
      return;
    }

    void this.commitNicknameEdit();
  }

  private onEmailEditFinished() {
    if (this.activeProfileEdit !== 'email') {
      return;
    }

    void this.commitEmailEdit();
  }

  private async commitNicknameEdit() {
    const nextDisplayName = this.nicknameEditBox?.string.trim() ?? '';
    const currentDisplayName = this.profileData?.display_name ?? this.nicknameLabel?.string ?? '';

    if (!nextDisplayName) {
      this.endProfileEdit('nickname', false);
      return;
    }

    if (nextDisplayName === currentDisplayName) {
      this.endProfileEdit('nickname', true);
      return;
    }

    try {
      const profile = await this.matchApi.updatePlayerProfile({
        display_name: nextDisplayName,
      });
      this.profileData = profile;
      this.applyProfileData(profile);
      this.syncStoredSessionDisplayName(profile.display_name);
      this.endProfileEdit('nickname', true);
    } catch (error) {
      console.warn('[HomeSceneController] Failed to update nickname.', error);
    }
  }

  private async commitEmailEdit() {
    const nextEmail = this.emailEditBox?.string.trim() ?? '';
    const currentEmail = this.profileData?.email?.trim() ?? '';

    if (!nextEmail) {
      this.endProfileEdit('email', false);
      return;
    }

    if (nextEmail === currentEmail) {
      this.endProfileEdit('email', true);
      return;
    }

    try {
      const profile = await this.matchApi.updatePlayerProfile({
        email: nextEmail,
      });
      this.profileData = profile;
      this.applyProfileData(profile);
      this.endProfileEdit('email', true);
    } catch (error) {
      console.warn('[HomeSceneController] Failed to update email.', error);
    }
  }

  private endProfileEdit(field: 'nickname' | 'email', useProfileValue: boolean) {
    if (field === 'nickname') {
      if (this.nicknameEditBoxNode) {
        this.nicknameEditBoxNode.active = false;
      }
      if (this.nicknameLabelNode) {
        this.nicknameLabelNode.active = true;
      }
      if (!useProfileValue && this.nicknameEditBox && this.nicknameLabel) {
        this.nicknameEditBox.string = this.profileData?.display_name ?? this.nicknameLabel.string;
      }
    } else {
      if (this.emailEditBoxNode) {
        this.emailEditBoxNode.active = false;
      }
      if (this.emailLabelNode) {
        this.emailLabelNode.active = true;
      }
      if (!useProfileValue && this.emailEditBox) {
        this.emailEditBox.string = this.profileData?.email ?? '';
      }
    }

    this.activeProfileEdit = null;
  }

  private toggleRegionMenu(visible: boolean) {
    if (!this.profilePageRoot) {
      return;
    }

    if (!this.regionMenuOverlay) {
      this.regionMenuOverlay = this.createRegionMenuOverlay();
      this.profilePageRoot.addChild(this.regionMenuOverlay);
    }

    this.regionMenuOverlay.active = visible;
  }

  private createRegionMenuOverlay(): Node {
    const overlay = new Node(REGION_MENU_OVERLAY);
    overlay.layer = this.profilePageRoot?.layer ?? this.node.layer;
    overlay.setPosition(0, 0, 0);
    const overlayTransform = overlay.addComponent(UITransform);
    overlayTransform.setContentSize(720, 1280);
    overlay.addComponent(BlockInputEvents);
    overlay.on(Node.EventType.TOUCH_END, this.onRegionOverlayTouched, this);

    const panel = new Node('RegionMenuPanel');
    panel.layer = overlay.layer;
    panel.setPosition(0, -40, 0);
    overlay.addChild(panel);
    panel.addComponent(BlockInputEvents);

    const panelTransform = panel.addComponent(UITransform);
    panelTransform.setContentSize(300, 520);

    for (let index = 0; index < REGION_OPTIONS.length; index += 1) {
      const optionNode = new Node(`RegionOption${index + 1}`);
      optionNode.layer = panel.layer;
      optionNode.setPosition(0, 200 - index * 56, 0);
      panel.addChild(optionNode);

      const optionTransform = optionNode.addComponent(UITransform);
      optionTransform.setContentSize(260, 48);

      const optionLabel = optionNode.addComponent(Label);
      optionLabel.string = REGION_OPTIONS[index];
      optionLabel.fontSize = 28;
      optionLabel.lineHeight = 36;
      optionLabel.color = Color.WHITE;
      optionLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      optionLabel.verticalAlign = Label.VerticalAlign.CENTER;

      const optionButton = optionNode.addComponent(Button);
      optionButton.transition = Button.Transition.NONE;
      optionNode.on(Button.EventType.CLICK, () => {
        void this.selectRegion(REGION_OPTIONS[index]);
      });
    }

    return overlay;
  }

  private onRegionOverlayTouched(event?: EventTouch) {
    const targetNode = (event?.target as Node | null) ?? null;
    if (targetNode === this.regionMenuOverlay) {
      this.toggleRegionMenu(false);
    }
  }

  private async selectRegion(region: string) {
    try {
      const profile = await this.matchApi.updatePlayerProfile({ region });
      this.profileData = profile;
      this.applyProfileData(profile);
    } catch (error) {
      console.warn('[HomeSceneController] Failed to update region.', error);
    } finally {
      this.toggleRegionMenu(false);
    }
  }

  private syncStoredSessionDisplayName(displayName: string) {
    const authSession = AuthSession.load();
    if (!authSession) {
      return;
    }

    authSession.display_name = displayName;
    AuthSession.save(authSession);
  }

  private formatRegistrationDate(registrationDate: string | null): string | null {
    if (!registrationDate) {
      return null;
    }

    const date = new Date(registrationDate);
    if (Number.isNaN(date.getTime())) {
      return registrationDate;
    }

    const year = date.getFullYear();
    const monthNumber = date.getMonth() + 1;
    const dayNumber = date.getDate();
    const month = monthNumber < 10 ? `0${monthNumber}` : `${monthNumber}`;
    const day = dayNumber < 10 ? `0${dayNumber}` : `${dayNumber}`;
    return `${year}-${month}-${day}`;
  }

  private getNicknameDisplayText(displayName: string | null | undefined, accountName: string | null | undefined): string {
    const normalizedDisplayName = displayName?.trim() ?? '';
    const normalizedAccountName = accountName?.trim() ?? '';

    if (!normalizedDisplayName || normalizedDisplayName === normalizedAccountName) {
      return PROFILE_NICKNAME_PLACEHOLDER;
    }

    return normalizedDisplayName;
  }

  private findNodeRecursive(root: Node, nodeName: string): Node | null {
    if (root.name === nodeName) {
      return root;
    }

    for (const child of root.children) {
      const found = this.findNodeRecursive(child, nodeName);
      if (found) {
        return found;
      }
    }

    return null;
  }

  private async preloadButtonSpriteFrames() {
    const [startSpriteFrame, cancelSpriteFrame, toggleOpenSpriteFrame, toggleCloseSpriteFrame] = await Promise.all([
      this.loadSpriteFrame(START_MATCH_BUTTON_BG_PATH),
      this.loadSpriteFrame(CANCEL_MATCH_BUTTON_BG_PATH),
      this.loadSpriteFrameWithFallback(TOGGLE_OPEN_BG_PATH, TOGGLE_OPEN_BG_UUID),
      this.loadSpriteFrameWithFallback(TOGGLE_CLOSE_BG_PATH, TOGGLE_CLOSE_BG_UUID),
    ]);
    this.startMatchButtonSpriteFrame = startSpriteFrame;
    this.cancelMatchButtonSpriteFrame = cancelSpriteFrame;
    this.toggleOpenSpriteFrame = toggleOpenSpriteFrame;
    this.toggleCloseSpriteFrame = toggleCloseSpriteFrame;
  }

  private refreshProfileToggles() {
    this.applyToggleState(this.messageToggle, this.messageToggleButton, this.messageToggleCheckmark, this.messageToggleEnabled);
    this.applyToggleState(this.soundToggle, this.soundToggleButton, this.soundToggleCheckmark, this.soundToggleEnabled);
  }

  private applyToggleState(toggle: Toggle | null, button: Button | null, checkmark: Node | null, enabled: boolean) {
    if (toggle) {
      toggle.isChecked = enabled;
    }

    if (checkmark?.isValid) {
      checkmark.active = true;
      const currentPosition = checkmark.getPosition();
      checkmark.setPosition(enabled ? TOGGLE_CHECKMARK_OPEN_X : TOGGLE_CHECKMARK_CLOSE_X, currentPosition.y, currentPosition.z);
    }

    const targetNode = button?.target ?? button?.node ?? null;
    const sprite = targetNode?.getComponent(Sprite) ?? button?.node.getComponent(Sprite) ?? null;
    const targetSpriteFrame = enabled ? this.toggleOpenSpriteFrame : this.toggleCloseSpriteFrame;
    if (!sprite || !targetSpriteFrame) {
      return;
    }

    sprite.spriteFrame = targetSpriteFrame;
    button.normalSprite = targetSpriteFrame;
    button.hoverSprite = targetSpriteFrame;
    button.pressedSprite = targetSpriteFrame;
    button.disabledSprite = targetSpriteFrame;
  }

  private detachToggleCheckmarkControl(toggle: Toggle | null) {
    if (!toggle) {
      return;
    }

    toggle.checkMark = null;
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

  private loadSpriteFrameWithFallback(path: string, uuid: string): Promise<SpriteFrame> {
    return new Promise((resolve, reject) => {
      resources.load(path, SpriteFrame, (resourceError, resourceSpriteFrame) => {
        if (!resourceError && resourceSpriteFrame) {
          resolve(resourceSpriteFrame);
          return;
        }

        assetManager.loadAny(uuid, (assetError, asset) => {
          const spriteFrame = asset as SpriteFrame | null;
          if (assetError || !spriteFrame) {
            reject(
              assetError
              ?? resourceError
              ?? new Error(`Failed to load sprite frame: ${path} (${uuid})`),
            );
            return;
          }

          resolve(spriteFrame);
        });
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
