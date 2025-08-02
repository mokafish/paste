// app.js
import Koa from 'koa';
import Router from '@koa/router';
import Store, { Item } from './store.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const app = new Koa();
const router = new Router();
const store = await Store.main();
const mainPage = fs.readFileSync(fileURLToPath(
    import.meta.resolve('./index.html', import.meta.url)), 'utf-8');
const initTime = new Date()

router.get('/', async (ctx) => {
    ctx.status = 200;
    // ctx.set('Cache-Control', 'public, max-age=300');
    ctx.set('Last-Modified', initTime.toUTCString());
    ctx.set('ETag', `W/"${initTime.getTime()}"`);
    if (ctx.$view === 'html') {
        ctx.set('Content-Type', 'text/html');
        ctx.body = mainPage;
    } else {
        ctx.set('Content-Type', 'text/plain');
        ctx.body = `curl ${ctx.$prefix} --data-binary '@FILE.txt'\n`;
    }
});

router.get('/:id', async (ctx) => {
    const id = ctx.params.id;

    const item = await store.get(id);
    if (item.metadata.size === 0) {
        ctx.status = 404;
        ctx.body = '404 Not Found.\n';
    } else {
        ctx.status = 200;
        ctx.set('Content-Type', 'text/plain');
        ctx.set('Content-Length', item.metadata.size);
        ctx.set('Last-Modified', item.metadata.mtime);
        ctx.body = item.stream;
    }
});

router.put('/:id', async (ctx) => {
    const id = ctx.params.id;
    await store.set(id, new Item(ctx.req, {
        size: parseInt(ctx.request.header['content-length'] || 0),
        mtime: new Date().toUTCString()
    }));

    ctx.status = 200;
    ctx.body = ctx.$prefix + id;
});

router.post('/:id', async (ctx) => {
    const id = ctx.params.id;

    const exists = await store.exists(id);
    if (exists) {
        ctx.status = 409;
        ctx.body = `Conflict: ${id} already exists`;
        return;
    }

    await store.set(id, new Item(ctx.req, {
        size: parseInt(ctx.request.header['content-length'] || 0),
        mtime: new Date().toUTCString()
    }));
    ctx.status = 201;
    ctx.body = ctx.$prefix + id;
});

router.post('/', async (ctx, next) => {
    const id = mkid();
    await store.set(id, new Item(ctx.req, {
        size: parseInt(ctx.request.header['content-length'] || 0),
        mtime: new Date().toUTCString()
    }));
    ctx.status = 201;
    ctx.body = ctx.$prefix + id;
});

router.put('/', async (ctx, next) => {
    const id = mkid();
    await store.set(id, new Item(ctx.req, {
        size: parseInt(ctx.request.header['content-length'] || 0),
        mtime: new Date().toUTCString()
    }));
    ctx.status = 200;
    ctx.body = ctx.$prefix + id;
});


router.delete('/:id', async (ctx) => {
    const id = ctx.params.id;
    await store.delete(id);
    ctx.status = 200;
    ctx.body = 'deleted';
});

// 错误处理中间件
app.use(async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        console.error(`[${new Date().toISOString()}] ERROR:`, err);
        ctx.status = err.status || 500;
        ctx.body = err.message || 'Internal Server Error';
    }
});

// 设置视图渲染中间件
app.use(async (ctx, next) => {
    const accept = ctx.headers['accept'] || '';
    const userAgent = ctx.headers['user-agent'] || '';
    if (userAgent.slice(1, 7) === 'ozilla' && accept.includes('text/html')) {
        ctx.$view = 'html';
    } else {
        ctx.$view = null;
    }
    await next();
})

// 设置url前缀中间件
app.use(async (ctx, next) => {
    const host = ctx.request.header['x-forwarded-host'] || ctx.request.header.host;
    const protocol = ctx.request.header['x-forwarded-proto'] || ctx.request.protocol;
    ctx.$prefix = `${protocol}://${host}/`;
    await next();
})

// 设置路由中间件
app.use(router.routes());
app.use(router.allowedMethods());


function mkid(seed) {
    seed = seed || Date.now();
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE((seed & 0xFFFFFFFF) >>> 0, 0);
    return buffer.toString('base64url');
}

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || '127.0.0.1';
app.listen(PORT, () => {
    console.log(`start pid ${process.pid}`);
    console.log(`running on http://${HOSTNAME}:${PORT}`);
});
