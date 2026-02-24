// Bump this value on every release that changes cached assets.
const SW_VERSION = 'v18';
const STATIC_CACHE = `static-${SW_VERSION}`;
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;
const APP_SHELL_KEY = new Request('./index.html');

const PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json',
    './css/inter-local.css',
    './css/styles.css',
    './js/utils.js',
    './js/db.js',
    './js/config-defaults.js',
    './js/app-version.js',
    './js/escolas.js',
    './js/turmas.js',
    './js/alunos.js',
    './js/chamadas.js',
    './js/scanner.js',
    './js/export.js',
    './js/qrgen.js',
    './js/app.js',
    './libs/html5-qrcode.min.js',
    './libs/jspdf.umd.min.js',
    './libs/qrcode.min.js',
    './libs/xlsx.full.min.js',
    './assets/logo1024.svg',
    './assets/logo1024wt.svg',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/icons/icon-512-maskable.png',
    './assets/icons/apple-touch-icon.png',
    './assets/icons/favicon-32.png',
    './assets/modelos/modelo_alunos.xlsx',
    './assets/fonts/inter-300.ttf',
    './assets/fonts/inter-400.ttf',
    './assets/fonts/inter-500.ttf',
    './assets/fonts/inter-600.ttf',
    './assets/fonts/inter-700.ttf'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) =>
            cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })))
        )
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
                    .map((key) => caches.delete(key))
            )
        ).then(async () => {
            if ('navigationPreload' in self.registration) {
                try {
                    await self.registration.navigationPreload.enable();
                } catch (_) { }
            }
            await self.clients.claim();
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                const runtimeCache = await caches.open(RUNTIME_CACHE);
                try {
                    const preloaded = await event.preloadResponse;
                    if (preloaded) {
                        runtimeCache.put(APP_SHELL_KEY, preloaded.clone());
                        return preloaded;
                    }
                    const network = await fetch(request);
                    if (network && network.ok) {
                        runtimeCache.put(APP_SHELL_KEY, network.clone());
                    }
                    return network;
                } catch (_) {
                    const cached = await caches.match(APP_SHELL_KEY);
                    return cached || Response.error();
                }
            })()
        );
        return;
    }

    const isStaticAsset =
        /\/css\//.test(url.pathname) ||
        /\/js\//.test(url.pathname) ||
        /\/libs\//.test(url.pathname) ||
        /\/assets\//.test(url.pathname) ||
        /\.(css|js|svg|png|jpg|jpeg|webp|ttf|woff2?|json|csv)$/.test(url.pathname);

    if (isStaticAsset) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(STATIC_CACHE);
                const cacheKey = new Request(url.pathname);
                const cached = await cache.match(cacheKey);

                const networkFetch = fetch(request)
                    .then((response) => {
                        if (response && response.ok) {
                            cache.put(cacheKey, response.clone());
                        }
                        return response;
                    })
                    .catch(() => null);

                if (cached) {
                    event.waitUntil(networkFetch);
                    return cached;
                }

                return (await networkFetch) || Response.error();
            })()
        );
        return;
    }

    event.respondWith(
        (async () => {
            try {
                return await fetch(request);
            } catch (_) {
                const runtimeCache = await caches.open(RUNTIME_CACHE);
                const cached = await runtimeCache.match(request);
                return cached || Response.error();
            }
        })()
    );
});


