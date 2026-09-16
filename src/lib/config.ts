export const cragsPerPage = 50;

export const maptilerApiKey = (import.meta.env.VITE_MAPTILER_API_KEY || '').trim();

export const types = [
	'sports-climbing',
	'bouldering',
	'multi-pitch',
	'trad',
	'alpine-tour',
	'via-ferrata'
] as const;

export const rockTypes = [
	'granite',
	'gneiss',
	'limestone',
	'dolomite',
	'sandstone',
	'basalt',
	'tuff',
	'rhyolite',
	'quartzite',
	'conglomerate',
	'schist',
	'slate'
] as const;

export type CragType = (typeof types)[number];
export type RockType = (typeof rockTypes)[number];
