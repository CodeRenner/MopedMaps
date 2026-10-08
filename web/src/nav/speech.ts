/** Speak texts with the device's speech synthesis; on/off stored per device. */

import { getLocale } from '../i18n';
import type { KeyValueStorage } from '../ui/profileStore';

export const VOICE_STORAGE_KEY = 'mopedmaps.voice.v1';

export function loadVoiceOn(storage: KeyValueStorage | null): boolean {
  try {
    return storage?.getItem(VOICE_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveVoiceOn(storage: KeyValueStorage | null, on: boolean): void {
  try {
    storage?.setItem(VOICE_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // ignore
  }
}

export const speechAvailable = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Say a text now (interrupting an older announcement). */
export function speak(text: string): void {
  if (!speechAvailable()) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = getLocale() === 'de' ? 'de-DE' : 'en-GB';
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}
