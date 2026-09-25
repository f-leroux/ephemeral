// Where the score API lives. Locally, server.js serves it on the same origin;
// on GitHub Pages it's the Cloudflare Worker in /worker.
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname) || /^192\.168\.|^10\./.test(location.hostname);

export const API_BASE = LOCAL ? '' : 'https://ephemeral-scores.f-leroux.workers.dev';
