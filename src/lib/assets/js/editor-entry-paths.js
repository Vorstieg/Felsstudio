export function splitEntryPath(entryPath) {
	const normalized = (entryPath || '').replace(/^\/+|\/+$/g, '');
	const parts = normalized.split('/').filter(Boolean);
	return { path: parts.slice(0, -1).join('/'), id: parts.at(-1) || '' };
}

export function getCragEntryPath(crag) {
	return (crag?.entryPath || crag?.properties?.path || '').replace(/^\/+|\/+$/g, '');
}

export function getCragEditorPath(crag) {
	return `/crags/editor/${getCragEntryPath(crag)}`;
}

export function getTopoEditorPath(workspace, crag, sector = null) {
	const path = `${workspace}/${getCragEntryPath(crag)}`;
	return sector?.id ? `${path}?sector=${encodeURIComponent(sector.id)}` : path;
}
