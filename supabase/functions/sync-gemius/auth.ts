const GDE_API_BASE = "https://gdeapi.gemius.com";

let _sessionId: string | null = null;

/**
 * Open a gDE API session using login credentials.
 * Caches sessionId for reuse within the same invocation.
 */
export async function openSession(): Promise<string> {
  if (_sessionId) return _sessionId;

  const login = Deno.env.get("GEMIUS_USERNAME");
  const passwd = Deno.env.get("GEMIUS_PASSWORD");
  if (!login || !passwd) {
    throw new Error("GEMIUS_USERNAME and GEMIUS_PASSWORD must be set as secrets");
  }

  const url = `${GDE_API_BASE}/OpenSession.php?ignoreEmptyParams=Y`;
  const body = new URLSearchParams({ login, passwd });
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`OpenSession HTTP ${resp.status}`);

  const xml = await resp.text();
  const statusMatch = xml.match(/<status>(.*?)<\/status>/);
  if (statusMatch && statusMatch[1] !== "OK") {
    throw new Error(`OpenSession failed: ${statusMatch[1]} — ${xml}`);
  }

  const sessionMatch = xml.match(/<sessionID>(.*?)<\/sessionID>/);
  if (!sessionMatch) {
    throw new Error(`OpenSession: no sessionID in response — ${xml.substring(0, 200)}`);
  }

  _sessionId = sessionMatch[1];
  console.log(`[gemius] Session opened: ${_sessionId.substring(0, 8)}...`);
  return _sessionId;
}

/**
 * Close the current gDE API session.
 */
export async function closeSession(): Promise<void> {
  if (!_sessionId) return;

  try {
    const url = `${GDE_API_BASE}/CloseSession.php?ignoreEmptyParams=Y&sessionID=${_sessionId}`;
    await fetch(url);
    console.log(`[gemius] Session closed`);
  } catch (err) {
    console.warn(`[gemius] CloseSession error (non-fatal):`, err);
  } finally {
    _sessionId = null;
  }
}

export { GDE_API_BASE };
