import {
  _decorator,
  Button,
  Component,
  director,
  EditBox,
  Node,
} from 'cc';
import { installAppResumeHandler } from '../AppLifecycle';
import { AuthApi } from './AuthApi';
import { AuthSession } from './AuthSession';

const { ccclass } = _decorator;

const PAGE_BG_NAME = 'LoginPageBG';
const REGISTER_PAGE_BG_NAME = 'RegisterPageBG';
const ACCOUNT_EDIT_NAME = 'AccountEdit';
const PASSWORD_EDIT_NAME = 'PasswordEdit';
const LOGIN_BUTTON_NAME = 'LoginButton';
const REGISTER_BUTTON_NAME = 'RegisterButton';
const REGISTER_ACCOUNT_EDIT_NAME = 'RegisterAccountEdit';
const REGISTER_PASSWORD_EDIT_NAME = 'RegisterPasswordEdit';
const CONFIRM_PASSWORD_EDIT_NAME = 'ConfirmPasswordEdit';
const REGISTER_END_BUTTON_NAME = 'RegisterEndButton';
const BACK_BUTTON_NAME = 'BackButton';

@ccclass('LoginSceneController')
export class LoginSceneController extends Component {
  private readonly authApi = new AuthApi();
  private disposeAppResumeHandler: (() => void) | null = null;

  private loginPageRoot: Node | null = null;
  private registerPageRoot: Node | null = null;

  private accountEdit: EditBox | null = null;
  private passwordEdit: EditBox | null = null;
  private loginButton: Button | null = null;
  private registerButton: Button | null = null;

  private registerAccountEdit: EditBox | null = null;
  private registerPasswordEdit: EditBox | null = null;
  private confirmPasswordEdit: EditBox | null = null;
  private registerEndButton: Button | null = null;
  private backButton: Button | null = null;

  private pending = false;

  onLoad() {
    this.disposeAppResumeHandler = installAppResumeHandler();
    this.loginPageRoot = this.node.getChildByName(PAGE_BG_NAME) ?? this.node;
    this.registerPageRoot = this.node.getChildByName(REGISTER_PAGE_BG_NAME) ?? null;

    this.accountEdit = this.loginPageRoot.getChildByName(ACCOUNT_EDIT_NAME)?.getComponent(EditBox) ?? null;
    this.passwordEdit = this.loginPageRoot.getChildByName(PASSWORD_EDIT_NAME)?.getComponent(EditBox) ?? null;
    this.loginButton = this.loginPageRoot.getChildByName(LOGIN_BUTTON_NAME)?.getComponent(Button) ?? null;
    this.registerButton = this.loginPageRoot.getChildByName(REGISTER_BUTTON_NAME)?.getComponent(Button) ?? null;

    this.registerAccountEdit = this.registerPageRoot?.getChildByName(REGISTER_ACCOUNT_EDIT_NAME)?.getComponent(EditBox) ?? null;
    this.registerPasswordEdit = this.registerPageRoot?.getChildByName(REGISTER_PASSWORD_EDIT_NAME)?.getComponent(EditBox) ?? null;
    this.confirmPasswordEdit = this.registerPageRoot?.getChildByName(CONFIRM_PASSWORD_EDIT_NAME)?.getComponent(EditBox) ?? null;
    this.registerEndButton = this.registerPageRoot?.getChildByName(REGISTER_END_BUTTON_NAME)?.getComponent(Button) ?? null;
    this.backButton = this.registerPageRoot?.getChildByName(BACK_BUTTON_NAME)?.getComponent(Button) ?? null;

    if (!this.accountEdit || !this.passwordEdit || !this.loginButton || !this.registerButton) {
      console.warn('[LoginSceneController] Missing login scene nodes.');
      return;
    }

    this.loginButton.node.on(Button.EventType.CLICK, this.onLoginClicked, this);
    this.registerButton.node.on(Button.EventType.CLICK, this.onRegisterEntryClicked, this);

    if (
      this.registerPageRoot
      && this.registerAccountEdit
      && this.registerPasswordEdit
      && this.confirmPasswordEdit
      && this.registerEndButton
      && this.backButton
    ) {
      this.registerEndButton.node.on(Button.EventType.CLICK, this.onRegisterEndClicked, this);
      this.backButton.node.on(Button.EventType.CLICK, this.onBackClicked, this);
    } else {
      console.warn('[LoginSceneController] Missing register scene nodes.');
    }

    const cachedSession = AuthSession.load();
    if (cachedSession) {
      this.accountEdit.string = cachedSession.account;
    }

    this.showLoginPage();
  }

  start() {
    this.scheduleOnce(() => {
      void this.reportPendingLogout();
    });
  }

  onDestroy() {
    this.disposeAppResumeHandler?.();
    this.disposeAppResumeHandler = null;

    const loginNode = this.loginButton?.node;
    if (loginNode?.isValid) {
      loginNode.off(Button.EventType.CLICK, this.onLoginClicked, this);
    }

    const registerNode = this.registerButton?.node;
    if (registerNode?.isValid) {
      registerNode.off(Button.EventType.CLICK, this.onRegisterEntryClicked, this);
    }

    const registerEndNode = this.registerEndButton?.node;
    if (registerEndNode?.isValid) {
      registerEndNode.off(Button.EventType.CLICK, this.onRegisterEndClicked, this);
    }

    const backNode = this.backButton?.node;
    if (backNode?.isValid) {
      backNode.off(Button.EventType.CLICK, this.onBackClicked, this);
    }
  }

  private async reportPendingLogout() {
    const accessToken = AuthSession.loadPendingLogout();
    if (!accessToken) {
      return;
    }

    try {
      await this.authApi.logout(accessToken);
      AuthSession.clearPendingLogout(accessToken);
    } catch (error) {
      console.warn('[LoginSceneController] Pending logout report failed.', error);
    }
  }

  private async onLoginClicked() {
    await this.submitLogin();
  }

  private onRegisterEntryClicked() {
    this.showRegisterPage();
  }

  private onBackClicked() {
    this.showLoginPage();
  }

  private async onRegisterEndClicked() {
    await this.submitRegisterAndLogin();
  }

  private async submitLogin() {
    if (this.pending) {
      return;
    }

    const account = this.accountEdit?.string.trim() ?? '';
    const password = this.passwordEdit?.string ?? '';
    const validationMessage = this.validateInput(account, password);
    if (validationMessage) {
      console.warn(`[LoginSceneController] ${validationMessage}`);
      return;
    }

    this.pending = true;
    this.setAllButtonsInteractable(false);

    try {
      const session = await this.authApi.login({ account, password });
      AuthSession.save(session);
      director.loadScene('HomeScene');
    } catch (error) {
      console.error(
        '[LoginSceneController]',
        error instanceof Error ? error.message : '请求失败，请检查鉴权服务。',
      );
    } finally {
      this.pending = false;
      this.setAllButtonsInteractable(true);
    }
  }

  private async submitRegisterAndLogin() {
    if (this.pending) {
      return;
    }

    const account = this.registerAccountEdit?.string.trim() ?? '';
    const password = this.registerPasswordEdit?.string ?? '';
    const confirmPassword = this.confirmPasswordEdit?.string ?? '';

    const validationMessage = this.validateInput(account, password);
    if (validationMessage) {
      console.warn(`[LoginSceneController] ${validationMessage}`);
      return;
    }

    if (password !== confirmPassword) {
      console.warn('[LoginSceneController] 两次输入的密码不一致。');
      return;
    }

    this.pending = true;
    this.setAllButtonsInteractable(false);

    try {
      await this.authApi.register({ account, password });
      const session = await this.authApi.login({ account, password });
      AuthSession.save(session);
      director.loadScene('HomeScene');
    } catch (error) {
      console.error(
        '[LoginSceneController]',
        error instanceof Error ? error.message : '请求失败，请检查鉴权服务。',
      );
    } finally {
      this.pending = false;
      this.setAllButtonsInteractable(true);
    }
  }

  private validateInput(account: string, password: string): string | null {
    if (!account) {
      return '请输入账号。';
    }
    if (account.length < 4 || account.length > 24) {
      return '账号长度需要在 4 到 24 个字符之间。';
    }
    if (!/^[A-Za-z0-9_]+$/.test(account)) {
      return '账号只支持字母、数字和下划线。';
    }
    if (!password) {
      return '请输入密码。';
    }
    if (password.length < 6 || password.length > 32) {
      return '密码长度需要在 6 到 32 个字符之间。';
    }
    return null;
  }

  private showLoginPage() {
    if (this.pending) {
      return;
    }

    if (this.loginPageRoot) {
      this.loginPageRoot.active = true;
    }

    if (this.registerPageRoot) {
      this.registerPageRoot.active = false;
    }
  }

  private showRegisterPage() {
    if (this.pending) {
      return;
    }

    if (this.loginPageRoot) {
      this.loginPageRoot.active = false;
    }

    if (this.registerPageRoot) {
      this.registerPageRoot.active = true;
    }
  }

  private setAllButtonsInteractable(interactable: boolean) {
    if (this.loginButton) {
      this.loginButton.interactable = interactable;
    }
    if (this.registerButton) {
      this.registerButton.interactable = interactable;
    }
    if (this.registerEndButton) {
      this.registerEndButton.interactable = interactable;
    }
    if (this.backButton) {
      this.backButton.interactable = interactable;
    }
  }
}
