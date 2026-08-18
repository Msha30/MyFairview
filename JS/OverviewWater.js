import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { database, app } from "./auth.js";

const firestore = getFirestore(app);
const CURRENT_PATH = "sensors/UL800";

let dynamicThresholds = {
    Safe: { min: 0, max: 0 },
    Monitor: { min: 0, max: 0 },
    Warning: { min: 0, max: 0 },
    Critical: { min: 0, max: 0 }
};

let currentLevelValue = null;

const currentElement = document.getElementById("currentWaterLevel");

// ============================================================
// LOAD THRESHOLDS FROM FIRESTORE
// ============================================================
function loadThresholds() {
    ["Safe", "Monitor", "Warning", "Critical"].forEach(status => {
        const docRef = doc(firestore, "WaterLevel_Threshold", status);
        onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                dynamicThresholds[status] = {
                    min: data.thresholdMin || 0,
                    max: data.thresholdMax || 0
                };
                updateThresholdUI();
                evaluateStatus();
            }
        });
    });
}

function updateThresholdUI() {
    Object.keys(dynamicThresholds).forEach(status => {
        const t = dynamicThresholds[status];
        const rangeElement = document.getElementById(`range-${status}`);
        if (rangeElement) {
            rangeElement.textContent = `${t.min}m - ${t.max}m`;
        }
    });
}

// ============================================================
// EVALUATE & HIGHLIGHT ACTIVE STATUS
// ============================================================
function evaluateStatus() {
    if (currentLevelValue === null) return;

    let activeStatus = "Safe";
    if (currentLevelValue >= dynamicThresholds.Critical.min) {
        activeStatus = "Critical";
    } else if (currentLevelValue >= dynamicThresholds.Warning.min) {
        activeStatus = "Warning";
    } else if (currentLevelValue >= dynamicThresholds.Monitor.min) {
        activeStatus = "Monitor";
    } else {
        activeStatus = "Safe";
    }

    // Update active class on status cards
    document.querySelectorAll(".card-status .status").forEach(card => {
        const cardStatus = card.getAttribute("data-status");
        if (cardStatus === activeStatus) {
            card.classList.add("active");
        } else {
            card.classList.remove("active");
        }
    });
}

// ============================================================
// LISTEN TO CURRENT WATER LEVEL
// ============================================================
const currentRef = ref(database, CURRENT_PATH);
onValue(currentRef, snapshot => {
    const data = snapshot.val();
    if (!data || data.level === undefined) {
        if (currentElement) currentElement.textContent = "-- m";
        return;
    }

    currentLevelValue = Number(data.level);
    if (currentElement) {
        currentElement.textContent = currentLevelValue.toFixed(2) + " m";
    }

    evaluateStatus();
});

// Initialize
loadThresholds();