const fileInput = document.getElementById("csvFile");
const exportButton = document.getElementById("exportKml");
const resetButton = document.getElementById("reset");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const flightListEl = document.getElementById("flightList");
const profileOverlay = document.getElementById("profileOverlay");
const profileChart = document.getElementById("profileChart");
const profilePaths = document.getElementById("profilePaths");
const profileCursor = document.getElementById("profileCursor");
const profileDot = document.getElementById("profileDot");
const profileEmpty = document.getElementById("profileEmpty");
const profileAxisX = document.getElementById("profileAxisX");
const profileAxisY = document.getElementById("profileAxisY");
const profileAxisYTicks = document.getElementById("profileAxisYTicks");
const profileAxisXTicks = document.getElementById("profileAxisXTicks");
const profileTicksX = document.getElementById("profileTicksX");
const profileTicksY = document.getElementById("profileTicksY");
const profileAxisLabelX = document.getElementById("profileAxisLabelX");
const profileAxisLabelY = document.getElementById("profileAxisLabelY");
const profileTooltip = document.getElementById("profileTooltip");
const profileCollapse = document.getElementById("profileCollapse");
const profileModeButtons = Array.from(document.querySelectorAll(".profile-mode"));

const map = L.map("map", { zoomControl: true }).setView([0, 0], 2);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19,
}).addTo(map);

const hoverMarkerPane = map.createPane("hoverMarkerPane");
hoverMarkerPane.style.zIndex = "650";

let segmentLayers = [];
let hoverMarker = null;
let points = [];
let activePoints = [];
let flightSegments = [];
let profileSegments = [];
let profileData = [];
let profileDataByTime = [];
let profileDataByDistance = [];
let profileMode = "distance";
let profileScales = null;
let profileIsHovering = false;
let activePoint = null;
let datasetStartTime = null;
let loadedFileCount = 0;
let profileTimeRange = null;

const PROFILE_PADDING = { top: 12, right: 12, bottom: 28, left: 56 };

const FLIGHT_COLORS = [
  { label: "Blue", value: "#5ad1ff" },
  { label: "Orange", value: "#ff8a5b" },
  { label: "Green", value: "#7bdc6b" },
  { label: "Yellow", value: "#ffd166" },
  { label: "Purple", value: "#9b7bff" },
  { label: "Pink", value: "#ff6fb1" },
  { label: "Teal", value: "#4dd0e1" },
  { label: "Red", value: "#ff5c5c" },
];

const toKmlTime = (timestamp) => {
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
};

const columnKeys = {
  latDeg: "flight.osd.lat_deg",
  lonDeg: "flight.osd.lon_deg",
  latRad: "flight.osd.lat_rad",
  lonRad: "flight.osd.lon_rad",
  gpsUsed: "flight.osd.gps_used",
  motorOn: "flight.osd.motor_on",
  alt: "flight.osd.rel_h_m",
  altHome: "flight.home.alt_m",
  batterySoc: "battery.dynamic.soc",
  batteryMv: "battery.dynamic.voltage_mv",
  homeLatDeg: "flight.home.lat_deg",
  homeLonDeg: "flight.home.lon_deg",
  homeLatRad: "flight.home.lat_rad",
  homeLonRad: "flight.home.lon_rad",
  homepointSet: "flight.home.homepoint_set",
  timestamp: "timestamp",
};

const toDegrees = (radians) =>
  Number.isFinite(radians) ? (radians * 180) / Math.PI : null;

const parseBoolean = (value) => {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
};

const formatSoc = (value) => {
  if (!Number.isFinite(value)) return "—";
  const percent = value <= 1.1 ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
};

const formatVoltage = (value) => {
  if (!Number.isFinite(value)) return "—";
  const volts = value > 1000 ? value / 1000 : value;
  return `${volts.toFixed(2)} V`;
};

const formatAltitude = (value) => {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} m`;
};

const formatTimestamp = (timestampValue, fallback) => {
  if (!Number.isFinite(timestampValue)) return fallback || "";
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatter.format(new Date(timestampValue));
};

const formatDate = (timestampValue) => {
  if (!Number.isFinite(timestampValue)) return "—";
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return formatter.format(new Date(timestampValue));
};

const formatDistance = (meters) => {
  if (!Number.isFinite(meters)) return "—";
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${meters.toFixed(0)} m`;
};

const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds)) return "—";
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const niceNumber = (value, round) => {
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  let niceFraction;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 4.5) niceFraction = 2.5;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 2.5) niceFraction = 2.5;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
};

const buildNiceDomain = (minValue, maxValue, targetTicks) => {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return null;
  let min = minValue;
  let max = maxValue;
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = niceNumber(Math.abs(max - min), false);
  const step = niceNumber(range / Math.max(targetTicks - 1, 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = niceMin; value <= niceMax + step / 2; value += step) {
    ticks.push(value);
  }
  return { min: niceMin, max: niceMax, step, ticks };
};

const buildNiceDomainZero = (maxValue, targetTicks) => {
  if (!Number.isFinite(maxValue)) return null;
  const max = maxValue > 0 ? maxValue : 1;
  return buildNiceDomain(0, max, targetTicks);
};

const buildTicks = (minValue, maxValue, step) => {
  const ticks = [];
  for (let value = minValue; value <= maxValue + step / 2; value += step) {
    ticks.push(value);
  }
  return ticks;
};

const buildNiceTicksFromZero = (maxValue, targetTicks) => {
  if (!Number.isFinite(maxValue)) return null;
  const max = maxValue > 0 ? maxValue : 1;
  const rawStep = max / Math.max(targetTicks - 1, 1);
  const step = niceNumber(rawStep, true);
  const ticks = [];
  for (let value = 0; value <= max - step / 2; value += step) {
    ticks.push(value);
  }
  if (!ticks.length || Math.abs(ticks[ticks.length - 1] - max) > step * 0.25) {
    ticks.push(max);
  }
  return { max, step, ticks };
};

const formatAxisValue = (value) => {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}`;
};

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
};

const bearingDegrees = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

const computeSegmentStats = (segment) => {
  const pts = segment.points;
  if (!pts.length) {
    segment.distance = 0;
    segment.duration = 0;
    segment.startTime = null;
    segment.endTime = null;
    return;
  }

  let distance = 0;
  let duration = 0;
  let lastTime = Number.isFinite(pts[0].timestampValue) ? pts[0].timestampValue : null;

  for (let i = 1; i < pts.length; i += 1) {
    const prev = pts[i - 1];
    const current = pts[i];
    distance += haversineMeters(prev.lat, prev.lon, current.lat, current.lon);

    const currentTime = current.timestampValue;
    if (Number.isFinite(lastTime) && Number.isFinite(currentTime)) {
      duration += (currentTime - lastTime) / 1000;
    }
    if (Number.isFinite(currentTime)) {
      lastTime = currentTime;
    }
  }

  segment.distance = distance;
  segment.duration = duration;
  segment.startTime = pts[0].timestampValue ?? null;
  segment.endTime = lastTime;
};

const buildFlightSegments = (trackPoints, offset = 0) => {
  const segments = [];
  let current = null;

  for (const point of trackPoints) {
    if (point.motorOn) {
      if (!current) {
        current = {
          id: offset + segments.length + 1,
          name: `Flight ${offset + segments.length + 1}`,
          points: [],
          enabled: true,
          color: FLIGHT_COLORS[(offset + segments.length) % FLIGHT_COLORS.length].value,
        };
      }
      current.points.push(point);
    } else if (current) {
      segments.push(current);
      current = null;
    }
  }

  if (current) segments.push(current);
  segments.forEach(computeSegmentStats);
  return segments;
};

const buildProfileDataFromSegments = (segments, startTime) => {
  const profilePoints = [];
  const profileSegmentsData = [];
  let totalDistance = 0;
  let totalTime = 0;

  for (const segment of segments) {
    const pts = segment.points;
    if (!pts.length) continue;

    let segmentDistance = 0;
    const segmentStartTime = Number.isFinite(pts[0].timestampValue) ? pts[0].timestampValue : null;
    const segmentProfilePoints = [];

    for (let i = 0; i < pts.length; i += 1) {
      const point = pts[i];
      if (i > 0) {
        const prev = pts[i - 1];
        segmentDistance += haversineMeters(prev.lat, prev.lon, point.lat, point.lon);
      }

      let timeFromStart;
      if (Number.isFinite(startTime) && Number.isFinite(point.timestampValue)) {
        timeFromStart = (point.timestampValue - startTime) / 1000;
      } else if (segmentStartTime != null && Number.isFinite(point.timestampValue)) {
        timeFromStart = totalTime + (point.timestampValue - segmentStartTime) / 1000;
      } else {
        timeFromStart = totalTime + i;
      }

      point.distFromStart = totalDistance + segmentDistance;
      point.timeFromStart = timeFromStart;
      segmentProfilePoints.push(point);
      profilePoints.push(point);
    }

    segment.profilePoints = segmentProfilePoints;
    profileSegmentsData.push(segment);
    totalDistance += segmentDistance;
    totalTime += segment.duration ?? 0;
  }

  return { profileSegments: profileSegmentsData, profilePoints, totalDistance, totalTime };
};

const getActiveSegments = () => flightSegments.filter((segment) => segment.enabled);

const renderFlightList = () => {
  flightListEl.innerHTML = "";
  if (!flightSegments.length) return;

  const title = document.createElement("div");
  title.className = "flight-list-title";
  title.textContent = `Flights (${flightSegments.length})`;
  flightListEl.appendChild(title);

  flightSegments.forEach((segment, index) => {
    const item = document.createElement("div");
    item.className = "flight-item";

    const row = document.createElement("div");
    row.className = "flight-row";

    const label = document.createElement("label");
    label.className = "flight-toggle";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = segment.enabled;

    const dot = document.createElement("span");
    dot.className = "flight-dot";
    dot.style.background = segment.color;
    dot.style.borderColor = segment.color;

    const name = document.createElement("span");
    name.className = "flight-name";
    name.textContent = segment.name || `Flight ${index + 1}`;

    label.append(checkbox, dot, name);

    const colorSelect = document.createElement("select");
    colorSelect.className = "flight-color";
    FLIGHT_COLORS.forEach((color) => {
      const option = document.createElement("option");
      option.value = color.value;
      option.textContent = color.label;
      if (color.value === segment.color) option.selected = true;
      colorSelect.appendChild(option);
    });

    row.append(label, colorSelect);
    item.appendChild(row);

    const meta = document.createElement("div");
    meta.className = "flight-meta";
    meta.textContent = `${formatDuration(segment.duration)} · ${formatDistance(segment.distance)}`;
    item.appendChild(meta);

    checkbox.addEventListener("change", () => {
      segment.enabled = checkbox.checked;
      updateActiveView();
    });

    const startEditing = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (label.querySelector(".flight-name-input")) return;

      const input = document.createElement("input");
      input.type = "text";
      input.className = "flight-name-input";
      input.value = segment.name || `Flight ${index + 1}`;
      label.replaceChild(input, name);
      input.focus();
      input.select();

      const finish = (commit) => {
        if (commit) {
          const value = input.value.trim();
          segment.name = value || `Flight ${index + 1}`;
        }
        const newSpan = document.createElement("span");
        newSpan.className = "flight-name";
        newSpan.textContent = segment.name || `Flight ${index + 1}`;
        label.replaceChild(newSpan, input);
        newSpan.addEventListener("click", startEditing);
      };

      input.addEventListener("blur", () => finish(true));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      });
    };

    name.addEventListener("click", startEditing);

    colorSelect.addEventListener("change", () => {
      segment.color = colorSelect.value;
      dot.style.background = segment.color;
      dot.style.borderColor = segment.color;
      updateActiveView(false);
    });

    flightListEl.appendChild(item);
  });
};

const renderSegments = (shouldFit) => {
  segmentLayers.forEach((layer) => map.removeLayer(layer));
  segmentLayers = [];
  activePoints = [];

  const visibleSegments = getActiveSegments();
  visibleSegments.forEach((segment) => {
    activePoints.push(...segment.points);
    if (segment.points.length < 2) return;
    const latLngs = segment.points.map((point) => [point.lat, point.lon]);
    const polyline = L.polyline(latLngs, { color: segment.color, weight: 3 }).addTo(map);
    segmentLayers.push(polyline);
  });

  if (!hoverMarker && activePoints.length) {
    hoverMarker = L.circleMarker([activePoints[0].lat, activePoints[0].lon], {
      radius: 6,
      color: "#1c1f26",
      fillColor: "#2c2f36",
      fillOpacity: 0.9,
      weight: 1,
      pane: "hoverMarkerPane",
    }).addTo(map);

    hoverMarker.bindTooltip("", {
      direction: "top",
      offset: [0, -8],
      opacity: 0.95,
      className: "map-tooltip",
      sticky: false,
    });
  }

  if (hoverMarker) {
    setHoverMarkerVisible(false);
  }

  if (shouldFit && segmentLayers.length) {
    const group = L.featureGroup(segmentLayers);
    map.fitBounds(group.getBounds(), { padding: [24, 24] });
  }
};

const updateSummary = () => {
  if (!points.length) {
    statsEl.textContent = "";
    return;
  }

  const visibleSegments = getActiveSegments();
  if (!visibleSegments.length) {
    statsEl.textContent = "No flights selected.";
    return;
  }

  const startTimes = visibleSegments
    .map((segment) => segment.startTime)
    .filter(Number.isFinite);
  const earliestStart = startTimes.length ? Math.min(...startTimes) : null;
  const dateLabel = formatDate(earliestStart);
  const totalDuration = visibleSegments.reduce((sum, segment) => sum + (segment.duration || 0), 0);

  const details = [`Date: ${dateLabel}`, `Duration: ${formatDuration(totalDuration)}`];
  statsEl.textContent = details.join("\n");
};

const updateActiveView = (shouldFit = false) => {
  renderSegments(shouldFit);
  const visibleSegments = getActiveSegments();
  const startTimes = visibleSegments
    .map((segment) => segment.startTime)
    .filter(Number.isFinite);
  const anchorTime = startTimes.length ? Math.min(...startTimes) : datasetStartTime;
  const endTimes = visibleSegments
    .map((segment) => segment.endTime)
    .filter(Number.isFinite);
  const latestEnd = endTimes.length ? Math.max(...endTimes) : null;
  profileTimeRange =
    Number.isFinite(anchorTime) && Number.isFinite(latestEnd)
      ? Math.max((latestEnd - anchorTime) / 1000, 0)
      : null;

  const { profileSegments: segmentsForProfile, profilePoints } = buildProfileDataFromSegments(
    visibleSegments,
    anchorTime
  );
  profileSegments = segmentsForProfile;
  profileData = profilePoints;
  profileDataByDistance = [...profileData].filter((point) => Number.isFinite(point.distFromStart));
  profileDataByTime = [...profileData].filter((point) => Number.isFinite(point.timeFromStart));
  profileDataByTime.sort((a, b) => a.timeFromStart - b.timeFromStart);
  activePoint = null;
  renderProfile();
  updateSummary();
  exportButton.disabled = visibleSegments.length === 0;
};

const appendTelemetry = (newPoints, shouldFit = false) => {
  if (!newPoints.length) return;

  const newStart = newPoints[0]?.timestampValue;
  if (Number.isFinite(newStart)) {
    datasetStartTime =
      datasetStartTime == null ? newStart : Math.min(datasetStartTime, newStart);
  }

  points.push(...newPoints);
  const newSegments = buildFlightSegments(newPoints, flightSegments.length);
  flightSegments.push(...newSegments);
  loadedFileCount += 1;

  renderFlightList();
  updateActiveView(shouldFit);
  statusEl.textContent = `Loaded ${points.length} points across ${flightSegments.length} flights.`;
  resetButton.disabled = false;
  exportButton.disabled = flightSegments.length === 0;
};

const getProfileSize = () => {
  const rect = profileChart.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
};

const buildProfileScales = (size) => {
  const width = Math.max(size.width, 1);
  const height = Math.max(size.height, 1);
  const innerWidth = width - PROFILE_PADDING.left - PROFILE_PADDING.right;
  const innerHeight = height - PROFILE_PADDING.top - PROFILE_PADDING.bottom;
  if (innerWidth <= 0 || innerHeight <= 0) return null;

  const altValues = profileData.map((point) => point.alt).filter(Number.isFinite);
  if (!altValues.length) return null;

  const minAlt = Math.min(...altValues);
  const maxAlt = Math.max(...altValues);
  const desiredYTicks = clamp(Math.round(innerHeight / 40), 3, 8);
  const desiredXTicks = clamp(Math.round(innerWidth / 70), 6, 12);
  const modeKey = profileMode === "time" ? "timeFromStart" : "distFromStart";
  const xValues = profileData.map((point) => point[modeKey]).filter(Number.isFinite);
  const xMaxRaw =
    profileMode === "time" && Number.isFinite(profileTimeRange)
      ? profileTimeRange
      : xValues.length
        ? Math.max(...xValues)
        : 0;
  const xDomain = buildNiceTicksFromZero(xMaxRaw, desiredXTicks);
  let yDomain = buildNiceDomain(minAlt, maxAlt, desiredYTicks);
  if (!yDomain || !xDomain) return null;

  if (minAlt >= -yDomain.step * 0.5) {
    yDomain = {
      ...yDomain,
      min: 0,
      ticks: buildTicks(0, yDomain.max, yDomain.step),
    };
  }

  const altSpan = Math.max(yDomain.max - yDomain.min, 1);
  const xMax = xDomain.max > 0 ? xDomain.max : 1;

  const xFor = (point) =>
    PROFILE_PADDING.left + (point[modeKey] / xMax) * innerWidth;
  const yForAlt = (alt) =>
    PROFILE_PADDING.top + (1 - (alt - yDomain.min) / altSpan) * innerHeight;

  return {
    width,
    height,
    innerWidth,
    innerHeight,
    minAlt: yDomain.min,
    maxAlt: yDomain.max,
    xMax,
    modeKey,
    yTicks: yDomain.ticks,
    xTicks: xDomain.ticks,
    yStep: yDomain.step,
    xStep: xDomain.step,
    xFor,
    yForAlt,
  };
};

const setProfileAxisVisibility = (visible) => {
  const opacity = visible ? "1" : "0";
  profileAxisX.style.opacity = opacity;
  profileAxisY.style.opacity = opacity;
  profileAxisYTicks.style.opacity = opacity;
  profileAxisXTicks.style.opacity = opacity;
  profileAxisLabelX.style.opacity = opacity;
  profileAxisLabelY.style.opacity = opacity;
};

const renderAxisTicks = (container, ticks, formatter) => {
  container.innerHTML = "";
  for (const tick of ticks) {
    const label = document.createElement("span");
    label.textContent = formatter(tick);
    container.appendChild(label);
  }
};

const renderAxisTickLines = (group, ticks, axis, scales) => {
  group.innerHTML = "";
  const tickLength = 4;
  const tickColor = "rgba(255,255,255,0.18)";
  if (axis === "y") {
    const x1 = PROFILE_PADDING.left;
    const x2 = PROFILE_PADDING.left + tickLength;
    for (const value of ticks) {
      const y = scales.yForAlt(value);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1);
      line.setAttribute("x2", x2);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("stroke", tickColor);
      line.setAttribute("stroke-width", "1");
      group.appendChild(line);
    }
    return;
  }

  const y1 = scales.height - PROFILE_PADDING.bottom;
  const y2 = y1 - tickLength;
  for (const value of ticks) {
    const x =
      PROFILE_PADDING.left + (value / Math.max(scales.xMax, 1)) * scales.innerWidth;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x);
    line.setAttribute("x2", x);
    line.setAttribute("y1", y1);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", tickColor);
    line.setAttribute("stroke-width", "1");
    group.appendChild(line);
  }
};

const setProfileAxisLabel = () => {
  profileAxisLabelY.textContent = "Altitude (m)";
  profileAxisLabelX.textContent =
    profileMode === "time" ? "Flight Time (min)" : "Distance (km)";
};

const updateProfileAxis = (scales) => {
  if (!scales) {
    profileAxisYTicks.innerHTML = "";
    profileAxisXTicks.innerHTML = "";
    profileTicksX.innerHTML = "";
    profileTicksY.innerHTML = "";
    profileAxisX.setAttribute("x1", 0);
    profileAxisX.setAttribute("x2", 0);
    profileAxisX.setAttribute("y1", 0);
    profileAxisX.setAttribute("y2", 0);
    profileAxisY.setAttribute("x1", 0);
    profileAxisY.setAttribute("x2", 0);
    profileAxisY.setAttribute("y1", 0);
    profileAxisY.setAttribute("y2", 0);
    setProfileAxisLabel();
    setProfileAxisVisibility(false);
    return;
  }

  renderAxisTicks(profileAxisYTicks, [...scales.yTicks].reverse(), (value) =>
    formatAxisValue(value)
  );

  if (profileMode === "time") {
    renderAxisTicks(profileAxisXTicks, scales.xTicks, (value) =>
      formatAxisValue(value / 60)
    );
  } else {
    renderAxisTicks(profileAxisXTicks, scales.xTicks, (value) =>
      formatAxisValue(value / 1000)
    );
  }

  const axisX = scales.height - PROFILE_PADDING.bottom;
  profileAxisX.setAttribute("x1", PROFILE_PADDING.left);
  profileAxisX.setAttribute("x2", scales.width - PROFILE_PADDING.right);
  profileAxisX.setAttribute("y1", axisX);
  profileAxisX.setAttribute("y2", axisX);

  profileAxisY.setAttribute("x1", PROFILE_PADDING.left);
  profileAxisY.setAttribute("x2", PROFILE_PADDING.left);
  profileAxisY.setAttribute("y1", PROFILE_PADDING.top);
  profileAxisY.setAttribute("y2", scales.height - PROFILE_PADDING.bottom);

  renderAxisTickLines(profileTicksY, scales.yTicks, "y", scales);
  renderAxisTickLines(profileTicksX, scales.xTicks, "x", scales);
  setProfileAxisLabel();
  setProfileAxisVisibility(true);
};

const showProfileEmpty = (message) => {
  profileEmpty.textContent = message;
  profileEmpty.style.display = "flex";
  profilePaths.innerHTML = "";
  clearProfileCursor();
  updateProfileAxis(null);
};

const hideProfileEmpty = () => {
  profileEmpty.style.display = "none";
};

const clearProfileCursor = () => {
  activePoint = null;
  profileCursor.style.opacity = 0;
  profileDot.style.opacity = 0;
  profileTooltip.style.opacity = 0;
};

const setHoverMarkerVisible = (visible) => {
  if (!hoverMarker) return;
  hoverMarker.setStyle({
    opacity: visible ? 1 : 0,
    fillOpacity: visible ? 0.9 : 0,
  });
};

const updateProfileTooltip = (point) => {
  if (!profileScales || !point) return;
  const x = profileScales.xFor(point);
  const distanceKm = Number.isFinite(point.distFromStart) ? point.distFromStart / 1000 : 0;
  const timeMin = Number.isFinite(point.timeFromStart) ? point.timeFromStart / 60 : 0;
  const axisLine =
    profileMode === "time"
      ? `Time: ${timeMin.toFixed(2)} min`
      : `Dist: ${distanceKm.toFixed(2)} km`;
  const altLine = Number.isFinite(point.alt) ? `Alt: ${point.alt.toFixed(1)} m` : "Alt: —";
  profileTooltip.textContent = `${axisLine} · ${altLine}`;
  profileTooltip.style.left = `${x}px`;
  profileTooltip.style.opacity = 1;
};

const setProfileCursor = (point) => {
  if (!profileScales) return;
  activePoint = point;
  const x = profileScales.xFor(point);
  profileCursor.setAttribute("x1", x);
  profileCursor.setAttribute("x2", x);
  profileCursor.setAttribute("y1", PROFILE_PADDING.top);
  profileCursor.setAttribute("y2", profileScales.height - PROFILE_PADDING.bottom);
  profileCursor.style.opacity = 1;

  if (Number.isFinite(point.alt)) {
    const y = profileScales.yForAlt(point.alt);
    profileDot.setAttribute("cx", x);
    profileDot.setAttribute("cy", y);
    profileDot.style.opacity = 1;
  } else {
    profileDot.style.opacity = 0;
  }
};

const renderProfile = () => {
  if (!profileData.length) {
    showProfileEmpty("Load telemetry to see the height profile.");
    return;
  }

  const size = getProfileSize();
  if (size.width <= 0 || size.height <= 0) return;

  profileChart.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
  profileScales = buildProfileScales(size);

  if (!profileScales) {
    showProfileEmpty("No altitude data in telemetry.");
    return;
  }

  profilePaths.innerHTML = "";
  let hasPath = false;

  for (const segment of profileSegments) {
    const segmentPoints = segment.profilePoints || [];
    if (!segmentPoints.length) continue;

    let path = "";
    let started = false;
    for (const point of segmentPoints) {
      if (!Number.isFinite(point.alt)) {
        started = false;
        continue;
      }
      const x = profileScales.xFor(point);
      const y = profileScales.yForAlt(point.alt);
      path += started ? ` L ${x} ${y}` : `M ${x} ${y}`;
      started = true;
    }

    if (path) {
      const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
      pathEl.setAttribute("d", path);
      pathEl.setAttribute("class", "profile-path");
      pathEl.setAttribute("stroke", segment.color || "#5ad1ff");
      profilePaths.appendChild(pathEl);
      hasPath = true;
    }
  }

  if (!hasPath) {
    showProfileEmpty("No altitude data in telemetry.");
    return;
  }

  hideProfileEmpty();
  updateProfileAxis(profileScales);

  if (activePoint) {
    setProfileCursor(activePoint);
  }
};

const findNearestProfilePoint = (xValue) => {
  const source =
    profileMode === "time"
      ? profileDataByTime
      : profileDataByDistance.length
        ? profileDataByDistance
        : profileData;
  if (!source.length) return null;
  const key = profileScales?.modeKey ?? (profileMode === "time" ? "timeFromStart" : "distFromStart");

  let lo = 0;
  let hi = source.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (source[mid][key] < xValue) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const left = source[lo];
  const right = source[hi];
  if (!left) return right;
  if (!right) return left;
  return Math.abs(left[key] - xValue) <= Math.abs(right[key] - xValue) ? left : right;
};

const syncHoverFromProfile = (point) => {
  if (!point || !hoverMarker) return;
  setHoverMarkerVisible(true);
  hoverMarker.setLatLng([point.lat, point.lon]);
  hoverMarker.closeTooltip();
  setProfileCursor(point);
  updateProfileTooltip(point);
};

const setProfileMode = (mode) => {
  if (!mode || profileMode === mode) return;
  profileMode = mode;
  profileModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });
  setProfileAxisLabel();
  renderProfile();
};

const resetState = () => {
  points = [];
  activePoints = [];
  flightSegments = [];
  profileSegments = [];
  profileDataByTime = [];
  profileDataByDistance = [];
  datasetStartTime = null;
  loadedFileCount = 0;
  profileTimeRange = null;
  statusEl.textContent = "No file loaded.";
  statsEl.textContent = "";
  flightListEl.innerHTML = "";
  exportButton.disabled = true;
  resetButton.disabled = true;

  segmentLayers.forEach((layer) => map.removeLayer(layer));
  segmentLayers = [];
  if (hoverMarker) {
    map.removeLayer(hoverMarker);
    hoverMarker = null;
  }

  profileData = [];
  profileScales = null;
  showProfileEmpty("Load telemetry to see the height profile.");
};

const toKmlColor = (hexColor) => {
  const sanitized = hexColor.replace("#", "");
  if (sanitized.length !== 6) return "ff00ccff";
  const r = sanitized.slice(0, 2);
  const g = sanitized.slice(2, 4);
  const b = sanitized.slice(4, 6);
  return `ff${b}${g}${r}`;
};

const createKml = (segments) => {
  const activeSegments = segments.filter((segment) => segment.enabled && segment.points.length);
  const placemarks = activeSegments
    .map((segment, index) => {
      const hasAltitude = segment.points.some((point) => Number.isFinite(point.alt));
      const coordinates = segment.points
        .map((point) => {
          if (!hasAltitude) return `${point.lon},${point.lat}`;
          return `${point.lon},${point.lat},${Number.isFinite(point.alt) ? point.alt : 0}`;
        })
        .join(" ");

      const altitudeMode = hasAltitude ? "relativeToGround" : "clampToGround";
      const color = toKmlColor(segment.color);
      const name = segment.name || `Flight ${index + 1}`;
      const begin = toKmlTime(segment.startTime);
      const end = toKmlTime(segment.endTime);
      const timeSpan = begin && end ? `\n      <TimeSpan>\n        <begin>${begin}</begin>\n        <end>${end}</end>\n      </TimeSpan>` : "";

      return `
    <Placemark>
      <name>${name}</name>
      ${timeSpan}
      <Style>
        <LineStyle>
          <color>${color}</color>
          <width>3</width>
        </LineStyle>
      </Style>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>${altitudeMode}</altitudeMode>
        <coordinates>${coordinates}</coordinates>
      </LineString>
    </Placemark>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>SquirrelCast Telemetry Track</name>${placemarks}
  </Document>
</kml>`;
};

const downloadKml = () => {
  const activeSegments = getActiveSegments();
  if (!activeSegments.length) return;
  const kml = createKml(flightSegments);
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "squirrelcast-telemetry.kml";
  anchor.click();
  URL.revokeObjectURL(url);
};

// Use containerPoint directly for distance comparisons (stable during zoom/pan)
const findNearestPoint = (containerPoint) => {
  if (!activePoints.length) return null;

  let closest = null;
  let minDist = Infinity;

  for (const point of activePoints) {
    const pointOnMap = map.latLngToContainerPoint([point.lat, point.lon]);
    const distance = pointOnMap.distanceTo(containerPoint);
    if (distance < minDist) {
      minDist = distance;
      closest = point;
    }
  }

  const SNAP_PX = 15; // 25% of the previous 60px snap
  if (minDist > SNAP_PX) return null;
  return closest;
};

const formatTooltip = (point) => {
  const lines = [];
  const timestampLabel = formatTimestamp(point.timestampValue, point.timestamp);
  if (timestampLabel) lines.push(`<strong>${timestampLabel}</strong>`);
  lines.push(`Altitude: ${formatAltitude(point.alt)}`);
  lines.push(`Battery: ${formatSoc(point.batterySoc)}`);
  lines.push(`Voltage: ${formatVoltage(point.batteryMv)}`);

  if (point.homepointSet && point.homeLat != null && point.homeLon != null) {
    const distance = haversineMeters(point.lat, point.lon, point.homeLat, point.homeLon);
    const bearing = bearingDegrees(point.lat, point.lon, point.homeLat, point.homeLon);
    lines.push(`Home: ${distance.toFixed(1)} m @ ${bearing.toFixed(0)}°`);
  }

  return lines.join("<br />");
};

const renderTrack = () => {
  if (!points.length) return;
  flightSegments = buildFlightSegments(points, 0);
  renderFlightList();
  updateActiveView(true);
  statusEl.textContent = `Loaded ${points.length} points across ${flightSegments.length} flights.`;
  resetButton.disabled = false;
};

const parseTelemetry = (rows) => {
  const parsed = rows
    .map((row) => {
      if (!parseBoolean(row[columnKeys.gpsUsed])) return null;

      const lat = Number.isFinite(row[columnKeys.latDeg])
        ? row[columnKeys.latDeg]
        : toDegrees(row[columnKeys.latRad]);
      const lon = Number.isFinite(row[columnKeys.lonDeg])
        ? row[columnKeys.lonDeg]
        : toDegrees(row[columnKeys.lonRad]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      const alt = Number.isFinite(row[columnKeys.alt]) ? row[columnKeys.alt] : row[columnKeys.altHome];
      const motorOn = parseBoolean(row[columnKeys.motorOn]);

      const homepointSet = parseBoolean(row[columnKeys.homepointSet]);
      const homeLat = Number.isFinite(row[columnKeys.homeLatDeg])
        ? row[columnKeys.homeLatDeg]
        : toDegrees(row[columnKeys.homeLatRad]);
      const homeLon = Number.isFinite(row[columnKeys.homeLonDeg])
        ? row[columnKeys.homeLonDeg]
        : toDegrees(row[columnKeys.homeLonRad]);

      return {
        lat,
        lon,
        alt: Number.isFinite(alt) ? alt : null,
        batterySoc: row[columnKeys.batterySoc],
        batteryMv: row[columnKeys.batteryMv],
        homeLat: homepointSet && Number.isFinite(homeLat) ? homeLat : null,
        homeLon: homepointSet && Number.isFinite(homeLon) ? homeLon : null,
        homepointSet,
        timestamp: row[columnKeys.timestamp],
        timestampValue: row[columnKeys.timestamp] ? Date.parse(row[columnKeys.timestamp]) : null,
        motorOn,
      };
    })
    .filter(Boolean);

  parsed.sort((a, b) => {
    if (a.timestampValue == null || b.timestampValue == null) return 0;
    return a.timestampValue - b.timestampValue;
  });

  return parsed;
};

const parseFile = (file) =>
  new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => resolve(parseTelemetry(results.data)),
      error: () => reject(new Error("Unable to parse file.")),
    });
  });

fileInput.addEventListener("change", (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  statusEl.textContent = `Parsing ${files.length} file${files.length === 1 ? "" : "s"}...`;
  exportButton.disabled = true;

  Promise.allSettled(files.map((file) => parseFile(file))).then((results) => {
    const parsedFiles = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    let addedAny = false;
    parsedFiles.forEach((parsed, index) => {
      if (!parsed.length) return;
      appendTelemetry(parsed, !addedAny);
      addedAny = true;
    });

    if (!addedAny) {
      statusEl.textContent = "No valid telemetry points found.";
      exportButton.disabled = flightSegments.length === 0;
      return;
    }

    updateActiveView(true);
  });
});

map.on("mousemove", (event) => {
  if (!activePoints.length || !hoverMarker) return;

  // Snap + show tooltip only when close enough to a data point
  const nearest = findNearestPoint(event.containerPoint);
  if (!nearest) {
    hoverMarker.closeTooltip();
    setHoverMarkerVisible(false);
    clearProfileCursor();
    return;
  }

  setHoverMarkerVisible(true);
  hoverMarker.setLatLng([nearest.lat, nearest.lon]);
  hoverMarker.setTooltipContent(formatTooltip(nearest));
  hoverMarker.openTooltip();
  setProfileCursor(nearest);
  profileTooltip.style.opacity = 0;
});

map.on("mouseout", () => {
  if (hoverMarker && !profileIsHovering) {
    hoverMarker.closeTooltip();
    setHoverMarkerVisible(false);
    clearProfileCursor();
  }
});

profileModeButtons.forEach((button) => {
  button.addEventListener("click", () => setProfileMode(button.dataset.mode));
});

profileCollapse.addEventListener("click", () => {
  const collapsed = profileOverlay.classList.toggle("is-collapsed");
  profileCollapse.classList.toggle("is-collapsed", collapsed);
  profileCollapse.setAttribute("aria-expanded", String(!collapsed));
  profileCollapse.setAttribute(
    "aria-label",
    collapsed ? "Expand height profile" : "Collapse height profile"
  );
  setTimeout(renderProfile, 240);
});

profileChart.addEventListener("mouseenter", () => {
  profileIsHovering = true;
});

profileChart.addEventListener("mouseleave", () => {
  profileIsHovering = false;
  if (hoverMarker) hoverMarker.closeTooltip();
  setHoverMarkerVisible(false);
  clearProfileCursor();
});

profileChart.addEventListener("mousemove", (event) => {
  if (!profileScales || !profileData.length) return;

  const rect = profileChart.getBoundingClientRect();
  const xPx = event.clientX - rect.left;
  const { innerWidth, xMax } = profileScales;
  if (innerWidth <= 0) return;

  const clamped = Math.min(Math.max((xPx - PROFILE_PADDING.left) / innerWidth, 0), 1);
  const xValue = clamped * xMax;
  const nearest = findNearestProfilePoint(xValue);
  if (nearest) syncHoverFromProfile(nearest);
});

if (typeof ResizeObserver !== "undefined") {
  const profileObserver = new ResizeObserver(() => renderProfile());
  profileObserver.observe(profileChart);
} else {
  window.addEventListener("resize", () => renderProfile());
}

exportButton.addEventListener("click", downloadKml);
resetButton.addEventListener("click", () => {
  fileInput.value = "";
  resetState();
});

resetState();
