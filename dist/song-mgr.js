function clone(obj, hash = new WeakMap()) {
  if (Object(obj) !== obj) return obj; // primitives
  if (hash.has(obj)) return hash.get(obj); // cyclic reference
  const result = obj instanceof Date ? new Date(obj) :
    obj instanceof RegExp ? new RegExp(obj.source, obj.flags) :
    obj.constructor ? new obj.constructor() :
    Object.create(null);
  hash.set(obj, result);
  return Object.assign(result, ...Object.keys(obj).map(
    key => ({
      [key]: clone(obj[key], hash)
    })));
}

function isJson(str) {
  try {
    let json = JSON.parse(str);
    return json;
  } catch (e) {
    return false;
  }
}

class Storage {
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

function getIDB() {
    /* global indexedDB,webkitIndexedDB,mozIndexedDB,OIndexedDB,msIndexedDB */
    try {
        if (typeof indexedDB !== 'undefined') {
            return indexedDB;
        }
        if (typeof webkitIndexedDB !== 'undefined') {
            return webkitIndexedDB;
        }
        if (typeof mozIndexedDB !== 'undefined') {
            return mozIndexedDB;
        }
        if (typeof OIndexedDB !== 'undefined') {
            return OIndexedDB;
        }
        if (typeof msIndexedDB !== 'undefined') {
            return msIndexedDB;
        }
    } catch (e) {
        return;
    }
}

var idb = getIDB();

function isIndexedDBValid() {
    try {
        // Initialize IndexedDB; fall back to vendor-prefixed versions
        // if needed.
        if (!idb) {
            return false;
        }
        // We mimic PouchDB here;
        //
        // We test for openDatabase because IE Mobile identifies itself
        // as Safari. Oh the lulz...
        var isSafari =
            typeof openDatabase !== 'undefined' &&
            /(Safari|iPhone|iPad|iPod)/.test(navigator.userAgent) &&
            !/Chrome/.test(navigator.userAgent) &&
            !/BlackBerry/.test(navigator.platform);

        var hasFetch =
            typeof fetch === 'function' &&
            fetch.toString().indexOf('[native code') !== -1;

        // Safari <10.1 does not meet our requirements for IDB support (#5572)
        // since Safari 10.1 shipped with fetch, we can use that to detect it
        return (
            (!isSafari || hasFetch) &&
            typeof indexedDB !== 'undefined' &&
            // some outdated implementations of IDB that appear on Samsung
            // and HTC Android devices <4.4 are missing IDBKeyRange
            // See: https://github.com/mozilla/localForage/issues/128
            // See: https://github.com/mozilla/localForage/issues/272
            typeof IDBKeyRange !== 'undefined'
        );
    } catch (e) {
        return false;
    }
}

// Abstracts constructing a Blob object, so it also works in older
// browsers that don't support the native Blob constructor. (i.e.
// old QtWebKit versions, at least).
// Abstracts constructing a Blob object, so it also works in older
// browsers that don't support the native Blob constructor. (i.e.
// old QtWebKit versions, at least).
function createBlob(parts, properties) {
    /* global BlobBuilder,MSBlobBuilder,MozBlobBuilder,WebKitBlobBuilder */
    parts = parts || [];
    properties = properties || {};
    try {
        return new Blob(parts, properties);
    } catch (e) {
        if (e.name !== 'TypeError') {
            throw e;
        }
        var Builder =
            typeof BlobBuilder !== 'undefined'
                ? BlobBuilder
                : typeof MSBlobBuilder !== 'undefined'
                  ? MSBlobBuilder
                  : typeof MozBlobBuilder !== 'undefined'
                    ? MozBlobBuilder
                    : WebKitBlobBuilder;
        var builder = new Builder();
        for (var i = 0; i < parts.length; i += 1) {
            builder.append(parts[i]);
        }
        return builder.getBlob(properties.type);
    }
}

// This is CommonJS because lie is an external dependency, so Rollup
// can just ignore it.
if (typeof Promise === 'undefined') {
    // In the "nopromises" build this will just throw if you don't have
    // a global promise object, but it would throw anyway later.
    require('lie/polyfill');
}

function executeCallback(promise, callback) {
    if (callback) {
        promise.then(
            function(result) {
                callback(null, result);
            },
            function(error) {
                callback(error);
            }
        );
    }
}

function executeTwoCallbacks(promise, callback, errorCallback) {
    if (typeof callback === 'function') {
        promise.then(callback);
    }

    if (typeof errorCallback === 'function') {
        promise.catch(errorCallback);
    }
}

function normalizeKey(key) {
    // Cast the key to a string, as that's all we can set as a key.
    if (typeof key !== 'string') {
        console.warn(`${key} used as a key, but it is not a string.`);
        key = String(key);
    }

    return key;
}

function getCallback() {
    if (
        arguments.length &&
        typeof arguments[arguments.length - 1] === 'function'
    ) {
        return arguments[arguments.length - 1];
    }
}

// Some code originally from async_storage.js in
// [Gaia](https://github.com/mozilla-b2g/gaia).

const DETECT_BLOB_SUPPORT_STORE = 'local-forage-detect-blob-support';
let supportsBlobs;
const dbContexts = {};
const toString = Object.prototype.toString;

// Transaction Modes
const READ_ONLY = 'readonly';
const READ_WRITE = 'readwrite';

// Transform a binary string to an array buffer, because otherwise
// weird stuff happens when you try to work with the binary string directly.
// It is known.
// From http://stackoverflow.com/questions/14967647/ (continues on next line)
// encode-decode-image-with-base64-breaks-image (2013-04-21)
function _binStringToArrayBuffer(bin) {
    var length = bin.length;
    var buf = new ArrayBuffer(length);
    var arr = new Uint8Array(buf);
    for (var i = 0; i < length; i++) {
        arr[i] = bin.charCodeAt(i);
    }
    return buf;
}

//
// Blobs are not supported in all versions of IndexedDB, notably
// Chrome <37 and Android <5. In those versions, storing a blob will throw.
//
// Various other blob bugs exist in Chrome v37-42 (inclusive).
// Detecting them is expensive and confusing to users, and Chrome 37-42
// is at very low usage worldwide, so we do a hacky userAgent check instead.
//
// content-type bug: https://code.google.com/p/chromium/issues/detail?id=408120
// 404 bug: https://code.google.com/p/chromium/issues/detail?id=447916
// FileReader bug: https://code.google.com/p/chromium/issues/detail?id=447836
//
// Code borrowed from PouchDB. See:
// https://github.com/pouchdb/pouchdb/blob/master/packages/node_modules/pouchdb-adapter-idb/src/blobSupport.js
//
function _checkBlobSupportWithoutCaching(idb$$1) {
    return new Promise(function(resolve) {
        var txn = idb$$1.transaction(DETECT_BLOB_SUPPORT_STORE, READ_WRITE);
        var blob = createBlob(['']);
        txn.objectStore(DETECT_BLOB_SUPPORT_STORE).put(blob, 'key');

        txn.onabort = function(e) {
            // If the transaction aborts now its due to not being able to
            // write to the database, likely due to the disk being full
            e.preventDefault();
            e.stopPropagation();
            resolve(false);
        };

        txn.oncomplete = function() {
            var matchedChrome = navigator.userAgent.match(/Chrome\/(\d+)/);
            var matchedEdge = navigator.userAgent.match(/Edge\//);
            // MS Edge pretends to be Chrome 42:
            // https://msdn.microsoft.com/en-us/library/hh869301%28v=vs.85%29.aspx
            resolve(
                matchedEdge ||
                    !matchedChrome ||
                    parseInt(matchedChrome[1], 10) >= 43
            );
        };
    }).catch(function() {
        return false; // error, so assume unsupported
    });
}

function _checkBlobSupport(idb$$1) {
    if (typeof supportsBlobs === 'boolean') {
        return Promise.resolve(supportsBlobs);
    }
    return _checkBlobSupportWithoutCaching(idb$$1).then(function(value) {
        supportsBlobs = value;
        return supportsBlobs;
    });
}

function _deferReadiness(dbInfo) {
    var dbContext = dbContexts[dbInfo.name];

    // Create a deferred object representing the current database operation.
    var deferredOperation = {};

    deferredOperation.promise = new Promise(function(resolve, reject) {
        deferredOperation.resolve = resolve;
        deferredOperation.reject = reject;
    });

    // Enqueue the deferred operation.
    dbContext.deferredOperations.push(deferredOperation);

    // Chain its promise to the database readiness.
    if (!dbContext.dbReady) {
        dbContext.dbReady = deferredOperation.promise;
    } else {
        dbContext.dbReady = dbContext.dbReady.then(function() {
            return deferredOperation.promise;
        });
    }
}

function _advanceReadiness(dbInfo) {
    var dbContext = dbContexts[dbInfo.name];

    // Dequeue a deferred operation.
    var deferredOperation = dbContext.deferredOperations.pop();

    // Resolve its promise (which is part of the database readiness
    // chain of promises).
    if (deferredOperation) {
        deferredOperation.resolve();
        return deferredOperation.promise;
    }
}

function _rejectReadiness(dbInfo, err) {
    var dbContext = dbContexts[dbInfo.name];

    // Dequeue a deferred operation.
    var deferredOperation = dbContext.deferredOperations.pop();

    // Reject its promise (which is part of the database readiness
    // chain of promises).
    if (deferredOperation) {
        deferredOperation.reject(err);
        return deferredOperation.promise;
    }
}

function _getConnection(dbInfo, upgradeNeeded) {
    return new Promise(function(resolve, reject) {
        dbContexts[dbInfo.name] = dbContexts[dbInfo.name] || createDbContext();

        if (dbInfo.db) {
            if (upgradeNeeded) {
                _deferReadiness(dbInfo);
                dbInfo.db.close();
            } else {
                return resolve(dbInfo.db);
            }
        }

        var dbArgs = [dbInfo.name];

        if (upgradeNeeded) {
            dbArgs.push(dbInfo.version);
        }

        var openreq = idb.open.apply(idb, dbArgs);

        if (upgradeNeeded) {
            openreq.onupgradeneeded = function(e) {
                var db = openreq.result;
                try {
                    db.createObjectStore(dbInfo.storeName);
                    if (e.oldVersion <= 1) {
                        // Added when support for blob shims was added
                        db.createObjectStore(DETECT_BLOB_SUPPORT_STORE);
                    }
                } catch (ex) {
                    if (ex.name === 'ConstraintError') {
                        console.warn(
                            'The database "' +
                                dbInfo.name +
                                '"' +
                                ' has been upgraded from version ' +
                                e.oldVersion +
                                ' to version ' +
                                e.newVersion +
                                ', but the storage "' +
                                dbInfo.storeName +
                                '" already exists.'
                        );
                    } else {
                        throw ex;
                    }
                }
            };
        }

        openreq.onerror = function(e) {
            e.preventDefault();
            reject(openreq.error);
        };

        openreq.onsuccess = function() {
            resolve(openreq.result);
            _advanceReadiness(dbInfo);
        };
    });
}

function _getOriginalConnection(dbInfo) {
    return _getConnection(dbInfo, false);
}

function _getUpgradedConnection(dbInfo) {
    return _getConnection(dbInfo, true);
}

function _isUpgradeNeeded(dbInfo, defaultVersion) {
    if (!dbInfo.db) {
        return true;
    }

    var isNewStore = !dbInfo.db.objectStoreNames.contains(dbInfo.storeName);
    var isDowngrade = dbInfo.version < dbInfo.db.version;
    var isUpgrade = dbInfo.version > dbInfo.db.version;

    if (isDowngrade) {
        // If the version is not the default one
        // then warn for impossible downgrade.
        if (dbInfo.version !== defaultVersion) {
            console.warn(
                'The database "' +
                    dbInfo.name +
                    '"' +
                    " can't be downgraded from version " +
                    dbInfo.db.version +
                    ' to version ' +
                    dbInfo.version +
                    '.'
            );
        }
        // Align the versions to prevent errors.
        dbInfo.version = dbInfo.db.version;
    }

    if (isUpgrade || isNewStore) {
        // If the store is new then increment the version (if needed).
        // This will trigger an "upgradeneeded" event which is required
        // for creating a store.
        if (isNewStore) {
            var incVersion = dbInfo.db.version + 1;
            if (incVersion > dbInfo.version) {
                dbInfo.version = incVersion;
            }
        }

        return true;
    }

    return false;
}

// encode a blob for indexeddb engines that don't support blobs
function _encodeBlob(blob) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onerror = reject;
        reader.onloadend = function(e) {
            var base64 = btoa(e.target.result || '');
            resolve({
                __local_forage_encoded_blob: true,
                data: base64,
                type: blob.type
            });
        };
        reader.readAsBinaryString(blob);
    });
}

// decode an encoded blob
function _decodeBlob(encodedBlob) {
    var arrayBuff = _binStringToArrayBuffer(atob(encodedBlob.data));
    return createBlob([arrayBuff], { type: encodedBlob.type });
}

// is this one of our fancy encoded blobs?
function _isEncodedBlob(value) {
    return value && value.__local_forage_encoded_blob;
}

// Specialize the default `ready()` function by making it dependent
// on the current database operations. Thus, the driver will be actually
// ready when it's been initialized (default) *and* there are no pending
// operations on the database (initiated by some other instances).
function _fullyReady(callback) {
    var self = this;

    var promise = self._initReady().then(function() {
        var dbContext = dbContexts[self._dbInfo.name];

        if (dbContext && dbContext.dbReady) {
            return dbContext.dbReady;
        }
    });

    executeTwoCallbacks(promise, callback, callback);
    return promise;
}

// Try to establish a new db connection to replace the
// current one which is broken (i.e. experiencing
// InvalidStateError while creating a transaction).
function _tryReconnect(dbInfo) {
    _deferReadiness(dbInfo);

    var dbContext = dbContexts[dbInfo.name];
    var forages = dbContext.forages;

    for (var i = 0; i < forages.length; i++) {
        const forage = forages[i];
        if (forage._dbInfo.db) {
            forage._dbInfo.db.close();
            forage._dbInfo.db = null;
        }
    }
    dbInfo.db = null;

    return _getOriginalConnection(dbInfo)
        .then(db => {
            dbInfo.db = db;
            if (_isUpgradeNeeded(dbInfo)) {
                // Reopen the database for upgrading.
                return _getUpgradedConnection(dbInfo);
            }
            return db;
        })
        .then(db => {
            // store the latest db reference
            // in case the db was upgraded
            dbInfo.db = dbContext.db = db;
            for (var i = 0; i < forages.length; i++) {
                forages[i]._dbInfo.db = db;
            }
        })
        .catch(err => {
            _rejectReadiness(dbInfo, err);
            throw err;
        });
}

// FF doesn't like Promises (micro-tasks) and IDDB store operations,
// so we have to do it with callbacks
function createTransaction(dbInfo, mode, callback, retries) {
    if (retries === undefined) {
        retries = 1;
    }

    try {
        var tx = dbInfo.db.transaction(dbInfo.storeName, mode);
        callback(null, tx);
    } catch (err) {
        if (
            retries > 0 &&
            (!dbInfo.db ||
                err.name === 'InvalidStateError' ||
                err.name === 'NotFoundError')
        ) {
            return Promise.resolve()
                .then(() => {
                    if (
                        !dbInfo.db ||
                        (err.name === 'NotFoundError' &&
                            !dbInfo.db.objectStoreNames.contains(
                                dbInfo.storeName
                            ) &&
                            dbInfo.version <= dbInfo.db.version)
                    ) {
                        // increase the db version, to create the new ObjectStore
                        if (dbInfo.db) {
                            dbInfo.version = dbInfo.db.version + 1;
                        }
                        // Reopen the database for upgrading.
                        return _getUpgradedConnection(dbInfo);
                    }
                })
                .then(() => {
                    return _tryReconnect(dbInfo).then(function() {
                        createTransaction(dbInfo, mode, callback, retries - 1);
                    });
                })
                .catch(callback);
        }

        callback(err);
    }
}

function createDbContext() {
    return {
        // Running localForages sharing a database.
        forages: [],
        // Shared database.
        db: null,
        // Database readiness (promise).
        dbReady: null,
        // Deferred operations on the database.
        deferredOperations: []
    };
}

// Open the IndexedDB database (automatically creates one if one didn't
// previously exist), using any options set in the config.
function _initStorage(options) {
    var self = this;
    var dbInfo = {
        db: null
    };

    if (options) {
        for (var i in options) {
            dbInfo[i] = options[i];
        }
    }

    // Get the current context of the database;
    var dbContext = dbContexts[dbInfo.name];

    // ...or create a new context.
    if (!dbContext) {
        dbContext = createDbContext();
        // Register the new context in the global container.
        dbContexts[dbInfo.name] = dbContext;
    }

    // Register itself as a running localForage in the current context.
    dbContext.forages.push(self);

    // Replace the default `ready()` function with the specialized one.
    if (!self._initReady) {
        self._initReady = self.ready;
        self.ready = _fullyReady;
    }

    // Create an array of initialization states of the related localForages.
    var initPromises = [];

    function ignoreErrors() {
        // Don't handle errors here,
        // just makes sure related localForages aren't pending.
        return Promise.resolve();
    }

    for (var j = 0; j < dbContext.forages.length; j++) {
        var forage = dbContext.forages[j];
        if (forage !== self) {
            // Don't wait for itself...
            initPromises.push(forage._initReady().catch(ignoreErrors));
        }
    }

    // Take a snapshot of the related localForages.
    var forages = dbContext.forages.slice(0);

    // Initialize the connection process only when
    // all the related localForages aren't pending.
    return Promise.all(initPromises)
        .then(function() {
            dbInfo.db = dbContext.db;
            // Get the connection or open a new one without upgrade.
            return _getOriginalConnection(dbInfo);
        })
        .then(function(db) {
            dbInfo.db = db;
            if (_isUpgradeNeeded(dbInfo, self._defaultConfig.version)) {
                // Reopen the database for upgrading.
                return _getUpgradedConnection(dbInfo);
            }
            return db;
        })
        .then(function(db) {
            dbInfo.db = dbContext.db = db;
            self._dbInfo = dbInfo;
            // Share the final connection amongst related localForages.
            for (var k = 0; k < forages.length; k++) {
                var forage = forages[k];
                if (forage !== self) {
                    // Self is already up-to-date.
                    forage._dbInfo.db = dbInfo.db;
                    forage._dbInfo.version = dbInfo.version;
                }
            }
        });
}

function getItem(key, callback) {
    var self = this;

    key = normalizeKey(key);

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                createTransaction(self._dbInfo, READ_ONLY, function(
                    err,
                    transaction
                ) {
                    if (err) {
                        return reject(err);
                    }

                    try {
                        var store = transaction.objectStore(
                            self._dbInfo.storeName
                        );
                        var req = store.get(key);

                        req.onsuccess = function() {
                            var value = req.result;
                            if (value === undefined) {
                                value = null;
                            }
                            if (_isEncodedBlob(value)) {
                                value = _decodeBlob(value);
                            }
                            resolve(value);
                        };

                        req.onerror = function() {
                            reject(req.error);
                        };
                    } catch (e) {
                        reject(e);
                    }
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

// Iterate over all items stored in database.
function iterate(iterator, callback) {
    var self = this;

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                createTransaction(self._dbInfo, READ_ONLY, function(
                    err,
                    transaction
                ) {
                    if (err) {
                        return reject(err);
                    }

                    try {
                        var store = transaction.objectStore(
                            self._dbInfo.storeName
                        );
                        var req = store.openCursor();
                        var iterationNumber = 1;

                        req.onsuccess = function() {
                            var cursor = req.result;

                            if (cursor) {
                                var value = cursor.value;
                                if (_isEncodedBlob(value)) {
                                    value = _decodeBlob(value);
                                }
                                var result = iterator(
                                    value,
                                    cursor.key,
                                    iterationNumber++
                                );

                                // when the iterator callback retuns any
                                // (non-`undefined`) value, then we stop
                                // the iteration immediately
                                if (result !== void 0) {
                                    resolve(result);
                                } else {
                                    cursor.continue();
                                }
                            } else {
                                resolve();
                            }
                        };

                        req.onerror = function() {
                            reject(req.error);
                        };
                    } catch (e) {
                        reject(e);
                    }
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);

    return promise;
}

function setItem(key, value, callback) {
    var self = this;

    key = normalizeKey(key);

    var promise = new Promise(function(resolve, reject) {
        var dbInfo;
        self
            .ready()
            .then(function() {
                dbInfo = self._dbInfo;
                if (toString.call(value) === '[object Blob]') {
                    return _checkBlobSupport(dbInfo.db).then(function(
                        blobSupport
                    ) {
                        if (blobSupport) {
                            return value;
                        }
                        return _encodeBlob(value);
                    });
                }
                return value;
            })
            .then(function(value) {
                createTransaction(self._dbInfo, READ_WRITE, function(
                    err,
                    transaction
                ) {
                    if (err) {
                        return reject(err);
                    }

                    try {
                        var store = transaction.objectStore(
                            self._dbInfo.storeName
                        );

                        // The reason we don't _save_ null is because IE 10 does
                        // not support saving the `null` type in IndexedDB. How
                        // ironic, given the bug below!
                        // See: https://github.com/mozilla/localForage/issues/161
                        if (value === null) {
                            value = undefined;
                        }

                        var req = store.put(value, key);

                        transaction.oncomplete = function() {
                            // Cast to undefined so the value passed to
                            // callback/promise is the same as what one would get out
                            // of `getItem()` later. This leads to some weirdness
                            // (setItem('foo', undefined) will return `null`), but
                            // it's not my fault localStorage is our baseline and that
                            // it's weird.
                            if (value === undefined) {
                                value = null;
                            }

                            resolve(value);
                        };
                        transaction.onabort = transaction.onerror = function() {
                            var err = req.error
                                ? req.error
                                : req.transaction.error;
                            reject(err);
                        };
                    } catch (e) {
                        reject(e);
                    }
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

function removeItem(key, callback) {
    var self = this;

    key = normalizeKey(key);

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                createTransaction(self._dbInfo, READ_WRITE, function(
                    err,
                    transaction
                ) {
                    if (err) {
                        return reject(err);
                    }

                    try {
                        var store = transaction.objectStore(
                            self._dbInfo.storeName
                        );
                        // We use a Grunt task to make this safe for IE and some
                        // versions of Android (including those used by Cordova).
                        // Normally IE won't like `.delete()` and will insist on
                        // using `['delete']()`, but we have a build step that
                        // fixes this for us now.
                        var req = store.delete(key);
                        transaction.oncomplete = function() {
                            resolve();
                        };

                        transaction.onerror = function() {
                            reject(req.error);
                        };

                        // The request will be also be aborted if we've exceeded our storage
                        // space.
                        transaction.onabort = function() {
                            var err = req.error
                                ? req.error
                                : req.transaction.error;
                            reject(err);
                        };
                    } catch (e) {
                        reject(e);
                    }
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

function clear(callback) {
    var self = this;

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                createTransaction(self._dbInfo, READ_WRITE, function(
                    err,
                    transaction
                ) {
                    if (err) {
                        return reject(err);
                    }

                    try {
                        var store = transaction.objectStore(
                            self._dbInfo.storeName
                        );
                        var req = store.clear();

                        transaction.oncomplete = function() {
                            resolve();
                        };

                        transaction.onabort = transaction.onerror = function() {
                            var err = req.error
                                ? req.error
                                : req.transaction.error;
                            reject(err);
                        };
                    } catch (e) {
                        reject(e);
                    }
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

function length(callback) {
    var self = this;

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                createTransaction(self._dbInfo, READ_ONLY, function(
                    err,
                    transaction
                ) {
                    if (err) {
                        return reject(err);
                    }

                    try {
                        var store = transaction.objectStore(
                            self._dbInfo.storeName
                        );
                        var req = store.count();

                        req.onsuccess = function() {
                            resolve(req.result);
                        };

                        req.onerror = function() {
                            reject(req.error);
                        };
                    } catch (e) {
                        reject(e);
                    }
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

function key(n, callback) {
    var self = this;

    var promise = new Promise(function(resolve, reject) {
        if (n < 0) {
            resolve(null);

            return;
        }

        self
            .ready()
            .then(function() {
                createTransaction(self._dbInfo, READ_ONLY, function(
                    err,
                    transaction
                ) {
                    if (err) {
                        return reject(err);
                    }

                    try {
                        var store = transaction.objectStore(
                            self._dbInfo.storeName
                        );
                        var advanced = false;
                        var req = store.openCursor();

                        req.onsuccess = function() {
                            var cursor = req.result;
                            if (!cursor) {
                                // this means there weren't enough keys
                                resolve(null);

                                return;
                            }

                            if (n === 0) {
                                // We have the first key, return it if that's what they
                                // wanted.
                                resolve(cursor.key);
                            } else {
                                if (!advanced) {
                                    // Otherwise, ask the cursor to skip ahead n
                                    // records.
                                    advanced = true;
                                    cursor.advance(n);
                                } else {
                                    // When we get here, we've got the nth key.
                                    resolve(cursor.key);
                                }
                            }
                        };

                        req.onerror = function() {
                            reject(req.error);
                        };
                    } catch (e) {
                        reject(e);
                    }
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

function keys(callback) {
    var self = this;

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                createTransaction(self._dbInfo, READ_ONLY, function(
                    err,
                    transaction
                ) {
                    if (err) {
                        return reject(err);
                    }

                    try {
                        var store = transaction.objectStore(
                            self._dbInfo.storeName
                        );
                        var req = store.openCursor();
                        var keys = [];

                        req.onsuccess = function() {
                            var cursor = req.result;

                            if (!cursor) {
                                resolve(keys);
                                return;
                            }

                            keys.push(cursor.key);
                            cursor.continue();
                        };

                        req.onerror = function() {
                            reject(req.error);
                        };
                    } catch (e) {
                        reject(e);
                    }
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

function dropInstance(options, callback) {
    callback = getCallback.apply(this, arguments);

    var currentConfig = this.config();
    options = (typeof options !== 'function' && options) || {};
    if (!options.name) {
        options.name = options.name || currentConfig.name;
        options.storeName = options.storeName || currentConfig.storeName;
    }

    var self = this;
    var promise;
    if (!options.name) {
        promise = Promise.reject('Invalid arguments');
    } else {
        const isCurrentDb =
            options.name === currentConfig.name && self._dbInfo.db;

        const dbPromise = isCurrentDb
            ? Promise.resolve(self._dbInfo.db)
            : _getOriginalConnection(options).then(db => {
                  const dbContext = dbContexts[options.name];
                  const forages = dbContext.forages;
                  dbContext.db = db;
                  for (var i = 0; i < forages.length; i++) {
                      forages[i]._dbInfo.db = db;
                  }
                  return db;
              });

        if (!options.storeName) {
            promise = dbPromise.then(db => {
                _deferReadiness(options);

                const dbContext = dbContexts[options.name];
                const forages = dbContext.forages;

                db.close();
                for (var i = 0; i < forages.length; i++) {
                    const forage = forages[i];
                    forage._dbInfo.db = null;
                }

                const dropDBPromise = new Promise((resolve, reject) => {
                    var req = idb.deleteDatabase(options.name);

                    req.onerror = req.onblocked = err => {
                        const db = req.result;
                        if (db) {
                            db.close();
                        }
                        reject(err);
                    };

                    req.onsuccess = () => {
                        const db = req.result;
                        if (db) {
                            db.close();
                        }
                        resolve(db);
                    };
                });

                return dropDBPromise
                    .then(db => {
                        dbContext.db = db;
                        for (var i = 0; i < forages.length; i++) {
                            const forage = forages[i];
                            _advanceReadiness(forage._dbInfo);
                        }
                    })
                    .catch(err => {
                        (
                            _rejectReadiness(options, err) || Promise.resolve()
                        ).catch(() => {});
                        throw err;
                    });
            });
        } else {
            promise = dbPromise.then(db => {
                if (!db.objectStoreNames.contains(options.storeName)) {
                    return;
                }

                const newVersion = db.version + 1;

                _deferReadiness(options);

                const dbContext = dbContexts[options.name];
                const forages = dbContext.forages;

                db.close();
                for (let i = 0; i < forages.length; i++) {
                    const forage = forages[i];
                    forage._dbInfo.db = null;
                    forage._dbInfo.version = newVersion;
                }

                const dropObjectPromise = new Promise((resolve, reject) => {
                    const req = idb.open(options.name, newVersion);

                    req.onerror = err => {
                        const db = req.result;
                        db.close();
                        reject(err);
                    };

                    req.onupgradeneeded = () => {
                        var db = req.result;
                        db.deleteObjectStore(options.storeName);
                    };

                    req.onsuccess = () => {
                        const db = req.result;
                        db.close();
                        resolve(db);
                    };
                });

                return dropObjectPromise
                    .then(db => {
                        dbContext.db = db;
                        for (let j = 0; j < forages.length; j++) {
                            const forage = forages[j];
                            forage._dbInfo.db = db;
                            _advanceReadiness(forage._dbInfo);
                        }
                    })
                    .catch(err => {
                        (
                            _rejectReadiness(options, err) || Promise.resolve()
                        ).catch(() => {});
                        throw err;
                    });
            });
        }
    }

    executeCallback(promise, callback);
    return promise;
}

var asyncStorage = {
    _driver: 'asyncStorage',
    _initStorage: _initStorage,
    _support: isIndexedDBValid(),
    iterate: iterate,
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    clear: clear,
    length: length,
    key: key,
    keys: keys,
    dropInstance: dropInstance
};

function isWebSQLValid() {
    return typeof openDatabase === 'function';
}

/* eslint-disable no-bitwise */

// Sadly, the best way to save binary data in WebSQL/localStorage is serializing
// it to Base64, so this is how we store it to prevent very strange errors with less
// verbose ways of binary <-> string data storage.
var BASE_CHARS =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

var BLOB_TYPE_PREFIX = '~~local_forage_type~';
var BLOB_TYPE_PREFIX_REGEX = /^~~local_forage_type~([^~]+)~/;

var SERIALIZED_MARKER = '__lfsc__:';
var SERIALIZED_MARKER_LENGTH = SERIALIZED_MARKER.length;

// OMG the serializations!
var TYPE_ARRAYBUFFER = 'arbf';
var TYPE_BLOB = 'blob';
var TYPE_INT8ARRAY = 'si08';
var TYPE_UINT8ARRAY = 'ui08';
var TYPE_UINT8CLAMPEDARRAY = 'uic8';
var TYPE_INT16ARRAY = 'si16';
var TYPE_INT32ARRAY = 'si32';
var TYPE_UINT16ARRAY = 'ur16';
var TYPE_UINT32ARRAY = 'ui32';
var TYPE_FLOAT32ARRAY = 'fl32';
var TYPE_FLOAT64ARRAY = 'fl64';
var TYPE_SERIALIZED_MARKER_LENGTH =
    SERIALIZED_MARKER_LENGTH + TYPE_ARRAYBUFFER.length;

var toString$1 = Object.prototype.toString;

function stringToBuffer(serializedString) {
    // Fill the string into a ArrayBuffer.
    var bufferLength = serializedString.length * 0.75;
    var len = serializedString.length;
    var i;
    var p = 0;
    var encoded1, encoded2, encoded3, encoded4;

    if (serializedString[serializedString.length - 1] === '=') {
        bufferLength--;
        if (serializedString[serializedString.length - 2] === '=') {
            bufferLength--;
        }
    }

    var buffer = new ArrayBuffer(bufferLength);
    var bytes = new Uint8Array(buffer);

    for (i = 0; i < len; i += 4) {
        encoded1 = BASE_CHARS.indexOf(serializedString[i]);
        encoded2 = BASE_CHARS.indexOf(serializedString[i + 1]);
        encoded3 = BASE_CHARS.indexOf(serializedString[i + 2]);
        encoded4 = BASE_CHARS.indexOf(serializedString[i + 3]);

        /*jslint bitwise: true */
        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }
    return buffer;
}

// Converts a buffer to a string to store, serialized, in the backend
// storage library.
function bufferToString(buffer) {
    // base64-arraybuffer
    var bytes = new Uint8Array(buffer);
    var base64String = '';
    var i;

    for (i = 0; i < bytes.length; i += 3) {
        /*jslint bitwise: true */
        base64String += BASE_CHARS[bytes[i] >> 2];
        base64String += BASE_CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
        base64String +=
            BASE_CHARS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
        base64String += BASE_CHARS[bytes[i + 2] & 63];
    }

    if (bytes.length % 3 === 2) {
        base64String = base64String.substring(0, base64String.length - 1) + '=';
    } else if (bytes.length % 3 === 1) {
        base64String =
            base64String.substring(0, base64String.length - 2) + '==';
    }

    return base64String;
}

// Serialize a value, afterwards executing a callback (which usually
// instructs the `setItem()` callback/promise to be executed). This is how
// we store binary data with localStorage.
function serialize(value, callback) {
    var valueType = '';
    if (value) {
        valueType = toString$1.call(value);
    }

    // Cannot use `value instanceof ArrayBuffer` or such here, as these
    // checks fail when running the tests using casper.js...
    //
    // TODO: See why those tests fail and use a better solution.
    if (
        value &&
        (valueType === '[object ArrayBuffer]' ||
            (value.buffer &&
                toString$1.call(value.buffer) === '[object ArrayBuffer]'))
    ) {
        // Convert binary arrays to a string and prefix the string with
        // a special marker.
        var buffer;
        var marker = SERIALIZED_MARKER;

        if (value instanceof ArrayBuffer) {
            buffer = value;
            marker += TYPE_ARRAYBUFFER;
        } else {
            buffer = value.buffer;

            if (valueType === '[object Int8Array]') {
                marker += TYPE_INT8ARRAY;
            } else if (valueType === '[object Uint8Array]') {
                marker += TYPE_UINT8ARRAY;
            } else if (valueType === '[object Uint8ClampedArray]') {
                marker += TYPE_UINT8CLAMPEDARRAY;
            } else if (valueType === '[object Int16Array]') {
                marker += TYPE_INT16ARRAY;
            } else if (valueType === '[object Uint16Array]') {
                marker += TYPE_UINT16ARRAY;
            } else if (valueType === '[object Int32Array]') {
                marker += TYPE_INT32ARRAY;
            } else if (valueType === '[object Uint32Array]') {
                marker += TYPE_UINT32ARRAY;
            } else if (valueType === '[object Float32Array]') {
                marker += TYPE_FLOAT32ARRAY;
            } else if (valueType === '[object Float64Array]') {
                marker += TYPE_FLOAT64ARRAY;
            } else {
                callback(new Error('Failed to get type for BinaryArray'));
            }
        }

        callback(marker + bufferToString(buffer));
    } else if (valueType === '[object Blob]') {
        // Conver the blob to a binaryArray and then to a string.
        var fileReader = new FileReader();

        fileReader.onload = function() {
            // Backwards-compatible prefix for the blob type.
            var str =
                BLOB_TYPE_PREFIX +
                value.type +
                '~' +
                bufferToString(this.result);

            callback(SERIALIZED_MARKER + TYPE_BLOB + str);
        };

        fileReader.readAsArrayBuffer(value);
    } else {
        try {
            callback(JSON.stringify(value));
        } catch (e) {
            console.error("Couldn't convert value into a JSON string: ", value);

            callback(null, e);
        }
    }
}

// Deserialize data we've inserted into a value column/field. We place
// special markers into our strings to mark them as encoded; this isn't
// as nice as a meta field, but it's the only sane thing we can do whilst
// keeping localStorage support intact.
//
// Oftentimes this will just deserialize JSON content, but if we have a
// special marker (SERIALIZED_MARKER, defined above), we will extract
// some kind of arraybuffer/binary data/typed array out of the string.
function deserialize(value) {
    // If we haven't marked this string as being specially serialized (i.e.
    // something other than serialized JSON), we can just return it and be
    // done with it.
    if (value.substring(0, SERIALIZED_MARKER_LENGTH) !== SERIALIZED_MARKER) {
        return JSON.parse(value);
    }

    // The following code deals with deserializing some kind of Blob or
    // TypedArray. First we separate out the type of data we're dealing
    // with from the data itself.
    var serializedString = value.substring(TYPE_SERIALIZED_MARKER_LENGTH);
    var type = value.substring(
        SERIALIZED_MARKER_LENGTH,
        TYPE_SERIALIZED_MARKER_LENGTH
    );

    var blobType;
    // Backwards-compatible blob type serialization strategy.
    // DBs created with older versions of localForage will simply not have the blob type.
    if (type === TYPE_BLOB && BLOB_TYPE_PREFIX_REGEX.test(serializedString)) {
        var matcher = serializedString.match(BLOB_TYPE_PREFIX_REGEX);
        blobType = matcher[1];
        serializedString = serializedString.substring(matcher[0].length);
    }
    var buffer = stringToBuffer(serializedString);

    // Return the right type based on the code/type set during
    // serialization.
    switch (type) {
        case TYPE_ARRAYBUFFER:
            return buffer;
        case TYPE_BLOB:
            return createBlob([buffer], { type: blobType });
        case TYPE_INT8ARRAY:
            return new Int8Array(buffer);
        case TYPE_UINT8ARRAY:
            return new Uint8Array(buffer);
        case TYPE_UINT8CLAMPEDARRAY:
            return new Uint8ClampedArray(buffer);
        case TYPE_INT16ARRAY:
            return new Int16Array(buffer);
        case TYPE_UINT16ARRAY:
            return new Uint16Array(buffer);
        case TYPE_INT32ARRAY:
            return new Int32Array(buffer);
        case TYPE_UINT32ARRAY:
            return new Uint32Array(buffer);
        case TYPE_FLOAT32ARRAY:
            return new Float32Array(buffer);
        case TYPE_FLOAT64ARRAY:
            return new Float64Array(buffer);
        default:
            throw new Error('Unkown type: ' + type);
    }
}

var localforageSerializer = {
    serialize: serialize,
    deserialize: deserialize,
    stringToBuffer: stringToBuffer,
    bufferToString: bufferToString
};

/*
 * Includes code from:
 *
 * base64-arraybuffer
 * https://github.com/niklasvh/base64-arraybuffer
 *
 * Copyright (c) 2012 Niklas von Hertzen
 * Licensed under the MIT license.
 */

function createDbTable(t, dbInfo, callback, errorCallback) {
    t.executeSql(
        `CREATE TABLE IF NOT EXISTS ${dbInfo.storeName} ` +
            '(id INTEGER PRIMARY KEY, key unique, value)',
        [],
        callback,
        errorCallback
    );
}

// Open the WebSQL database (automatically creates one if one didn't
// previously exist), using any options set in the config.
function _initStorage$1(options) {
    var self = this;
    var dbInfo = {
        db: null
    };

    if (options) {
        for (var i in options) {
            dbInfo[i] =
                typeof options[i] !== 'string'
                    ? options[i].toString()
                    : options[i];
        }
    }

    var dbInfoPromise = new Promise(function(resolve, reject) {
        // Open the database; the openDatabase API will automatically
        // create it for us if it doesn't exist.
        try {
            dbInfo.db = openDatabase(
                dbInfo.name,
                String(dbInfo.version),
                dbInfo.description,
                dbInfo.size
            );
        } catch (e) {
            return reject(e);
        }

        // Create our key/value table if it doesn't exist.
        dbInfo.db.transaction(function(t) {
            createDbTable(
                t,
                dbInfo,
                function() {
                    self._dbInfo = dbInfo;
                    resolve();
                },
                function(t, error) {
                    reject(error);
                }
            );
        }, reject);
    });

    dbInfo.serializer = localforageSerializer;
    return dbInfoPromise;
}

function tryExecuteSql(t, dbInfo, sqlStatement, args, callback, errorCallback) {
    t.executeSql(
        sqlStatement,
        args,
        callback,
        function(t, error) {
            if (error.code === error.SYNTAX_ERR) {
                t.executeSql(
                    'SELECT name FROM sqlite_master ' +
                        "WHERE type='table' AND name = ?",
                    [name],
                    function(t, results) {
                        if (!results.rows.length) {
                            // if the table is missing (was deleted)
                            // re-create it table and retry
                            createDbTable(
                                t,
                                dbInfo,
                                function() {
                                    t.executeSql(
                                        sqlStatement,
                                        args,
                                        callback,
                                        errorCallback
                                    );
                                },
                                errorCallback
                            );
                        } else {
                            errorCallback(t, error);
                        }
                    },
                    errorCallback
                );
            } else {
                errorCallback(t, error);
            }
        },
        errorCallback
    );
}

function getItem$1(key, callback) {
    var self = this;

    key = normalizeKey(key);

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                var dbInfo = self._dbInfo;
                dbInfo.db.transaction(function(t) {
                    tryExecuteSql(
                        t,
                        dbInfo,
                        `SELECT * FROM ${
                            dbInfo.storeName
                        } WHERE key = ? LIMIT 1`,
                        [key],
                        function(t, results) {
                            var result = results.rows.length
                                ? results.rows.item(0).value
                                : null;

                            // Check to see if this is serialized content we need to
                            // unpack.
                            if (result) {
                                result = dbInfo.serializer.deserialize(result);
                            }

                            resolve(result);
                        },
                        function(t, error) {
                            reject(error);
                        }
                    );
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

function iterate$1(iterator, callback) {
    var self = this;

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                var dbInfo = self._dbInfo;

                dbInfo.db.transaction(function(t) {
                    tryExecuteSql(
                        t,
                        dbInfo,
                        `SELECT * FROM ${dbInfo.storeName}`,
                        [],
                        function(t, results) {
                            var rows = results.rows;
                            var length = rows.length;

                            for (var i = 0; i < length; i++) {
                                var item = rows.item(i);
                                var result = item.value;

                                // Check to see if this is serialized content
                                // we need to unpack.
                                if (result) {
                                    result = dbInfo.serializer.deserialize(
                                        result
                                    );
                                }

                                result = iterator(result, item.key, i + 1);

                                // void(0) prevents problems with redefinition
                                // of `undefined`.
                                if (result !== void 0) {
                                    resolve(result);
                                    return;
                                }
                            }

                            resolve();
                        },
                        function(t, error) {
                            reject(error);
                        }
                    );
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

function _setItem(key, value, callback, retriesLeft) {
    var self = this;

    key = normalizeKey(key);

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                // The localStorage API doesn't return undefined values in an
                // "expected" way, so undefined is always cast to null in all
                // drivers. See: https://github.com/mozilla/localForage/pull/42
                if (value === undefined) {
                    value = null;
                }

                // Save the original value to pass to the callback.
                var originalValue = value;

                var dbInfo = self._dbInfo;
                dbInfo.serializer.serialize(value, function(value, error) {
                    if (error) {
                        reject(error);
                    } else {
                        dbInfo.db.transaction(
                            function(t) {
                                tryExecuteSql(
                                    t,
                                    dbInfo,
                                    `INSERT OR REPLACE INTO ${
                                        dbInfo.storeName
                                    } ` + '(key, value) VALUES (?, ?)',
                                    [key, value],
                                    function() {
                                        resolve(originalValue);
                                    },
                                    function(t, error) {
                                        reject(error);
                                    }
                                );
                            },
                            function(sqlError) {
                                // The transaction failed; check
                                // to see if it's a quota error.
                                if (sqlError.code === sqlError.QUOTA_ERR) {
                                    // We reject the callback outright for now, but
                                    // it's worth trying to re-run the transaction.
                                    // Even if the user accepts the prompt to use
                                    // more storage on Safari, this error will
                                    // be called.
                                    //
                                    // Try to re-run the transaction.
                                    if (retriesLeft > 0) {
                                        resolve(
                                            _setItem.apply(self, [
                                                key,
                                                originalValue,
                                                callback,
                                                retriesLeft - 1
                                            ])
                                        );
                                        return;
                                    }
                                    reject(sqlError);
                                }
                            }
                        );
                    }
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

function setItem$1(key, value, callback) {
    return _setItem.apply(this, [key, value, callback, 1]);
}

function removeItem$1(key, callback) {
    var self = this;

    key = normalizeKey(key);

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                var dbInfo = self._dbInfo;
                dbInfo.db.transaction(function(t) {
                    tryExecuteSql(
                        t,
                        dbInfo,
                        `DELETE FROM ${dbInfo.storeName} WHERE key = ?`,
                        [key],
                        function() {
                            resolve();
                        },
                        function(t, error) {
                            reject(error);
                        }
                    );
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

// Deletes every item in the table.
// TODO: Find out if this resets the AUTO_INCREMENT number.
function clear$1(callback) {
    var self = this;

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                var dbInfo = self._dbInfo;
                dbInfo.db.transaction(function(t) {
                    tryExecuteSql(
                        t,
                        dbInfo,
                        `DELETE FROM ${dbInfo.storeName}`,
                        [],
                        function() {
                            resolve();
                        },
                        function(t, error) {
                            reject(error);
                        }
                    );
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

// Does a simple `COUNT(key)` to get the number of items stored in
// localForage.
function length$1(callback) {
    var self = this;

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                var dbInfo = self._dbInfo;
                dbInfo.db.transaction(function(t) {
                    // Ahhh, SQL makes this one soooooo easy.
                    tryExecuteSql(
                        t,
                        dbInfo,
                        `SELECT COUNT(key) as c FROM ${dbInfo.storeName}`,
                        [],
                        function(t, results) {
                            var result = results.rows.item(0).c;
                            resolve(result);
                        },
                        function(t, error) {
                            reject(error);
                        }
                    );
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

// Return the key located at key index X; essentially gets the key from a
// `WHERE id = ?`. This is the most efficient way I can think to implement
// this rarely-used (in my experience) part of the API, but it can seem
// inconsistent, because we do `INSERT OR REPLACE INTO` on `setItem()`, so
// the ID of each key will change every time it's updated. Perhaps a stored
// procedure for the `setItem()` SQL would solve this problem?
// TODO: Don't change ID on `setItem()`.
function key$1(n, callback) {
    var self = this;

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                var dbInfo = self._dbInfo;
                dbInfo.db.transaction(function(t) {
                    tryExecuteSql(
                        t,
                        dbInfo,
                        `SELECT key FROM ${
                            dbInfo.storeName
                        } WHERE id = ? LIMIT 1`,
                        [n + 1],
                        function(t, results) {
                            var result = results.rows.length
                                ? results.rows.item(0).key
                                : null;
                            resolve(result);
                        },
                        function(t, error) {
                            reject(error);
                        }
                    );
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

function keys$1(callback) {
    var self = this;

    var promise = new Promise(function(resolve, reject) {
        self
            .ready()
            .then(function() {
                var dbInfo = self._dbInfo;
                dbInfo.db.transaction(function(t) {
                    tryExecuteSql(
                        t,
                        dbInfo,
                        `SELECT key FROM ${dbInfo.storeName}`,
                        [],
                        function(t, results) {
                            var keys = [];

                            for (var i = 0; i < results.rows.length; i++) {
                                keys.push(results.rows.item(i).key);
                            }

                            resolve(keys);
                        },
                        function(t, error) {
                            reject(error);
                        }
                    );
                });
            })
            .catch(reject);
    });

    executeCallback(promise, callback);
    return promise;
}

// https://www.w3.org/TR/webdatabase/#databases
// > There is no way to enumerate or delete the databases available for an origin from this API.
function getAllStoreNames(db) {
    return new Promise(function(resolve, reject) {
        db.transaction(
            function(t) {
                t.executeSql(
                    'SELECT name FROM sqlite_master ' +
                        "WHERE type='table' AND name <> '__WebKitDatabaseInfoTable__'",
                    [],
                    function(t, results) {
                        var storeNames = [];

                        for (var i = 0; i < results.rows.length; i++) {
                            storeNames.push(results.rows.item(i).name);
                        }

                        resolve({
                            db,
                            storeNames
                        });
                    },
                    function(t, error) {
                        reject(error);
                    }
                );
            },
            function(sqlError) {
                reject(sqlError);
            }
        );
    });
}

function dropInstance$1(options, callback) {
    callback = getCallback.apply(this, arguments);

    var currentConfig = this.config();
    options = (typeof options !== 'function' && options) || {};
    if (!options.name) {
        options.name = options.name || currentConfig.name;
        options.storeName = options.storeName || currentConfig.storeName;
    }

    var self = this;
    var promise;
    if (!options.name) {
        promise = Promise.reject('Invalid arguments');
    } else {
        promise = new Promise(function(resolve) {
            var db;
            if (options.name === currentConfig.name) {
                // use the db reference of the current instance
                db = self._dbInfo.db;
            } else {
                db = openDatabase(options.name, '', '', 0);
            }

            if (!options.storeName) {
                // drop all database tables
                resolve(getAllStoreNames(db));
            } else {
                resolve({
                    db,
                    storeNames: [options.storeName]
                });
            }
        }).then(function(operationInfo) {
            return new Promise(function(resolve, reject) {
                operationInfo.db.transaction(
                    function(t) {
                        function dropTable(storeName) {
                            return new Promise(function(resolve, reject) {
                                t.executeSql(
                                    `DROP TABLE IF EXISTS ${storeName}`,
                                    [],
                                    function() {
                                        resolve();
                                    },
                                    function(t, error) {
                                        reject(error);
                                    }
                                );
                            });
                        }

                        var operations = [];
                        for (
                            var i = 0, len = operationInfo.storeNames.length;
                            i < len;
                            i++
                        ) {
                            operations.push(
                                dropTable(operationInfo.storeNames[i])
                            );
                        }

                        Promise.all(operations)
                            .then(function() {
                                resolve();
                            })
                            .catch(function(e) {
                                reject(e);
                            });
                    },
                    function(sqlError) {
                        reject(sqlError);
                    }
                );
            });
        });
    }

    executeCallback(promise, callback);
    return promise;
}

var webSQLStorage = {
    _driver: 'webSQLStorage',
    _initStorage: _initStorage$1,
    _support: isWebSQLValid(),
    iterate: iterate$1,
    getItem: getItem$1,
    setItem: setItem$1,
    removeItem: removeItem$1,
    clear: clear$1,
    length: length$1,
    key: key$1,
    keys: keys$1,
    dropInstance: dropInstance$1
};

function isLocalStorageValid() {
    try {
        return (
            typeof localStorage !== 'undefined' &&
            'setItem' in localStorage &&
            // in IE8 typeof localStorage.setItem === 'object'
            !!localStorage.setItem
        );
    } catch (e) {
        return false;
    }
}

// If IndexedDB isn't available, we'll fall back to localStorage.

function _getKeyPrefix(options, defaultConfig) {
    var keyPrefix = options.name + '/';

    if (options.storeName !== defaultConfig.storeName) {
        keyPrefix += options.storeName + '/';
    }
    return keyPrefix;
}

// Check if localStorage throws when saving an item
function checkIfLocalStorageThrows() {
    var localStorageTestKey = '_localforage_support_test';

    try {
        localStorage.setItem(localStorageTestKey, true);
        localStorage.removeItem(localStorageTestKey);

        return false;
    } catch (e) {
        return true;
    }
}

// Check if localStorage is usable and allows to save an item
// This method checks if localStorage is usable in Safari Private Browsing
// mode, or in any other case where the available quota for localStorage
// is 0 and there wasn't any saved items yet.
function _isLocalStorageUsable() {
    return !checkIfLocalStorageThrows() || localStorage.length > 0;
}

// Config the localStorage backend, using options set in the config.
function _initStorage$2(options) {
    var self = this;
    var dbInfo = {};
    if (options) {
        for (var i in options) {
            dbInfo[i] = options[i];
        }
    }

    dbInfo.keyPrefix = _getKeyPrefix(options, self._defaultConfig);

    if (!_isLocalStorageUsable()) {
        return Promise.reject();
    }

    self._dbInfo = dbInfo;
    dbInfo.serializer = localforageSerializer;

    return Promise.resolve();
}

// Remove all keys from the datastore, effectively destroying all data in
// the app's key/value store!
function clear$2(callback) {
    var self = this;
    var promise = self.ready().then(function() {
        var keyPrefix = self._dbInfo.keyPrefix;

        for (var i = localStorage.length - 1; i >= 0; i--) {
            var key = localStorage.key(i);

            if (key.indexOf(keyPrefix) === 0) {
                localStorage.removeItem(key);
            }
        }
    });

    executeCallback(promise, callback);
    return promise;
}

// Retrieve an item from the store. Unlike the original async_storage
// library in Gaia, we don't modify return values at all. If a key's value
// is `undefined`, we pass that value to the callback function.
function getItem$2(key, callback) {
    var self = this;

    key = normalizeKey(key);

    var promise = self.ready().then(function() {
        var dbInfo = self._dbInfo;
        var result = localStorage.getItem(dbInfo.keyPrefix + key);

        // If a result was found, parse it from the serialized
        // string into a JS object. If result isn't truthy, the key
        // is likely undefined and we'll pass it straight to the
        // callback.
        if (result) {
            result = dbInfo.serializer.deserialize(result);
        }

        return result;
    });

    executeCallback(promise, callback);
    return promise;
}

// Iterate over all items in the store.
function iterate$2(iterator, callback) {
    var self = this;

    var promise = self.ready().then(function() {
        var dbInfo = self._dbInfo;
        var keyPrefix = dbInfo.keyPrefix;
        var keyPrefixLength = keyPrefix.length;
        var length = localStorage.length;

        // We use a dedicated iterator instead of the `i` variable below
        // so other keys we fetch in localStorage aren't counted in
        // the `iterationNumber` argument passed to the `iterate()`
        // callback.
        //
        // See: github.com/mozilla/localForage/pull/435#discussion_r38061530
        var iterationNumber = 1;

        for (var i = 0; i < length; i++) {
            var key = localStorage.key(i);
            if (key.indexOf(keyPrefix) !== 0) {
                continue;
            }
            var value = localStorage.getItem(key);

            // If a result was found, parse it from the serialized
            // string into a JS object. If result isn't truthy, the
            // key is likely undefined and we'll pass it straight
            // to the iterator.
            if (value) {
                value = dbInfo.serializer.deserialize(value);
            }

            value = iterator(
                value,
                key.substring(keyPrefixLength),
                iterationNumber++
            );

            if (value !== void 0) {
                return value;
            }
        }
    });

    executeCallback(promise, callback);
    return promise;
}

// Same as localStorage's key() method, except takes a callback.
function key$2(n, callback) {
    var self = this;
    var promise = self.ready().then(function() {
        var dbInfo = self._dbInfo;
        var result;
        try {
            result = localStorage.key(n);
        } catch (error) {
            result = null;
        }

        // Remove the prefix from the key, if a key is found.
        if (result) {
            result = result.substring(dbInfo.keyPrefix.length);
        }

        return result;
    });

    executeCallback(promise, callback);
    return promise;
}

function keys$2(callback) {
    var self = this;
    var promise = self.ready().then(function() {
        var dbInfo = self._dbInfo;
        var length = localStorage.length;
        var keys = [];

        for (var i = 0; i < length; i++) {
            var itemKey = localStorage.key(i);
            if (itemKey.indexOf(dbInfo.keyPrefix) === 0) {
                keys.push(itemKey.substring(dbInfo.keyPrefix.length));
            }
        }

        return keys;
    });

    executeCallback(promise, callback);
    return promise;
}

// Supply the number of keys in the datastore to the callback function.
function length$2(callback) {
    var self = this;
    var promise = self.keys().then(function(keys) {
        return keys.length;
    });

    executeCallback(promise, callback);
    return promise;
}

// Remove an item from the store, nice and simple.
function removeItem$2(key, callback) {
    var self = this;

    key = normalizeKey(key);

    var promise = self.ready().then(function() {
        var dbInfo = self._dbInfo;
        localStorage.removeItem(dbInfo.keyPrefix + key);
    });

    executeCallback(promise, callback);
    return promise;
}

// Set a key's value and run an optional callback once the value is set.
// Unlike Gaia's implementation, the callback function is passed the value,
// in case you want to operate on that value only after you're sure it
// saved, or something like that.
function setItem$2(key, value, callback) {
    var self = this;

    key = normalizeKey(key);

    var promise = self.ready().then(function() {
        // Convert undefined values to null.
        // https://github.com/mozilla/localForage/pull/42
        if (value === undefined) {
            value = null;
        }

        // Save the original value to pass to the callback.
        var originalValue = value;

        return new Promise(function(resolve, reject) {
            var dbInfo = self._dbInfo;
            dbInfo.serializer.serialize(value, function(value, error) {
                if (error) {
                    reject(error);
                } else {
                    try {
                        localStorage.setItem(dbInfo.keyPrefix + key, value);
                        resolve(originalValue);
                    } catch (e) {
                        // localStorage capacity exceeded.
                        // TODO: Make this a specific error/event.
                        if (
                            e.name === 'QuotaExceededError' ||
                            e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
                        ) {
                            reject(e);
                        }
                        reject(e);
                    }
                }
            });
        });
    });

    executeCallback(promise, callback);
    return promise;
}

function dropInstance$2(options, callback) {
    callback = getCallback.apply(this, arguments);

    options = (typeof options !== 'function' && options) || {};
    if (!options.name) {
        var currentConfig = this.config();
        options.name = options.name || currentConfig.name;
        options.storeName = options.storeName || currentConfig.storeName;
    }

    var self = this;
    var promise;
    if (!options.name) {
        promise = Promise.reject('Invalid arguments');
    } else {
        promise = new Promise(function(resolve) {
            if (!options.storeName) {
                resolve(`${options.name}/`);
            } else {
                resolve(_getKeyPrefix(options, self._defaultConfig));
            }
        }).then(function(keyPrefix) {
            for (var i = localStorage.length - 1; i >= 0; i--) {
                var key = localStorage.key(i);

                if (key.indexOf(keyPrefix) === 0) {
                    localStorage.removeItem(key);
                }
            }
        });
    }

    executeCallback(promise, callback);
    return promise;
}

var localStorageWrapper = {
    _driver: 'localStorageWrapper',
    _initStorage: _initStorage$2,
    _support: isLocalStorageValid(),
    iterate: iterate$2,
    getItem: getItem$2,
    setItem: setItem$2,
    removeItem: removeItem$2,
    clear: clear$2,
    length: length$2,
    key: key$2,
    keys: keys$2,
    dropInstance: dropInstance$2
};

const sameValue = (x, y) =>
    x === y ||
    (typeof x === 'number' && typeof y === 'number' && isNaN(x) && isNaN(y));

const includes = (array, searchElement) => {
    const len = array.length;
    let i = 0;
    while (i < len) {
        if (sameValue(array[i], searchElement)) {
            return true;
        }
        i++;
    }

    return false;
};

const isArray =
    Array.isArray ||
    function(arg) {
        return Object.prototype.toString.call(arg) === '[object Array]';
    };

// Drivers are stored here when `defineDriver()` is called.
// They are shared across all instances of localForage.
const DefinedDrivers = {};

const DriverSupport = {};

const DefaultDrivers = {
    INDEXEDDB: asyncStorage,
    WEBSQL: webSQLStorage,
    LOCALSTORAGE: localStorageWrapper
};

const DefaultDriverOrder = [
    DefaultDrivers.INDEXEDDB._driver,
    DefaultDrivers.WEBSQL._driver,
    DefaultDrivers.LOCALSTORAGE._driver
];

const OptionalDriverMethods = ['dropInstance'];

const LibraryMethods = [
    'clear',
    'getItem',
    'iterate',
    'key',
    'keys',
    'length',
    'removeItem',
    'setItem'
].concat(OptionalDriverMethods);

const DefaultConfig = {
    description: '',
    driver: DefaultDriverOrder.slice(),
    name: 'localforage',
    // Default DB size is _JUST UNDER_ 5MB, as it's the highest size
    // we can use without a prompt.
    size: 4980736,
    storeName: 'keyvaluepairs',
    version: 1.0
};

function callWhenReady(localForageInstance, libraryMethod) {
    localForageInstance[libraryMethod] = function() {
        const _args = arguments;
        return localForageInstance.ready().then(function() {
            return localForageInstance[libraryMethod].apply(
                localForageInstance,
                _args
            );
        });
    };
}

function extend() {
    for (let i = 1; i < arguments.length; i++) {
        const arg = arguments[i];

        if (arg) {
            for (let key in arg) {
                if (arg.hasOwnProperty(key)) {
                    if (isArray(arg[key])) {
                        arguments[0][key] = arg[key].slice();
                    } else {
                        arguments[0][key] = arg[key];
                    }
                }
            }
        }
    }

    return arguments[0];
}

class LocalForage {
    constructor(options) {
        for (let driverTypeKey in DefaultDrivers) {
            if (DefaultDrivers.hasOwnProperty(driverTypeKey)) {
                const driver = DefaultDrivers[driverTypeKey];
                const driverName = driver._driver;
                this[driverTypeKey] = driverName;

                if (!DefinedDrivers[driverName]) {
                    // we don't need to wait for the promise,
                    // since the default drivers can be defined
                    // in a blocking manner
                    this.defineDriver(driver);
                }
            }
        }

        this._defaultConfig = extend({}, DefaultConfig);
        this._config = extend({}, this._defaultConfig, options);
        this._driverSet = null;
        this._initDriver = null;
        this._ready = false;
        this._dbInfo = null;

        this._wrapLibraryMethodsWithReady();
        this.setDriver(this._config.driver).catch(() => {});
    }

    // Set any config values for localForage; can be called anytime before
    // the first API call (e.g. `getItem`, `setItem`).
    // We loop through options so we don't overwrite existing config
    // values.
    config(options) {
        // If the options argument is an object, we use it to set values.
        // Otherwise, we return either a specified config value or all
        // config values.
        if (typeof options === 'object') {
            // If localforage is ready and fully initialized, we can't set
            // any new configuration values. Instead, we return an error.
            if (this._ready) {
                return new Error(
                    "Can't call config() after localforage " + 'has been used.'
                );
            }

            for (let i in options) {
                if (i === 'storeName') {
                    options[i] = options[i].replace(/\W/g, '_');
                }

                if (i === 'version' && typeof options[i] !== 'number') {
                    return new Error('Database version must be a number.');
                }

                this._config[i] = options[i];
            }

            // after all config options are set and
            // the driver option is used, try setting it
            if ('driver' in options && options.driver) {
                return this.setDriver(this._config.driver);
            }

            return true;
        } else if (typeof options === 'string') {
            return this._config[options];
        } else {
            return this._config;
        }
    }

    // Used to define a custom driver, shared across all instances of
    // localForage.
    defineDriver(driverObject, callback, errorCallback) {
        const promise = new Promise(function(resolve, reject) {
            try {
                const driverName = driverObject._driver;
                const complianceError = new Error(
                    'Custom driver not compliant; see ' +
                        'https://mozilla.github.io/localForage/#definedriver'
                );

                // A driver name should be defined and not overlap with the
                // library-defined, default drivers.
                if (!driverObject._driver) {
                    reject(complianceError);
                    return;
                }

                const driverMethods = LibraryMethods.concat('_initStorage');
                for (let i = 0, len = driverMethods.length; i < len; i++) {
                    const driverMethodName = driverMethods[i];

                    // when the property is there,
                    // it should be a method even when optional
                    const isRequired = !includes(
                        OptionalDriverMethods,
                        driverMethodName
                    );
                    if (
                        (isRequired || driverObject[driverMethodName]) &&
                        typeof driverObject[driverMethodName] !== 'function'
                    ) {
                        reject(complianceError);
                        return;
                    }
                }

                const configureMissingMethods = function() {
                    const methodNotImplementedFactory = function(methodName) {
                        return function() {
                            const error = new Error(
                                `Method ${methodName} is not implemented by the current driver`
                            );
                            const promise = Promise.reject(error);
                            executeCallback(
                                promise,
                                arguments[arguments.length - 1]
                            );
                            return promise;
                        };
                    };

                    for (
                        let i = 0, len = OptionalDriverMethods.length;
                        i < len;
                        i++
                    ) {
                        const optionalDriverMethod = OptionalDriverMethods[i];
                        if (!driverObject[optionalDriverMethod]) {
                            driverObject[
                                optionalDriverMethod
                            ] = methodNotImplementedFactory(
                                optionalDriverMethod
                            );
                        }
                    }
                };

                configureMissingMethods();

                const setDriverSupport = function(support) {
                    if (DefinedDrivers[driverName]) {
                        console.info(
                            `Redefining LocalForage driver: ${driverName}`
                        );
                    }
                    DefinedDrivers[driverName] = driverObject;
                    DriverSupport[driverName] = support;
                    // don't use a then, so that we can define
                    // drivers that have simple _support methods
                    // in a blocking manner
                    resolve();
                };

                if ('_support' in driverObject) {
                    if (
                        driverObject._support &&
                        typeof driverObject._support === 'function'
                    ) {
                        driverObject._support().then(setDriverSupport, reject);
                    } else {
                        setDriverSupport(!!driverObject._support);
                    }
                } else {
                    setDriverSupport(true);
                }
            } catch (e) {
                reject(e);
            }
        });

        executeTwoCallbacks(promise, callback, errorCallback);
        return promise;
    }

    driver() {
        return this._driver || null;
    }

    getDriver(driverName, callback, errorCallback) {
        const getDriverPromise = DefinedDrivers[driverName]
            ? Promise.resolve(DefinedDrivers[driverName])
            : Promise.reject(new Error('Driver not found.'));

        executeTwoCallbacks(getDriverPromise, callback, errorCallback);
        return getDriverPromise;
    }

    getSerializer(callback) {
        const serializerPromise = Promise.resolve(localforageSerializer);
        executeTwoCallbacks(serializerPromise, callback);
        return serializerPromise;
    }

    ready(callback) {
        const self = this;

        const promise = self._driverSet.then(() => {
            if (self._ready === null) {
                self._ready = self._initDriver();
            }

            return self._ready;
        });

        executeTwoCallbacks(promise, callback, callback);
        return promise;
    }

    setDriver(drivers, callback, errorCallback) {
        const self = this;

        if (!isArray(drivers)) {
            drivers = [drivers];
        }

        const supportedDrivers = this._getSupportedDrivers(drivers);

        function setDriverToConfig() {
            self._config.driver = self.driver();
        }

        function extendSelfWithDriver(driver) {
            self._extend(driver);
            setDriverToConfig();

            self._ready = self._initStorage(self._config);
            return self._ready;
        }

        function initDriver(supportedDrivers) {
            return function() {
                let currentDriverIndex = 0;

                function driverPromiseLoop() {
                    while (currentDriverIndex < supportedDrivers.length) {
                        let driverName = supportedDrivers[currentDriverIndex];
                        currentDriverIndex++;

                        self._dbInfo = null;
                        self._ready = null;

                        return self
                            .getDriver(driverName)
                            .then(extendSelfWithDriver)
                            .catch(driverPromiseLoop);
                    }

                    setDriverToConfig();
                    const error = new Error(
                        'No available storage method found.'
                    );
                    self._driverSet = Promise.reject(error);
                    return self._driverSet;
                }

                return driverPromiseLoop();
            };
        }

        // There might be a driver initialization in progress
        // so wait for it to finish in order to avoid a possible
        // race condition to set _dbInfo
        const oldDriverSetDone =
            this._driverSet !== null
                ? this._driverSet.catch(() => Promise.resolve())
                : Promise.resolve();

        this._driverSet = oldDriverSetDone
            .then(() => {
                const driverName = supportedDrivers[0];
                self._dbInfo = null;
                self._ready = null;

                return self.getDriver(driverName).then(driver => {
                    self._driver = driver._driver;
                    setDriverToConfig();
                    self._wrapLibraryMethodsWithReady();
                    self._initDriver = initDriver(supportedDrivers);
                });
            })
            .catch(() => {
                setDriverToConfig();
                const error = new Error('No available storage method found.');
                self._driverSet = Promise.reject(error);
                return self._driverSet;
            });

        executeTwoCallbacks(this._driverSet, callback, errorCallback);
        return this._driverSet;
    }

    supports(driverName) {
        return !!DriverSupport[driverName];
    }

    _extend(libraryMethodsAndProperties) {
        extend(this, libraryMethodsAndProperties);
    }

    _getSupportedDrivers(drivers) {
        const supportedDrivers = [];
        for (let i = 0, len = drivers.length; i < len; i++) {
            const driverName = drivers[i];
            if (this.supports(driverName)) {
                supportedDrivers.push(driverName);
            }
        }
        return supportedDrivers;
    }

    _wrapLibraryMethodsWithReady() {
        // Add a stub for each driver API method that delays the call to the
        // corresponding driver method until localForage is ready. These stubs
        // will be replaced by the driver methods as soon as the driver is
        // loaded, so there is no performance impact.
        for (let i = 0, len = LibraryMethods.length; i < len; i++) {
            callWhenReady(this, LibraryMethods[i]);
        }
    }

    createInstance(options) {
        return new LocalForage(options);
    }
}

// The actual localForage object that we expose as a module or via a
// global. It's extended by pulling in one of our other libraries.
var ls = new LocalForage();

const db = new Storage(ls);

function uuid() {
  let d = new Date().getTime();
  let uid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    let r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
  return uid;
}

const faker = window.faker;

const artists = [];
const songs = [];

const recordLabels = [
  'Universal Music Group',
  'Sony Music Entertainment',
  'Warner Music Group'
];

async function getArtists() {
  let artistsInDb = await db.get('artists');
  if (artistsInDb) return artistsInDb;

  for (let i = 0; i < 25; i++) {
    artists.push({
      birth: faker.date.past(),
      country: faker.address.country(),
      death: faker.date.past(),
      dislikes: Math.floor(Math.random() * 400),
      email: faker.internet.email(),
      favorite: faker.random.boolean(),
      firstname: faker.name.firstName(),
      lastname: faker.name.lastName(),
      likes: Math.floor(Math.random() * 600),
      picture: faker.image.avatar(),
      uid: uuid()
    });
  }
  db.put('artists', artists);
  return artists;
}

async function getSongs() {
  let songsInDb = await db.get('songs');
  if (songsInDb) return songsInDb;

  for (let i = 0; i < 750; i++) {
    songs.push({
      artistId: artists[Math.floor(Math.random() * 25)].uid,
      dislikes: Math.floor(Math.random() * 400),
      favorite: faker.random.boolean(),
      image: `https://loremflickr.com/320/240?lock=${i}`,
      // image: `https://picsum.photos/200/300/?image=${Math.floor(Math.random() * 1084)}`,
      label: recordLabels[Math.floor(Math.random() * 3)],
      likes: Math.floor(Math.random() * 1000),
      name: faker.commerce.productName(),
      releaseDate: faker.date.past(),
      tagline: faker.lorem.paragraph(),
      uid: uuid()
    });
  }
  db.put('songs', songs);
  return songs;
}

var css = ":host {\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  background-color: #fff;\n  border: 1px solid #ccc;\n  font-family: sans-serif;\n}\nh2 {\n  font-size: 1.5em;\n  font-weight: 400;\n  color: #333;\n  font-style: italic;\n}\nnav {\n  display: flex;\n  height: 42px;\n  align-items: center;\n  background-color: #eaeaea;\n}\nnav button {\n  display: flex;\n  flex: 1;\n  border: 0;\n  background: transparent;\n  font-size: 1.1em;\n  padding: 0 12px;\n  height: inherit;\n  color: #308ad7;\n  cursor: pointer;\n  outline: none;\n}\nnav button.active {\n  background-color: #fff;\n  color: #333;\n}\nsection {\n  display: flex;\n  flex: 1;\n  flex-direction: column;\n  overflow-x: hidden;\n  overflow-y: auto;\n  padding: 12px;\n}\nsection#tracks .track {\n  display: flex;\n  min-height: 248px;\n  padding: 12px;\n}\nsection#tracks .track:nth-child(even) {\n  background: #efefef;\n}\nsection#tracks .track .left,\nsection#tracks .track .right {\n  display: flex;\n  flex-direction: column;\n}\nsection#tracks .track .left {\n  flex: 0.75;\n}\nsection#tracks .track .right {\n  flex: 0.25;\n}\nsection#tracks .artist {\n  padding: 4px 0;\n  font-size: 1.25em;\n  font-style: italic;\n}\nsection#tracks .label {\n  font-size: 1em;\n  font-family: serif;\n  font-weight: bold;\npadding\n}\nsection#artists .artist {\n  display: flex;\n  min-height: 248px;\n  padding: 12px;\n}\nsection#artists .artist:nth-child(even) {\n  background: #efefef;\n}\nsection#artists .artist .left,\nsection#artists .artist .right {\n  display: flex;\n  flex-direction: column;\n}\nsection#artists .artist .left {\n  flex: 0.75;\n}\nsection#artists .artist .right {\n  flex: 0.25;\n}\nsection#artists .artist .right img {\n  width: 300px;\n  height: auto;\n}\n.likes {\n  margin-top: 16px;\n}\n.likes button {\n  display: inline-flex;\n  background: transparent;\n  border: 0;\n  outline: none;\n  align-items: center;\n  cursor: pointer;\n}\n.likes button img {\n  height: 16px;\n  width: 16px;\n  margin-right: 12px;\n}\n.hidden {\n  display: none !important;\n}\n";

var nav = [
  {
    active: true,
    id: 'tracks',
    name: 'Tracks',
    number: 0
  },
  {
    id: 'artists',
    name: 'Artists',
    number: 0
  },
  {
    id: 'favoritetracks',
    name: 'Favorite Tracks',
    number: 0
  },
  {
    id: 'favoriteartists',
    name: 'Favorite Artists',
    number: 0
  }
];

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
// The first argument to JS template tags retain identity across multiple
// calls to a tag for the same literal, so we can cache work done per literal
// in a Map.
const templateCaches = new Map();
/**
 * The return type of `html`, which holds a Template and the values from
 * interpolated expressions.
 */
class TemplateResult {
    constructor(strings, values, type, partCallback = defaultPartCallback) {
        this.strings = strings;
        this.values = values;
        this.type = type;
        this.partCallback = partCallback;
    }
    /**
     * Returns a string of HTML used to create a <template> element.
     */
    getHTML() {
        const l = this.strings.length - 1;
        let html = '';
        let isTextBinding = true;
        for (let i = 0; i < l; i++) {
            const s = this.strings[i];
            html += s;
            // We're in a text position if the previous string closed its tags.
            // If it doesn't have any tags, then we use the previous text position
            // state.
            const closing = findTagClose(s);
            isTextBinding = closing > -1 ? closing < s.length : isTextBinding;
            html += isTextBinding ? nodeMarker : marker;
        }
        html += this.strings[l];
        return html;
    }
    getTemplateElement() {
        const template = document.createElement('template');
        template.innerHTML = this.getHTML();
        return template;
    }
}
/**
 * The default TemplateFactory which caches Templates keyed on
 * result.type and result.strings.
 */
function defaultTemplateFactory(result) {
    let templateCache = templateCaches.get(result.type);
    if (templateCache === undefined) {
        templateCache = new Map();
        templateCaches.set(result.type, templateCache);
    }
    let template = templateCache.get(result.strings);
    if (template === undefined) {
        template = new Template(result, result.getTemplateElement());
        templateCache.set(result.strings, template);
    }
    return template;
}
/**
 * Renders a template to a container.
 *
 * To update a container with new values, reevaluate the template literal and
 * call `render` with the new result.
 *
 * @param result a TemplateResult created by evaluating a template tag like
 *     `html` or `svg`.
 * @param container A DOM parent to render to. The entire contents are either
 *     replaced, or efficiently updated if the same result type was previous
 *     rendered there.
 * @param templateFactory a function to create a Template or retreive one from
 *     cache.
 */
function render(result, container, templateFactory = defaultTemplateFactory) {
    const template = templateFactory(result);
    let instance = container.__templateInstance;
    // Repeat render, just call update()
    if (instance !== undefined && instance.template === template &&
        instance._partCallback === result.partCallback) {
        instance.update(result.values);
        return;
    }
    // First render, create a new TemplateInstance and append it
    instance =
        new TemplateInstance(template, result.partCallback, templateFactory);
    container.__templateInstance = instance;
    const fragment = instance._clone();
    instance.update(result.values);
    removeNodes(container, container.firstChild);
    container.appendChild(fragment);
}
/**
 * An expression marker with embedded unique key to avoid collision with
 * possible text in templates.
 */
const marker = `{{lit-${String(Math.random()).slice(2)}}}`;
/**
 * An expression marker used text-positions, not attribute positions,
 * in template.
 */
const nodeMarker = `<!--${marker}-->`;
const markerRegex = new RegExp(`${marker}|${nodeMarker}`);
/**
 * This regex extracts the attribute name preceding an attribute-position
 * expression. It does this by matching the syntax allowed for attributes
 * against the string literal directly preceding the expression, assuming that
 * the expression is in an attribute-value position.
 *
 * See attributes in the HTML spec:
 * https://www.w3.org/TR/html5/syntax.html#attributes-0
 *
 * "\0-\x1F\x7F-\x9F" are Unicode control characters
 *
 * " \x09\x0a\x0c\x0d" are HTML space characters:
 * https://www.w3.org/TR/html5/infrastructure.html#space-character
 *
 * So an attribute is:
 *  * The name: any character except a control character, space character, ('),
 *    ("), ">", "=", or "/"
 *  * Followed by zero or more space characters
 *  * Followed by "="
 *  * Followed by zero or more space characters
 *  * Followed by:
 *    * Any character except space, ('), ("), "<", ">", "=", (`), or
 *    * (") then any non-("), or
 *    * (') then any non-(')
 */
const lastAttributeNameRegex = /[ \x09\x0a\x0c\x0d]([^\0-\x1F\x7F-\x9F \x09\x0a\x0c\x0d"'>=/]+)[ \x09\x0a\x0c\x0d]*=[ \x09\x0a\x0c\x0d]*(?:[^ \x09\x0a\x0c\x0d"'`<>=]*|"[^"]*|'[^']*)$/;
/**
 * Finds the closing index of the last closed HTML tag.
 * This has 3 possible return values:
 *   - `-1`, meaning there is no tag in str.
 *   - `string.length`, meaning the last opened tag is unclosed.
 *   - Some positive number < str.length, meaning the index of the closing '>'.
 */
function findTagClose(str) {
    const close = str.lastIndexOf('>');
    const open = str.indexOf('<', close + 1);
    return open > -1 ? str.length : close;
}
/**
 * A placeholder for a dynamic expression in an HTML template.
 *
 * There are two built-in part types: AttributePart and NodePart. NodeParts
 * always represent a single dynamic expression, while AttributeParts may
 * represent as many expressions are contained in the attribute.
 *
 * A Template's parts are mutable, so parts can be replaced or modified
 * (possibly to implement different template semantics). The contract is that
 * parts can only be replaced, not removed, added or reordered, and parts must
 * always consume the correct number of values in their `update()` method.
 *
 * TODO(justinfagnani): That requirement is a little fragile. A
 * TemplateInstance could instead be more careful about which values it gives
 * to Part.update().
 */
class TemplatePart {
    constructor(type, index, name, rawName, strings) {
        this.type = type;
        this.index = index;
        this.name = name;
        this.rawName = rawName;
        this.strings = strings;
    }
}
const isTemplatePartActive = (part) => part.index !== -1;
/**
 * An updateable Template that tracks the location of dynamic parts.
 */
class Template {
    constructor(result, element) {
        this.parts = [];
        this.element = element;
        const content = this.element.content;
        // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
        const walker = document.createTreeWalker(content, 133 /* NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT |
               NodeFilter.SHOW_TEXT */, null, false);
        let index = -1;
        let partIndex = 0;
        const nodesToRemove = [];
        // The actual previous node, accounting for removals: if a node is removed
        // it will never be the previousNode.
        let previousNode;
        // Used to set previousNode at the top of the loop.
        let currentNode;
        while (walker.nextNode()) {
            index++;
            previousNode = currentNode;
            const node = currentNode = walker.currentNode;
            if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
                if (!node.hasAttributes()) {
                    continue;
                }
                const attributes = node.attributes;
                // Per https://developer.mozilla.org/en-US/docs/Web/API/NamedNodeMap,
                // attributes are not guaranteed to be returned in document order. In
                // particular, Edge/IE can return them out of order, so we cannot assume
                // a correspondance between part index and attribute index.
                let count = 0;
                for (let i = 0; i < attributes.length; i++) {
                    if (attributes[i].value.indexOf(marker) >= 0) {
                        count++;
                    }
                }
                while (count-- > 0) {
                    // Get the template literal section leading up to the first
                    // expression in this attribute
                    const stringForPart = result.strings[partIndex];
                    // Find the attribute name
                    const attributeNameInPart = lastAttributeNameRegex.exec(stringForPart)[1];
                    // Find the corresponding attribute
                    // TODO(justinfagnani): remove non-null assertion
                    const attribute = attributes.getNamedItem(attributeNameInPart);
                    const stringsForAttributeValue = attribute.value.split(markerRegex);
                    this.parts.push(new TemplatePart('attribute', index, attribute.name, attributeNameInPart, stringsForAttributeValue));
                    node.removeAttribute(attribute.name);
                    partIndex += stringsForAttributeValue.length - 1;
                }
            }
            else if (node.nodeType === 3 /* Node.TEXT_NODE */) {
                const nodeValue = node.nodeValue;
                if (nodeValue.indexOf(marker) < 0) {
                    continue;
                }
                const parent = node.parentNode;
                const strings = nodeValue.split(markerRegex);
                const lastIndex = strings.length - 1;
                // We have a part for each match found
                partIndex += lastIndex;
                // Generate a new text node for each literal section
                // These nodes are also used as the markers for node parts
                for (let i = 0; i < lastIndex; i++) {
                    parent.insertBefore((strings[i] === '')
                        ? document.createComment('')
                        : document.createTextNode(strings[i]), node);
                    this.parts.push(new TemplatePart('node', index++));
                }
                parent.insertBefore(strings[lastIndex] === '' ?
                    document.createComment('') :
                    document.createTextNode(strings[lastIndex]), node);
                nodesToRemove.push(node);
            }
            else if (node.nodeType === 8 /* Node.COMMENT_NODE */ &&
                node.nodeValue === marker) {
                const parent = node.parentNode;
                // Add a new marker node to be the startNode of the Part if any of the
                // following are true:
                //  * We don't have a previousSibling
                //  * previousSibling is being removed (thus it's not the
                //    `previousNode`)
                //  * previousSibling is not a Text node
                //
                // TODO(justinfagnani): We should be able to use the previousNode here
                // as the marker node and reduce the number of extra nodes we add to a
                // template. See https://github.com/PolymerLabs/lit-html/issues/147
                const previousSibling = node.previousSibling;
                if (previousSibling === null || previousSibling !== previousNode ||
                    previousSibling.nodeType !== Node.TEXT_NODE) {
                    parent.insertBefore(document.createComment(''), node);
                }
                else {
                    index--;
                }
                this.parts.push(new TemplatePart('node', index++));
                nodesToRemove.push(node);
                // If we don't have a nextSibling add a marker node.
                // We don't have to check if the next node is going to be removed,
                // because that node will induce a new marker if so.
                if (node.nextSibling === null) {
                    parent.insertBefore(document.createComment(''), node);
                }
                else {
                    index--;
                }
                currentNode = previousNode;
                partIndex++;
            }
        }
        // Remove text binding nodes after the walk to not disturb the TreeWalker
        for (const n of nodesToRemove) {
            n.parentNode.removeChild(n);
        }
    }
}
/**
 * Returns a value ready to be inserted into a Part from a user-provided value.
 *
 * If the user value is a directive, this invokes the directive with the given
 * part. If the value is null, it's converted to undefined to work better
 * with certain DOM APIs, like textContent.
 */
const getValue = (part, value) => {
    // `null` as the value of a Text node will render the string 'null'
    // so we convert it to undefined
    if (isDirective(value)) {
        value = value(part);
        return noChange;
    }
    return value === null ? undefined : value;
};
const isDirective = (o) => typeof o === 'function' && o.__litDirective === true;
/**
 * A sentinel value that signals that a value was handled by a directive and
 * should not be written to the DOM.
 */
const noChange = {};
const isPrimitiveValue = (value) => value === null ||
    !(typeof value === 'object' || typeof value === 'function');
class AttributePart {
    constructor(instance, element, name, strings) {
        this.instance = instance;
        this.element = element;
        this.name = name;
        this.strings = strings;
        this.size = strings.length - 1;
        this._previousValues = [];
    }
    _interpolate(values, startIndex) {
        const strings = this.strings;
        const l = strings.length - 1;
        let text = '';
        for (let i = 0; i < l; i++) {
            text += strings[i];
            const v = getValue(this, values[startIndex + i]);
            if (v && v !== noChange &&
                (Array.isArray(v) || typeof v !== 'string' && v[Symbol.iterator])) {
                for (const t of v) {
                    // TODO: we need to recursively call getValue into iterables...
                    text += t;
                }
            }
            else {
                text += v;
            }
        }
        return text + strings[l];
    }
    _equalToPreviousValues(values, startIndex) {
        for (let i = startIndex; i < startIndex + this.size; i++) {
            if (this._previousValues[i] !== values[i] ||
                !isPrimitiveValue(values[i])) {
                return false;
            }
        }
        return true;
    }
    setValue(values, startIndex) {
        if (this._equalToPreviousValues(values, startIndex)) {
            return;
        }
        const s = this.strings;
        let value;
        if (s.length === 2 && s[0] === '' && s[1] === '') {
            // An expression that occupies the whole attribute value will leave
            // leading and trailing empty strings.
            value = getValue(this, values[startIndex]);
            if (Array.isArray(value)) {
                value = value.join('');
            }
        }
        else {
            value = this._interpolate(values, startIndex);
        }
        if (value !== noChange) {
            this.element.setAttribute(this.name, value);
        }
        this._previousValues = values;
    }
}
class NodePart {
    constructor(instance, startNode, endNode) {
        this.instance = instance;
        this.startNode = startNode;
        this.endNode = endNode;
        this._previousValue = undefined;
    }
    setValue(value) {
        value = getValue(this, value);
        if (value === noChange) {
            return;
        }
        if (isPrimitiveValue(value)) {
            // Handle primitive values
            // If the value didn't change, do nothing
            if (value === this._previousValue) {
                return;
            }
            this._setText(value);
        }
        else if (value instanceof TemplateResult) {
            this._setTemplateResult(value);
        }
        else if (Array.isArray(value) || value[Symbol.iterator]) {
            this._setIterable(value);
        }
        else if (value instanceof Node) {
            this._setNode(value);
        }
        else if (value.then !== undefined) {
            this._setPromise(value);
        }
        else {
            // Fallback, will render the string representation
            this._setText(value);
        }
    }
    _insert(node) {
        this.endNode.parentNode.insertBefore(node, this.endNode);
    }
    _setNode(value) {
        if (this._previousValue === value) {
            return;
        }
        this.clear();
        this._insert(value);
        this._previousValue = value;
    }
    _setText(value) {
        const node = this.startNode.nextSibling;
        value = value === undefined ? '' : value;
        if (node === this.endNode.previousSibling &&
            node.nodeType === Node.TEXT_NODE) {
            // If we only have a single text node between the markers, we can just
            // set its value, rather than replacing it.
            // TODO(justinfagnani): Can we just check if _previousValue is
            // primitive?
            node.textContent = value;
        }
        else {
            this._setNode(document.createTextNode(value));
        }
        this._previousValue = value;
    }
    _setTemplateResult(value) {
        const template = this.instance._getTemplate(value);
        let instance;
        if (this._previousValue && this._previousValue.template === template) {
            instance = this._previousValue;
        }
        else {
            instance = new TemplateInstance(template, this.instance._partCallback, this.instance._getTemplate);
            this._setNode(instance._clone());
            this._previousValue = instance;
        }
        instance.update(value.values);
    }
    _setIterable(value) {
        // For an Iterable, we create a new InstancePart per item, then set its
        // value to the item. This is a little bit of overhead for every item in
        // an Iterable, but it lets us recurse easily and efficiently update Arrays
        // of TemplateResults that will be commonly returned from expressions like:
        // array.map((i) => html`${i}`), by reusing existing TemplateInstances.
        // If _previousValue is an array, then the previous render was of an
        // iterable and _previousValue will contain the NodeParts from the previous
        // render. If _previousValue is not an array, clear this part and make a new
        // array for NodeParts.
        if (!Array.isArray(this._previousValue)) {
            this.clear();
            this._previousValue = [];
        }
        // Lets us keep track of how many items we stamped so we can clear leftover
        // items from a previous render
        const itemParts = this._previousValue;
        let partIndex = 0;
        for (const item of value) {
            // Try to reuse an existing part
            let itemPart = itemParts[partIndex];
            // If no existing part, create a new one
            if (itemPart === undefined) {
                // If we're creating the first item part, it's startNode should be the
                // container's startNode
                let itemStart = this.startNode;
                // If we're not creating the first part, create a new separator marker
                // node, and fix up the previous part's endNode to point to it
                if (partIndex > 0) {
                    const previousPart = itemParts[partIndex - 1];
                    itemStart = previousPart.endNode = document.createTextNode('');
                    this._insert(itemStart);
                }
                itemPart = new NodePart(this.instance, itemStart, this.endNode);
                itemParts.push(itemPart);
            }
            itemPart.setValue(item);
            partIndex++;
        }
        if (partIndex === 0) {
            this.clear();
            this._previousValue = undefined;
        }
        else if (partIndex < itemParts.length) {
            const lastPart = itemParts[partIndex - 1];
            // Truncate the parts array so _previousValue reflects the current state
            itemParts.length = partIndex;
            this.clear(lastPart.endNode.previousSibling);
            lastPart.endNode = this.endNode;
        }
    }
    _setPromise(value) {
        this._previousValue = value;
        value.then((v) => {
            if (this._previousValue === value) {
                this.setValue(v);
            }
        });
    }
    clear(startNode = this.startNode) {
        removeNodes(this.startNode.parentNode, startNode.nextSibling, this.endNode);
    }
}
const defaultPartCallback = (instance, templatePart, node) => {
    if (templatePart.type === 'attribute') {
        return new AttributePart(instance, node, templatePart.name, templatePart.strings);
    }
    else if (templatePart.type === 'node') {
        return new NodePart(instance, node, node.nextSibling);
    }
    throw new Error(`Unknown part type ${templatePart.type}`);
};
/**
 * An instance of a `Template` that can be attached to the DOM and updated
 * with new values.
 */
class TemplateInstance {
    constructor(template, partCallback, getTemplate) {
        this._parts = [];
        this.template = template;
        this._partCallback = partCallback;
        this._getTemplate = getTemplate;
    }
    update(values) {
        let valueIndex = 0;
        for (const part of this._parts) {
            if (!part) {
                valueIndex++;
            }
            else if (part.size === undefined) {
                part.setValue(values[valueIndex]);
                valueIndex++;
            }
            else {
                part.setValue(values, valueIndex);
                valueIndex += part.size;
            }
        }
    }
    _clone() {
        // Clone the node, rather than importing it, to keep the fragment in the
        // template's document. This leaves the fragment inert so custom elements
        // won't upgrade until after the main document adopts the node.
        const fragment = this.template.element.content.cloneNode(true);
        const parts = this.template.parts;
        if (parts.length > 0) {
            // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be
            // null
            const walker = document.createTreeWalker(fragment, 133 /* NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT |
                   NodeFilter.SHOW_TEXT */, null, false);
            let index = -1;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const partActive = isTemplatePartActive(part);
                // An inactive part has no coresponding Template node.
                if (partActive) {
                    while (index < part.index) {
                        index++;
                        walker.nextNode();
                    }
                }
                this._parts.push(partActive ? this._partCallback(this, part, walker.currentNode) : undefined);
            }
        }
        return fragment;
    }
}
/**
 * Removes nodes, starting from `startNode` (inclusive) to `endNode`
 * (exclusive), from `container`.
 */
const removeNodes = (container, startNode, endNode = null) => {
    let node = startNode;
    while (node !== endNode) {
        const n = node.nextSibling;
        container.removeChild(node);
        node = n;
    }
};
//# sourceMappingURL=lit-html.js.map

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * Interprets a template literal as a lit-extended HTML template.
 */
const html$1 = (strings, ...values) => new TemplateResult(strings, values, 'html', extendedPartCallback);
/**
 * A PartCallback which allows templates to set properties and declarative
 * event handlers.
 *
 * Properties are set by default, instead of attributes. Attribute names in
 * lit-html templates preserve case, so properties are case sensitive. If an
 * expression takes up an entire attribute value, then the property is set to
 * that value. If an expression is interpolated with a string or other
 * expressions then the property is set to the string result of the
 * interpolation.
 *
 * To set an attribute instead of a property, append a `$` suffix to the
 * attribute name.
 *
 * Example:
 *
 *     html`<button class$="primary">Buy Now</button>`
 *
 * To set an event handler, prefix the attribute name with `on-`:
 *
 * Example:
 *
 *     html`<button on-click=${(e)=> this.onClickHandler(e)}>Buy Now</button>`
 *
 */
const extendedPartCallback = (instance, templatePart, node) => {
    if (templatePart.type === 'attribute') {
        if (templatePart.rawName.substr(0, 3) === 'on-') {
            const eventName = templatePart.rawName.slice(3);
            return new EventPart(instance, node, eventName);
        }
        const lastChar = templatePart.name.substr(templatePart.name.length - 1);
        if (lastChar === '$') {
            const name = templatePart.name.slice(0, -1);
            return new AttributePart(instance, node, name, templatePart.strings);
        }
        if (lastChar === '?') {
            const name = templatePart.name.slice(0, -1);
            return new BooleanAttributePart(instance, node, name, templatePart.strings);
        }
        return new PropertyPart(instance, node, templatePart.rawName, templatePart.strings);
    }
    return defaultPartCallback(instance, templatePart, node);
};
/**
 * Implements a boolean attribute, roughly as defined in the HTML
 * specification.
 *
 * If the value is truthy, then the attribute is present with a value of
 * ''. If the value is falsey, the attribute is removed.
 */
class BooleanAttributePart extends AttributePart {
    setValue(values, startIndex) {
        const s = this.strings;
        if (s.length === 2 && s[0] === '' && s[1] === '') {
            const value = getValue(this, values[startIndex]);
            if (value === noChange) {
                return;
            }
            if (value) {
                this.element.setAttribute(this.name, '');
            }
            else {
                this.element.removeAttribute(this.name);
            }
        }
        else {
            throw new Error('boolean attributes can only contain a single expression');
        }
    }
}
class PropertyPart extends AttributePart {
    setValue(values, startIndex) {
        const s = this.strings;
        let value;
        if (this._equalToPreviousValues(values, startIndex)) {
            return;
        }
        if (s.length === 2 && s[0] === '' && s[1] === '') {
            // An expression that occupies the whole attribute value will leave
            // leading and trailing empty strings.
            value = getValue(this, values[startIndex]);
        }
        else {
            // Interpolation, so interpolate
            value = this._interpolate(values, startIndex);
        }
        if (value !== noChange) {
            this.element[this.name] = value;
        }
        this._previousValues = values;
    }
}
class EventPart {
    constructor(instance, element, eventName) {
        this.instance = instance;
        this.element = element;
        this.eventName = eventName;
    }
    setValue(value) {
        const listener = getValue(this, value);
        if (listener === this._listener) {
            return;
        }
        if (listener == null) {
            this.element.removeEventListener(this.eventName, this);
        }
        else if (this._listener == null) {
            this.element.addEventListener(this.eventName, this);
        }
        this._listener = listener;
    }
    handleEvent(event) {
        if (typeof this._listener === 'function') {
            this._listener.call(this.element, event);
        }
        else if (typeof this._listener.handleEvent === 'function') {
            this._listener.handleEvent(event);
        }
    }
}
//# sourceMappingURL=lit-extended.js.map

class SongMgr extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._songs = [];
    this._artists = [];
    this.getData();
  }

  activeType() {
    let activeTab = nav.find(n => n.active);
    return activeTab.id.includes('tracks') ? 'tracks' : 'artists';
  }

  artist(artist) {
    return html$1`
    <div class="artist">
      <div class="left">
        <h2>${artist.firstname} ${artist.lastname}</h2>
        <div class="the-dash">
          ${artist.birth.toLocaleString('en', { year: 'numeric', month: '2-digit', day: 'numeric' })} -
          ${artist.death.toLocaleString('en', { year: 'numeric', month: '2-digit', day: 'numeric' })}
        </div>
        <div class="country">${artist.country}</div>
        <div class="likes">
          <button name="artist-like" uid="${artist.uid}" onclick="${this.like.bind(this, artist)}">
            <img src="../src/thumbs-up-right.svg"></img>
            ${artist.likes}
          </button>
          <button name="artist-dislike" uid="${artist.uid}" onclick="${this.dislike.bind(this, artist)}">
            <img src="../src/thumbs-down-right.svg"></img>
            ${artist.dislikes}
          </button>
          <button uid="${artist.uid}" name="artist-favorite" onclick="${this.toggleFavorite.bind(this, artist)}">
            ${artist.favorite === true ? html$1`
              <img src="../src/favorite.selected.svg"></img>
            ` : html$1`
              <img src="../src/favorite.unselected.svg"></img>
            `}
          </button>
        </div>
      </div>
      <div class="right">
        <img src="${artist.picture}"></img>
      </div>
    </div>
    `;
  }

  attributeChangedCallback(name, oVal, nVal) {
    if (nVal && !/{{|_hyper/.test(nVal) && nVal !== oVal) {
      console.log('name', name);
    }
  }

  connectedCallback() {
    this.render();
    this.shadowRoot.querySelector('#tracks').classList.add('active');
  }

  dislike(thing) {
    thing.dislikes++;
    this.syncNav();
    this.render();
    this.save(thing);
  }

  disconnectedCallback() {}

  changeNav(ev) {
    let navItems = this.shadowRoot.querySelectorAll('button.nav');
    navItems.forEach(ni => ni.classList.remove('active'));
    const target = ev.currentTarget;
    const id = target.id;
    nav.forEach(n => n.active = false);
    let selected = nav.find(n => n.id === id);
    selected.active = true;
    target.classList.add('active');
    if (/tracks/.test(selected.id)) this.getSongs(selected.id);
    if (/artists/.test(selected.id)) this.getArtists(selected.id);
    this.render();
  }

  async getArtists(filter = 'artists') {
    let artists = clone(await getArtists());
    if (filter === 'favoriteartists') this.artists = artists.filter(a => a.favorite === true);
    else this.artists = artists;
    this.syncNav();
  }

  getData(filter) {
    this.artists = this.getArtists();
    this.songs = this.getSongs();
  }

  async getSongs(filter = 'tracks') {
    this.getArtists();
    let songs = clone(await getSongs());
    if (filter === 'favoritetracks') this.songs = songs.filter(s => s.favorite === true);
    else this.songs = songs;
    this.syncArtists();
    this.syncNav();
  }

  like(thing) {
    thing.likes++;
    this.syncNav();
    this.render();
    this.save(thing);
  }

  render() {
    console.time('render');
    const template = html$1`
    <style>${css}</style>
    <nav>
    ${nav.map(n => html$1`
      <button class="nav" name="${n.id}" id="${n.id}" onclick="${this.changeNav.bind(this)}">${n.name} (${n.number})</button>
    `
    )}
    </nav>
    ${this.activeType() === 'tracks'
      ? html$1`
      <section id="tracks">
        ${Array.isArray(this.songs) ? this.songs.map(song => this.track(song)) : ''}
      </section>
      `
      : html$1`
      <section id="artists">
        ${Array.isArray(this.artists) ? this.artists.map(artist => this.artist(artist)) : ''}
      </section>
      `
    }
    `;
    render(template, this.shadowRoot);
    console.timeEnd('render');
  }

  async syncArtists() {
    this.songs.forEach(s => {
      let artist = this.artists.find(a => a.uid === s.artistId);
      s.artist = artist;
    });
  }

  save(thing) {
    const keys = Object.keys(thing);
    let type;
    if (keys.includes('firstname')) type = 'artists';
    else type = 'songs';

    db
    .get(type)
    .then(items => {
      let item = items.find(i => i.uid === thing.uid);
      Object.assign(item, clone(thing));
      return items;
    })
    .then(items => db.put(type, items));
  }

  syncNav() {
    return Promise.all([db.get('songs'), db.get('artists')])
      .then(results => ({ songs: results[0], artists: results[1] }))
      .then(o => {
        nav[0].number = o.songs.length;
        nav[1].number = o.artists.length;
        nav[2].number = this.songs.filter(s => s.favorite === true).length;
        nav[3].number = this.artists.filter(a => a.favorite === true).length;
      })
      .then(() => this.render());
  }

  track(song) {
    return html$1`
    <div class="track">
      <div class="left">
        <h2>${song.name}</h2>
        <div class="tagline">${song.tagline}</div>
        <div class="artist">${song.artist.firstname} ${song.artist.lastname}</div>
        <div class="released">${song.releaseDate.toLocaleString('en', { year: 'numeric', month: '2-digit', day: 'numeric' })}</div>
        <div class="label">${song.label}</div>
        <div class="likes">
          <button name="song-like" uid="${song.uid}" onclick="${this.like.bind(this, song)}">
            <img src="../src/thumbs-up-right.svg"></img>
            ${song.likes}
          </button>
          <button name="song-dislike" uid="${song.uid}" onclick="${this.dislike.bind(this, song)}">
            <img src="../src/thumbs-down-right.svg"></img>
            ${song.dislikes}
          </button>
          <button uid="${song.uid}" name="song-favorite" onclick="${this.toggleFavorite.bind(this, song)}">
            ${song.favorite === true ? html$1`
              <img src="../src/favorite.selected.svg"></img>
            ` : html$1`
              <img src="../src/favorite.unselected.svg"></img>
            `}
          </button>
        </div>
      </div>
      <div class="right">
        <img src="${song.image}"></img>
      </div>
    </div>
    `;
  }

  toggleFavorite(thing) {
    thing.favorite = !thing.favorite;
    this.syncNav();
    this.render();
    this.save(thing);
  }

  get artists() {
    return this._artists;
  }

  set artists(artists) {
    this._artists = artists;
  }

  get songs() {
    return this._songs;
  }

  set songs(songs) {
    this._songs = songs;
  }

  static get observedAttributes() {
    return [];
  }
}

customElements.get('song-mgr') || customElements.define('song-mgr', SongMgr);

export { SongMgr };
