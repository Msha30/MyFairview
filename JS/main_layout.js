import { auth, logout, getStaffProfile, database, app } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import { getFirestore, doc, onSnapshot, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { watchAccess, NAV_MODULE, loadAccess } from "./permissions.js";
import { showMessage, confirmAction } from "./dialogs.js";

const userSection = document.getElementById("userSection");
const userDropdown = document.getElementById("userDropdown");
const logoutBtn = document.getElementById("logoutBtn");

// 1. Auth Guard & Profile Fetcher
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("index.html");
        return;
    }

    // Only Info_Staff accounts may use this admin console. A signed-in Firebase
    // Auth user who isn't staff (e.g. loaded MainLayout.html directly with a
    // resident session) gets signed out and bounced back to the login page.
    let userData = null;
    try {
        userData = await getStaffProfile(user.uid);
    } catch (err) {
        console.error("Error verifying staff account:", err);
    }

    if (!userData) {
        await logout();
        return;
    }

    const userNameEl = document.querySelector(".user-name") || document.getElementById("userName");
    const userRoleEl = document.querySelector(".user-role") || document.getElementById("userRole");

    const fullName = `${userData.fName || ""} ${userData.lName || ""}`.trim() || "Administrator";

    if (userNameEl) userNameEl.textContent = fullName;

    // Avatar initials follow the displayed name: "Administrator" -> A, "Mickey Santos" -> MS
    const avatarEl = document.querySelector("#userSection .user-avatar");
    if (avatarEl) {
        const first = (userData.fName || "").trim().charAt(0);
        const last = (userData.lName || "").trim().charAt(0);
        avatarEl.textContent = (first + last).toUpperCase() || fullName.charAt(0).toUpperCase();
    }
    if (userRoleEl) userRoleEl.textContent = userData.role || "Staff";

    startAccessWatch();
});

// ------------------------------------------------------------
// Access control: sidebar follows this staff member's permissions, live.
// (The page itself is also guarded inside the iframe by subpage_guard.js.)
// ------------------------------------------------------------
let accessWatchStarted = false;
let lastAccessSignature = null;
let seenStaffDoc = false;

function applyNavAccess(access) {
    Object.entries(NAV_MODULE).forEach(([file, moduleKey]) => {
        const allowed = access.can(moduleKey, "view");
        // Matches links/buttons that point at the page (href, data-page, data-src, data-target)
        const sel = ["onclick", "href", "data-page", "data-src", "data-target", "data-href"]
            .map(attr => `[${attr}*="${file}" i]`).join(",");
        document.querySelectorAll(sel).forEach(el => {
            const item = el.closest("li") || el;
            item.style.display = allowed ? "" : "none";
        });
    });

    // Hide a section heading (e.g. "Admin") when every item under it is hidden
    document.querySelectorAll(".menu-title").forEach(title => {
        let el = title.nextElementSibling;
        let anyVisible = false;
        while (el && !el.classList.contains("menu-title")) {
            if (el.classList.contains("menu-item") && el.style.display !== "none") anyVisible = true;
            el = el.nextElementSibling;
        }
        title.style.display = anyVisible ? "" : "none";
    });
}

function startAccessWatch() {
    if (accessWatchStarted) return;
    accessWatchStarted = true;

    watchAccess(async (access) => {
        if (!access.isStaff) {
            // Staff record was removed while signed in
            if (!seenStaffDoc) return; // ignore a transient empty first snapshot
            await showMessage({
                title: "Access Removed",
                type: "error",
                message: "Your staff account has been removed. You will now be signed out."
            });
            await logout();
            return;
        }
        seenStaffDoc = true;

        const p = access.profile;
        const signature = JSON.stringify([p.role, p.p_announcement, p.p_citizens, p.p_vehicles,
            p.p_reports, p.p_waterLevel, p.p_evacPlan, p.p_access]);

        applyNavAccess(access);

        if (lastAccessSignature !== null && signature !== lastAccessSignature) {
            // Refresh the sign-in token too, so server-side rules that read the
            // staff's custom claims (see Security/SECURITY_GUIDE.md) see the change.
            auth.currentUser?.getIdToken(true).catch(() => {});
            // Permissions changed while they were working: reload the open page so
            // its buttons/guard use the new permissions, and tell them why.
            document.getElementById("contentFrame")?.contentWindow?.location.reload();
            showMessage({
                title: "Permissions Updated",
                message: "A Super Admin changed your access. The page has been refreshed to match."
            });
        }
        lastAccessSignature = signature;
    });
}

// 2. Parse URL parameters for iframe navigation
const urlParams = new URLSearchParams(window.location.search);
const requestedPage = urlParams.get("page");

if (requestedPage) {
    const iframe = document.getElementById("contentFrame");
    if (iframe) {
        iframe.src = `MainPages/${requestedPage}`;
    }
}

// 3. User Dropdown Toggle
if (userSection && userDropdown) {
    userSection.addEventListener("click", (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
        if (!userDropdown.contains(e.target) && !userSection.contains(e.target)) {
            userDropdown.classList.add("hidden");
        }
    });
}

// 4. Fetch and inject Dialog_Logout.html on page load
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch("Popups/Dialog_Logout.html"); // Adjust path if inside a folder like "Popups/Dialog_Logout.html"
        if (response.ok) {
            const html = await response.text();
            const container = document.getElementById("popup-container");
            if (container) {
                container.innerHTML = html;
            }
        }
    } catch (err) {
        console.error("Error loading logout dialog:", err);
    }
});

// 5. Logout Action - Open Modal
if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (userDropdown) {
            userDropdown.classList.add("hidden");
        }

        const dialogLogout = document.getElementById("dialogLogout");
        if (dialogLogout) {
            dialogLogout.style.display = "flex";
        }
    });
}

// 6. Handle Modal Actions (Cancel, Confirm Logout, Outside Click) via Event Delegation
document.addEventListener("click", async (e) => {
    const dialogLogout = document.getElementById("dialogLogout");
    if (!dialogLogout) return;

    // Close modal if clicking "Cancel" or clicking the dark background overlay
    if (e.target.id === "cancelLogoutBtn" || e.target === dialogLogout) {
        dialogLogout.style.display = "none";
    }

    // Execute logout when confirming
    if (e.target.id === "confirmLogoutBtn") {
        const confirmBtn = e.target;
        confirmBtn.textContent = "Logging out...";
        confirmBtn.disabled = true;
        await logout();
    }
});

// 7. Live Alert Timestamp
function updateLiveTime() {
    const timeEl = document.getElementById("currentTime");
    if (!timeEl) return;

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
    const timeStr = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    });

    timeEl.textContent = `${dateStr} · ${timeStr}`;
}

updateLiveTime();
setInterval(updateLiveTime, 1000);
// 8. Dynamic Water Level Alert
const firestore = getFirestore(app);
let currentWaterLevel = 0;

let dynamicThresholds = {
    Safe: { min: 0, max: 0, msg: "", status: "Safe" },
    Monitor: { min: 0, max: 0, msg: "", status: "Monitor" },
    Warning: { min: 0, max: 0, msg: "", status: "Warning" },
    Critical: { min: 0, max: 0, msg: "", status: "Critical" }
};

// Fetch Thresholds from Firestore
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
                updateAlertUI(); // Refresh UI if thresholds change
            }
        });
    });
}

// Thresholds start as 0 until Firestore answers; until then every level would read "Critical"
function thresholdsReady() {
    return dynamicThresholds.Warning.min > 0 && dynamicThresholds.Critical.min > dynamicThresholds.Warning.min;
}

function getStatus(level) {
    if (!thresholdsReady()) return "Safe";
    if (level >= dynamicThresholds.Critical.min) return "Critical";
    if (level >= dynamicThresholds.Warning.min) return "Warning";
    if (level >= dynamicThresholds.Monitor.min) return "Monitor";
    return "Safe";
}

// Update the Top Bar Alert UI
function updateAlertUI() {
    evaluateCriticalPopup();

    const alertEl = document.querySelector(".alert");
    if (!alertEl) return;

    const status = getStatus(currentWaterLevel);
    const thresholdData = dynamicThresholds[status];

    if (status === "Safe") {
        alertEl.style.display = "none";
    } else {
        alertEl.style.display = "flex";

        // Apply Color Based on Status
        if (status === "Monitor") alertEl.style.background = "var(--yellowdark)";
        else if (status === "Warning") alertEl.style.background = "var(--orange)";
        else if (status === "Critical") alertEl.style.background = "var(--red)";

        // Construct HTML dynamically (using Meters and Firebase Message)
        alertEl.innerHTML = `
            <span class="alert-pill">⚠ ALERT</span>
            <strong>Water Level Advisory:</strong>
            Paltok Creek is at ${currentWaterLevel.toFixed(2)}m — ${thresholdData.msg || 'Monitor closely.'}
            <span id="currentTime" style="margin-left:auto;font-size:12px;opacity:0.8"></span>
        `;
        
        // Immediately repopulate the time since we overwrote the span
        updateLiveTime();
    }
}

// Initialize Realtime Sensor Fetching
loadThresholds();
const currentRef = ref(database, "sensors/UL800");
onValue(currentRef, snapshot => {
    const data = snapshot.val();
    if (data && data.level !== undefined) {
        currentWaterLevel = Number(data.level);
        latestSensorTime = normalizeTimestamp(data.timestamp);
        updateAlertUI();
    }
});

// ------------------------------------------------------------
// CRITICAL WATER LEVEL POP-UP  ->  Evacuation Plan
// Shown once when the level reaches Critical (and again only after it has gone
// back down). Residents get the matching push notification from the
// waterLevelAlert Cloud Function; this is the staff-side counterpart.
// ------------------------------------------------------------
let latestSensorTime = null;
let criticalPopupShown = false;

function normalizeTimestamp(ts) {
    const v = Number(ts);
    if (!Number.isFinite(v) || v <= 0) return null;
    return v < 1e12 ? v * 1000 : v; // seconds -> ms
}

// A reading counts as live if it is under a minute old (the sensor reports every ~5 s)
const sensorIsLive = () => latestSensorTime !== null && Date.now() - latestSensorTime < 60000;

async function evacuationCenterSummary() {
    try {
        const snap = await getDocs(collection(firestore, "EvacuationCenter"));
        const names = snap.docs.map(d => d.data().placeName).filter(Boolean);
        if (names.length === 0) return "No evacuation centers have been added to the Evacuation Plan yet.";
        const shown = names.slice(0, 3).join(", ");
        return `Evacuation centers: ${shown}${names.length > 3 ? ` and ${names.length - 3} more` : ""}.`;
    } catch (err) {
        console.error("Could not load evacuation centers:", err);
        return "Open the Evacuation Plan to see the evacuation centers.";
    }
}

function goToEvacuationPlan() {
    const page = "MainPages/EvacuationPlan.html";
    // Same approach Overview.js uses so the sidebar highlight moves too
    const item = Array.from(document.querySelectorAll(".menu-item"))
        .find(el => (el.getAttribute("onclick") || "").includes("EvacuationPlan.html"));
    if (item && typeof window.loadPage === "function") {
        window.loadPage(item, page);
    } else {
        const frame = document.getElementById("contentFrame");
        if (frame) frame.src = page;
    }
}

async function evaluateCriticalPopup() {
    // Only act on a live reading, once thresholds are known
    if (!thresholdsReady() || !sensorIsLive()) return;

    if (getStatus(currentWaterLevel) !== "Critical") {
        criticalPopupShown = false; // dropped back down: allow a future Critical to alert again
        return;
    }
    if (criticalPopupShown) return;
    criticalPopupShown = true;

    const message = `Paltok Creek has reached ${currentWaterLevel.toFixed(2)} m and the bridge is flooded. Residents should be directed to the evacuation centers.`;
    const detail = await evacuationCenterSummary();

    const access = await loadAccess();
    if (access?.can("evacuation", "view")) {
        const open = await confirmAction({
            title: "CRITICAL WATER LEVEL",
            message,
            detail,
            confirmText: "View Evacuation Centers",
            cancelText: "Dismiss"
        });
        if (open) goToEvacuationPlan();
    } else {
        // This staff member can't open the Evacuation Plan page, so just inform them
        await showMessage({ title: "CRITICAL WATER LEVEL", type: "error", message, detail });
    }
}
/*
export async function registerUser(fullname, email, password) {
    try {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCred.user;

        // Store user profile in Firestore
        const userProfile = {
            fullname: fullname,
            email: email,
            createdAt: new Date().toISOString()
        };
        await setDoc(doc(firestore, "Accounts", user.uid), userProfile);

        // Store user data in sessionStorage
        sessionStorage.setItem("userData", JSON.stringify(userProfile));

        alert("Registration successful!");
        window.location.href = "MainLayout.html";
    } catch (err) {
        alert(err.message);
        console.error("Registration error:", err);
    }
}*/