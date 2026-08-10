export const gradeSystems = {
	french: [
		'1a',
		'2a',
		'3a',
		'4a',
		'4b',
		'4c',
		'5a',
		'5b',
		'5c',
		'6a',
		'6a+',
		'6b',
		'6b+',
		'6c',
		'6c+',
		'7a',
		'7a+',
		'7b',
		'7b+',
		'7c',
		'7c+',
		'8a',
		'8a+',
		'8b',
		'8b+',
		'9a'
	],

	uiaa: [
		'I',
		'II',
		'III',
		'IV',
		'IV+',
		'V-',
		'V',
		'V+',
		'VI-',
		'VI',
		'VI+',
		'VII-',
		'VII',
		'VII+',
		'VIII-',
		'VIII',
		'VIII+',
		'IX-',
		'IX',
		'IX+',
		'X-',
		'X',
		'X+',
		'XI-',
		'XI',
		'XI+'
	],

	// French Alpine System for Hochtouren
	sac: ['F', 'PD', 'AD', 'D', 'TD', 'ED'],

	// Via Ferrata Grades (Hüsler Scale)
	huelser: ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'],

	// Via Ferrata Grades (Schall Scale)
	schall: ['A', 'A/B', 'B', 'B/C', 'C', 'C/D', 'D', 'D/E', 'E']
};

export function getAvailableGradeSystems(routeType) {
	if (routeType === 'alpine-tour') {
		return ['sac', 'uiaa'];
	} else if (routeType === 'via-ferrata') {
		return ['schall', 'huelser'];
	} else {
		return ['uiaa', 'french'];
	}
}
