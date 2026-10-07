/** Request/response transport to the router: a real Worker or in-process. */

import type { RouterRequest, RouterResponse } from './protocol';
import { RouterService } from './service';

type Payload<T> = T extends unknown ? Omit<T, 'id'> : never;
export type RouterCall = Payload<RouterRequest>;

export interface RouterPort {
  request(req: RouterCall, transfer?: Transferable[]): Promise<RouterResponse>;
}

/** Runs the service on the calling thread (tests, or fallback without Worker). */
export class LocalRouterPort implements RouterPort {
  private readonly service = new RouterService();
  private nextId = 1;

  async request(req: RouterCall): Promise<RouterResponse> {
    return this.service.handle({ ...req, id: this.nextId++ } as RouterRequest);
  }
}

/** Correlates worker responses with requests by id. */
export class WorkerRouterPort implements RouterPort {
  private nextId = 1;
  private readonly pending = new Map<number, (r: RouterResponse) => void>();

  constructor(private readonly worker: Worker) {
    worker.onmessage = (ev: MessageEvent<RouterResponse>) => {
      const resolve = this.pending.get(ev.data.id);
      if (resolve) {
        this.pending.delete(ev.data.id);
        resolve(ev.data);
      }
    };
  }

  request(req: RouterCall, transfer: Transferable[] = []): Promise<RouterResponse> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ ...req, id }, transfer);
    });
  }
}
