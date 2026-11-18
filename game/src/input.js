// Keyboard, mouse and touch. Held keys give a driving direction; one-shot presses (start,
// pause, enter a car, mute) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. The mouse aims on foot and a
// click shoots; touch drags move or steer, a tap shoots, a double-tap enters a car. Space
// doubles as the handbrake while driving and as confirm on menus.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MUTE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, space: false };
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  const touch = { active: false, x: 0, y: 0, startX: 0, startY: 0, startTime: 0, moved: false };
  let lastTap = 0;

  function keyDown(event) {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (CONFIRM.has(event.code)) {
      held.space = event.code === 'Space' ? true : held.space;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  }

  function keyUp(event) {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (event.code === 'Space') held.space = false;
  }

  function pointerPos(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    held.space = false;
    mouse.down = false;
    touch.active = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') return;
    const pos = pointerPos(event);
    mouse.x = pos.x;
    mouse.y = pos.y;
    mouse.down = true;
    mouse.clicked = true;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const pos = pointerPos(event);
    mouse.x = pos.x;
    mouse.y = pos.y;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  canvas.addEventListener('touchstart', (event) => {
    event.preventDefault();
    const t = event.touches[0];
    const pos = pointerPos(t);
    touch.active = true;
    touch.x = pos.x;
    touch.y = pos.y;
    touch.startX = pos.x;
    touch.startY = pos.y;
    touch.startTime = performance.now();
    touch.moved = false;
  }, { passive: false });
  canvas.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const t = event.touches[0];
    const pos = pointerPos(t);
    touch.x = pos.x;
    touch.y = pos.y;
    if (Math.hypot(pos.x - touch.startX, pos.y - touch.startY) > 12) touch.moved = true;
  }, { passive: false });
  canvas.addEventListener('touchend', (event) => {
    event.preventDefault();
    touch.active = false;
    const now = performance.now();
    if (!touch.moved && now - touch.startTime < 250) {
      if (now - lastTap < 350) actions |= ACTION_ENTER;
      else mouse.clicked = true;
      mouse.x = touch.x;
      mouse.y = touch.y;
      lastTap = now;
    }
  }, { passive: false });

  return {
    mouse,
    touch,
    /** The driving direction this frame, with Space as the handbrake. */
    drive() {
      return {
        up: held.up,
        down: held.down,
        left: held.left,
        right: held.right,
        brake: held.space,
      };
    },
    /** Touch steering: a drag vector from the touch start, normalised, or null. */
    touchDrive() {
      if (!touch.active || !touch.moved) return null;
      const dx = touch.x - touch.startX;
      const dy = touch.y - touch.startY;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len, strength: Math.min(1, len / 80) };
    },
    /** One-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** True once when the pointer was clicked (or tapped) since the last call. */
    takeClick() {
      const clicked = mouse.clicked;
      mouse.clicked = false;
      return clicked;
    },
  };
}
