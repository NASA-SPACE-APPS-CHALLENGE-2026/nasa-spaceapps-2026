import type { SourceDeps } from '../sources/types';
import { serverCache } from './cache';

export function serverDeps(): SourceDeps {
  return { fetch: globalThis.fetch.bind(globalThis), cache: serverCache(), env: process.env };
}
