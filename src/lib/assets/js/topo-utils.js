import { Vector3 } from 'three';
import { generateId } from './id-utils.js';

export { fixpointSymbols, topoSymbols } from '@vorstieg/topo-renderer';

export const availableTopoTags = [
	'Kinderfreundlich', 'Regensicher', 'Kurzer Zustieg', 'Alpin', 'Brüchig', 'Beliebt',
	'Morgensonne', 'Abendsonne', 'Schattig', 'Gletscher', 'Firn', 'Grat', 'Ausgesetzt',
	'Steinschlag', 'Spaltengefahr', 'Klettersteig'
];

export const availableRouteTags = [
	'Technisch', 'Kraft', 'Ausdauer', 'Leisten', 'Löcher', 'Riss', 'Platte', 'Überhang',
	'Weite Haken', 'Abgespeckt', 'Klassiker', 'Boulder-Start', 'Gletscher', 'Firn', 'Grat',
	'Ausgesetzt', 'Steinschlag', 'Spaltengefahr', 'Klettersteig'
];

export function getDefaultGeometryMode(type) {
	if (type === 'alpine-tour') return 'track';
	if (type === 'via-ferrata') return 'hybrid';
	return 'topo';
}

export function convertRouteType(route, newType) {
	const isMultiPitch = (type) =>
		Array.isArray(type) ? type.includes('multi-pitch') : type === 'multi-pitch';
	const wasMultiPitch = isMultiPitch(route.type);
	const willBeMultiPitch = newType === 'multi-pitch';

	if (willBeMultiPitch && !wasMultiPitch) {
		route.pitches = [{
			id: generateId('pitch'), pitchNumber: 1, grade: route.grade,
			_gradeScale: route._gradeScale || 'french', length: route.length,
			description: route.description, points: route.points || [], type: 'pitch'
		}];
		route.length = 0;
		route.points = [];
	} else if (!willBeMultiPitch && wasMultiPitch) {
		if (route.pitches?.length) {
			const first = route.pitches[0];
			route.grade = first.grade;
			route._gradeScale = first._gradeScale;
			route.length = first.length;
			route.description = first.description;
			route.points = first.points;
		}
		delete route.pitches;
	}

	route.topo = { ...(route.topo || {}) };
	if (!route.assets) route.assets = { paths: [] };
	if (!route.assets.paths) route.assets.paths = [];
	if (Array.isArray(route.type)) {
		if (willBeMultiPitch && !route.type.includes('multi-pitch')) route.type.push('multi-pitch');
		else if (!willBeMultiPitch && route.type.includes('multi-pitch')) {
			route.type = route.type.filter((type) => type !== 'multi-pitch');
			if (!route.type.length) route.type = [newType];
		} else route.type = [newType];
	} else route.type = [newType];
}

export function calculateRouteLength(route, scale = 1) {
	if (!route.points || route.points.length < 2) return 0;
	let length = 0;
	for (let index = 0; index < route.points.length - 1; index++) {
		length += new Vector3(...route.points[index]).distanceTo(new Vector3(...route.points[index + 1]));
	}
	return parseFloat((length * scale).toFixed(1));
}

export function calculateBoltAmount(route, fixPoints = []) {
	if (!route.fixPoints || !fixPoints) return 0;
	return route.fixPoints.filter((id) => fixPoints.find((point) => point.id === id)?.type === 'bolt').length;
}
