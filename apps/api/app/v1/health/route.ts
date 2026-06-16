/**
 * Liveness/health probe for the TryIt API.
 *
 * Returns a static `{ status: 'ok' }` payload so load balancers, uptime checks, and
 * the integration test suite can confirm the service is up. No auth and no side
 * effects — this endpoint is deliberately the one route that reveals nothing sensitive.
 */
export async function GET() {
  return Response.json({ status: 'ok' });
}
