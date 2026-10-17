/* global fetch */
const API = (() => {
  async function req(method, path, body) {
    const opts = { method, credentials: 'include', headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.issues = data && data.issues;
      throw err;
    }
    return data;
  }
  return {
    get: (path) => req('GET', path),
    post: (path, body) => req('POST', path, body || {}),
    patch: (path, body) => req('PATCH', path, body || {}),
    del: (path) => req('DELETE', path),
  };
})();
