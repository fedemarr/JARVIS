export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, credentials: 'same-origin' });
  if (response.status === 401) window.dispatchEvent(new Event('jarvis-session-expired'));
  return response;
}
