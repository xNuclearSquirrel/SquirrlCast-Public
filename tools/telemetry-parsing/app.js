const fileInput = document.getElementById("csvFile");
const exportButton = document.getElementById("exportKml");
const resetButton = document.getElementById("reset");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");

const map = L.map("map", { zoomControl: true }).setView([0, 0], 2);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19,
}).addTo(map);

let polyline = null;
let hoverMarker = null;
let points = [];

const columnKeys = {
  latDeg: "flight.osd.lat_deg",
  lonDeg: "flight.osd.lon_deg",
  latRad: "flight.osd.lat_rad",
  lonRad: "flight.osd.lon_rad",
  gpsUsed: "flight.osd.gps_used",
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

const resetState = () => {
  points = [];
  statusEl.textContent = "No file loaded.";
  statsEl.textContent = "";
  exportButton.disabled = true;
  resetButton.disabled = true;

  if (polyline) {
    map.removeLayer(polyline);
    polyline = null;
  }
  if (hoverMarker) {
    map.removeLayer(hoverMarker);
    hoverMarker = null;
  }
};

const updateSummary = (meta) => {
  const details = [`Points: ${meta.points}`, `Time span: ${meta.start} → ${meta.end}`];
  statsEl.textContent = details.join("\n");
};

const createKml = (trackPoints) => {
  const hasAltitude = trackPoints.some((point) => Number.isFinite(point.alt));
  const coordinates = trackPoints
    .map((point) => {
      if (!hasAltitude) return `${point.lon},${point.lat}`;
      return `${point.lon},${point.lat},${Number.isFinite(point.alt) ? point.alt : 0}`;
    })
    .join(" ");

  const altitudeMode = hasAltitude ? "relativeToGround" : "clampToGround";

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>SquirrelCast Telemetry Track</name>
    <Placemark>
      <name>Flight Track</name>
      <Style>
        <LineStyle>
          <color>ff00ccff</color>
          <width>3</width>
        </LineStyle>
      </Style>
      <LineString>
        <tessellate>1</tessellate>
        <altitudeMode>${altitudeMode}</altitudeMode>
        <coordinates>${coordinates}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
};

const downloadKml = () => {
  if (!points.length) return;
  const kml = createKml(points);
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "squirrelcast-telemetry.kml";
  anchor.click();
  URL.revokeObjectURL(url);
};

// Use containerPoint directly for distance comparisons (more stable during zoom/pan)
const findNearestPoint = (containerPoint) => {
  if (!points.length) return null;

  let closest = null;
  let minDist = Infinity;

  for (const point of points) {
    const layerPoint = map.latLngToLayerPoint([point.lat, point.lon]);
    const distance = layerPoint.distanceTo(containerPoint);
    if (distance < minDist) {
      minDist = distance;
      closest = point;
    }
  }

  const SNAP_PX = 60; // a little more forgiving than 48
  if (minDist > SNAP_PX) return null;
  return closest;
};

const formatTooltip = (point) => {
  const lines = [];
  if (point.timestamp) lines.push(`<strong>${point.timestamp}</strong>`);
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
  const latLngs = points.map((point) => [point.lat, point.lon]);

  if (polyline) map.removeLayer(polyline);
  polyline = L.polyline(latLngs, { color: "#5ad1ff", weight: 3 }).addTo(map);
  map.fitBounds(polyline.getBounds(), { padding: [24, 24] });

  if (!hoverMarker) {
    hoverMarker = L.circleMarker(latLngs[0], {
      radius: 5,
      color: "#ffffff",
      fillColor: "#5ad1ff",
      fillOpacity: 0.9,
      weight: 1,
    }).addTo(map);

    // Bind tooltip to the marker so Leaflet handles stacking + positioning
    hoverMarker.bindTooltip("", {
      direction: "top",
      offset: [0, -8],
      opacity: 0.95,
      className: "map-tooltip",
      sticky: false,
    });
  }
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
      };
    })
    .filter(Boolean);

  parsed.sort((a, b) => {
    if (a.timestampValue == null || b.timestampValue == null) return 0;
    return a.timestampValue - b.timestampValue;
  });

  return parsed;
};

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  statusEl.textContent = "Parsing telemetry...";
  statsEl.textContent = "";
  exportButton.disabled = true;
  resetButton.disabled = true;

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    complete: (results) => {
      points = parseTelemetry(results.data);

      if (!points.length) {
        statusEl.textContent = "No valid telemetry points found.";
        return;
      }

      statusEl.textContent = `Loaded ${points.length} points.`;
      exportButton.disabled = false;
      resetButton.disabled = false;
      renderTrack();

      const first = points[0]?.timestamp ?? "—";
      const last = points[points.length - 1]?.timestamp ?? "—";
      updateSummary({ points: points.length, start: first, end: last });
    },
    error: () => {
      statusEl.textContent = "Unable to parse file.";
    },
  });
});

map.on("mousemove", (event) => {
  if (!points.length || !polyline || !hoverMarker) return;

  // Always follow the mouse
  hoverMarker.setLatLng(event.latlng);

  // Snap + show tooltip only when close enough to a data point
  const nearest = findNearestPoint(event.containerPoint);
  if (!nearest) {
    hoverMarker.closeTooltip();
    return;
  }

  hoverMarker.setLatLng([nearest.lat, nearest.lon]);
  hoverMarker.setTooltipContent(formatTooltip(nearest));
  hoverMarker.openTooltip();
});

map.on("mouseout", () => {
  if (hoverMarker) hoverMarker.closeTooltip();
});

exportButton.addEventListener("click", downloadKml);
resetButton.addEventListener("click", () => {
  fileInput.value = "";
  resetState();
});

resetState();
