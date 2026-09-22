import { DEFAULT_SETTINGS } from '../../src/shared/settings';
import type { DialogSnapshot, ElementKind, Settings, SnapshotElement } from '../../src/shared/types';

let counter = 0;

export function el(text: string, kind: ElementKind = 'button', extra: Partial<SnapshotElement> = {}): SnapshotElement {
  counter++;
  return {
    key: extra.key ?? `e${counter}`,
    kind,
    tag: kind === 'link' ? 'a' : kind === 'button' ? 'button' : 'input',
    id: extra.id ?? '',
    classes: extra.classes ?? '',
    text,
    ariaLabel: extra.ariaLabel ?? '',
    disabled: extra.disabled ?? false,
    ...(extra.checked !== undefined ? { checked: extra.checked } : {}),
  };
}

export function toggle(text: string, checked: boolean, extra: Partial<SnapshotElement> = {}): SnapshotElement {
  return el(text, 'switch', { ...extra, checked });
}

export function snap(elements: SnapshotElement[], opts: Partial<DialogSnapshot> = {}): DialogSnapshot {
  return {
    dialogText: opts.dialogText ?? 'We use cookies to improve your experience.',
    lang: opts.lang ?? 'en',
    cmpHint: opts.cmpHint ?? '',
    elements,
    round: opts.round ?? 1,
  };
}

export function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...patch, custom: { ...DEFAULT_SETTINGS.custom, ...(patch.custom ?? {}) }, openjev: { ...DEFAULT_SETTINGS.openjev, ...(patch.openjev ?? {}) } };
}

export function resetKeys(): void {
  counter = 0;
}

export class MemoryStore {
  data = new Map<string, unknown>();
  async get(key: string): Promise<unknown> {
    return this.data.get(key);
  }
  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, JSON.parse(JSON.stringify(value)));
  }
}
