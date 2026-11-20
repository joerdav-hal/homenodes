// Home Assistant can't cancel a WebSocket query, so the panel bounds how long it waits and ignores
// replies that a newer request has made pointless.

export class TimeoutError extends Error {
  /** @param {number} ms */
  constructor(ms) { super(`No answer after ${Math.round(ms / 1000)} s`); this.name = "TimeoutError"; }
}

/**
 * The promise's result, or a TimeoutError once ms have passed.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
export const within = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

/** Tickets per kind of request; only the newest ticket of a kind is still current. */
export class Latest {
  constructor() { /** @type {Map<string, number>} */ this._n = new Map(); }
  /** @param {string} kind @returns {() => boolean} Whether this is still the newest request of its kind. */
  take(kind) {
    const n = (this._n.get(kind) || 0) + 1;
    this._n.set(kind, n);
    return () => this._n.get(kind) === n;
  }
  /** Makes every outstanding ticket stale, as when the panel goes away. */
  cancelAll() { for (const k of this._n.keys()) this._n.set(k, (this._n.get(k) || 0) + 1); }
}

/** A short reason for an error from Home Assistant or a timeout. @param {any} e */
export const reason = (e) => String(e?.message || e?.code || e || "error").slice(0, 200);
