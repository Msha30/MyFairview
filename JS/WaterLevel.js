import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import { getFirestore, doc, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { database, app } from "./auth.js";

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
document.addEventListener("DOMContentLoaded", () => {
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
                    const inputs = item.querySelectorAll("input[type='number']");
                    const msgInput = item.querySelector(".message");
                    if (inputs.length >= 2) {
                        inputs[0].value = t.min;
                        inputs[1].value = t.max;
                    }
                    if (msgInput) msgInput.value = t.msg;
                }
            });
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
            saveBtn.textContent = "Saving...";
            saveBtn.disabled = true;
            
            const batch = writeBatch(firestore);

            ['safe', 'monitor', 'warning', 'critical'].forEach(type => {
                const capitalized = type.charAt(0).toUpperCase() + type.slice(1);
                const item = modal.querySelector(`.item.${type}`);
                if (item) {
                    const inputs = item.querySelectorAll("input[type='number']");
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