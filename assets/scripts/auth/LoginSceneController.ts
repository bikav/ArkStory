import {
  _decorator,
  Button,
  Color,
  Component,
  director,
  EditBox,
  Label,
  Node,
  UITransform,
} from 'cc';
import { AuthApi } from './AuthApi';
import { AuthSession } from './AuthSession';

const { ccclass } = _decorator;

const ACCOUNT_EDIT_NAME = 'AccountEdit';
const PASSWORD_EDIT_NAME = 'PasswordEdit';
const LOGIN_BUTTON_NAME = 'LoginButton';
const REGISTER_BUTTON_NAME = 'RegisterButton';
const STATUS_LABEL_NAME = 'LoginStatusLabel';

@ccclass('LoginSceneController')
export class LoginSceneController extends Component {
  private readonly authApi = new AuthApi();

  private accountEdit: EditBox | null = null;
  private passwordEdit: EditBox | null = null;
  private loginButton: Button | null = null;
  private registerButton: Button | null = null;
  private statusLabel: Label | null = null;
  private pending = false;

  onLoad() {
    this.accountEdit = this.node.getChildByName(ACCOUNT_EDIT_NAME)?.getComponent(EditBox) ?? null;
    this.passwordEdit = this.node.getChildByName(PASSWORD_EDIT_NAME)?.getComponent(EditBox) ?? null;
    this.loginButton = this.node.getChildByName(LOGIN_BUTTON_NAME)?.getComponent(Button) ?? null;
    this.registerButton = this.node.getChildByName(REGISTER_BUTTON_NAME)?.getComponent(Button) ?? null;
    this.statusLabel = this.ensureStatusLabel();

    if (!this.accountEdit || !this.passwordEdit || !this.loginButton || !this.registerButton) {
      console.warn('[LoginSceneController] Missing login scene nodes.');
      this.setStatus('登录节点未绑定完整，请检查 LoginScene。', true);
      return;
    }

    this.loginButton.node.on(Button.EventType.CLICK, this.onLoginClicked, this);
    this.registerButton.node.on(Button.EventType.CLICK, this.onRegisterClicked, this);

    const cachedSession = AuthSession.load();
    if (cachedSession) {
      this.setStatus(`检测到上次登录账号：${cachedSession.account}`, false);
      this.accountEdit.string = cachedSession.account;
    } else {
      this.setStatus('请输入账号和密码。', false);
    }
  }

  onDestroy() {
    const loginNode = this.loginButton?.node;
    if (loginNode?.isValid) {
      loginNode.off(Button.EventType.CLICK, this.onLoginClicked, this);
    }

    const registerNode = this.registerButton?.node;
    if (registerNode?.isValid) {
      registerNode.off(Button.EventType.CLICK, this.onRegisterClicked, this);
    }
  }

  private ensureStatusLabel(): Label {
    let statusNode = this.node.getChildByName(STATUS_LABEL_NAME);
    if (!statusNode) {
      statusNode = new Node(STATUS_LABEL_NAME);
      statusNode.layer = this.node.layer;
      this.node.addChild(statusNode);
      statusNode.setPosition(0, -90, 0);

      const transform = statusNode.addComponent(UITransform);
      transform.setContentSize(560, 80);

      const label = statusNode.addComponent(Label);
      label.fontSize = 26;
      label.lineHeight = 32;
      label.horizontalAlign = Label.HorizontalAlign.CENTER;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.overflow = Label.Overflow.SHRINK;
      return label;
    }

    return statusNode.getComponent(Label) ?? statusNode.addComponent(Label);
  }

  private async onLoginClicked() {
    await this.submitAuth('login');
  }

  private async onRegisterClicked() {
    await this.submitAuth('register');
  }

  private async submitAuth(mode: 'login' | 'register') {
    if (this.pending) {
      return;
    }

    const account = this.accountEdit?.string.trim() ?? '';
    const password = this.passwordEdit?.string ?? '';
    const validationMessage = this.validateInput(account, password);
    if (validationMessage) {
      this.setStatus(validationMessage, true);
      return;
    }

    this.pending = true;
    this.setButtonsInteractable(false);
    this.setStatus(mode === 'login' ? '正在登录...' : '正在注册账号...', false);

    try {
      const session = mode === 'login'
        ? await this.authApi.login({ account, password })
        : await this.authApi.register({ account, password });

      AuthSession.save(session);
      this.setStatus(`${mode === 'login' ? '登录' : '注册'}成功，正在进入 HomeScene...`, false);
      director.loadScene('HomeScene');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : '请求失败，请检查鉴权服务。', true);
    } finally {
      this.pending = false;
      this.setButtonsInteractable(true);
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

  private setButtonsInteractable(interactable: boolean) {
    if (this.loginButton) {
      this.loginButton.interactable = interactable;
    }
    if (this.registerButton) {
      this.registerButton.interactable = interactable;
    }
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
}
