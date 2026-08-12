// Controls how many posts are shown per page on the main blog index pages
export const cragsPerPage = 50;

// Browser keys are public, but are supplied by each deployment so their
// allowed origins and quotas can be managed outside the source tree.
export const maptilerApiKey = (import.meta.env.VITE_MAPTILER_API_KEY || '').trim();

export const types = [
	'sports-climbing',
	'bouldering',
	'multi-pitch',
	'trad',
	'alpine-tour',
	'via-ferrata'
];

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
];
