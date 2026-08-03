import type { ValidationMode } from './types';

export type ValidationTrigger = 'manual' | 'save' | 'type';

export function shouldValidate(mode: ValidationMode, trigger: ValidationTrigger): boolean {
  if (trigger === 'manual') {
    return true;
  }
  if (mode === 'manual') {
    return false;
  }
  if (mode === 'save') {
    return trigger === 'save';
  }
  if (mode === 'type') {
    return trigger === 'type';
  }
  return trigger === 'save' || trigger === 'type';
}

export class DebouncedValidationScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  schedule(key: string, callback: () => void, delayMs: number): void {
    this.cancel(key);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      callback();
    }, delayMs);
    this.timers.set(key, timer);
  }

  cancel(key: string): void {
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(key);
    }
  }

  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
