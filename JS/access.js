import { auth, firestore, firebaseConfig } from "./auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { collection, doc, setDoc, getDocs, getDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { writeLog } from "./logging.js";
import { getChanges, describeChanges, setApplyState } from "./edit-tracker.js";
import { confirmChanges, confirmDelete, runWithLoading, showMessage } from "./dialogs.js";
import { MODULES, loadAccess, parseAccess, summarizeAccess, missingGrants, isSuperAdminRole } from "./permissions.js";

// Secondary app: creating a staff account signs that new account in, so it must
// not happen on the main auth instance or the current admin would be logged out.
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

const popupContainer = document.getElementById("popup-container");

// Who is using this page (filled in on load)
let myAccess = null;
const myStaffID = () => myAccess?.profile?.staffID || "";

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

function generateStaffID() {
    const year = new Date().getFullYear().toString().slice(-2);
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const randomNumber = (array[0] % 100000).toString().padStart(5, "0");
    return `BFVS-${year}-${randomNumber}`;
}

function friendlyError(err) {
    switch (err?.code) {
        case "auth/email-already-in-use":
            return "That email already has a sign-in account. If a staff member with this email was removed earlier, their login still exists in Firebase Authentication — use a different email, or delete the old account there first.";
        case "auth/invalid-email":
            return "That email address doesn't look valid.";
        case "auth/weak-password":
            return "The password is too weak. Use at least 6 characters.";
        case "auth/network-request-failed":
            return "Couldn't reach the server. Please check your internet connection.";
        case "permission-denied":
            return "The database refused this action. Your account may not have permission for it.";
        default:
            return "Something went wrong. Please try again.";
    }
}

const deny = (message, parent = null) =>
    showMessage({ title: "Not allowed", type: "error", message, parent });

// ------------------------------------------------------------
// Checkboxes <-> stored strings ("All Access" / "Viewing Access" / "View, Create")
// idPrefix: "access" (Add popup) or "edit-access" (Info popup)
// ------------------------------------------------------------
function boxesFor(idPrefix, category) {
    return Array.from(document.querySelectorAll(`input[id^="${idPrefix}-${category}-"]`));
}

function accessFromBoxes(idPrefix, category) {
    const boxes = boxesFor(idPrefix, category);
    if (boxes.length === 0) return "No Access";

    const checked = boxes.filter(cb => cb.checked);
    if (checked.length === boxes.length) return "All Access";
    if (checked.length === 0) return "No Access";
    if (checked.length === 1 && checked[0].id.endsWith("-view")) return "Viewing Access";

    return checked.map(cb => {
        const action = cb.id.split("-").pop();
        return action.charAt(0).toUpperCase() + action.slice(1);
    }).join(", ");
}

function fillBoxes(idPrefix, category, accessString) {
    const actions = parseAccess(accessString, category);
    boxesFor(idPrefix, category).forEach(cb => {
        cb.checked = actions.has(cb.id.split("-").pop());
    });
}

// Any action needs View; removing View clears the actions.
function linkViewBoxes(idPrefix) {
    Object.keys(MODULES).forEach(category => {
        const boxes = boxesFor(idPrefix, category);
        const view = boxes.find(b => b.id.endsWith("-view"));
        if (!view) return;
        boxes.forEach(b => b.addEventListener("change", () => {
            if (b === view) {
                if (!view.checked) boxes.forEach(x => { x.checked = false; });
            } else if (b.checked) {
                view.checked = true;
            }
        }));
    });
}

// You can't hand out (or take away) permissions you don't have yourself.
function lockBoxesBeyondMyAccess(idPrefix) {
    if (myAccess?.isSuper) return;
    Object.keys(MODULES).forEach(category => {
        boxesFor(idPrefix, category).forEach(cb => {
            const action = cb.id.split("-").pop();
            if (!myAccess?.can(category, action)) {
                cb.disabled = true;
                cb.title = "You can only manage permissions that you have yourself.";
            }
        });
    });
}

// Actions in `after` that weren't in `before` and that I don't hold.
function escalationProblems(before, after) {
    if (myAccess?.isSuper) return [];
    const problems = [];
    Object.entries(MODULES).forEach(([key, def]) => {
        const had = parseAccess(before[def.field], key);
        const wants = parseAccess(after[def.field], key);
        wants.forEach(a => {
            if (!had.has(a) && !myAccess?.can(key, a)) problems.push(`${def.label}: ${a}`);
        });
    });
    return problems;
}

// ------------------------------------------------------------
// Staff table
// ------------------------------------------------------------
function staffDisplayName(staff) {
    const fName = (staff.fName || "").trim();
    const lName = (staff.lName || "").trim();
    const mName = (staff.mName || "").trim();
    const mInitial = mName ? `${mName.charAt(0)}.` : "";
    return (lName && mName)
        ? `${lName}, ${fName} ${mInitial}`.trim()
        : [fName, mInitial, lName].filter(Boolean).join(" ");
}

async function loadStaffTable() {
    const tbody = document.querySelector(".tableDiv.members tbody");
    if (!tbody) return;

    try {
        const snap = await getDocs(collection(firestore, "Info_Staff"));
        tbody.innerHTML = "";

        const canEdit = myAccess?.can("management", "edit");

        snap.forEach((docSnap) => {
            const staff = docSnap.data();
            const staffID = staff.staffID || docSnap.id;
            const isSuper = isSuperAdminRole(staff.role);
            const isMe = staffID === myStaffID();

            const initials = `${(staff.fName || "").trim().charAt(0)}${(staff.lName || "").trim().charAt(0)}`;
            const avatarClass = isSuper ? "super" : (staff.role ? "admin" : "none");
            const showEdit = canEdit && !isSuper && !isMe;

            tbody.insertAdjacentHTML("beforeend", `
                <tr class="tableRow" data-id="${esc(staffID)}" data-super="${isSuper}"${isSuper ? "" : ' style="cursor: pointer;"'}>
                    <td class="user-section">
                        <div class="user-avatar ${avatarClass}">${esc(initials)}</div>
                        <div class="user-info">
                            <strong>${esc(staffDisplayName(staff))}${isMe ? " (You)" : ""}</strong><br>
                            <span>${esc(staff.role || "Staff")}</span>
                        </div>
                    </td>
                    <td>${esc(staffID)}</td>
                    <td>${esc(summarizeAccess(staff))}</td>
                    <td>${showEdit ? `<a class="btn edit" href="#" data-id="${esc(staffID)}">Edit</a>` : ""}</td>
                </tr>
            `);
        });

        tbody.querySelectorAll(".tableRow").forEach(row => {
            row.addEventListener("click", (e) => {
                if (e.target.classList.contains("edit")) return;
                if (row.getAttribute("data-super") === "true") return; // Super Admin info is never shown
                openStaffModal(row.getAttribute("data-id"), false);
            });
        });

        tbody.querySelectorAll(".btn.edit").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                openStaffModal(e.currentTarget.getAttribute("data-id"), true);
            });
        });

        applySearch();
    } catch (err) {
        console.error("Error loading staff table:", err);
        showMessage({
            title: "Couldn't Load Staff",
            type: "error",
            message: friendlyError(err)
        });
    }
}

// Search box (#search) filters the visible rows
function applySearch() {
    const term = (document.getElementById("search")?.value || "").trim().toLowerCase();
    document.querySelectorAll(".tableDiv.members tbody .tableRow").forEach(row => {
        row.style.display = !term || row.textContent.toLowerCase().includes(term) ? "" : "none";
    });
}

// ------------------------------------------------------------
// Add staff
// ------------------------------------------------------------
async function openAddModal() {
    if (!myAccess?.can("management", "add")) {
        await deny("Your account doesn't have permission to add staff.");
        return;
    }
    try {
        const response = await fetch("../Popups/Add_Staff.html");
        popupContainer.innerHTML = await response.text();
        popupContainer.classList.remove("hidden");

        const overlay = document.querySelector(".modal-overlay");
        if (overlay) overlay.style.display = "flex";

        const pw = document.getElementById("add-password");
        if (pw) pw.type = "password";

        linkViewBoxes("access");
        lockBoxesBeyondMyAccess("access");

        document.querySelector(".button.confirm").addEventListener("click", submitNewStaff);
        document.querySelector(".button.delete").addEventListener("click", closeModal);
    } catch (err) {
        console.error("Error loading Add_Staff modal:", err);
        showMessage({ title: "Couldn't Open Form", type: "error", message: "The Add Staff form couldn't be loaded. Please try again." });
    }
}

function collectNewStaffAccess() {
    return {
        p_announcement: accessFromBoxes("access", "announcement"),
        p_citizens: accessFromBoxes("access", "citizens"),
        p_vehicles: accessFromBoxes("access", "vehicles"),
        p_reports: accessFromBoxes("access", "reports"),
        p_waterLevel: accessFromBoxes("access", "water"),
        p_evacPlan: accessFromBoxes("access", "evacuation"),
        p_access: accessFromBoxes("access", "management")
    };
}

async function submitNewStaff() {
    const parent = document.getElementById("addStaff");
    const val = (id) => (document.getElementById(id)?.value || "").trim();
    const fail = (title, message, detail = "") =>
        showMessage({ title, type: "error", message, detail, parent });

    if (!myAccess?.can("management", "add")) {
        return fail("Not allowed", "Your account doesn't have permission to add staff.");
    }

    const email = val("add-email").toLowerCase();
    const password = document.getElementById("add-password").value;
    const fName = val("add-fName");
    const lName = val("add-lName");
    const role = val("add-position");

    if (!fName || !lName) return fail("Missing Details", "Please enter the staff member's first name and surname.");
    if (!email || !password) return fail("Missing Details", "Email and password are required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Invalid Email", "Please enter a valid email address.");
    if (password.length < 6) return fail("Weak Password", "The password must be at least 6 characters long.");
    if (!role) return fail("Missing Details", "Please enter the staff member's barangay position.");
    if (isSuperAdminRole(role)) return fail("Not Allowed", "Super Admin can't be used as a position for a new staff member.");

    const permissions = collectNewStaffAccess();
    const tooMuch = missingGrants(myAccess, permissions);
    if (tooMuch.length) {
        return fail("Not Allowed", "You can only give a new staff member permissions that you have yourself.", tooMuch.join(" · "));
    }

    const newStaffID = generateStaffID();
    const staffData = {
        staffID: newStaffID,
        email,
        fName,
        lName,
        mName: val("add-mName"),
        suffix: val("add-suffix"),
        birthDate: val("add-dob"),
        contact: val("add-contact"),
        address: val("add-address"),
        role,
        ...permissions,
        createdBy: myStaffID(),
        createdOn: serverTimestamp()
    };

    const outcome = await runWithLoading({
        loadingAction: "Adding Staff Member",
        loadingDescription: "add the new staff member",
        successAction: "Staff Member Added",
        successDescription: `${fName} ${lName} has been added as staff successfully`,
        parent,
        task: async () => {
            let newUser = null;
            try {
                const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                newUser = cred.user;
                await setDoc(doc(firestore, "Info_Staff", newStaffID), { ...staffData, uid: newUser.uid });
            } catch (err) {
                // Don't leave a login behind that has no staff record
                if (newUser) { try { await deleteUser(newUser); } catch { /* best effort */ } }
                throw err;
            } finally {
                try { await secondaryAuth.signOut(); } catch { /* ignore */ }
            }
        }
    });

    if (!outcome.ok) {
        console.error("Error creating staff:", outcome.error);
        return fail("Couldn't Add Staff", friendlyError(outcome.error));
    }

    writeLog("Add", "New Staff Member", newStaffID, `Added ${fName} ${lName} (${role})`);
    closeModal();
    loadStaffTable();
}

function closeModal() {
    const overlay = document.querySelector(".modal-overlay");
    if (overlay) overlay.style.display = "none";
    popupContainer.innerHTML = "";
}

// ------------------------------------------------------------
// System logs
// ------------------------------------------------------------
const ACTION_BG = {
    add: "post", edit: "edit", change: "edit", update: "edit",
    delete: "remove", remove: "remove"
};

function logRowClass(action) {
    const key = (action || "").toLowerCase();
    for (const [needle, cls] of Object.entries(ACTION_BG)) {
        if (key.includes(needle)) return cls;
    }
    return "";
}

async function loadStaffNameLookup() {
    const lookup = {};
    try {
        const snap = await getDocs(collection(firestore, "Info_Staff"));
        snap.forEach(d => {
            const s = d.data();
            const name = [s.fName, s.lName].filter(Boolean).join(" ").trim();
            lookup[d.id] = name || d.id;
        });
    } catch (err) {
        console.error("Error loading staff names for logs:", err);
    }
    return lookup;
}

function formatLogTimestamp(ts) {
    if (!ts || !ts.toDate) return { date: "—", time: "—" };
    const d = ts.toDate();
    return {
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    };
}

async function initSystemLogs() {
    const listEl = document.getElementById("systemLogsList");
    if (!listEl) return;

    const staffNames = await loadStaffNameLookup();

    onSnapshot(collection(firestore, "Logs"), (snapshot) => {
        const logs = snapshot.docs
            .map(d => d.data())
            .sort((a, b) => (b.madeOn?.toMillis?.() || 0) - (a.madeOn?.toMillis?.() || 0));

        listEl.innerHTML = "";

        logs.forEach(log => {
            const { date, time } = formatLogTimestamp(log.madeOn);
            const rowClass = logRowClass(log.action);
            const madeByName = staffNames[log.madeBy] || log.madeByName || (log.madeBy && log.madeBy !== "system" ? log.madeBy : "—");

            const row = document.createElement("div");
            row.className = rowClass ? `row ${rowClass}` : "row";
            row.innerHTML = `
                <div class="logtitle">${esc(log.actionDesc || log.action || "Log")} — ${esc(log.affectedID || "")}</div>
                <div class="logdesc">${esc(log.details || "")}</div>
                <div class="logmeta">
                    <span>${esc(date)}</span>
                    <span>${esc(time)}</span>
                    <span>By: ${esc(madeByName)}</span>
                </div>
            `;
            listEl.appendChild(row);
        });
    }, (err) => console.error("Error loading logs:", err));
}

// ------------------------------------------------------------
// Initialization
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    myAccess = await loadAccess();

    // No View permission: subpage_guard/permissions.js already covers the page.
    if (!myAccess?.can("management", "view")) return;

    const addBtn = document.querySelector(".btn.add");
    if (addBtn) {
        if (!myAccess.can("management", "add")) {
            addBtn.style.display = "none";
        } else {
            addBtn.addEventListener("click", (e) => {
                e.preventDefault();
                openAddModal();
            });
        }
    }

    document.getElementById("search")?.addEventListener("input", applySearch);

    loadStaffTable();
    initSystemLogs();
});

// ------------------------------------------------------------
// View / edit one staff member
// ------------------------------------------------------------
const STAFF_LABELS = {
    role: "position",
    lName: "surname",
    fName: "first name",
    mName: "middle name",
    suffix: "suffix",
    contact: "contact number",
    birthDate: "date of birth",
    address: "address",
    p_announcement: "Announcement access",
    p_citizens: "Citizens access",
    p_vehicles: "Vehicles access",
    p_reports: "Reports access",
    p_waterLevel: "Water Level access",
    p_evacPlan: "Evacuation Plan access",
    p_access: "Access Management access"
};

function collectStaffValues() {
    const v = (id) => document.getElementById(id).value;
    return {
        role: v("edit-position"),
        lName: v("edit-lName"),
        fName: v("edit-fName"),
        mName: v("edit-mName"),
        suffix: v("edit-suffix"),
        contact: v("edit-contact"),
        birthDate: v("edit-dob"),
        address: v("edit-address"),

        p_announcement: accessFromBoxes("edit-access", "announcement"),
        p_citizens: accessFromBoxes("edit-access", "citizens"),
        p_vehicles: accessFromBoxes("edit-access", "vehicles"),
        p_reports: accessFromBoxes("edit-access", "reports"),
        p_waterLevel: accessFromBoxes("edit-access", "water"),
        p_evacPlan: accessFromBoxes("edit-access", "evacuation"),
        p_access: accessFromBoxes("edit-access", "management")
    };
}

async function openStaffModal(staffID, isEditMode = false) {
    // Edit mode needs "Edit Staff"; nobody edits their own access (prevents lock-outs / self-promotion)
    if (isEditMode && !myAccess?.can("management", "edit")) {
        await deny("Your account doesn't have permission to edit staff.");
        return;
    }
    if (isEditMode && staffID === myStaffID()) {
        await deny("You can't change your own access. Ask another administrator to do it.");
        return;
    }

    try {
        const response = await fetch("../Popups/Info_Staff.html");
        popupContainer.innerHTML = await response.text();
        popupContainer.classList.remove("hidden");

        const overlay = document.querySelector(".modal-overlay");
        if (overlay) {
            overlay.style.display = "flex";
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) closeModal();
            });
        }

        const staffDoc = await getDoc(doc(firestore, "Info_Staff", staffID));
        if (!staffDoc.exists()) {
            closeModal();
            await showMessage({ title: "Not Found", type: "error", message: "That staff member no longer exists." });
            loadStaffTable();
            return;
        }

        const staff = staffDoc.data();

        // Super Admin information is never shown
        if (isSuperAdminRole(staff.role)) {
            closeModal();
            return;
        }

        document.getElementById("edit-position").value = staff.role || "";
        document.getElementById("edit-lName").value = staff.lName || "";
        document.getElementById("edit-fName").value = staff.fName || "";
        document.getElementById("edit-mName").value = staff.mName || "";
        document.getElementById("edit-suffix").value = staff.suffix || "";
        document.getElementById("edit-contact").value = staff.contact || "";
        document.getElementById("edit-dob").value = staff.birthDate || "";
        document.getElementById("edit-email").value = staff.email || "";
        document.getElementById("edit-address").value = staff.address || "";
        document.getElementById("display-staffID").innerText = staff.staffID || "";

        fillBoxes("edit-access", "announcement", staff.p_announcement);
        fillBoxes("edit-access", "citizens", staff.p_citizens);
        fillBoxes("edit-access", "vehicles", staff.p_vehicles);
        fillBoxes("edit-access", "reports", staff.p_reports);
        fillBoxes("edit-access", "water", staff.p_waterLevel);
        fillBoxes("edit-access", "evacuation", staff.p_evacPlan);
        fillBoxes("edit-access", "management", staff.p_access);

        if (!isEditMode) {
            // VIEW MODE
            document.querySelectorAll("#staffModal input").forEach(input => {
                if (input.type === "checkbox") {
                    input.disabled = true;
                } else {
                    input.readOnly = true;
                    input.style.cursor = "default";
                }
            });
            const actionButtons = document.querySelector("#staffModal .buttons");
            if (actionButtons) actionButtons.style.display = "none";
            return;
        }

        // EDIT MODE
        document.querySelectorAll("#staffModal input.input").forEach(input => {
            if (!input.disabled) input.classList.add("edit");
        });

        linkViewBoxes("edit-access");
        lockBoxesBeyondMyAccess("edit-access");

        const applyBtn = document.querySelector("#staffModal .button.accept");
        const removeBtn = document.querySelector("#staffModal .button.delete");
        if (removeBtn && !myAccess.can("management", "remove")) removeBtn.style.display = "none";

        const originalValues = collectStaffValues();
        const staffChanges = () => getChanges(originalValues, collectStaffValues(), STAFF_LABELS);
        const refreshApplyBtn = () => setApplyState(applyBtn, staffChanges().length > 0);

        refreshApplyBtn();
        document.querySelectorAll("#staffModal input").forEach(input => {
            input.addEventListener("input", refreshApplyBtn);
            input.addEventListener("change", refreshApplyBtn);
        });

        applyBtn.addEventListener("click", async () => {
            const changes = staffChanges();
            const parent = document.getElementById("staffModal");
            const fail = (title, message, detail = "") =>
                showMessage({ title, type: "error", message, detail, parent });

            if (changes.length === 0) {
                openStaffModal(staffID, false); // "Cancel": back to viewing mode
                return;
            }

            const now = collectStaffValues();
            if (!now.fName.trim() || !now.lName.trim()) return fail("Missing Details", "First name and surname can't be empty.");
            if (!now.role.trim()) return fail("Missing Details", "Position can't be empty.");
            if (isSuperAdminRole(now.role)) return fail("Not Allowed", "Super Admin can't be used as a position.");

            const tooMuch = escalationProblems(originalValues, now);
            if (tooMuch.length) {
                return fail("Not Allowed", "You can only give permissions that you have yourself.", tooMuch.join(" · "));
            }

            if (!(await confirmChanges("staff member", parent))) {
                openStaffModal(staffID, false);
                return;
            }
            saveStaffChanges(staffID, originalValues, changes);
        });

        removeBtn?.addEventListener("click", () => removeStaff(staffID));

    } catch (err) {
        console.error("Error opening modal:", err);
        closeModal();
        showMessage({ title: "Couldn't Open Staff Info", type: "error", message: friendlyError(err) });
    }
}

async function saveStaffChanges(staffID, originalValues, changes) {
    const parent = document.getElementById("staffModal");
    const updated = collectStaffValues();
    Object.keys(updated).forEach(k => {
        if (!k.startsWith("p_")) updated[k] = updated[k].trim();
    });

    const originalName = `${originalValues.fName} ${originalValues.lName}`.trim() || staffID;

    const outcome = await runWithLoading({
        loadingAction: "Saving Changes",
        loadingDescription: "save the staff changes",
        successAction: "Changes Saved",
        successDescription: `${originalName}'s information has been updated successfully`,
        parent,
        task: () => updateDoc(doc(firestore, "Info_Staff", staffID), {
            ...updated,
            updatedBy: myStaffID(),
            updatedOn: serverTimestamp()
        })
    });

    if (!outcome.ok) {
        console.error("Error updating staff:", outcome.error);
        await showMessage({ title: "Couldn't Save Changes", type: "error", message: friendlyError(outcome.error), parent });
        return;
    }

    writeLog("Edit", "Edited Staff Info", staffID, describeChanges(originalName, changes));
    closeModal();
    loadStaffTable();
}

async function removeStaff(staffID) {
    const parent = document.getElementById("staffModal");

    if (!myAccess?.can("management", "remove")) {
        return deny("Your account doesn't have permission to remove staff.", parent);
    }
    if (staffID === myStaffID()) {
        return deny("You can't remove your own account.", parent);
    }

    const staffName = `${document.getElementById("edit-fName")?.value || ""} ${document.getElementById("edit-lName")?.value || ""}`.trim() || staffID;
    if (!(await confirmDelete({ id: staffID, name: staffName, type: "Staff", parent }))) return;

    const outcome = await runWithLoading({
        loadingAction: "Removing Staff Member",
        loadingDescription: "remove the staff member",
        successAction: "Staff Member Removed",
        successDescription: `${staffName} has been removed from staff`,
        parent,
        task: () => deleteDoc(doc(firestore, "Info_Staff", staffID))
    });

    if (!outcome.ok) {
        console.error("Error deleting staff:", outcome.error);
        await showMessage({ title: "Couldn't Remove Staff", type: "error", message: friendlyError(outcome.error), parent });
        return;
    }

    writeLog("Delete", "Removed Staff Member", staffID, `Removed staff ${staffID}`);
    closeModal();
    loadStaffTable();
}