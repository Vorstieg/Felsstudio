import type { FelsTopoDocument, PathFeature } from '@vorstieg/fels-types/types';

export type RoutePathRole = 'approach' | 'main' | 'descent' | 'variant';

export type RoutePathRoleMeta = {
	id: RoutePathRole;
	labelKey: string;
	shortLabelKey: string;
	mapColor: string;
	badgeClass: string;
	dotClass: string;
};

export const ROUTE_PATH_ROLES: readonly RoutePathRoleMeta[] = [
	{
		id: 'approach',
		labelKey: 'editor.approach',
		shortLabelKey: 'editor.approach',
		mapColor: '#0d9488',
		badgeClass: 'border-teal-200 bg-teal-50 text-teal-800',
		dotClass: 'bg-teal-600'
	},
	{
		id: 'main',
		labelKey: 'editor.main',
		shortLabelKey: 'editor.role_main_short',
		mapColor: '#0075de',
		badgeClass: 'border-creator-blue/25 bg-creator-blue/10 text-creator-blue',
		dotClass: 'bg-creator-blue'
	},
	{
		id: 'descent',
		labelKey: 'editor.descent',
		shortLabelKey: 'editor.descent',
		mapColor: '#d97706',
		badgeClass: 'border-amber-200 bg-amber-50 text-amber-800',
		dotClass: 'bg-amber-600'
	},
	{
		id: 'variant',
		labelKey: 'editor.variant',
		shortLabelKey: 'editor.variant',
		mapColor: '#7c3aed',
		badgeClass: 'border-purple-200 bg-purple-50 text-purple-800',
		dotClass: 'bg-purple-600'
	}
] as const;

const ROLE_ORDER: RoutePathRole[] = ['approach', 'main', 'descent', 'variant'];

export function normalizeRoutePathRole(role?: string | null): RoutePathRole {
	if (role === 'approach' || role === 'main' || role === 'descent' || role === 'variant') {
		return role;
	}
	return 'main';
}

export function getRoutePathRoleMeta(role?: string | null): RoutePathRoleMeta {
	const normalized = normalizeRoutePathRole(role);
	return ROUTE_PATH_ROLES.find((item) => item.id === normalized) || ROUTE_PATH_ROLES[1];
}

export function nextRoutePathRole(role?: string | null): RoutePathRole {
	const current = normalizeRoutePathRole(role);
	const index = ROLE_ORDER.indexOf(current);
	return ROLE_ORDER[(index + 1) % ROLE_ORDER.length];
}

/** Infer a sensible default role from a path or GPX track name. */
export function inferRoutePathRole(
	name?: string | null,
	fallback: RoutePathRole = 'main'
): RoutePathRole {
	const text = String(name || '').toLowerCase();
	if (!text) return fallback;
	if (/\b(abstieg|abseil\w*|descent|rappel|retour|rückweg|rueckweg)\b/i.test(text)) {
		return 'descent';
	}
	if (/\b(zustieg|zuweg|approach|parkplatz|parking|anmarsch|einstieg)\b/i.test(text)) {
		return 'approach';
	}
	if (/\b(variante|variant|ausstieg|exit|alternative)\b/i.test(text)) {
		return 'variant';
	}
	return fallback;
}

/** Resolve the primary semantic role of a topo path across its assigned routes (for map coloring). */
export function getPrimaryPathRole(
	document: FelsTopoDocument | null | undefined,
	feature: PathFeature | null | undefined
): RoutePathRole {
	if (!feature) return 'main';
	const roles: RoutePathRole[] = [];
	for (const route of document?.routes || []) {
		for (const ref of route.pathRefs || []) {
			if (String(ref.pathId) === String(feature.id)) {
				roles.push(normalizeRoutePathRole(ref.role));
			}
		}
	}
	if (roles.length === 0) {
		return inferRoutePathRole((feature.properties as { name?: string } | undefined)?.name, 'main');
	}
	// If multiple routes assign roles to the same path, pick the most frequent (tie-break by priority).
	const counts = new Map<RoutePathRole, number>();
	for (const role of roles) counts.set(role, (counts.get(role) || 0) + 1);
	let best = roles[0];
	let bestCount = 0;
	for (const role of ROLE_ORDER) {
		const count = counts.get(role) || 0;
		if (count > bestCount) {
			best = role;
			bestCount = count;
		}
	}
	return best;
}
