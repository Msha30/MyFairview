import { firestore } from "./auth.js";
import { collection, doc, setDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const logsCollection = collection(firestore, "Logs");

// Generates the next sequential LOG-YY-00000 id for the current year by
// scanning existing doc ids (mirrors the EC-###/AN26-#### generators
// already used elsewhere in this codebase).
async function nextLogId() {
    const year = new Date().getFullYear().toString().slice(-2);
    const prefix = `LOG-${year}-`;
    const snapshot = await getDocs(logsCollection);
    let max = 0;
    snapshot.forEach(d => {
        if (d.id.startsWith(prefix)) {
            const n = parseInt(d.id.slice(prefix.length), 10);
            if (!isNaN(n)) max = Math.max(max, n);
        }
    });
    return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

function currentStaffID() {
    try {
        const userData = JSON.parse(sessionStorage.getItem("userData") || "{}");
        return userData.staffID || userData.id || "system";
    } catch {
        return "system";
    }
}

/**
 * Writes an entry to the Logs collection. Any action made from the site
 * (verify/reject, new records, edits, deletions) should call this right
 * after the mutation succeeds.
 *
 * @param {string} action     Short verb used for background color bucketing
 *                            on the System Logs list — e.g. "Add", "Edit",
 *                            "Delete", "Verify", "Reject".
 * @param {string} actionDesc Short human label, e.g. "Verified Citizen",
 *                            "New Vehicle", "Edited Announcement".
 * @param {string} affectedID The ID of whatever was affected (userID,
 *                            plateNo, reportID, evacID, annID, etc.)
 * @param {string} details    Longer free-text description of what happened.
 */
export async function writeLog(action, actionDesc, affectedID, details = "") {
    try {
        const logID = await nextLogId();
        await setDoc(doc(firestore, "Logs", logID), {
            logID,
            action,
            actionDesc,
            affectedID: affectedID || "",
            details,
            madeBy: currentStaffID(),
            madeOn: serverTimestamp()
        });
    } catch (err) {
        // A logging failure shouldn't block the actual action from succeeding.
        console.error("Failed to write log:", err);
    }
}
