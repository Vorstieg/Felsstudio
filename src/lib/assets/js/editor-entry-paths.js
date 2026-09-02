export function splitEntryPath(entryPath) {
	const normalized = (entryPath || '').replace(/^\/+|\/+$/g, '');
	const parts = normalized.split('/').filter(Boolean);
	return { path: parts.slice(0, -1).join('/'), id: parts.at(-1) || '' };
}

export function getCragEditorPath(crag) {
	return `/crags/editor/${(crag.properties?.path || '').replace(/^\/+|\/+$/g, '')}`;
}

export function getTopoEditorPath(workspace, crag, sector = null) {
	const path = `${workspace}/${(crag.properties?.path || '').replace(/^\/+|\/+$/g, '')}`;
	return sector?.id ? `${path}?sector=${encodeURIComponent(sector.id)}` : path;
}
