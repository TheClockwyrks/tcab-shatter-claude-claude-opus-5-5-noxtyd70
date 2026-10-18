// The five screens' menus: their entries, the hit region each entry occupies,
// and how keys, a pointer, and touch contacts move the highlight and confirm.

import type { DeepReadonly } from "ts-essentials";
import { FIELD_W, GAMEOVER_ITEMS, PAUSE_ITEMS, TITLE_ITEMS } from "./constants";
import type { MenuPress, Screen, ShatterState } from "./game";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const ITEM_W = 380;
const ITEM_H = 54;
const ITEM_GAP = 14;

/** Where each screen's menu begins, the top of its first entry. */
const MENU_TOP: Readonly<Partial<Record<Screen, number>>> = {
  title: 420,
  paused: 300,
  gameover: 440,
};

/** The entries of the menu `screen` shows, empty on a screen without one. */
export function menuItems(screen: Screen): readonly string[] {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "gameover":
      return GAMEOVER_ITEMS;
    default:
      return [];
  }
}

/** The hit region of entry `index` on `screen`'s menu, or `null` for none. */
export function itemRect(screen: Screen, index: number): Rect | null {
  const top = MENU_TOP[screen];
  const count = menuItems(screen).length;
  if (top === undefined || !Number.isInteger(index)) return null;
  if (index < 0 || index >= count) return null;
  return {
    x: (FIELD_W - ITEM_W) / 2,
    y: top + index * (ITEM_H + ITEM_GAP),
    w: ITEM_W,
    h: ITEM_H,
  };
}

/** The entry on `screen`'s menu whose region holds `(x, y)`, or `-1`. */
export function itemAt(screen: Screen, x: number, y: number): number {
  const count = menuItems(screen).length;
  for (let i = 0; i < count; i += 1) {
    const r = itemRect(screen, i);
    if (r !== null && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
      return i;
  }
  return -1;
}

/** One pointer sample, as far as the menus read it. */
export interface MenuSample {
  readonly type: "down" | "move" | "up";
  readonly x: number;
  readonly y: number;
  readonly id: number;
}

/** What one frame's input asks of a menu. */
export interface MenuInput {
  readonly up: boolean;
  readonly down: boolean;
  readonly confirm: boolean;
  readonly samples: readonly MenuSample[];
}

/** The menu after a frame's input: the highlight and any entry confirmed. */
export interface MenuOutcome {
  readonly index: number;
  readonly confirmed: number | null;
  readonly presses: readonly MenuPress[];
}

/**
 * Applies a frame's menu input. Key movement goes first and wraps at both ends;
 * the pointer and touch samples follow in arrival order, so a pointer selection
 * on the same frame wins the highlight. A key confirm takes the key's entry
 * even when a pointer confirm arrives on the same frame.
 */
export function runMenu(
  state: DeepReadonly<ShatterState>,
  input: MenuInput,
): MenuOutcome {
  const count = menuItems(state.screen).length;
  let index = state.menuIndex;
  if (input.up) index = (((index - 1) % count) + count) % count;
  if (input.down) index = (((index + 1) % count) + count) % count;
  const keyConfirm = input.confirm ? index : null;

  let pointerConfirm: number | null = null;
  const presses = new Map<number, number>(
    state.menuPresses.map((p) => [p.id, p.index]),
  );
  for (const sample of input.samples) {
    const at = itemAt(state.screen, sample.x, sample.y);
    if (at >= 0) index = at;
    if (sample.type === "down") {
      presses.set(sample.id, at);
    } else if (sample.type === "up") {
      const from = presses.get(sample.id);
      presses.delete(sample.id);
      if (at >= 0 && from === at) pointerConfirm = at;
    }
  }

  const confirmed = keyConfirm ?? pointerConfirm;
  return {
    index: confirmed ?? index,
    confirmed,
    presses: [...presses].map(([id, i]) => ({ id, index: i })),
  };
}
