/**
 * Shared API fetch wrapper.
 *
 * - Attaches the Authorization header from the provided token.
 * - Detects 401 responses and redirects to the login page
 *   so the user can re-authenticate (Supabase token expired).
 */

const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function apiFetch(
  path,
  { token, method, body, headers: extraHeaders } = {}
) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
  // Default to JSON content-type for POST/PUT/PATCH unless the caller
  // explicitly provides their own Content-Type.
  if (body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: method || (body ? "POST" : "GET"),
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // If the token is expired or invalid, redirect to login.
  // The backend returns 401 when the JWT cannot be validated.
  if (response.status === 401) {
    // Import supabase lazily to avoid circular deps on first load.
    const { supabase } = await import("./supabaseClient");
    await supabase.auth.signOut();
    window.location.href = "/";
    throw new Error("Session expired — redirecting to login");
  }

  return response;
}
