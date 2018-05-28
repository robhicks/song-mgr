import { Storage } from './Storage.mjs';
import ls from '../node_modules/localforage/src/localforage.js';

export const db = new Storage(ls);
