import { AsyncLocalStorage } from "node:async_hooks";
/** Lets a report that is being written be stopped: each run remembers its "epoch"; stopping bumps it and the old run throws at its next step. */
const epochs = new Map<number, number>();
export const stopped = "Stopped";
export const als = new AsyncLocalStorage<{ rid: number; epoch: number }>();
export const startRun = <T>(rid: number, fn: () => Promise<T>) => als.run({ rid, epoch: epochs.get(rid) ?? 0 }, fn);
export const stopRun = (rid: number) => epochs.set(rid, (epochs.get(rid) ?? 0) + 1);
export function checkCancel() { const s = als.getStore(); if (s && s.epoch !== (epochs.get(s.rid) ?? 0)) throw new Error(stopped); }
