// Anti-cheat helpers: disable copy/paste/right-click/keyboard shortcuts, fullscreen, violation detection.

export function attachInputBlockers(target: HTMLElement = document.body): () => void {
  const prevent = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  const blockKeys = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    // Block copy/paste/cut/select-all/print/save/find
    if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "a", "p", "s", "u", "f"].includes(k)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    // Block F12 (devtools), Ctrl+Shift+I/J/C
    if (k === "f12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k))) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  };

  target.addEventListener("copy", prevent as any);
  target.addEventListener("paste", prevent as any);
  target.addEventListener("cut", prevent as any);
  target.addEventListener("contextmenu", prevent as any);
  target.addEventListener("selectstart", prevent as any);
  target.addEventListener("dragstart", prevent as any);
  document.addEventListener("keydown", blockKeys, true);

  // Apply CSS to disable selection
  const prevSelect = target.style.userSelect;
  const prevWebkit = (target.style as any).webkitUserSelect;
  target.style.userSelect = "none";
  (target.style as any).webkitUserSelect = "none";

  return () => {
    target.removeEventListener("copy", prevent as any);
    target.removeEventListener("paste", prevent as any);
    target.removeEventListener("cut", prevent as any);
    target.removeEventListener("contextmenu", prevent as any);
    target.removeEventListener("selectstart", prevent as any);
    target.removeEventListener("dragstart", prevent as any);
    document.removeEventListener("keydown", blockKeys, true);
    target.style.userSelect = prevSelect;
    (target.style as any).webkitUserSelect = prevWebkit;
  };
}

export async function enterFullscreen(el: HTMLElement = document.documentElement): Promise<void> {
  const anyEl = el as any;
  try {
    if (anyEl.requestFullscreen) await anyEl.requestFullscreen();
    else if (anyEl.webkitRequestFullscreen) await anyEl.webkitRequestFullscreen();
    else if (anyEl.msRequestFullscreen) await anyEl.msRequestFullscreen();
  } catch {
    // user may deny — caller handles via fullscreenchange listener
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {}
}

export function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

export type ViolationType =
  | "tab_switch"
  | "window_blur"
  | "fullscreen_exit"
  | "visibility_hidden"
  | "copy_attempt"
  | "paste_attempt"
  | "context_menu"
  | "shortcut_blocked"
  | "screen_change";

export interface ViolationListenerOptions {
  onViolation: (type: ViolationType, details?: Record<string, unknown>) => void;
}

export function attachViolationListeners({ onViolation }: ViolationListenerOptions): () => void {
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      onViolation("visibility_hidden", { at: Date.now() });
    }
  };
  const onBlur = () => onViolation("window_blur", { at: Date.now() });
  const onFsChange = () => {
    if (!document.fullscreenElement) onViolation("fullscreen_exit", { at: Date.now() });
  };
  const onScreenChange = () => onViolation("screen_change", { at: Date.now() });

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onBlur);
  document.addEventListener("fullscreenchange", onFsChange);
  // Detect monitor changes (when supported)
  const mql = window.matchMedia("(min-resolution: 1dppx)");
  mql.addEventListener?.("change", onScreenChange);

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("fullscreenchange", onFsChange);
    mql.removeEventListener?.("change", onScreenChange);
  };
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
