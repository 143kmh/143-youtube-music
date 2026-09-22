import { test, expect } from '@playwright/test';
import { Window } from 'happy-dom';
import { installPlaybackKeyboard } from '../src/features/143-ui/playback-keyboard';

test('Space toggles once without a player click, preserves text entry and cleans up', () => {
  const dom = new Window();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.document });
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: dom.Element });
  let toggles = 0;
  let nativeKeys = 0;
  dom.document.body.addEventListener('keydown', () => nativeKeys++);
  const dispose = installPlaybackKeyboard({ togglePlayback: () => toggles++ });
  const press = (target = dom.document.body, options = {}) => {
    const event = new dom.KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return event;
  };
  expect(press().defaultPrevented).toBe(true);
  press(dom.document.body, { repeat: true });
  expect(toggles).toBe(1);
  expect(nativeKeys).toBe(0);
  const input = dom.document.createElement('input');
  dom.document.body.append(input);
  expect(press(input).defaultPrevented).toBe(false);
  press(dom.document.body, { ctrlKey: true });
  expect(toggles).toBe(1);
  const button = dom.document.createElement('button');
  dom.document.body.append(button);
  press(button);
  expect(toggles).toBe(2);
  dispose();
  press();
  expect(toggles).toBe(2);
  dom.happyDOM.abort();
});

