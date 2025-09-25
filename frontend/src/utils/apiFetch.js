// src/utils/apiFetch.js
export default async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include", // later useful if you add sessions/JWT cookies
    ...options,
  });

  // safely parse JSON
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    // ignore parse error
  }

  // return unified response
  return {
    ok: res.ok && data.ok, // backend sets data.ok
    status: res.status,
    ...data,
  };
}
