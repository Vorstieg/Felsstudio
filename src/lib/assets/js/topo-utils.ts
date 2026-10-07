import { Vector3 } from 'three';
import { generateId } from './id-utils.ts';
import type { FixPoint, Path3D, Route } from '@vorstieg/fels-types/types';

export { fixpointSymbols, topoSymbols } from '@vorstieg/topo-renderer';

export const availableTopoTags = [
	'Kinderfreundlich',
	'Regensicher',
	'Kurzer Zustieg',
	'Alpin',
	'Brüchig',
	'Beliebt',
	'Morgensonne',
	'Abendsonne',
	'Schattig',
	'Gletscher',
	'Firn',
	'Grat',
	'Ausgesetzt',
	'Steinschlag',
	'Spaltengefahr',
	'Klettersteig'
];

export const availableRouteTags = [
	'Technisch',
	'Kraft',
	'Ausdauer',
	'Leisten',
	'Löcher',
	'Riss',
	'Platte',
	'Überhang',
	'Weite Haken',
	'Abgespeckt',
	'Klassiker',
	'Boulder-Start',
	'Gletscher',
	'Firn',
	'Grat',
	'Ausgesetzt',
	'Steinschlag',
	'Spaltengefahr',
	'Klettersteig'
];

export type GeometryMode = 'track' | 'hybrid' | 'topo';

export function getDefaultGeometryMode(type: string): GeometryMode {
	if (type === 'alpine-tour') return 'track';
	if (type === 'via-ferrata') return 'hybrid';
	return 'topo';
}

type GradeBearing = { grade?: { value?: string | null } | null } | null | undefined;

export function getGradeValue(item: GradeBearing): string {
	return item?.grade?.value || '';
}

const uiaaToFrench = {
	I: '1a',
	II: '2a',
	III: '3a',
	IV: '4a',
	'IV+': '4b',
	'V-': '4c',
	V: '5a',
	'V+': '5b',
	'VI-': '5c',
	VI: '6a',
	'VI+': '6a+',
	'VII-': '6b',
	VII: '6b+',
	'VII+': '6c',
	'VIII-': '6c+',
	VIII: '7a',
	'VIII+': '7a+',
	'IX-': '7b',
	IX: '7b+',
	'IX+': '7c',
	'X-': '7c+',
	X: '8a',
	'X+': '8a+',
	'XI-': '8b',
	XI: '8b+',
	'XI+': '9a',
	4: '4a',
	'4+': '4b',
	'5-': '4c',
	5: '5a',
	'5+': '5b',
	'6-': '5c',
	6: '6a',
	'6+': '6a+',
	'7-': '6b',
	7: '6b+',
	'7+': '6c',
	'8-': '6c+',
	8: '7a',
	'8+': '7a+',
	'9-': '7b',
	9: '7b+',
	'9+': '7c',
	'10-': '7c+',
	10: '8a',
	'10+': '8a+',
	'11-': '8b',
	11: '8b+',
	'11+': '9a'
};

export function standardizedGradeValue(value = '', scale = 'french'): string {
	if (!value) return '';
	return scale === 'uiaa' ? (uiaaToFrench as Record<string, string>)[value] || value : value;
}

export function createGrade(
	value = '',
	scale = 'french'
): { scale: string; value: string; standardizedValue: string } | null {
	return value ? { scale, value, standardizedValue: standardizedGradeValue(value, scale) } : null;
}

type EditablePitch = NonNullable<Route['pitches']>[number] & {
	description?: string;
	length?: number;
	type?: string;
};

type EditableRoute = Omit<Route, 'type' | 'pitches'> & {
	type?: string | string[];
	pitches?: EditablePitch[];
	grade?: Route['grade'];
	length?: number;
	description?: string;
	points2D?: Route['points2D'];
	points3D?: Path3D;
	topo?: Record<string, unknown>;
};

export function convertRouteType(route: EditableRoute, newType: string): void {
	const isMultiPitch = (type: EditableRoute['type']): boolean =>
		Array.isArray(type) ? type.includes('multi-pitch') : type === 'multi-pitch';
	const wasMultiPitch = isMultiPitch(route.type);
	const willBeMultiPitch = newType === 'multi-pitch';

	if (willBeMultiPitch && !wasMultiPitch) {
		route.pitches = [
			{
				id: generateId('pitch'),
				pitchNumber: 1,
				grade: route.grade,
				length: route.length,
				description: route.description,
				points2D: route.points2D,
				points3D: route.points3D,
				type: 'pitch'
			}
		];
		route.length = 0;
		delete route.points2D;
		delete route.points3D;
	} else if (!willBeMultiPitch && wasMultiPitch) {
		if (route.pitches?.length) {
			const first = route.pitches[0];
			route.grade = first.grade;
			route.length = first.length;
			route.description = first.description;
			route.points2D = first.points2D;
			route.points3D = first.points3D;
		}
		delete route.pitches;
	}

	route.topo = { ...(route.topo || {}) };
	if (!Array.isArray(route.pathRefs)) route.pathRefs = [];
	if (Array.isArray(route.type)) {
		if (willBeMultiPitch && !route.type.includes('multi-pitch')) route.type.push('multi-pitch');
		else if (!willBeMultiPitch && route.type.includes('multi-pitch')) {
			route.type = route.type.filter((type) => type !== 'multi-pitch');
			if (!route.type.length) route.type = [newType];
		} else route.type = [newType];
	} else route.type = [newType];
}

export function calculateRouteLength(route: Pick<Route, 'points3D'>, scale = 1): number {
	if (!route.points3D || route.points3D.length < 2) return 0;
	let length = 0;
	for (let index = 0; index < route.points3D.length - 1; index++) {
		length += new Vector3(...route.points3D[index]).distanceTo(
			new Vector3(...route.points3D[index + 1])
		);
	}
	return parseFloat((length * scale).toFixed(1));
}

export function calculateBoltAmount(
	route: Pick<Route, 'fixPoints'>,
	fixPoints: FixPoint[] = []
): number {
	if (!route.fixPoints || !fixPoints) return 0;
	return route.fixPoints.filter((id) => fixPoints.find((point) => point.id === id)?.type === 'bolt')
		.length;
}
