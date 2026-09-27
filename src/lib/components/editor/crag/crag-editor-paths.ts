/** Convert a crag or folder name into a stable URL path segment. */
export function slugifyName(value: string): string {
	return (
		value
			.trim()
			.toLowerCase()
			// Preserve the German spelling when converting names to stable slugs.
			.replace(/ä/g, 'ae')
			.replace(/ö/g, 'oe')
			.replace(/ü/g, 'ue')
			.replace(/ß/g, 'ss')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
	);
}

/** Remove leading and trailing slashes and collapse repeated separators. */
export function normalizePath(path: string = ''): string {
	return path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}
