/// <reference lib="webworker" />
/** Web Worker entry: thin adapter around RouterService. */

import type { RouterRequest } from './protocol';
import { RouterService } from './service';

declare const self: DedicatedWorkerGlobalScope;
const service = new RouterService();

self.onmessage = (ev: MessageEvent<RouterRequest>) => {
  self.postMessage(service.handle(ev.data));
};
