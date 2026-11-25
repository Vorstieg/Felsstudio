import type { ReviewAction } from '$lib/assets/js/review-package';
import { workspaceNodes, type SharedDraft } from '$lib/state/shared-draft';
import { getGeometryCenter } from '$lib/assets/js/sector-utils';
import type { HierarchyValidationError } from '$lib/types/crag';

export type SubmissionCheck = {
	id: string;
	level: 'info' | 'warning' | 'error';
	messageKey?: string;
	messageValues?: Record<string, string | number>;
	rawMessage?: string;
	action?: 'discard-track';
};

export type ReviewSubmissionPreview = {
	draftName: string;
	entryPath: string;
	entriesCount: number;
	routesCount: number;
	tracksCount: number;
	imagesCount: number;
	modelsCount: number;
	actions: ReviewAction[];
	checks: SubmissionCheck[];
	canSubmit: boolean;
	autoFinalizedTrack: boolean;
};

function isDefaultOrEmptyName(name: string | null | undefined): boolean {
	const trimmed = String(name || '').trim();
	return !trimmed || trimmed === 'New Crag' || trimmed === 'Unnamed draft';
}

function isUnsetCoordinate(coords: [number, number] | null | undefined): boolean {
	if (!coords) return true;
	const [lng, lat] = coords;
	if (!Number.isFinite(lng) || !Number.isFinite(lat)) return true;
	return lng === 0 && lat === 0;
}

/** Build a contributor-friendly summary and preflight check list before review submission. */
export function summarizeReviewSubmission({
	draft,
	actions = [],
	hierarchyErrors = [],
	autoFinalizedTrack = false,
	trackBlockedMessage = ''
}: {
	draft: SharedDraft;
	actions?: ReviewAction[];
	hierarchyErrors?: HierarchyValidationError[];
	autoFinalizedTrack?: boolean;
	trackBlockedMessage?: string;
}): ReviewSubmissionPreview {
	const nodes = workspaceNodes(draft.workspace);
	const activeNode = nodes.find((node) => node.clientId === draft.activeNodeId) || draft.workspace;
	const activePath = [activeNode.path, activeNode.entry?.properties.id || activeNode.id]
		.filter(Boolean)
		.join('/');

	// Count distinct workspace entry directories affected by actions
	const affectedEntryDirs = new Set<string>();
	for (const action of actions) {
		const target = action.destination || action.path;
		if (!target) continue;
		const lastSlash = target.lastIndexOf('/');
		const basename = lastSlash >= 0 ? target.slice(lastSlash + 1) : target;
		const isFileTarget =
			action.action === 'write' ||
			/\.(json|geojson|glb|gltf|png|jpe?g|webp|svg|gpx|kml|txt|md)$/i.test(basename);
		const dir = isFileTarget ? (lastSlash >= 0 ? target.slice(0, lastSlash) : target) : target;
		if (dir) affectedEntryDirs.add(dir);
	}
	const dirtyEntryNodes = nodes.filter((node) => node.entry && node.dirtyPaths.length > 0);
	const entriesCount = Math.max(affectedEntryDirs.size, dirtyEntryNodes.length);

	let routesCount = 0;
	let tracksCount = 0;
	let imagesCount = 0;
	let modelsCount = 0;

	for (const node of nodes) {
		if (node.topo?.routes?.length) {
			routesCount += node.topo.routes.length;
		}
		const approachTracks = (node.access?.features || []).filter(
			(feature) =>
				(feature as { geometry?: { type?: string } } | null | undefined)?.geometry?.type ===
				'LineString'
		).length;
		const topoPaths = (node.topo?.paths?.features || []).filter(
			(feature) => feature?.geometry?.type === 'LineString'
		).length;
		tracksCount += approachTracks + topoPaths;

		const pendingUploads = (node.pendingImages || []).filter(Boolean).length;
		const hasBackgroundBlob = Boolean(node.clientId && draft.media?.[node.clientId]?.background);
		imagesCount += pendingUploads + (hasBackgroundBlob ? 1 : 0);

		if (node.clientId && draft.contexts?.[node.clientId]?.glbBlob) {
			modelsCount += 1;
		}
	}

	const checks: SubmissionCheck[] = [];

	if (trackBlockedMessage) {
		checks.push({
			id: 'active-track-blocked',
			level: 'error',
			rawMessage: trackBlockedMessage,
			action: 'discard-track'
		});
	}

	if (!draft.placed) {
		checks.push({
			id: 'missing-location',
			level: 'error',
			messageKey: 'editor.review_location_required'
		});
	}

	for (const [index, err] of hierarchyErrors.entries()) {
		checks.push({
			id: `hierarchy-error-${index}`,
			level: 'error',
			rawMessage: err.message
		});
	}

	if (autoFinalizedTrack) {
		checks.push({
			id: 'track-auto-finalized',
			level: 'info',
			messageKey: 'editor.review_track_auto_finalized'
		});
	}

	const activeName = activeNode.entry?.properties.name || draft.name;
	if (isDefaultOrEmptyName(activeName)) {
		checks.push({
			id: 'unnamed-entry',
			level: 'warning',
			messageKey: 'editor.review_check_unnamed_entry'
		});
	}

	const center = getGeometryCenter(activeNode.entry?.geometry);
	if (draft.placed && isUnsetCoordinate(center)) {
		checks.push({
			id: 'missing-coordinates',
			level: 'warning',
			messageKey: 'editor.review_check_missing_coordinates'
		});
	}

	const hasBlockingErrors = checks.some((check) => check.level === 'error');
	if (!hasBlockingErrors && actions.length === 0) {
		checks.push({
			id: 'no-changes',
			level: 'warning',
			messageKey: 'editor.no_pending_file_changes'
		});
	}

	return {
		draftName: activeNode.entry?.properties.name || draft.name || '',
		entryPath: activePath,
		entriesCount,
		routesCount,
		tracksCount,
		imagesCount,
		modelsCount,
		actions,
		checks,
		canSubmit: !hasBlockingErrors && actions.length > 0,
		autoFinalizedTrack
	};
}
