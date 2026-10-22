/* Service Worker do RASEC Espetinhos — Totem
   Estratégias: precache do app shell + cache-first (assets estáticos)
   + network-first (navegação, com fallback à página offline). */

'use strict';

const VERSAO = 'rasec-v1.0.0';
const CACHE_ESTATICO = `${VERSAO}-estatico`;
const CACHE_PAGINAS = `${VERSAO}-paginas`;

const SHELL = [
  './',
  './index.html',
  './offline.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_ESTATICO);
      await Promise.allSettled(SHELL.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          .filter((nome) => !nome.startsWith(VERSAO))
          .map((nome) => caches.delete(nome))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: network-first com fallback (offline.html > index em cache)
  if (request.mode === 'navigate') {
    evento.respondWith(
      (async () => {
        try {
          const resposta = await fetch(request);
          const cache = await caches.open(CACHE_PAGINAS);
          cache.put(request, resposta.clone());
          return resposta;
        } catch (_) {
          const cache = await caches.open(CACHE_PAGINAS);
          return (
            (await cache.match(request)) ||
            (await caches.match('./index.html')) ||
            (await caches.match('./offline.html')) ||
            new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
          );
        }
      })()
    );
    return;
  }

  // Demais requests do mesmo origin (css/js/imagens): cache-first
  evento.respondWith(
    (async () => {
      const hit = await caches.match(request);
      if (hit) return hit;
      try {
        const resposta = await fetch(request);
        if (resposta && resposta.ok) {
          const cache = await caches.open(CACHE_ESTATICO);
          cache.put(request, resposta.clone());
        }
        return resposta;
      } catch (_) {
        return new Response('', { status: 504 });
      }
    })()
  );
});
