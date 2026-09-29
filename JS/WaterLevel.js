import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import { getFirestore, doc, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { database, app } from "./auth.js";
import { writeLog } from "./logging.js";
import { getChanges, describeChanges, setSaveEnabled } from "./edit-tracker.js";

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
const highestElement = document.getElementById("highestWaterLevel");
const lowestElement = document.getElementById("lowestWaterLevel");
const historyElement = document.getElementById("waterHistory");

let currentReading = null;
let lastDailyData = null;

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
// Initialize fetching
loadThresholds();

// Updates the HTML table in WaterLevel.html
function updateThresholdTable() {
    ['safe', 'monitor', 'warning', 'critical'].forEach(type => {
        const row = document.querySelector(`.tableRow.${type}`);
        if (row) {
            const capitalized = type.charAt(0).toUpperCase() + type.slice(1);
            const t = dynamicThresholds[capitalized];
            const cells = row.querySelectorAll("td");
            if (cells.length >= 3) {
                cells[1].textContent = `${t.min}m - ${t.max}m`;
                cells[2].textContent = t.msg || "—";
            }
        }
    });
}

// ============================================================
// HELPER: LOAD EXTERNAL MODAL HTML
// ============================================================
async function ensureModalLoaded() {
    let modal = document.getElementById("editWaterThreshold");
    if (!modal) {
        try {
            const response = await fetch("../Popups/Edit_WaterThreshold.html");
            if (!response.ok) throw new Error("Failed to load modal HTML");
            const htmlText = await response.text();
            document.body.insertAdjacentHTML("beforeend", htmlText);
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
const THRESHOLD_TYPES = ['safe', 'monitor', 'warning', 'critical'];
const MAX_LEVEL_LIMIT = 10; // Highest allowed value for Critical's max threshold

// Swaps a number <input> for a <select> (once), keeping the same classes so styling is unchanged
function toSelect(el) {
    if (el.tagName === "SELECT") return el;
    const sel = document.createElement("select");
    sel.className = el.className;
    el.replaceWith(sel);
    return sel;
}

// Fills a dropdown with 1..maxVal. A stored value outside that range is still listed so it
// stays visible (and will be rejected on Save).
function fillSelect(sel, maxVal, current) {
    const cur = parseFloat(current);
    const opts = [];
    for (let i = 1; i <= maxVal; i++) opts.push(i);
    if (!isNaN(cur) && cur !== 0 && !opts.includes(cur)) opts.push(cur);
    opts.sort((a, b) => a - b);
    sel.innerHTML = opts.map(n => `<option value="${n}">${n}</option>`).join("");
    sel.value = String(!isNaN(cur) && opts.includes(cur) ? cur : opts[0]);
}

// (Re)builds every threshold dropdown based on Critical's max
function setupThresholdDropdowns(modal, values) {
    const get = (type, idx) => toSelect(modal.querySelectorAll(`.item.${type} .thres-item .form-input`)[idx]);
    const critMax = get("critical", 1);
    const others = [get("safe", 1), get("monitor", 0), get("monitor", 1), get("warning", 0), get("warning", 1), get("critical", 0)];

    // Safe minimum is always 0 and not editable
    const safeMin = get("safe", 0);
    safeMin.innerHTML = `<option value="0">0</option>`;
    safeMin.value = "0";
    safeMin.disabled = true;

    if (values) fillSelect(critMax, MAX_LEVEL_LIMIT, values.criticalMax);
    const rebuildOthers = (vals) => {
        const max = parseFloat(critMax.value) || MAX_LEVEL_LIMIT;
        others.forEach((sel, i) => fillSelect(sel, max, vals ? vals[i] : sel.value));
    };
    if (values) rebuildOthers([values.safeMax, values.monitorMin, values.monitorMax, values.warningMin, values.warningMax, values.criticalMin]);

    critMax.onchange = () => { rebuildOthers(null); refreshThresholdSaveState(); };
}
let thresholdOriginal = {};

// Reads the popup's current values and the human labels for each field
function readThresholdModal(modal) {
    const values = {};
    const labels = {};
    THRESHOLD_TYPES.forEach(type => {
        const cap = type.charAt(0).toUpperCase() + type.slice(1);
        const item = modal.querySelector(`.item.${type}`);
        if (!item) return;
        const inputs = item.querySelectorAll(".thres-item .form-input");
        const msgInput = item.querySelector(".message");
        if (inputs.length >= 2) {
            values[`${type}Min`] = String(parseFloat(inputs[0].value) || 0);
            values[`${type}Max`] = String(parseFloat(inputs[1].value) || 0);
            labels[`${type}Min`] = `${cap} minimum threshold`;
            labels[`${type}Max`] = `${cap} maximum threshold`;
        }
        if (msgInput) {
            values[`${type}Msg`] = msgInput.value;
            labels[`${type}Msg`] = `${cap} bridge message`;
        }
    });
    return { values, labels };
}

function refreshThresholdSaveState() {
    const modal = document.getElementById("editWaterThreshold");
    if (!modal) return;
    const { values, labels } = readThresholdModal(modal);
    setSaveEnabled(modal.querySelector(".button.confirm"), getChanges(thresholdOriginal, values, labels).length > 0);
}

document.addEventListener("DOMContentLoaded", () => {
    // Save stays grey/inactive until a threshold or message actually changes
    document.addEventListener("input", (e) => {
        if (e.target.closest && e.target.closest("#editWaterThreshold")) refreshThresholdSaveState();
    });

    document.addEventListener("click", async (e) => {
        
        // 1. OPEN MODAL
        if (e.target.closest(".btn.edit")) {
            e.preventDefault();
            const modal = await ensureModalLoaded();
            if (!modal) return;
            
            // Populate modal with current Firestore data
            ['safe', 'monitor', 'warning', 'critical'].forEach(type => {
                const capitalized = type.charAt(0).toUpperCase() + type.slice(1);
                const t = dynamicThresholds[capitalized];
                const item = modal.querySelector(`.item.${type}`);
                if (item) {
                    const inputs = item.querySelectorAll(".thres-item .form-input");
                    const msgInput = item.querySelector(".message");
                    if (msgInput) msgInput.value = t.msg;
                }
            });
            setupThresholdDropdowns(modal, {
                safeMax: dynamicThresholds.Safe.max,
                monitorMin: dynamicThresholds.Monitor.min, monitorMax: dynamicThresholds.Monitor.max,
                warningMin: dynamicThresholds.Warning.min, warningMax: dynamicThresholds.Warning.max,
                criticalMin: dynamicThresholds.Critical.min, criticalMax: dynamicThresholds.Critical.max
            });
            thresholdOriginal = readThresholdModal(modal).values;
            refreshThresholdSaveState();
            modal.style.display = "flex";
        }

        // 2. CLOSE MODAL
        if (e.target.closest(".button.delete") || (e.target.id === "editWaterThreshold" && e.target.classList.contains("modal-overlay"))) {
            const modal = document.getElementById("editWaterThreshold");
            if (modal) modal.style.display = "none";
        }

        // 3. SAVE MODAL TO FIRESTORE
        if (e.target.closest(".button.confirm") && e.target.closest("#editWaterThreshold")) {
            const saveBtn = e.target.closest(".button.confirm");
            const modal = document.getElementById("editWaterThreshold");
            const { values: currentValues, labels: thresholdLabels } = readThresholdModal(modal);
            const thresholdChanges = getChanges(thresholdOriginal, currentValues, thresholdLabels);
            if (thresholdChanges.length === 0) return; // Nothing changed: nothing to save or log

            // Every threshold must be within the highest (Critical max) level
            const highest = parseFloat(currentValues.criticalMax);
            const tooHigh = Object.keys(currentValues).filter(k => /(Min|Max)$/.test(k) && parseFloat(currentValues[k]) > highest);
            if (tooHigh.length > 0) {
                alert(`Thresholds can't be higher than the highest level (${highest}). Please fix the dropdowns that exceed it.`);
                return;
            }
            saveBtn.textContent = "Saving...";
            saveBtn.disabled = true;
            
            const batch = writeBatch(firestore);

            ['safe', 'monitor', 'warning', 'critical'].forEach(type => {
                const capitalized = type.charAt(0).toUpperCase() + type.slice(1);
                const item = modal.querySelector(`.item.${type}`);
                if (item) {
                    const inputs = item.querySelectorAll(".thres-item .form-input");
                    const msgInput = item.querySelector(".message");
                    
                    if (inputs.length >= 2 && msgInput) {
                        const docRef = doc(firestore, "WaterLevel_Threshold", capitalized);
                        batch.update(docRef, {
                            thresholdMin: parseFloat(inputs[0].value) || 0,
                            thresholdMax: parseFloat(inputs[1].value) || 0,
                            message: msgInput.value.trim()
                        });
                    }
                }
            });

            try {
                await batch.commit();
                writeLog("Edit", "Edited Water Level Threshold", "WaterLevel_Threshold", describeChanges("water level", thresholdChanges));
                modal.style.display = "none";
            } catch (err) {
                console.error("Error updating thresholds:", err);
                alert("Failed to save thresholds. Check console.");
            } finally {
                saveBtn.textContent = "Save";
                saveBtn.disabled = false;
            }
        }
    });
});

// ============================================================
// FORMAT METERS
// ============================================================
function formatMeters(value) {
    if (value === null || value === undefined || isNaN(value)) return "-- m";
    return Number(value).toFixed(2) + " m";
}

// ============================================================
// CURRENT WATER LEVEL
// ============================================================
const currentRef = ref(database, CURRENT_PATH);
onValue(currentRef, snapshot => {
    const data = snapshot.val();
    if (!data) {
        if (currentElement) currentElement.textContent = "-- m";
        return;
    }

    const levelMeters = Number(data.level);
    if (currentElement) currentElement.textContent = formatMeters(levelMeters);

    currentReading = {
        average: levelMeters,
        highest: levelMeters,
        lowest: levelMeters,
        date: getTodayDate()
    };

    if (lastDailyData) renderHistory(lastDailyData);
});

// ============================================================
// STATUS HELPER
// ============================================================
function getStatus(level) {
    if (level >= dynamicThresholds.Critical.min) return "Critical";
    if (level >= dynamicThresholds.Warning.min) return "Warning";
    if (level >= dynamicThresholds.Monitor.min) return "Monitor";
    return "Safe";
}

// ============================================================
// HISTORY FETCHING & RENDERING
// ============================================================
const historyRef = ref(database, HISTORY_PATH);
onValue(historyRef, snapshot => {
    const data = snapshot.val();
    if (!data) {
        if (historyElement) historyElement.innerHTML = "<div>No water level history available.</div>";
        return;
    }
    const dailyData = processHistory(data);
    lastDailyData = dailyData;
    updateTodayStatistics(dailyData);
    renderHistory(dailyData);
});

function processHistory(data) {
    const dailyData = {};
    Object.entries(data).forEach(([date, readings]) => {
        if (!readings) return;
        const values = [];
        Object.values(readings).forEach(reading => {
            if (!reading || reading.level === undefined) return;
            values.push({ level: Number(reading.level), timestamp: Number(reading.timestamp) });
        });
        if (values.length === 0) return;
        const validValues = values.filter(item => item.level > 0);
        if (validValues.length === 0) return;

        const levels = validValues.map(item => item.level);
        dailyData[date] = {
            average: levels.reduce((sum, value) => sum + value, 0) / levels.length,
            highest: Math.max(...levels),
            lowest: Math.min(...levels),
            readings: validValues
        };
    });
    return dailyData;
}

function updateTodayStatistics(dailyData) {
    const todayData = dailyData[getTodayDate()];
    if (!todayData) {
        if (highestElement) highestElement.textContent = "-- m";
        if (lowestElement) lowestElement.textContent = "-- m";
        return;
    }
    if (highestElement) highestElement.textContent = formatMeters(todayData.highest);
    if (lowestElement) lowestElement.textContent = formatMeters(todayData.lowest);
}

function getTodayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function renderHistory(dailyData) {
    if (!historyElement) return;
    historyElement.innerHTML = "";

    if (currentReading && !dailyData[currentReading.date]) {
        dailyData[currentReading.date] = {
            average: currentReading.average, highest: currentReading.highest,
            lowest: currentReading.lowest, readings: []
        };
    }

    const dates = Object.keys(dailyData).sort().reverse().slice(0, 30);
    if (dates.length === 0) return historyElement.innerHTML = "<div>No history available.</div>";

    dates.forEach(date => {
        const data = dailyData[date];
        const status = getStatus(data.average);
        const icon = getStatusIcon(status);
        const formattedDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });
        
        const item = document.createElement("div");
        item.className = "level-item";
        item.innerHTML = `
            <div class="history-icon"><img src="${icon}" class="svg" alt="${status}"></div>
            <div class="content1">
                <div class="status">${status}</div>
                <div class="date">${formattedDate}</div>
            </div>
            <div class="ave"><strong>${data.average.toFixed(2)}</strong><span>m</span></div>
            <div class="content2">
                <div class="desc">Highest : ${data.highest.toFixed(2)} m</div>
                <div class="desc">Lowest : ${data.lowest.toFixed(2)} m</div>
            </div>
        `;
        historyElement.appendChild(item);
    });
}

function getStatusIcon(status) {
    switch (status) {
        case "Safe": return "../Icons/ic_water_1.svg";
        case "Monitor": return "../Icons/ic_water_2.svg";
        case "Warning": return "../Icons/ic_water_3.svg";
        case "Critical": return "../Icons/ic_water_4.svg";
        default: return "../Icons/ic_water_1.svg";
    }
}