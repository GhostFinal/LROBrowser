import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Native VM fixtures execute slices of the packaged runtime. Supply the same
// imported helpers as the full runtime, rather than replacing them with mocks.
export const assistantInput = await import(pathToFileURL(resolve('generated/core/runtime/lro-assistant-input.mjs')).href);
export const assistantDom = await import(pathToFileURL(resolve('generated/core/runtime/lro-assistant-dom.mjs')).href);
