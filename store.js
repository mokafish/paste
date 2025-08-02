// store.js
import path from 'node:path';
import fs from 'node:fs';
import stream from 'node:stream';
import { fileURLToPath } from 'node:url';

let mainStore = null;

export class Item {
    /**
     * 
     * @param {stream.Duplex} stream 
     * @param {object<string,any>} metadata 
     */
    constructor(stream, metadata = {}) {
        this.stream = stream;
        this.metadata = metadata;
    }
}


export default class Store {
    async init() { }
    async get(id) { return new Item(); }
    async set(id, item) { }
    // async getStream(id) { return new Readable() }
    // async setStream(id, stream) { return false }
    async exists(id) { return false }
    async delete(id) { }

    /** @returns {Promise<Store>} */
    static async main() {
        if (mainStore) return mainStore;

        mainStore = new FileStore(path.join(path.dirname(
            fileURLToPath(import.meta.url)), 'db'));
        await mainStore.init();
        return mainStore;
    }
}

export class FileStore extends Store {
    constructor(directory, depth = 2) {
        super();
        this.directory = directory;
        this.depth = depth;
    }

    async init() {
        fs.mkdirSync(this.directory, { recursive: true });
    }

    // 生成分片文件路径
    _getShardedPath(id) {
        const hash = this._simpleHash(id);
        let current = this.directory;

        for (let i = 0; i < this.depth; i++) {
            const segment = hash.slice(i * 2, (i + 1) * 2) || '00';
            current = path.join(current, segment);
        }

        return path.join(current, id);
    }

    // 简单哈希函数用于分片
    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }

    async set(id, item, limit = 1024 * 1024 * 10) {
        const { stream: readableStream, metadata } = item;
        if (metadata.size && metadata.size > limit) {
            throw new TooLargeError()
        }
        const filePath = this._getShardedPath(id);
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        const writeStream = fs.createWriteStream(filePath);
        const limitStream = new LimitStream(limit);
        return new Promise((resolve, reject) => {
            stream.pipeline(
                readableStream,
                limitStream,
                writeStream,
                (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            );
            // readableStream
            //     .pipe(limitStream)
            //     .on('error', (err) => {
            //         reject(err);
            //     })
            //     .pipe(writeStream)
            //     .on('finish', () => resolve())
            //     .on('error', (err) => {
            //         reject(err);
            //     });
        });
    }

    async get(id) {
        const filePath = this._getShardedPath(id);
        const item = new Item(null, { size: 0, mtime: new Date().toUTCString() });
        try {
            const stats = fs.statSync(filePath);
            if (stats.size !== 0) {
                item.metadata.size = stats.size;
                item.mtime = stats.mtime.toUTCString();
                item.stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 }); // 64KB 分块读取
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                // pass
            } else {
                throw error;
            }
        }

        return item
    }

    async exists(id) {
        const filePath = this._getShardedPath(id);
        return fs.existsSync(filePath);
    }

    async delete(id) {
        const filePath = this._getShardedPath(id);
        try {
            fs.unlinkSync(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
}


class LimitStream extends stream.Transform {
    constructor(limit) {
        super();
        this.limit = limit;
        this.size = 0;
    }

    _transform(chunk, encoding, callback) {
        this.size += chunk.length;

        if (this.size > this.limit) {
            return callback(new TooLargeError());
        }

        this.push(chunk);
        callback();
    }
}



class TooLargeError extends Error {
    constructor(message = 'Request body too large') {
        super(message);
        this.name = 'TooLargeError';
        this.code = 'TOO_LARGE';
    }
}