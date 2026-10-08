/// <reference lib="webworker" />
/** Web Worker entry: thin adapter around RouterService. */

import type { RouterRequest } from './protocol';
import { RouterService } from './service';

declare const self: DedicatedWorkerGlobalScope;
const service = new RouterService();

self.onmessage = (ev: MessageEvent<RouterRequest>) => {
  const res = service.handle(ev.data);
  const transfer = res.type === 'roads' ? [res.roads.coords.buffer, res.roads.offsets.buffer, res.roads.classes.buffer] : [];
  self.postMessage(res, transfer);
};
