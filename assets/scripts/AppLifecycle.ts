import { Camera, director, Director, game, Game } from 'cc';

export function installAppResumeHandler(): () => void {
  const refreshActiveCameras = () => {
    const scene = director.getScene();
    if (!scene) {
      return;
    }

    for (const camera of scene.getComponentsInChildren(Camera)) {
      if (!camera.enabled) {
        continue;
      }

      camera.enabled = false;
      camera.enabled = true;
    }
  };

  const handleShow = () => {
    game.resume();
    director.resume();
    director.once(Director.EVENT_AFTER_UPDATE, refreshActiveCameras);
  };

  game.on(Game.EVENT_SHOW, handleShow);

  return () => {
    game.off(Game.EVENT_SHOW, handleShow);
    director.off(Director.EVENT_AFTER_UPDATE, refreshActiveCameras);
  };
}