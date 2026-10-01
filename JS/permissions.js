// Shared permission engine for the admin console.
//
// Every staff member has seven p_* strings in Info_Staff (written by access.js):
//   "All Access" | "Viewing Access" | "No Access" | "View, Create, Edit" ...
// This file turns those strings into real checks:
//   - which pages a person may open          (guardPage / sidebar in main_layout.js)
//   - which buttons a person may use          (PAGE_RULES below)
//   - what a person may hand out to others    (missingGrants)
//
// IMPORTANT: this is the *UI* layer. It stops honest staff from clicking things
// they shouldn't. The real lock must be in firestore.rules / database.rules.json
// (see Security/SECURITY_GUIDE.md) — anyone can bypass browser JavaScript.

import { auth, firestore, getStaffProfile } from "./auth.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { showMessage } from "./dialog.js";

// ------------------------------------------------------------
// Module catalogue (matches the checkbox ids in Add_Staff / Info_Staff)
// ------------------------------------------------------------
export const MODULES = {
    announcement: { label: "Announcement",     field: "p_announcement", actions: ["view", "create", "edit", "remove"] },
    citizens:     { label: "Citizens",         field: "p_citizens",     actions: ["view", "verify", "edit", "remove", "export"] },
    vehicles:     { label: "Barangay Vehicles", field: "p_vehicles",    actions: ["view", "add", "deploy", "remove"] },
    reports:      { label: "Community Reports", field: "p_reports",     actions: ["view", "resolve"] },
    water:        { label: "Water Level",      field: "p_waterLevel",   actions: ["view", "edit"] },
    evacuation:   { label: "Evacuation Plan",  field: "p_evacPlan",     actions: ["view", "edit", "remove"] },
    management:   { label: "Access Management", field: "p_access",      actions: ["view", "add", "edit", "remove"] }
};

export function isSuperAdminRole(role) {
    return String(role || "").trim().replace(/\s+/g, " ").toLowerCase() === "super admin";
}

/** "View, Create" -> Set{"view","create"}.  Any action implies view. */
export function parseAccess(str, moduleKey) {
    const def = MODULES[moduleKey];
    const all = new Set(def.actions);
    const text = String(str || "").trim().toLowerCase();

    if (!text || text === "no access") return new Set();
    if (text === "all access" || text === "full access") return all;
    if (text === "viewing access" || text === "view access") return new Set(["view"]);

    const out = new Set(
        text.split(",").map(a => a.trim()).filter(a => all.has(a))
    );
    if (out.size > 0) out.add("view"); // can't act on a page you can't open
    return out;
}

// ------------------------------------------------------------
// Access object for one signed-in staff member
// ------------------------------------------------------------
function makeAccess(profile) {
    const isSuper = !!profile && isSuperAdminRole(profile.role);
    const cache = {};

    const actionsOf = (moduleKey) => {
        if (!profile) return new Set();
        if (isSuper) return new Set(MODULES[moduleKey].actions);
        return (cache[moduleKey] ??= parseAccess(profile[MODULES[moduleKey].field], moduleKey));
    };

    return {
        profile,
        isStaff: !!profile,
        isSuper,
        actionsOf,
        can: (moduleKey, action = "view") => actionsOf(moduleKey).has(action)
    };
}

let cached = null;

/** Fresh read of the signed-in staff profile (once per page load). */
export function loadAccess(force = false) {
    if (force || !cached) {
        cached = (async () => {
            await auth.authStateReady();
            const user = auth.currentUser;
            if (!user) return null;
            let profile = null;
            try {
                profile = await getStaffProfile(user.uid);
            } catch (err) {
                console.error("Could not load staff permissions:", err);
            }
            return makeAccess(profile); // no profile => fail closed (no access)
        })();
    }
    return cached;
}

/** Live updates: calls cb(access) now and whenever this staff member's doc changes. */
export async function watchAccess(cb) {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) return () => {};
    const q = query(collection(firestore, "Info_Staff"), where("uid", "==", user.uid));
    return onSnapshot(q, (snap) => {
        const d = snap.docs[0];
        cb(makeAccess(d ? { id: d.id, ...d.data() } : null));
    }, (err) => console.error("Permission watch failed:", err));
}

/** One-line label for the Access Level column. */
export function summarizeAccess(profile) {
    if (!profile) return "No Access";
    const access = makeAccess(profile);
    if (access.isSuper) return "Full Access";

    const keys = Object.keys(MODULES);
    const sets = keys.map(k => access.actionsOf(k));
    if (sets.every(s => s.size === 0)) return "No Access";
    if (keys.every((k, i) => sets[i].size === MODULES[k].actions.length)) return "Full Access";
    if (sets.every(s => s.size === 0 || (s.size === 1 && s.has("view")))) return "Viewing Access";
    return "Custom Access";
}

/**
 * Anti-escalation: a staff member can't hand out more than they hold.
 * @param values  { p_announcement: "...", ... }  (what's about to be saved)
 * @returns       list of "Module: action" strings the granter doesn't hold ([] = fine)
 */
export function missingGrants(granterAccess, values) {
    if (granterAccess?.isSuper) return [];
    const problems = [];
    for (const [key, def] of Object.entries(MODULES)) {
        const wanted = parseAccess(values[def.field], key);
        const own = granterAccess ? granterAccess.actionsOf(key) : new Set();
        wanted.forEach(a => { if (!own.has(a)) problems.push(`${def.label}: ${a}`); });
    }
    return problems;
}

// ------------------------------------------------------------
// Page -> module, and per-page "which button needs which action"
// (keys are lowercase file names of the pages in MainPages/)
// ------------------------------------------------------------
export const PAGE_MODULE = {
    "announcement.html": "announcement",
    "citizens.html": "citizens",
    "vehicles.html": "vehicles",
    "reports.html": "reports",
    "waterlevel.html": "water",
    "evacuationplan.html": "evacuation",
    "access.html": "management"
    // overview.html / surveillance.html: open to every staff member
};

// Pages that aren't listed in PAGE_MODULE above are open to all staff.
// Sidebar item (by page file name) -> module
export const NAV_MODULE = PAGE_MODULE;

export const PAGE_RULES = {
    "announcement.html": [
        { selector: "#publishAnnBtn, #addMediaBtn", action: "create", label: "post announcements" },
        { selector: ".announce-item .btn.edit, #saveEditAnnBtn", action: "edit", label: "edit announcements" },
        { selector: ".announce-item .btn.del", action: "remove", label: "remove announcements" }
    ],
    "citizens.html": [
        { selector: ".btn.export", action: "export", label: "export citizen data" },
        { selector: "#btn-verify-accept, #btn-verify-reject", action: "verify", label: "verify users" },
        { selector: "#btn-edit-info, #btn-apply-changes", action: "edit", label: "edit user information" },
        { selector: "#infoCitizens .buttons.col .button.delete", action: "remove", label: "remove users" }
    ],
    "vehicles.html": [
        { selector: "#openAddVehicleBtn, #infoVehicle .button.accept", action: "add", label: "add or edit vehicles" },
        { selector: "#openDeployVehicleBtn, #deployVehicle .button.accept", action: "deploy", label: "deploy or recall vehicles" },
        { selector: "#infoVehicle .button.delete", action: "remove", label: "remove vehicles" }
    ],
    "reports.html": [
        { selector: "#btnInvalid, #btnResolve", action: "resolve", label: "resolve reports" }
    ],
    "waterlevel.html": [
        { selector: ".btn.edit", action: "edit", label: "edit water level thresholds" }
    ],
    "evacuationplan.html": [
        { selector: "#openAddEvacBtn, #btn-edit-evac, #infoEvacCenter .button.accept", action: "edit", label: "add or edit evacuation centers" },
        { selector: "#infoEvacCenter .button.delete", action: "remove", label: "remove evacuation centers" }
    ]
};

// ------------------------------------------------------------
// UI enforcement
// ------------------------------------------------------------
const STYLE_ID = "mfv-perm-style";

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = `[data-no-perm]{display:none !important;}`;
    document.head.appendChild(st);
}

/** Full-page notice that covers the page (used when "View" is missing). */
export function showNoAccess(message = "You don't have access to this page. Ask a Super Admin to update your permissions.") {
    if (document.getElementById("mfv-no-access")) return;
    const wrap = document.createElement("div");
    wrap.id = "mfv-no-access";
    wrap.style.cssText = `
        position: fixed; inset: 0; z-index: 2147483000; display: flex;
        align-items: center; justify-content: center; background: #f4f6f8;
        font-family: inherit; padding: 24px; text-align: center;`;
    const card = document.createElement("div");
    card.style.cssText = `
        background: #fff; border-radius: 12px; padding: 32px 36px; max-width: 420px;
        box-shadow: 0 4px 16px rgba(0,0,0,.08);`;
    const h = document.createElement("div");
    h.textContent = "Access restricted";
    h.style.cssText = "font-size: 18px; font-weight: 700; margin-bottom: 8px;";
    const p = document.createElement("div");
    p.textContent = message;
    p.style.cssText = "font-size: 14px; color: #666; line-height: 1.5;";
    card.append(h, p);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
}

/** Hides (and click-blocks) every element matching the rules this person isn't allowed to use. */
function enforceRules(access, moduleKey, rules) {
    const denied = rules.filter(r => !access.can(moduleKey, r.action));
    if (denied.length === 0) return;

    ensureStyle();
    const all = denied.map(r => r.selector).join(",");

    const mark = () => document.querySelectorAll(all).forEach(el => el.setAttribute("data-no-perm", ""));
    mark();

    // Popups and list rows are injected later, so keep marking as the DOM changes
    let queued = false;
    new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => { queued = false; mark(); });
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Belt and braces: even if something un-hides a button, the click does nothing
    document.addEventListener("click", (e) => {
        const hit = e.target.closest?.(all);
        if (!hit) return;
        const rule = denied.find(r => hit.matches(r.selector)) || denied[0];
        e.preventDefault();
        e.stopImmediatePropagation();
        showMessage({
            title: "Not allowed",
            type: "error",
            message: `Your account doesn't have permission to ${rule.label}.`
        });
    }, true);
}

/**
 * Called by subpage_guard.js on every MainPages/*.html page.
 * - no View permission  -> cover the page
 * - missing actions     -> hide those buttons
 */
export async function guardPage() {
    const file = window.location.pathname.split("/").pop().toLowerCase();
    const moduleKey = PAGE_MODULE[file];
    if (!moduleKey) return null;

    const access = await loadAccess();
    if (!access) return null; // not signed in: main_layout.js sends them to the login page

    if (!access.can(moduleKey, "view")) {
        showNoAccess();
        return access;
    }
    enforceRules(access, moduleKey, PAGE_RULES[file] || []);
    return access;
}