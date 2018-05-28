export function clone(obj, hash = new WeakMap()) {
  if (Object(obj) !== obj) return obj; // primitives
  if (hash.has(obj)) return hash.get(obj); // cyclic reference
  const result = obj instanceof Date ? new Date(obj) :
    obj instanceof RegExp ? new RegExp(obj.source, obj.flags) :
    obj.constructor ? new obj.constructor() :
    Object.create(null);
  hash.set(obj, result);
  if (obj instanceof Map)
    Array.from(obj, ([key, val]) => result.set(key, clone(val, hash)));
  return Object.assign(result, ...Object.keys(obj).map(
    key => ({
      [key]: clone(obj[key], hash)
    })));
}
