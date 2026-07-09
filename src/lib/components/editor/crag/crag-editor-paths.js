import { pathBasename, pathDirname } from '$lib/assets/js/sector-utils.js';

export function slugifyName(value, fallback = 'new-crag') {
	return (
		(value || fallback)
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || fallback
	);
}

export function normalizePath(path = '') {
	return String(path)
		.replace(/^\/+|\/+$/g, '')
		.replace(/\/+/g, '/');
}

export function getCragEntryPath(crag) {
	const slug = slugifyName(crag.name);
	const currentPath = normalizePath(crag.path || '');
	if (!currentPath) return '';
	if (pathBasename(currentPath) === slug) return currentPath;
	const parent = pathDirname(currentPath) || currentPath;
	return normalizePath(`${parent}/${slug}`);
}

export function getCragId(crag) {
	return crag.id || crag.path?.split('/').filter(Boolean).at(-1) || slugifyName(crag.name);
}

export function getTopoId(crag, sector = null) {
	const cragId = getCragId(crag);
	return sector?.id ? `${cragId}:${sector.id}` : cragId;
}
