import { routingProfile, routingUrl } from '$lib/config.ts';

export type TrackCoordinate = [longitude: number, latitude: number];

/**
 * BRouter profile for tracing climbing approaches, hard hiking trails (SAC T1–T6),
 * and via ferratas (highway=via_ferrata) in both directions without detouring onto easy roads.
 */
export const ALPINE_TRACE_PROFILE = `---context:global
assign validForFoot = true
assign allow_steps = true
assign allow_ferries = false
assign ignore_bicycle_no = true
assign considerTurnRestrictions = false
assign processUnusedTags = true

---context:way
assign is_via_ferrata = highway=via_ferrata
assign has_sac_scale = not sac_scale=
assign is_trail = or is_via_ferrata or has_sac_scale or highway=path or highway=footway or highway=track or highway=steps highway=bridleway
assign is_road = or highway=pedestrian or highway=living_street or highway=residential or highway=service or highway=unclassified or highway=road or highway=tertiary or highway=secondary or highway=primary or highway=tertiary_link or highway=secondary_link highway=primary_link
assign is_blocked = and not is_via_ferrata or highway=motorway or highway=motorway_link or highway=trunk or highway=trunk_link foot=no

assign costfactor =
  if is_blocked then 10000
  else if is_via_ferrata then 1.0
  else if is_trail then 1.02
  else if is_road then 1.15
  else 10000

assign turncost = 0
assign initialcost = 0

---context:node
assign initialcost = 0
`;

interface ProfileUploadResponse {
	profileid?: unknown;
	error?: unknown;
}

interface GeoJsonRouteResponse {
	features?: Array<{
		geometry?: {
			coordinates?: unknown;
		};
	}>;
}

let cachedProfileId: string | null = null;
let pendingProfileUpload: Promise<string> | null = null;

export function resetRoutingProfileCache(): void {
	cachedProfileId = null;
	pendingProfileUpload = null;
}

async function uploadAlpineTraceProfile(): Promise<string> {
	const response = await fetch(`${routingUrl}/profile`, {
		method: 'POST',
		headers: { 'Content-Type': 'text/plain' },
		body: ALPINE_TRACE_PROFILE
	});
	if (!response.ok) throw new Error('Routing unavailable');
	const data = (await response.json()) as ProfileUploadResponse;
	if (typeof data.profileid !== 'string' || !data.profileid.trim()) {
		throw new Error('Routing unavailable');
	}
	cachedProfileId = data.profileid;
	return data.profileid;
}

async function resolveProfileId(signal?: AbortSignal): Promise<{ id: string; fromCache: boolean }> {
	if (routingProfile) return { id: routingProfile, fromCache: false };
	if (cachedProfileId) return { id: cachedProfileId, fromCache: true };
	if (!pendingProfileUpload) {
		pendingProfileUpload = uploadAlpineTraceProfile().finally(() => {
			pendingProfileUpload = null;
		});
	}
	const id = await pendingProfileUpload;
	if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
	return { id, fromCache: false };
}

function buildRouteUrl(from: TrackCoordinate, to: TrackCoordinate, profileId: string): string {
	const lonlats = `${from[0]},${from[1]}|${to[0]},${to[1]}`;
	const params = new URLSearchParams({
		lonlats,
		profile: profileId,
		alternativeidx: '0',
		format: 'geojson'
	});
	return `${routingUrl}?${params.toString()}`;
}

function extractCoordinates(data: GeoJsonRouteResponse): TrackCoordinate[] {
	const raw = data.features?.[0]?.geometry?.coordinates;
	if (
		!Array.isArray(raw) ||
		raw.length < 2 ||
		raw.some(
			(point) =>
				!Array.isArray(point) ||
				point.length < 2 ||
				!Number.isFinite(point[0]) ||
				!Number.isFinite(point[1])
		)
	) {
		throw new Error('Routing unavailable');
	}
	return raw.map((point) => [point[0] as number, point[1] as number]);
}

export async function getRoutedSegment(
	from: TrackCoordinate,
	to: TrackCoordinate,
	signal?: AbortSignal
): Promise<TrackCoordinate[]> {
	const initial = await resolveProfileId(signal);
	let response = await fetch(buildRouteUrl(from, to, initial.id), { signal });

	// A BRouter server restart can evict uploaded custom profiles; re-upload once if cached.
	if (!response.ok && initial.fromCache && !routingProfile) {
		resetRoutingProfileCache();
		const refreshed = await resolveProfileId(signal);
		response = await fetch(buildRouteUrl(from, to, refreshed.id), { signal });
	}

	if (!response.ok) throw new Error('Routing unavailable');
	const data = (await response.json()) as GeoJsonRouteResponse;
	return extractCoordinates(data);
}
