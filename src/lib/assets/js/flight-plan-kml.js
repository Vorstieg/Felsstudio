/**
 * Serialise a crag capture plan as a DJI Waypoint Mission (WPML) KMZ.
 *
 * The XML shape intentionally follows a KMZ exported by DJI Fly for Mavic 4
 * Pro: `template.kml`, `waylines.wpml`, and an empty `res/` directory.  DJI
 * uses the uav.com WPML namespace for this aircraft (not the older dji.com
 * namespace used by several third-party generators).
 */

import JSZip from 'jszip';

const KML_NAMESPACE = 'http://www.opengis.net/kml/2.2';
const WPML_NAMESPACE = 'http://www.uav.com/wpmz/1.0.2';
const MAVIC_4_PRO_DRONE_ENUM = 68;
const MAVIC_4_PRO_DRONE_SUB_ENUM = 0;

function escapeXml(value) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function number(value, fieldName, index) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new TypeError(`Waypoint ${index + 1} has no valid ${fieldName}.`);
	}
	return parsed;
}

function normaliseWaypoint(waypoint, index) {
	if (!waypoint || typeof waypoint !== 'object') {
		throw new TypeError(`Waypoint ${index + 1} must be an object.`);
	}

	const longitude = number(waypoint.longitude, 'longitude', index);
	const latitude = number(waypoint.latitude, 'latitude', index);
	const altitude = number(waypoint.altitude, 'altitude', index);
	if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
		throw new RangeError(`Waypoint ${index + 1} is outside WGS84 bounds.`);
	}

	return { ...waypoint, longitude, latitude, altitude };
}

function formattedNumber(value) {
	return Number(value)
		.toFixed(8)
		.replace(/(?:\.0+|(?<=\..*?)0+)$/, '');
}

/** DJI Fly manual waypoint headings use the signed -180°…+180° convention. */
function normaliseHeading(value) {
	const heading = ((((Number(value) + 180) % 360) + 360) % 360) - 180;
	// Avoid serialising JavaScript's `-0`, which is needlessly ambiguous in WPML.
	return Object.is(heading, -0) ? 0 : heading;
}

function missionWaypoints(plan) {
	if (!plan || typeof plan !== 'object') throw new TypeError('A flight plan is required.');
	if (!Array.isArray(plan.waypoints) || plan.waypoints.length < 2) {
		throw new TypeError('A flight plan requires at least two waypoints.');
	}
	return plan.waypoints.map(normaliseWaypoint);
}

function relativeStartElevation(plan, waypoints) {
	const explicit = Number(plan.metadata?.startElevation);
	if (Number.isFinite(explicit)) return explicit;

	// The current generator produces AMSL altitudes and its first waypoint is
	// its terrain elevation plus stand-off.  This retains the intended stand-off
	// when a dedicated mission-start elevation has not yet been recorded.
	const standOff = Number(plan.metadata?.standOffMeters);
	return waypoints[0].altitude - (Number.isFinite(standOff) ? standOff : 0);
}

function waypointHeight(waypoint, startElevation) {
	const explicit = Number(waypoint.relativeAltitude ?? waypoint.executeHeight);
	return Number.isFinite(explicit) ? explicit : waypoint.altitude - startElevation;
}

function cameraFocalLength(camera) {
	switch (camera) {
		case 'tele-6x':
		case '6x':
			return 168;
		case 'tele-3x':
		case 'medium-tele':
			return 70;
		case 'wide':
		case 'main':
		default:
			return 24;
	}
}

function actionXml(actionId, type, parameters) {
	return `
          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>${type}</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>${parameters}
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
}

function waypointActions(waypoint, actionId) {
	const gimbalPitch = Number.isFinite(Number(waypoint.gimbalPitch))
		? Number(waypoint.gimbalPitch)
		: -8;
	const actions = [
		actionXml(
			actionId++,
			'gimbalRotate',
			`
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>${formattedNumber(gimbalPitch)}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>`
		),
		actionXml(
			actionId++,
			'zoom',
			`
              <wpml:focalLength>${cameraFocalLength(waypoint.camera)}</wpml:focalLength>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>`
		)
	];

	// A native takePhoto action at each planned capture position is more
	// portable than interval actions, whose support varies by payload/firmware.
	if (waypoint.phase === 'capture' || waypoint.action === 'photo') {
		actions.push(
			actionXml(
				actionId++,
				'takePhoto',
				`
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
              <wpml:fileSuffix>crag</wpml:fileSuffix>`
			)
		);
	}
	return { xml: actions.join(''), nextActionId: actionId };
}

function missionConfigXml(speed) {
	return `
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:globalTransitionalSpeed>${formattedNumber(speed)}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${MAVIC_4_PRO_DRONE_ENUM}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>${MAVIC_4_PRO_DRONE_SUB_ENUM}</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>`;
}

/** Build Mavic 4 Pro's template.kml from a validated plan. */
export function exportFlightPlanTemplateKml(plan) {
	const waypoints = missionWaypoints(plan);
	const now = Date.now();
	const speed = Number(plan.metadata?.transitSpeed) || waypoints[0].speed || 5;
	return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="${KML_NAMESPACE}" xmlns:wpml="${WPML_NAMESPACE}">
  <Document>
    <wpml:author>Felsstudio</wpml:author>
    <wpml:createTime>${now}</wpml:createTime>
    <wpml:updateTime>${now}</wpml:updateTime>${missionConfigXml(speed)}
  </Document>
</kml>
`;
}

/** Build Mavic 4 Pro's executable waylines.wpml from a validated plan. */
export function exportFlightPlanWaylinesWpml(plan) {
	const waypoints = missionWaypoints(plan);
	const startElevation = relativeStartElevation(plan, waypoints);
	let actionId = 1;
	let actionGroupId = 1;
	const placemarks = waypoints
		.map((waypoint, index) => {
			const actions = waypointActions(waypoint, actionId);
			actionId = actions.nextActionId;
			const heading = Number.isFinite(Number(waypoint.heading))
				? normaliseHeading(waypoint.heading)
				: 0;
			const speed = Number.isFinite(Number(waypoint.speed)) ? Number(waypoint.speed) : 2.5;
			const pitch = Number.isFinite(Number(waypoint.gimbalPitch))
				? Number(waypoint.gimbalPitch)
				: -8;
			const turnMode =
				index === 0 || index === waypoints.length - 1
					? 'toPointAndStopWithContinuityCurvature'
					: 'toPointAndPassWithContinuityCurvature';
			return `
      <Placemark>
        <Point><coordinates>${formattedNumber(waypoint.longitude)},${formattedNumber(waypoint.latitude)}</coordinates></Point>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${formattedNumber(waypointHeight(waypoint, startElevation))}</wpml:executeHeight>
        <wpml:waypointSpeed>${formattedNumber(speed)}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>manually</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${formattedNumber(heading)}</wpml:waypointHeadingAngle>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${turnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
        <wpml:actionGroup>
          <wpml:actionGroupId>${actionGroupId++}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${index}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${index}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
          <wpml:actionTrigger><wpml:actionTriggerType>reachPoint</wpml:actionTriggerType></wpml:actionTrigger>${actions.xml}
        </wpml:actionGroup>
        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>${formattedNumber(pitch)}</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
      </Placemark>`;
		})
		.join('');
	const speed =
		Number(plan.metadata?.speed) ||
		waypoints.find((waypoint) => waypoint.phase === 'capture')?.speed ||
		2.5;
	return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="${KML_NAMESPACE}" xmlns:wpml="${WPML_NAMESPACE}">
  <Document>${missionConfigXml(speed)}
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>${formattedNumber(speed)}</wpml:autoFlightSpeed>${placemarks}
    </Folder>
  </Document>
</kml>
`;
}

/** Returns the executable WPML document for callers that need inspectable XML. */
export function exportFlightPlanKml(plan) {
	return exportFlightPlanWaylinesWpml(plan);
}

export function flightPlanKmlFilename(plan = {}) {
	const label = plan.name || plan.cragName || 'crag-capture-plan';
	const slug = String(label)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${slug || 'crag-capture-plan'}.kml`;
}

export function flightPlanKmzFilename(plan = {}) {
	return flightPlanKmlFilename(plan).replace(/\.kml$/i, '.kmz');
}

/** Create a DJI-native Mavic 4 Pro KMZ archive. */
export async function createFlightPlanKmz(plan) {
	const zip = new JSZip();
	zip.file('template.kml', exportFlightPlanTemplateKml(plan));
	zip.file('waylines.wpml', exportFlightPlanWaylinesWpml(plan));
	zip.folder('res');
	return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Create a browser download for an already validated flight plan. */
export async function downloadFlightPlanKmz(plan) {
	if (typeof document === 'undefined' || typeof URL === 'undefined') {
		throw new Error('KMZ downloads are only available in a browser.');
	}
	const blob = await createFlightPlanKmz(plan);
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = flightPlanKmzFilename(plan);
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
