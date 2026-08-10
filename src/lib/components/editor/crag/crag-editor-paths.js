export function slugifyName(value) {
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

export function normalizePath(path = '') {
	return String(path)
		.replace(/^\/+|\/+$/g, '')
		.replace(/\/+/g, '/');
}
