// Shared confirmation dialogs (Dialog_Changes / Delete / Export / Loading / Confirm).
// Each function loads its Popups/Dialog_*.html on first use, fills in the text,
// and resolves only after the person has made a choice — so the real action can
// happen AFTER the dialog.
//
// "parent" is the popup the person was in (e.g. the citizen info popup). It is hidden
// while the dialog is up and shown again if they press Cancel.

const MIN_LOADING_MS = 3000;
const REDIRECT_SECONDS = 3;

// ------------------------------------------------------------
// Loading / helpers
// ------------------------------------------------------------
async function ensureDialog(name) {
    const id = `dialog${name}`;
    let el = document.getElementById(id);
    if (el) return el;

    const res = await fetch(new URL(`../Popups/Dialog_${name}.html`, import.meta.url));
    const html = await res.text();
    const wrap = document.createElement("div");
    wrap.insertAdjacentHTML("beforeend", html);
    document.body.appendChild(wrap);
    return document.getElementById(id);
}

const show = (el) => { if (el) el.style.display = "flex"; };
const hide = (el) => { if (el) el.style.display = "none"; };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function setLabels(dialog, { title, line1, line2 }) {
    const titleEl = dialog.querySelector(".diatitle");
    const l1 = dialog.querySelector(".dia1");
    const l2 = dialog.querySelector(".dia2");
    if (title !== undefined && titleEl) titleEl.textContent = title;
    if (line1 !== undefined && l1) l1.textContent = line1;
    if (line2 !== undefined && l2) l2.textContent = line2;
}

// Shows a two-button dialog and resolves true (confirm) / false (cancel)
function askChoice(dialog, confirmSelector, parent) {
    return new Promise(resolve => {
        const confirmBtn = dialog.querySelector(confirmSelector);
        const cancelBtn = dialog.querySelector(".button.delete");

        const finish = (result) => {
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            hide(dialog);
            if (!result) show(parent); // Cancel: bring the original popup back
            resolve(result);
        };

        confirmBtn.onclick = () => finish(true);
        cancelBtn.onclick = () => finish(false);

        hide(parent);
        show(dialog);
    });
}

// ------------------------------------------------------------
// Dialog_Changes
// ------------------------------------------------------------
/** @returns {Promise<boolean>} true = confirmed (parent stays hidden), false = cancelled (parent shown again) */
export async function confirmChanges(itemType, parent = null) {
    const dialog = await ensureDialog("Changes");
    setLabels(dialog, {
        title: "Apply Changes",
        line1: `Are you sure you want to save the changes to this ${itemType}?`,
        line2: "Your updates will be applied once you confirm."
    });
    dialog.querySelector(".button.confirm").textContent = "Confirm";
    dialog.querySelector(".button.delete").textContent = "Cancel";
    return askChoice(dialog, ".button.confirm", parent);
}

// ------------------------------------------------------------
// Generic yes/no (replaces window.confirm)
// ------------------------------------------------------------
/** @returns {Promise<boolean>} */
export async function confirmAction({ title, message, detail = "", confirmText = "Confirm", cancelText = "Cancel", parent = null }) {
    const dialog = await ensureDialog("Changes");
    setLabels(dialog, { title, line1: message, line2: detail });
    dialog.querySelector(".button.confirm").textContent = confirmText;
    dialog.querySelector(".button.delete").textContent = cancelText;
    return askChoice(dialog, ".button.confirm", parent);
}

// ------------------------------------------------------------
// Dialog_Message  (replaces window.alert)
// ------------------------------------------------------------
/**
 * One-button notice. Resolves when the person presses OK.
 * @param {Object} o
 * @param {string} o.title
 * @param {string} o.message
 * @param {"info"|"error"|"success"} [o.type]
 * @param {Element} [o.parent]  popup to hide while the notice is up (shown again on OK)
 */
export async function showMessage({ title = "Notice", message = "", detail = "", type = "info", buttonText = "OK", parent = null }) {
    const dialog = await ensureDialog("Message");
    dialog.dataset.type = type;
    setLabels(dialog, { title, line1: message, line2: detail });
    const ok = dialog.querySelector(".button.confirm");
    ok.textContent = buttonText;

    return new Promise(resolve => {
        const finish = () => {
            ok.onclick = null;
            dialog.onclick = null;
            document.removeEventListener("keydown", onKey);
            hide(dialog);
            show(parent);
            resolve();
        };
        const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter") finish(); };
        ok.onclick = finish;
        dialog.onclick = (e) => { if (e.target === dialog) finish(); };
        document.addEventListener("keydown", onKey);

        hide(parent);
        show(dialog);
        ok.focus();
    });
}

export const showError = (message, opts = {}) =>
    showMessage({ title: "Something went wrong", type: "error", message, ...opts });

export const showWarning = (message, opts = {}) =>
    showMessage({ title: "Please check", type: "info", message, ...opts });

// ------------------------------------------------------------
// Dialog_Delete
// ------------------------------------------------------------
/** @returns {Promise<boolean>} true = confirmed (parent stays hidden), false = cancelled (parent shown again) */
export async function confirmDelete({ id, name, type, parent = null }) {
    const dialog = await ensureDialog("Delete");
    setLabels(dialog, {
        title: `Delete ${id}`,
        line1: `Are you sure you want to permanently delete ${name} from ${type}?`
    });
    return askChoice(dialog, ".button.red", parent);
}

// ------------------------------------------------------------
// Dialog_Export
// ------------------------------------------------------------
/** @returns {Promise<boolean>} */
export async function confirmExport({ type, filters = [], parent = null }) {
    const dialog = await ensureDialog("Export");
    const labels = dialog.querySelectorAll(".form-label");
    setLabels(dialog, {
        title: `Export ${type}`,
        line1: `This will generate and download a CSV file containing the available ${type} data.`
    });
    if (labels[2]) labels[2].textContent = filters.join(", ");
    return askChoice(dialog, ".button.confirm", parent);
}

// ------------------------------------------------------------
// Dialog_Loading  ->  Dialog_Confirm
// ------------------------------------------------------------
/** Shows the Confirm dialog with a 3-2-1 countdown, then closes it by itself. */
export async function showSuccess({ action, description, parent = null, seconds = REDIRECT_SECONDS, countdownText = (n) => `You will be redirected back in ${n}`, keepOpen = false }) {
    const dialog = await ensureDialog("Confirm");
    hide(parent);
    setLabels(dialog, { title: action, line1: `${description}.` });
    show(dialog);

    for (let n = seconds; n > 0; n--) {
        setLabels(dialog, { line2: countdownText(n) });
        await wait(1000);
    }
    if (!keepOpen) hide(dialog); // keepOpen: caller is about to navigate away
}

/**
 * Runs a "create" task behind the Loading dialog (never shorter than 3 seconds),
 * then shows the Confirm dialog.
 *
 * @param {Object}   o
 * @param {string}   o.loadingAction       e.g. "Posting Announcement"
 * @param {string}   o.loadingDescription  e.g. "post your announcement"  -> "Please wait while we post your announcement."
 * @param {Function} o.task                async function doing the real work; may return a string to override successDescription
 * @param {string}   o.successAction       e.g. "Announcement Posted"
 * @param {string}   o.successDescription  e.g. `"Title" Announcement has been posted successfully`
 * @param {Element}  [o.parent]            popup to hide while working
 * @returns {Promise<{ok:boolean, result?:any, error?:any}>}
 */
export async function runWithLoading({ loadingAction, loadingDescription, task, successAction, successDescription, parent = null }) {
    const loading = await ensureDialog("Loading");
    setLabels(loading, {
        title: loadingAction,
        line1: `Please wait while we ${loadingDescription}.`
    });
    hide(parent);
    show(loading);

    let result;
    try {
        [result] = await Promise.all([task(), wait(MIN_LOADING_MS)]);
    } catch (error) {
        hide(loading);
        show(parent); // let the person fix things and try again
        return { ok: false, error };
    }

    hide(loading);
    await showSuccess({
        action: successAction,
        description: typeof result === "string" ? result : successDescription
    });
    return { ok: true, result };
}

// ------------------------------------------------------------
// CSV download
// ------------------------------------------------------------
export function downloadCSV(filename, headers, rows) {
    const esc = (v) => {
        const s = String(v ?? "");
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows].map(r => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const todayStamp = () => new Date().toISOString().slice(0, 10);