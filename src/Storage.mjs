import { isJson } from "./isJson.mjs";

export class Storage {
  constructor(store, wsc, wss) {
    this.store = store;
  }

  clear() {
    if (this.store.clear) this.store.clear();
  }

  del(path) {
    if (this.store.del) return this.store.del(path);
    else if (this.store.removeItem) return this.store.removeItem(path);
  }

  get(path) {
    if (this.store.get) return this.store.get(path).then(val => this.deserialize(val));
    else if (this.store.getItem) return this.store.getItem(path);
  }

  put(path, value) {
    if (this.store.put) return this.store.put(path, this.serialize(value));
    else if (this.store.setItem) return this.store.setItem(path, value);
  }

  serialize(val) {
    if (typeof val === "object") return JSON.stringify(val);
    return val;
  }

  deserialize(val) {
    return isJson(val) ? JSON.parse(val) : null;
  }
}
