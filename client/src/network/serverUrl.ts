/**
 * Colyseus endpoint. Override with VITE_SERVER_URL (e.g. https://game.example.com);
 * by default the server is expected on port 2567 of the host serving the page,
 * which works for localhost, LAN testing and the docker-compose setup.
 */
export function getServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${window.location.hostname}:2567`;
}
