const CACHE_NAME = "nexus-ledger-v59";
const SHELL = [
  "./index.html",
  "./guide.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isNavigation(request) {
  return request.mode === "navigate" ||
    (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

function isHtml(url) {
  return url.pathname.endsWith(".html") || url.pathname.endsWith("/");
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isFirebaseCdn = url.hostname === "www.gstatic.com";
  if (url.origin !== self.location.origin && !isFirebaseCdn) return;

  // HTMLは常にネットワーク優先（古い台帳レイアウトが残らないように）
  if (isNavigation(event.request) || isHtml(url)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Firebase の部品（gstatic）はオフラインでも読めるようキャッシュ優先で保存
  // （無いとネットが切れた状態で開き直すと、画面の読み込みが止まるため）
  if (isFirebaseCdn) {
    event.respondWith(
      caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
