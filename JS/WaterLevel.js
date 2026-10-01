import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import { getFirestore, doc, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { database, app } from "./auth.js";
import { writeLog } from "./logging.js";
import { getChanges, describeChanges, setSaveEnabled } from "./edit-tracker.js";
import { confirmChanges } from "./dialogs.js";
import { sendAppNotification } from "./notifications.js";

// ============================================================
// CONFIGURATION & SETUP
// ============================================================
const firestore = getFirestore(app);
const CURRENT_PATH = "sensors/UL800";
const HISTORY_PATH = "history/UL800";

// Dynamic Thresholds Container
let dynamicThresholds = {
    Safe: { min: 0, max: 0, msg: "", status: "Safe" },
    Monitor: { min: 0, max: 0, msg: "", status: "Monitor" },
    Warning: { min: 0, max: 0, msg: "", status: "Warning" },
    Critical: { min: 0, max: 0, msg: "", status: "Critical" }
};

const currentElement = document.getElementById("currentWaterLevel");
const currentUpdatedElement = document.getElementById("currentWaterLevelLabel");
const highestElement = document.getElementById("highestWaterLevel");
const lowestElement = document.getElementById("lowestWaterLevel");
const historyElement = document.getElementById("waterHistory");

let currentReading = null;
let lastDailyData = null;
let lastNotifiedStatus = "Safe";

// ============================================================
// CURRENT WATER LEVEL CARD COLOR (follows the last known level)
// Safe = green, Monitor = orange, Warning = red, Critical = dark blue
// ============================================================
const CARD_COLORS = {
    Safe: { border: "var(--green)", bg: "var(--greenfaded)" },
    Monitor: { border: "var(--orange)", bg: "var(--orangefaded)" },
    Warning: { border: "var(--red)", bg: "var(--redfaded)" },
    Critical: { border: "var(--bluedark)", bg: "var(--bluefaded)" }
};

function lastKnownLevel() {
    // Live reading while the sensor is online
    if (sensorOnline && currentReading) return currentReading.average;

    // Offline: the most recent level on record
    if (!lastDailyData) return null;
    const dates = Object.keys(lastDailyData).sort();
    for (let i = dates.length - 1; i >= 0; i--) {
        const day = lastDailyData[dates[i]];
        const readings = (day.readings || []).filter(r => Number.isFinite(r.level));
        if (readings.length) {
            return readings.reduce((a, b) => (b.timestamp > a.timestamp ? b : a)).level;
        }
        if (Number.isFinite(day.average)) return day.average;
    }
    return null;
}

function updateCurrentCardColor() {
    const card = document.querySelector(".card.blue");
    if (!card) return;
    const level = lastKnownLevel();
    if (level === null) return;
    const colors = CARD_COLORS[getStatus(level)];
    card.style.borderColor = colors.border;
    card.style.background = colors.bg;

    // The drop icon takes the same color as the border. It's a black SVG, so it is
    // drawn as a color-filled mask instead of the fixed blue filter it had before.
    let icon = card.querySelector(".iconpic");
    if (icon && icon.tagName === "IMG") {
        const maskIcon = document.createElement("span");
        maskIcon.className = "iconpic";
        maskIcon.style.filter = "none";
        maskIcon.style.display = "block";
        maskIcon.style.webkitMask = `url("${icon.getAttribute("src")}") center / contain no-repeat`;
        maskIcon.style.mask = `url("${icon.getAttribute("src")}") center / contain no-repeat`;
        icon.replaceWith(maskIcon);
        icon = maskIcon;
    }
    if (icon) icon.style.backgroundColor = colors.border;
}

// ============================================================
// FIRESTORE: LOAD THRESHOLDS
// ============================================================
function loadThresholds() {
    const statuses = ["Safe", "Monitor", "Warning", "Critical"];

    statuses.forEach(status => {
        const docRef = doc(firestore, "WaterLevel_Threshold", status);

        onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();

                dynamicThresholds[status] = {
                    min: data.thresholdMin || 0,
                    max: data.thresholdMax || 0,
                    msg: data.message || "",
                    status: data.status || status
                };

                updateThresholdTable();
            }
        });
    });
}

loadThresholds();

// ============================================================
// UPDATE THRESHOLD TABLE
// ============================================================
function updateThresholdTable() {
    ["safe", "monitor", "warning", "critical"].forEach(type => {
        const row = document.querySelector(`.tableRow.${type}`);

        if (row) {
            const capitalized =
                type.charAt(0).toUpperCase() + type.slice(1);

            const t = dynamicThresholds[capitalized];
            const cells = row.querySelectorAll("td");

            if (cells.length >= 3) {
                cells[1].textContent = `${t.min}m - ${t.max}m`;
                cells[2].textContent = t.msg || "—";
            }
        }
    });
    updateCurrentCardColor();
}

// ============================================================
// HELPER: LOAD EXTERNAL MODAL HTML
// ============================================================
async function ensureModalLoaded() {
    let modal = document.getElementById("editWaterThreshold");

    if (!modal) {
        try {
            const response = await fetch("../Popups/Edit_WaterThreshold.html");

            if (!response.ok) {
                throw new Error("Failed to load modal HTML");
            }

            const htmlText = await response.text();

            document.body.insertAdjacentHTML(
                "beforeend",
                htmlText
            );

            modal = document.getElementById("editWaterThreshold");
        } catch (err) {
            console.error("Error fetching external modal:", err);
            alert("Could not load external edit modal.");
        }
    }

    return modal;
}

// ============================================================
// MODAL: EDIT THRESHOLDS
// ============================================================
const THRESHOLD_TYPES = [
    "safe",
    "monitor",
    "warning",
    "critical"
];

const MAX_LEVEL_LIMIT = 10;

function toSelect(el) {
    if (el.tagName === "SELECT") {
        return el;
    }

    const sel = document.createElement("select");

    sel.className = el.className;

    sel.style.appearance = "none";
    sel.style.webkitAppearance = "none";
    sel.style.mozAppearance = "none";

    el.replaceWith(sel);

    return sel;
}

function fillSelect(sel, maxVal, current) {
    const cur = parseFloat(current);
    const opts = [];

    for (let i = 1; i <= maxVal; i++) {
        opts.push(i);
    }

    if (
        !isNaN(cur) &&
        cur !== 0 &&
        !opts.includes(cur)
    ) {
        opts.push(cur);
    }

    opts.sort((a, b) => a - b);

    sel.innerHTML = opts
        .map(n => `<option value="${n}">${n}</option>`)
        .join("");

    sel.value = String(
        !isNaN(cur) && opts.includes(cur)
            ? cur
            : opts[0]
    );
}

function setupThresholdDropdowns(modal, values) {
    const get = (type, idx) =>
        toSelect(
            modal.querySelectorAll(
                `.item.${type} .thres-item .form-input`
            )[idx]
        );

    const critMax = get("critical", 1);

    const others = [
        get("safe", 1),
        get("monitor", 0),
        get("monitor", 1),
        get("warning", 0),
        get("warning", 1),
        get("critical", 0)
    ];

    // Safe minimum is always 0
    const safeMin = get("safe", 0);

    safeMin.innerHTML =
        `<option value="0">0</option>`;

    safeMin.value = "0";
    safeMin.disabled = true;

    if (values) {
        fillSelect(
            critMax,
            MAX_LEVEL_LIMIT,
            values.criticalMax
        );
    }

    const rebuildOthers = (vals) => {
        const max =
            parseFloat(critMax.value) ||
            MAX_LEVEL_LIMIT;

        others.forEach((sel, i) => {
            fillSelect(
                sel,
                max,
                vals ? vals[i] : sel.value
            );
        });
    };

    if (values) {
        rebuildOthers([
            values.safeMax,
            values.monitorMin,
            values.monitorMax,
            values.warningMin,
            values.warningMax,
            values.criticalMin
        ]);
    }

    critMax.onchange = () => {
        rebuildOthers(null);
        refreshThresholdSaveState();
    };
}

let thresholdOriginal = {};

function readThresholdModal(modal) {
    const values = {};
    const labels = {};

    THRESHOLD_TYPES.forEach(type => {
        const cap =
            type.charAt(0).toUpperCase() +
            type.slice(1);

        const item =
            modal.querySelector(`.item.${type}`);

        if (!item) {
            return;
        }

        const inputs =
            item.querySelectorAll(
                ".thres-item .form-input"
            );

        const msgInput =
            item.querySelector(".message");

        if (inputs.length >= 2) {
            values[`${type}Min`] =
                String(
                    parseFloat(inputs[0].value) || 0
                );

            values[`${type}Max`] =
                String(
                    parseFloat(inputs[1].value) || 0
                );

            labels[`${type}Min`] =
                `${cap} minimum threshold`;

            labels[`${type}Max`] =
                `${cap} maximum threshold`;
        }

        if (msgInput) {
            values[`${type}Msg`] =
                msgInput.value;

            labels[`${type}Msg`] =
                `${cap} bridge message`;
        }
    });

    return {
        values,
        labels
    };
}

function refreshThresholdSaveState() {
    const modal =
        document.getElementById(
            "editWaterThreshold"
        );

    if (!modal) {
        return;
    }

    const {
        values,
        labels
    } = readThresholdModal(modal);

    setSaveEnabled(
        modal.querySelector(".button.confirm"),
        getChanges(
            thresholdOriginal,
            values,
            labels
        ).length > 0
    );
}

// ============================================================
// DOM EVENTS
// ============================================================
document.addEventListener("DOMContentLoaded", () => {

    document.addEventListener("input", (e) => {
        if (
            e.target.closest &&
            e.target.closest("#editWaterThreshold")
        ) {
            refreshThresholdSaveState();
        }
    });

    document.addEventListener("click", async (e) => {

        // ====================================================
        // OPEN MODAL
        // ====================================================
        if (e.target.closest(".btn.edit")) {
            e.preventDefault();

            const modal =
                await ensureModalLoaded();

            if (!modal) {
                return;
            }

            [
                "safe",
                "monitor",
                "warning",
                "critical"
            ].forEach(type => {

                const capitalized =
                    type.charAt(0).toUpperCase() +
                    type.slice(1);

                const t =
                    dynamicThresholds[capitalized];

                const item =
                    modal.querySelector(
                        `.item.${type}`
                    );

                if (item) {
                    const msgInput =
                        item.querySelector(".message");

                    if (msgInput) {
                        msgInput.value = t.msg;
                    }
                }
            });

            setupThresholdDropdowns(
                modal,
                {
                    safeMax:
                        dynamicThresholds.Safe.max,

                    monitorMin:
                        dynamicThresholds.Monitor.min,

                    monitorMax:
                        dynamicThresholds.Monitor.max,

                    warningMin:
                        dynamicThresholds.Warning.min,

                    warningMax:
                        dynamicThresholds.Warning.max,

                    criticalMin:
                        dynamicThresholds.Critical.min,

                    criticalMax:
                        dynamicThresholds.Critical.max
                }
            );

            thresholdOriginal =
                readThresholdModal(modal).values;

            refreshThresholdSaveState();

            modal.style.display = "flex";
        }

        // ====================================================
        // CLOSE MODAL
        // ====================================================
        if (
            e.target.closest(".button.delete") ||
            (
                e.target.id === "editWaterThreshold" &&
                e.target.classList.contains("modal-overlay")
            )
        ) {
            const modal =
                document.getElementById(
                    "editWaterThreshold"
                );

            if (modal) {
                modal.style.display = "none";
            }
        }

        // ====================================================
        // SAVE MODAL
        // ====================================================
        if (
            e.target.closest(".button.confirm") &&
            e.target.closest("#editWaterThreshold")
        ) {
            const saveBtn =
                e.target.closest(".button.confirm");

            const modal =
                document.getElementById(
                    "editWaterThreshold"
                );

            const {
                values: currentValues,
                labels: thresholdLabels
            } =
                readThresholdModal(modal);

            const thresholdChanges =
                getChanges(
                    thresholdOriginal,
                    currentValues,
                    thresholdLabels
                );

            if (thresholdChanges.length === 0) {
                return;
            }

            const description =
                describeChanges(
                    thresholdChanges
                );

            const confirmed =
                await confirmChanges(
                    description
                );

            if (!confirmed) {
                return;
            }

            saveBtn.disabled = true;

            try {
                const batch =
                    writeBatch(firestore);

                THRESHOLD_TYPES.forEach(type => {
                    const cap =
                        type.charAt(0).toUpperCase() +
                        type.slice(1);

                    const docRef =
                        doc(
                            firestore,
                            "WaterLevel_Threshold",
                            cap
                        );

                    batch.set(
                        docRef,
                        {
                            thresholdMin:
                                parseFloat(
                                    currentValues[
                                        `${type}Min`
                                    ]
                                ) || 0,

                            thresholdMax:
                                parseFloat(
                                    currentValues[
                                        `${type}Max`
                                    ]
                                ) || 0,

                            message:
                                currentValues[
                                    `${type}Msg`
                                ] || "",

                            status: cap
                        },
                        {
                            merge: true
                        }
                    );
                });

                await batch.commit();

                await writeLog(
                    "Water Level Threshold",
                    "Updated threshold settings",
                    description
                );

                thresholdOriginal =
                    currentValues;

                refreshThresholdSaveState();

                modal.style.display = "none";

            } catch (err) {
                console.error(
                    "Error saving thresholds:",
                    err
                );

                alert(
                    "Failed to save threshold settings."
                );

                saveBtn.disabled = false;
            }
        }
    });
});

// ============================================================
// FORMAT HELPERS
// ============================================================
function formatMeters(value) {
    if (
        value === null ||
        value === undefined ||
        isNaN(value)
    ) {
        return "-- m";
    }

    return Number(value).toFixed(2) + " m";
}

// ============================================================
// TIMESTAMP HELPERS
// ============================================================
function normalizeTimestamp(timestamp) {
    const value = Number(timestamp);

    if (
        !Number.isFinite(value) ||
        value <= 0
    ) {
        return null;
    }

    // Unix seconds are ~10 digits.
    // Unix milliseconds are ~13 digits.
    return value < 1e12
        ? value * 1000
        : value;
}

function formatLastUpdated(timestamp) {
    const milliseconds =
        normalizeTimestamp(timestamp);

    if (milliseconds === null) {
        return "Last Updated: --";
    }

    const updatedAt =
        new Date(milliseconds);

    if (
        Number.isNaN(
            updatedAt.getTime()
        )
    ) {
        return "Last Updated: --";
    }

    const now = new Date();

    const elapsedMs =
        Math.max(
            0,
            now.getTime() -
            updatedAt.getTime()
        );

    const elapsedMinutes =
        Math.floor(
            elapsedMs / 60000
        );

    if (elapsedMs < 60000) {
        return "Updated Just Now";
    }

    if (elapsedMinutes < 60) {
        return `Updated ${elapsedMinutes} Minute${elapsedMinutes === 1 ? "" : "s"} Ago`;
    }

    const time =
        updatedAt.toLocaleTimeString(
            "en-US",
            {
                hour: "numeric",
                minute: "2-digit",
                hour12: true
            }
        );

    const sameDay =
        updatedAt.getFullYear() ===
            now.getFullYear() &&

        updatedAt.getMonth() ===
            now.getMonth() &&

        updatedAt.getDate() ===
            now.getDate();

    if (sameDay) {
        return `Last Updated: ${time}`;
    }

    const date =
        updatedAt.toLocaleDateString(
            "en-US",
            {
                month: "2-digit",
                day: "2-digit",
                year: "2-digit"
            }
        );

    return `Last Updated: ${date} - ${time}`;
}

function updateLastUpdatedLabel(timestamp) {
    if (currentUpdatedElement) {
        currentUpdatedElement.textContent =
            formatLastUpdated(timestamp);
    }
}

// ============================================================
// SENSOR ONLINE / OFFLINE DETECTION
// ============================================================
//
// The sensor normally uploads a reading every 5 seconds.
//
// If the timestamp becomes older than 15 seconds,
// the sensor is considered OFFLINE.
//
// This handles:
//
// 1. Sensor powered OFF
// 2. Sensor disconnected
// 3. Sensor stops sending data
// 4. Network connection is lost
// 5. Sensor firmware stops updating Firebase
//
// IMPORTANT:
//
// Old Firebase data is NOT deleted.
//
// Historical data remains available.
//
// Only the CURRENT reading is hidden when
// the sensor becomes stale/offline.
// ============================================================

const SENSOR_OFFLINE_TIMEOUT_MS = 15000;

let latestSensorTimestamp = null;
let sensorOnline = false;

// ============================================================
// SHOW SENSOR OFFLINE
// ============================================================
function showSensorOffline() {

    sensorOnline = false;

    latestSensorTimestamp = null;

    currentReading = null;

    if (currentElement) {
        currentElement.textContent = "--";
    }

    if (currentUpdatedElement) {
        currentUpdatedElement.textContent =
            "Sensor Offline";
    }

    // Keep the card colored by the last known level
    updateCurrentCardColor();
}

// ============================================================
// SHOW CURRENT SENSOR READING
// ============================================================
function showCurrentSensorReading(data) {
    const timestamp = normalizeTimestamp(data.timestamp);
    const levelMeters = Number(data.level);

    if (timestamp === null || !Number.isFinite(levelMeters)) {
        showSensorOffline();
        return;
    }

    const age = Date.now() - timestamp;
    if (age > SENSOR_OFFLINE_TIMEOUT_MS || age < -60000) {
        showSensorOffline();
        return;
    }

    sensorOnline = true;
    latestSensorTimestamp = timestamp;

    if (currentElement) {
        currentElement.textContent = formatMeters(levelMeters);
    }
    updateLastUpdatedLabel(timestamp);

    // ============================================================
    // NEW: AUTOMATED NOTIFICATION TRIGGER
    // ============================================================
    const currentStatus = getStatus(levelMeters); 

    // Only trigger if the status has worsened to prevent spamming
    if (currentStatus !== lastNotifiedStatus) {
        if (currentStatus === "Critical") {
            sendAppNotification(
                "CRITICAL WATER LEVEL",
                `Paltok Creek has reached ${levelMeters.toFixed(2)}m. Bridge flooded, do not cross!`,
                "water_level" 
            );
        } else if (currentStatus === "Warning") {
            sendAppNotification(
                "Water Level Advisory",
                `Paltok Creek has risen to ${levelMeters.toFixed(2)}m. Please exercise caution.`,
                "water_level"
            );
        }
        // Save the current status so it only alerts once per stage
        lastNotifiedStatus = currentStatus; 
    }
    // ============================================================

    currentReading = {
        average: levelMeters,
        highest: levelMeters,
        lowest: levelMeters,
        date: getTodayDate()
    };

    updateCurrentCardColor();

    if (lastDailyData) {
        renderHistory(lastDailyData);
    }
}

// ============================================================
// FIREBASE CURRENT SENSOR LISTENER
// ============================================================
const currentRef =
    ref(
        database,
        CURRENT_PATH
    );

onValue(
    currentRef,
    snapshot => {

        const data =
            snapshot.val();

        // No current Firebase data.
        if (!data) {
            showSensorOffline();
            return;
        }

        showCurrentSensorReading(
            data
        );
    }
);

// ============================================================
// PERIODICALLY CHECK FOR STALE SENSOR DATA
// ============================================================
//
// Firebase does not necessarily fire another
// onValue event when the physical sensor is
// switched OFF.
//
// This timer checks the last known timestamp.
//
// Every 5 seconds:
//
// If timestamp is older than 15 seconds:
//      Sensor Offline
//
// Otherwise:
//      Sensor Online
// ============================================================
setInterval(() => {

    if (!latestSensorTimestamp) {
        showSensorOffline();
        return;
    }

    const age =
        Date.now() -
        latestSensorTimestamp;

    if (
        age >
        SENSOR_OFFLINE_TIMEOUT_MS
    ) {
        showSensorOffline();

    } else if (sensorOnline) {

        updateLastUpdatedLabel(
            latestSensorTimestamp
        );
    }

}, 5000);

// ============================================================
// STATUS HELPER
// ============================================================
function getStatus(level) {

    if (
        level >=
        dynamicThresholds.Critical.min
    ) {
        return "Critical";
    }

    if (
        level >=
        dynamicThresholds.Warning.min
    ) {
        return "Warning";
    }

    if (
        level >=
        dynamicThresholds.Monitor.min
    ) {
        return "Monitor";
    }

    return "Safe";
}

// ============================================================
// HISTORY FETCHING & RENDERING
// ============================================================
const historyRef =
    ref(
        database,
        HISTORY_PATH
    );

onValue(
    historyRef,
    snapshot => {

        const data =
            snapshot.val();

        if (!data) {

            if (historyElement) {
                historyElement.innerHTML =
                    "<div>No water level history available.</div>";
            }

            return;
        }

        const dailyData =
            processHistory(data);

        lastDailyData =
            dailyData;

        updateCurrentCardColor();

        updateTodayStatistics(
            dailyData
        );

        renderHistory(
            dailyData
        );
    }
);

// ============================================================
// PROCESS HISTORY
// ============================================================
function processHistory(data) {

    const dailyData = {};

    Object.entries(data).forEach(
        ([date, readings]) => {

            if (!readings) {
                return;
            }

            const values = [];

            Object.values(readings)
                .forEach(reading => {

                    if (
                        !reading ||
                        reading.level === undefined
                    ) {
                        return;
                    }

                    values.push({
                        level:
                            Number(
                                reading.level
                            ),

                        timestamp:
                            Number(
                                reading.timestamp
                            )
                    });
                });

            if (
                values.length === 0
            ) {
                return;
            }

            const validValues =
                values.filter(
                    item =>
                        item.level > 0
                );

            if (
                validValues.length === 0
            ) {
                return;
            }

            const levels =
                validValues.map(
                    item =>
                        item.level
                );

            dailyData[date] = {
                average:
                    levels.reduce(
                        (sum, value) =>
                            sum + value,
                        0
                    ) /
                    levels.length,

                highest:
                    Math.max(...levels),

                lowest:
                    Math.min(...levels),

                readings:
                    validValues
            };
        }
    );

    return dailyData;
}

// ============================================================
// TODAY STATISTICS
// ============================================================
function updateTodayStatistics(
    dailyData
) {

    const todayData =
        dailyData[
            getTodayDate()
        ];

    if (!todayData) {

        if (highestElement) {
            highestElement.textContent =
                "-- m";
        }

        if (lowestElement) {
            lowestElement.textContent =
                "-- m";
        }

        return;
    }

    if (highestElement) {
        highestElement.textContent =
            formatMeters(
                todayData.highest
            );
    }

    if (lowestElement) {
        lowestElement.textContent =
            formatMeters(
                todayData.lowest
            );
    }
}

// ============================================================
// GET TODAY DATE
// ============================================================
function getTodayDate() {

    const now =
        new Date();

    const year =
        now.getFullYear();

    const month =
        String(
            now.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            now.getDate()
        ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

// ============================================================
// RENDER HISTORY
// ============================================================
function renderHistory(
    dailyData
) {

    if (!historyElement) {
        return;
    }

    historyElement.innerHTML = "";

    // ========================================================
    // IMPORTANT:
    //
    // Only add current reading if the sensor
    // is actually online.
    //
    // A stale/offline reading will NEVER be
    // inserted as a new current history value.
    // ========================================================
    if (
        sensorOnline &&
        currentReading &&
        !dailyData[
            currentReading.date
        ]
    ) {

        dailyData[
            currentReading.date
        ] = {

            average:
                currentReading.average,

            highest:
                currentReading.highest,

            lowest:
                currentReading.lowest,

            readings: []
        };
    }

    // ========================================================
    // LAST 30 DAYS
    // ========================================================
    const cutoff =
        new Date();

    cutoff.setHours(
        0,
        0,
        0,
        0
    );

    cutoff.setDate(
        cutoff.getDate() - 29
    );

    const cutoffStr =
        `${cutoff.getFullYear()}-${String(
            cutoff.getMonth() + 1
        ).padStart(2, "0")}-${String(
            cutoff.getDate()
        ).padStart(2, "0")}`;

    const dates =
        Object.keys(
            dailyData
        )
            .filter(
                d => d >= cutoffStr
            )
            .sort()
            .reverse();

    if (
        dates.length === 0
    ) {

        historyElement.innerHTML =
            "<div>No history available.</div>";

        return;
    }

    // ========================================================
    // CREATE HISTORY ITEMS
    // ========================================================
    dates.forEach(
        date => {

            const data =
                dailyData[date];

            const status =
                getStatus(
                    data.average
                );

            const icon =
                getStatusIcon(
                    status
                );

            const formattedDate =
                new Date(
                    date +
                    "T00:00:00"
                ).toLocaleDateString(
                    "en-US",
                    {
                        month: "long",
                        day: "numeric"
                    }
                );

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "level-item";

            item.innerHTML = `
                <div class="history-icon">
                    <img
                        src="${icon}"
                        class="svg"
                        alt="${status}"
                    >
                </div>

                <div class="content1">
                    <div class="status">
                        ${status}
                    </div>

                    <div class="date">
                        ${formattedDate}
                    </div>
                </div>

                <div class="ave">
                    <strong>
                        ${data.average.toFixed(2)}
                    </strong>
                    <span>m</span>
                </div>

                <div class="content2">
                    <div class="desc">
                        Highest :
                        ${data.highest.toFixed(2)} m
                    </div>

                    <div class="desc">
                        Lowest :
                        ${data.lowest.toFixed(2)} m
                    </div>
                </div>
            `;

            historyElement.appendChild(
                item
            );
        }
    );
}

// ============================================================
// STATUS ICON
// ============================================================
function getStatusIcon(
    status
) {

    switch (status) {

        case "Safe":
            return "../Icons/ic_water_1.svg";

        case "Monitor":
            return "../Icons/ic_water_2.svg";

        case "Warning":
            return "../Icons/ic_water_3.svg";

        case "Critical":
            return "../Icons/ic_water_4.svg";

        default:
            return "../Icons/ic_water_1.svg";
    }
}