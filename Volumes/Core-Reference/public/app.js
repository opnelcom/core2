"use strict";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const appRoot = "/reference/";

function setPanelGlass(enabled, transparency = 58) {
  const amount = enabled
    ? Math.max(0, Math.min(100, Number(transparency) || 0))
    : 0;
  document.body.classList.toggle("panels-glass", amount > 0);
  document.body.style.setProperty(
    "--panel-glass-alpha",
    String(1 - amount / 100),
  );
}

const panelGlassParams = new URLSearchParams(location.search);
setPanelGlass(
  panelGlassParams.get("panel_glass") === "1",
  panelGlassParams.get("panel_transparency"),
);
window.addEventListener("message", (event) => {
  if (
    event.origin === location.origin &&
    event.data?.type === "core-saas-panel-glass"
  ) {
    setPanelGlass(event.data.enabled, event.data.transparency);
  }
});

function showView(name, updateHash = true) {
  const view = $(`#view-${name}`);
  if (!view) return;
  $$(".view").forEach((item) => item.classList.toggle("active", item === view));
  $$(".nav-item").forEach((item) =>
    item.classList.toggle("active", item.dataset.view === name),
  );
  if (updateHash) history.replaceState(null, "", `#${name}`);
  if (name === "time") renderClocks();
}

$$(".nav-item").forEach((button) =>
  button.addEventListener("click", () => showView(button.dataset.view)),
);
const initialView = location.hash.slice(1);
showView(initialView, false);

async function loadCountries() {
  const response = await fetch(`${appRoot}countries.json`);
  if (!response.ok)
    throw new Error(`Country data could not be loaded (${response.status}).`);
  return response.json();
}

let countries = [];
let selectedCountry = null;

function renderCountryDetail(country) {
  selectedCountry = country;
  $$(".country-option").forEach((option) => {
    const selected = option.dataset.code === country.code;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
  const detail = $("#country-detail");
  const fields = [
    ["Official name", country.officialName],
    ["Alpha-2 code", country.code],
    ["Alpha-3 code", country.alpha3],
    ["Numeric code", country.numeric],
    ["Region", country.region],
    ["Subregion", country.subregion],
    ["Currency code", country.currency],
    ["Calling code", country.callingCode],
    [
      "Postal code",
      country.postalCodeRequired
        ? "Usually required"
        : "Not generally required",
    ],
    ["Administrative areas", country.administrativeLabel],
  ];
  detail.innerHTML = `<div class="country-title"><span class="country-code-large">${country.code}</span><div><p class="panel-kicker">${country.region || "COUNTRY"}</p><h2>${escapeHtml(country.name)}</h2><p>${escapeHtml(country.subregion || "")}</p></div></div><dl class="country-facts">${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value || "Not listed")}</dd></div>`).join("")}</dl>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}

function renderCountryList(query = "") {
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = countries.filter((country) =>
    [
      country.name,
      country.officialName,
      country.code,
      country.alpha3,
      country.numeric,
      country.region,
      country.subregion,
      country.currency,
      country.callingCode,
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized),
  );
  const list = $("#country-list");
  list.replaceChildren();
  filtered.forEach((country) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `country-option${selectedCountry?.code === country.code ? " selected" : ""}`;
    option.dataset.code = country.code;
    option.setAttribute("role", "option");
    option.setAttribute(
      "aria-selected",
      String(selectedCountry?.code === country.code),
    );
    option.innerHTML = `<span>${escapeHtml(country.name)}</span><code>${country.code}</code>`;
    option.addEventListener("click", () => renderCountryDetail(country));
    list.append(option);
  });
  if (!filtered.length)
    list.innerHTML = '<p class="empty-state">No matching countries.</p>';
}

$("#country-search").addEventListener("input", (event) =>
  renderCountryList(event.target.value),
);
loadCountries()
  .then((items) => {
    countries = items;
    renderCountryList();
  })
  .catch((error) => {
    $("#country-list").innerHTML =
      `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  });

const unitCategories = {
  Length: {
    metre: ["Metre", 1],
    kilometre: ["Kilometre", 1000],
    centimetre: ["Centimetre", 0.01],
    millimetre: ["Millimetre", 0.001],
    mile: ["Mile", 1609.344],
    yard: ["Yard", 0.9144],
    foot: ["Foot", 0.3048],
    inch: ["Inch", 0.0254],
  },
  Area: {
    squareMetre: ["Square metre", 1],
    squareKilometre: ["Square kilometre", 1e6],
    hectare: ["Hectare", 1e4],
    acre: ["Acre", 4046.8564224],
    squareFoot: ["Square foot", 0.09290304],
  },
  Volume: {
    litre: ["Litre", 1],
    millilitre: ["Millilitre", 0.001],
    cubicMetre: ["Cubic metre", 1000],
    usGallon: ["US gallon", 3.785411784],
    imperialGallon: ["Imperial gallon", 4.54609],
    cup: ["US cup", 0.2365882365],
    tablespoon: ["Tablespoon", 0.0147867648],
  },
  Mass: {
    kilogram: ["Kilogram", 1],
    gram: ["Gram", 0.001],
    milligram: ["Milligram", 1e-6],
    tonne: ["Metric tonne", 1000],
    pound: ["Pound", 0.45359237],
    ounce: ["Ounce", 0.028349523125],
  },
  Speed: {
    metresPerSecond: ["Metres per second", 1],
    kilometresPerHour: ["Kilometres per hour", 1 / 3.6],
    milesPerHour: ["Miles per hour", 0.44704],
    knot: ["Knot", 0.5144444444],
    feetPerSecond: ["Feet per second", 0.3048],
  },
  Temperature: {
    celsius: ["Celsius"],
    fahrenheit: ["Fahrenheit"],
    kelvin: ["Kelvin"],
  },
  Data: {
    byte: ["Byte", 1],
    kilobyte: ["Kilobyte (1000 B)", 1000],
    megabyte: ["Megabyte (1000 kB)", 1e6],
    gigabyte: ["Gigabyte (1000 MB)", 1e9],
    kibibyte: ["Kibibyte (1024 B)", 1024],
    mebibyte: ["Mebibyte (1024 KiB)", 1048576],
  },
};

function populateUnitOptions(select, units) {
  select.replaceChildren(
    ...Object.entries(units).map(
      ([value, [label]]) => new Option(label, value),
    ),
  );
}

function updateUnitCategory() {
  const units = unitCategories[$("#unit-category").value];
  populateUnitOptions($("#unit-from"), units);
  populateUnitOptions($("#unit-to"), units);
  $("#unit-to").selectedIndex = Math.min(1, $("#unit-to").options.length - 1);
  updateUnitResult();
}

function convertTemperature(value, from, to) {
  const celsius =
    from === "fahrenheit"
      ? ((value - 32) * 5) / 9
      : from === "kelvin"
        ? value - 273.15
        : value;
  return to === "fahrenheit"
    ? (celsius * 9) / 5 + 32
    : to === "kelvin"
      ? celsius + 273.15
      : celsius;
}

function updateUnitResult() {
  const value = Number($("#unit-value").value);
  const category = $("#unit-category").value;
  const from = $("#unit-from").value;
  const to = $("#unit-to").value;
  if (!Number.isFinite(value)) {
    $("#unit-result").value = "";
    return;
  }
  const units = unitCategories[category];
  const result =
    category === "Temperature"
      ? convertTemperature(value, from, to)
      : (value * units[from][1]) / units[to][1];
  $("#unit-result").value = Number(result.toPrecision(9)).toString();
  $("#unit-note").textContent =
    `${value} ${units[from][0]} = ${$("#unit-result").value} ${units[to][0]}`;
}

$("#unit-category").replaceChildren(
  ...Object.keys(unitCategories).map(
    (category) => new Option(category, category),
  ),
);
$("#unit-category").addEventListener("change", updateUnitCategory);
$("#unit-value").addEventListener("input", updateUnitResult);
$("#unit-from").addEventListener("change", updateUnitResult);
$("#unit-to").addEventListener("change", updateUnitResult);
$("#unit-swap").addEventListener("click", () => {
  const from = $("#unit-from").value;
  $("#unit-from").value = $("#unit-to").value;
  $("#unit-to").value = from;
  updateUnitResult();
});
updateUnitCategory();

const fallbackTimeZones = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Africa/Johannesburg",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];
const supportedZones = [
  ...new Set([
    "UTC",
    ...(typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : fallbackTimeZones),
  ]),
];
const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
let timeZones = [
  ...new Set([
    localZone,
    "UTC",
    "Europe/London",
    "Africa/Johannesburg",
    "America/New_York",
    "Asia/Tokyo",
  ]),
];
try {
  const saved = JSON.parse(
    localStorage.getItem("coreReference.timeZones") || "null",
  );
  if (Array.isArray(saved))
    timeZones = [
      ...new Set([
        localZone,
        ...saved.filter((zone) => supportedZones.includes(zone)),
      ]),
    ];
} catch {}

$("#timezone-add").replaceChildren(
  new Option("Choose time zone…", ""),
  ...supportedZones.map((zone) => new Option(zone.replaceAll("_", " "), zone)),
);
function renderClocks() {
  const list = $("#clock-list");
  list.replaceChildren();
  timeZones.forEach((zone) => {
    const card = document.createElement("article");
    card.className = "clock-row";
    const now = new Date();
    const time = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(now);
    const date = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(now);
    const offset =
      new Intl.DateTimeFormat("en", {
        timeZone: zone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(now)
        .find((part) => part.type === "timeZoneName")?.value || "UTC";
    card.innerHTML = `<div><span class="clock-zone">${escapeHtml(zone.replaceAll("_", " "))}</span><span class="clock-date">${escapeHtml(date)}</span></div><strong class="clock-time">${time}</strong><span class="clock-offset">${escapeHtml(offset)}</span>`;
    if (zone !== localZone) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-action";
      remove.title = `Remove ${zone}`;
      remove.setAttribute("aria-label", `Remove ${zone}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        timeZones = timeZones.filter((item) => item !== zone);
        persistTimeZones();
        renderClocks();
      });
      card.append(remove);
    }
    list.append(card);
  });
}
function persistTimeZones() {
  try {
    localStorage.setItem("coreReference.timeZones", JSON.stringify(timeZones));
  } catch {}
}
$("#timezone-add").addEventListener("change", (event) => {
  if (event.target.value && !timeZones.includes(event.target.value)) {
    timeZones.push(event.target.value);
    persistTimeZones();
    renderClocks();
  }
  event.target.value = "";
});
renderClocks();
window.setInterval(() => {
  if ($("#view-time").classList.contains("active")) renderClocks();
}, 1000);

function toDms(value, positive, negative) {
  const direction = value < 0 ? negative : positive;
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minuteValue = (absolute - degrees) * 60;
  const minutes = Math.floor(minuteValue);
  const seconds = (minuteValue - minutes) * 60;
  return `${degrees}° ${minutes}′ ${seconds.toFixed(2)}″ ${direction}`;
}
function updateDms() {
  const lat = Number($("#coord-lat").value);
  const lon = Number($("#coord-lon").value);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    $("#coord-dms").textContent = "Enter valid latitude and longitude.";
    return;
  }
  $("#coord-dms").textContent =
    `${toDms(lat, "N", "S")}  ·  ${toDms(lon, "E", "W")}`;
}
function fromDms(value, max, positive, negative) {
  const match = value
    .trim()
    .match(
      /^(-?\d+(?:\.\d+)?)\s*(?:°|d)?\s*(\d+(?:\.\d+)?)?\s*(?:['′m])?\s*(\d+(?:\.\d+)?)?\s*(?:["″s])?\s*([NSEW])?$/i,
    );
  if (!match)
    throw new Error(
      "Use degrees, optional minutes/seconds, and N/S/E/W (for example 51 30 26 N).",
    );
  const degrees = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const direction = (match[4] || "").toUpperCase();
  if (
    minutes >= 60 ||
    seconds >= 60 ||
    (direction && ![positive, negative].includes(direction))
  )
    throw new Error("Coordinate notation is out of range.");
  const sign = direction
    ? direction === negative
      ? -1
      : 1
    : degrees < 0
      ? -1
      : 1;
  const result = sign * (Math.abs(degrees) + minutes / 60 + seconds / 3600);
  if (Math.abs(result) > max)
    throw new Error(`Coordinate must be between -${max} and ${max}.`);
  return result;
}
function updateDistance() {
  try {
    const parsePoint = (value) => {
      const parts = value.split(",").map((part) => Number(part.trim()));
      if (
        parts.length !== 2 ||
        !parts.every(Number.isFinite) ||
        Math.abs(parts[0]) > 90 ||
        Math.abs(parts[1]) > 180
      )
        throw new Error("Enter latitude, longitude in decimal degrees.");
      return { lat: parts[0], lon: parts[1] };
    };
    const a = parsePoint($("#point-a").value);
    const b = parsePoint($("#point-b").value);
    const radians = Math.PI / 180;
    const lat1 = a.lat * radians;
    const lat2 = b.lat * radians;
    const dLat = (b.lat - a.lat) * radians;
    const dLon = (b.lon - a.lon) * radians;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const km = 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = (Math.atan2(y, x) / radians + 360) % 360;
    $("#distance-result").textContent =
      `${km.toLocaleString(undefined, { maximumFractionDigits: 2 })} km · ${bearing.toFixed(1)}°`;
  } catch (error) {
    $("#distance-result").textContent = error.message;
  }
}
["#coord-lat", "#coord-lon"].forEach((selector) =>
  $(selector).addEventListener("input", updateDms),
);
["#point-a", "#point-b"].forEach((selector) =>
  $(selector).addEventListener("input", updateDistance),
);
$("#coord-from-dms").addEventListener("click", () => {
  try {
    $("#coord-lat").value = fromDms(
      $("#coord-dms-lat").value,
      90,
      "N",
      "S",
    ).toFixed(6);
    $("#coord-lon").value = fromDms(
      $("#coord-dms-lon").value,
      180,
      "E",
      "W",
    ).toFixed(6);
    updateDms();
  } catch (error) {
    $("#coord-dms-status").textContent = error.message;
  }
});
$("#copy-dms").addEventListener("click", () =>
  copyText($("#coord-dms").textContent, $("#coord-dms-status")),
);
updateDms();
updateDistance();

function setStatus(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle("error", error);
}
function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decodeBase64(text) {
  const binary = atob(text.trim());
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
$("#base64-encode").addEventListener("click", () => {
  try {
    $("#base64-output").value = encodeBase64($("#base64-input").value);
    setStatus($("#base64-status"), "Encoded UTF-8 text.");
  } catch (error) {
    setStatus($("#base64-status"), error.message, true);
  }
});
$("#base64-decode").addEventListener("click", () => {
  try {
    $("#base64-output").value = decodeBase64($("#base64-input").value);
    setStatus($("#base64-status"), "Decoded UTF-8 text.");
  } catch {
    setStatus($("#base64-status"), "Input is not valid UTF-8 Base64.", true);
  }
});
$("#base64-swap").addEventListener("click", () => {
  const input = $("#base64-input").value;
  $("#base64-input").value = $("#base64-output").value;
  $("#base64-output").value = input;
});

function writeTextOutput(value, message) {
  $("#text-output").value = value;
  setStatus($("#text-status"), message);
}
$("#json-format").addEventListener("click", () => {
  try {
    writeTextOutput(
      JSON.stringify(JSON.parse($("#text-input").value), null, 2),
      "Valid JSON, formatted.",
    );
  } catch (error) {
    setStatus($("#text-status"), `Invalid JSON: ${error.message}`, true);
  }
});
$("#url-encode").addEventListener("click", () =>
  writeTextOutput(
    encodeURIComponent($("#text-input").value),
    "URL component encoded.",
  ),
);
$("#url-decode").addEventListener("click", () => {
  try {
    writeTextOutput(
      decodeURIComponent($("#text-input").value),
      "URL component decoded.",
    );
  } catch {
    setStatus($("#text-status"), "Input contains invalid URL encoding.", true);
  }
});
$("#uuid-generate").addEventListener("click", () =>
  writeTextOutput(crypto.randomUUID(), "UUID generated locally."),
);
$("#sha-hash").addEventListener("click", async () => {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode($("#text-input").value),
    );
    const hex = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    writeTextOutput(hex, "SHA-256 digest generated locally.");
  } catch {
    setStatus(
      $("#text-status"),
      "SHA-256 requires a secure browser context.",
      true,
    );
  }
});
async function copyText(text, status = $("#text-status")) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(status, "Copied to clipboard.");
  } catch {
    setStatus(status, "Clipboard access is unavailable in this browser.", true);
  }
}
$("#text-copy").addEventListener("click", () =>
  copyText($("#text-output").value),
);
