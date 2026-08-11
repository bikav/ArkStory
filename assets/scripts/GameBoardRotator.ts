import { _decorator, Component, director, EventMouse, EventTouch, input, Input, Node, Quat, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('GameBoardRotator')
export class GameBoardRotator extends Component {
  @property
  public rotationSpeed = 0.25;

  @property
  public minPitch = 40;

  @property
  public maxPitch = 140;

  @property
  public boardNodeName = 'Game Board';

  private boardNode: Node | null = null;
  private isDragging = false;
  private currentRotation = new Quat();
  private tempQuat = new Quat();
  private tempEuler = new Vec3();

  onLoad() {
    this.tryBindBoardNode();
    this.syncFromBoard();
  }

  onEnable() {
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
  }

  onDisable() {
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
  }

  private onTouchStart(_event: EventTouch) {
    this.isDragging = true;
  }

  private onTouchMove(event: EventTouch) {
    if (!this.isDragging) {
      return;
    }

    const delta = event.getDelta();
    this.rotateBoard(delta.x, delta.y);
  }

  private onTouchEnd(_event: EventTouch) {
    this.isDragging = false;
  }

  private onMouseDown(event: EventMouse) {
    if (event.getButton() !== EventMouse.BUTTON_LEFT) {
      return;
    }

    this.isDragging = true;
  }

  private onMouseMove(event: EventMouse) {
    if (!this.isDragging) {
      return;
    }

    this.rotateBoard(event.movementX, event.movementY);
  }

  private onMouseUp(_event: EventMouse) {
    this.isDragging = false;
  }

  private rotateBoard(deltaX: number, deltaY: number) {
    if (!this.tryBindBoardNode()) {
      return;
    }

    Quat.fromEuler(this.tempQuat, 0, deltaX * this.rotationSpeed, 0);
    Quat.multiply(this.currentRotation, this.tempQuat, this.currentRotation);

    Quat.fromEuler(this.tempQuat, -deltaY * this.rotationSpeed, 0, 0);
    Quat.multiply(this.currentRotation, this.currentRotation, this.tempQuat);

    this.clampPitch();
    this.boardNode!.setRotation(this.currentRotation);
  }

  private tryBindBoardNode(): boolean {
    if (this.boardNode && this.boardNode.isValid) {
      return true;
    }

    const scene = director.getScene();
    if (!scene) {
      return false;
    }

    this.boardNode = this.findNodeByName(scene, this.boardNodeName);
    return !!this.boardNode;
  }

  private syncFromBoard() {
    if (!this.tryBindBoardNode()) {
      return;
    }

    Quat.copy(this.currentRotation, this.boardNode!.rotation);
    this.clampPitch();
    this.boardNode!.setRotation(this.currentRotation);
  }

  private clampPitch() {
    Quat.toEuler(this.tempEuler, this.currentRotation);

    const pitch = this.clamp(this.normalizeAngle(this.tempEuler.x), this.minPitch, this.maxPitch);
    const yaw = this.normalizeAngle(this.tempEuler.y);
    const roll = this.normalizeAngle(this.tempEuler.z);

    Quat.fromEuler(this.currentRotation, pitch, yaw, roll);
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

  private normalizeAngle(angle: number): number {
    let normalized = angle % 360;
    if (normalized > 180) {
      normalized -= 360;
    } else if (normalized < -180) {
      normalized += 360;
    }
    return normalized;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
