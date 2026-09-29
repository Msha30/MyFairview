// Shared helpers for "did anything actually change?" checks in edit popups.

const norm = (v) => String(v ?? "").trim();

/**
 * Compares two plain objects and returns only the fields that differ.
 * @param {Object} before  Original values
 * @param {Object} after   Current values
 * @param {Object} labels  { fieldKey: "human label" } — only these keys are compared
 * @returns {Array<{key:string,label:string,from:string,to:string}>}
 */
export function getChanges(before, after, labels) {
    const changes = [];
    Object.keys(labels).forEach(key => {
        const from = norm(before[key]);
        const to = norm(after[key]);
        if (from !== to) changes.push({ key, label: labels[key], from, to });
    });
    return changes;
}

/**
 * Turns a change list into a readable log line, e.g.
 * Edited Juan Dela Cruz address from "A" to "B"; Edited Juan Dela Cruz first name from "X" to "Y"
 */
export function describeChanges(subject, changes) {
    return changes
        .map(c => `Edited ${subject} ${c.label} from "${c.from}" to "${c.to}"`)
        .join("; ");
}

const GREY = { background: "#e0e0e0", color: "#777", borderColor: "#bdbdbd" };

/**
 * Edit-mode action button: reads "Cancel" (grey) while nothing has changed,
 * and reverts to its normal look / label once something has.
 */
export function setApplyState(btn, hasChanges, changedText = "Apply Changes") {
    if (!btn) return;
    if (hasChanges) {
        btn.textContent = changedText;
        btn.style.background = "";
        btn.style.color = "";
        btn.style.borderColor = "";
    } else {
        btn.textContent = "Cancel";
        btn.style.background = GREY.background;
        btn.style.color = GREY.color;
        btn.style.borderColor = GREY.borderColor;
    }
}

/**
 * For popups that already have their own Cancel button (announcement, water
 * thresholds): the Save button goes grey and inert until something changes.
 */
export function setSaveEnabled(btn, hasChanges) {
    if (!btn) return;
    btn.disabled = !hasChanges;
    btn.style.background = hasChanges ? "" : GREY.background;
    btn.style.color = hasChanges ? "" : GREY.color;
    btn.style.borderColor = hasChanges ? "" : GREY.borderColor;
    btn.style.cursor = hasChanges ? "" : "not-allowed";
}
