import { auth, firestore, storage } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { collection, getDocs, getDoc, setDoc, doc, deleteDoc, updateDoc, query, where, limit } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";
import { writeLog } from "./logging.js";
import { getChanges, describeChanges, setSaveEnabled } from "./edit-tracker.js";
import { confirmChanges, confirmDelete, runWithLoading } from "./dialogs.js";

let currentStaffId = "BFVS-26-00000"; // Default fallback staff ID
let uploadedFiles = []; // Holds actual JS File objects
let activeEditId = null;
let annOriginal = { title: "", message: "" }; // Values when the edit popup was opened
const ANN_LABELS = { title: "title", message: "message" };

function annCurrentValues() {
    return {
        title: document.getElementById("editAnnTitle").value,
        message: document.getElementById("editAnnMessage").value
    };
}

function refreshAnnSaveState() {
    setSaveEnabled(document.getElementById("saveEditAnnBtn"), getChanges(annOriginal, annCurrentValues(), ANN_LABELS).length > 0);
}

// Helper: Cleans up file metadata and attaches the count index (e.g. 1_barangay_event.png)
function sanitizeFileName(originalName, index) {
    const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
    
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
    const cleanName = nameWithoutExt
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    return `${index + 1}_${cleanName || "image"}.${ext}`;
}

// Track Auth User and retrieve their corresponding staffID
// Track Auth User and retrieve their corresponding staffID
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // 1. Direct document lookup by Auth UID (Standard Firestore structure)
            const userDocRef = doc(firestore, "Users", user.uid);
            const userSnap = await getDoc(userDocRef);

            if (userSnap.exists()) {
                const userData = userSnap.data();
                // Checks for staffID or staffId field, fallback to user.uid if neither exists
                currentStaffId = userData.staffID || userData.staffId || user.uid;
            } else {
                // 2. Fallback query in case document ID is auto-generated and "uid" is a field
                const staffQuery = query(collection(firestore, "Users"), where("uid", "==", user.uid), limit(1));
                const staffSnap = await getDocs(staffQuery);

                if (!staffSnap.empty) {
                    const staffData = staffSnap.docs[0].data();
                    currentStaffId = staffData.staffID || staffData.staffId || user.uid;
                }
            }
        } catch (err) {
            console.error("Error fetching staff ID profile:", err);
        }
    }
});

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Load Edit Modal Fragment
    try {
        const res = await fetch("../Popups/Edit_Announcement.html");
        if (res.ok) {
            document.getElementById("popup-container").innerHTML = await res.text();
            initEditModalLogic();
        }
    } catch (err) {
        console.error("Error loading edit popup:", err);
    }

    // 2. Fetch and render announcements
    await loadAnnouncements();

    // 3. Real file selection setup
    const addMediaBtn = document.getElementById("addMediaBtn");
    const mediaFileInput = document.getElementById("mediaFileInput");

    if (addMediaBtn && mediaFileInput) {
        addMediaBtn.addEventListener("click", () => {
            if (uploadedFiles.length >= 5) {
                alert("Cannot exceed 5 photos.");
                return;
            }
            mediaFileInput.click();
        });

        mediaFileInput.addEventListener("change", (e) => {
            const selectedFiles = Array.from(e.target.files);
            if (uploadedFiles.length + selectedFiles.length > 5) {
                alert("Cannot exceed 5 photos in total.");
                mediaFileInput.value = "";
                return;
            }
            uploadedFiles.push(...selectedFiles);
            mediaFileInput.value = ""; // Reset file input selection
            renderMediaList();
        });
    }

    // 4. Publish Button Handler
    const publishBtn = document.getElementById("publishAnnBtn");
    if (publishBtn) {
        publishBtn.addEventListener("click", handlePublishAnnouncement);
    }
});

// Render selected file previews
function renderMediaList() {
    const container = document.getElementById("mediaListContainer");
    const countNote = document.getElementById("mediaCountNote");
    if (!container) return;

    countNote.textContent = `${uploadedFiles.length} / 5`;
    container.innerHTML = "";

    uploadedFiles.forEach((file, index) => {
        const previewUrl = URL.createObjectURL(file);
        const item = document.createElement("div");
        item.className = "media-item";
        item.innerHTML = `
            <img src="../Icons/ic_drag.svg" alt="" />
            <div class="media">
                <img src="${previewUrl}" alt="${escapeHTML(file.name)}" style="width: 100%; height: 100%; object-fit: cover;" />
            </div>
            <span class="media-filename">${escapeHTML(file.name)}</span>
            <button class="media-delete-btn" data-index="${index}" type="button" title="Remove">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                </svg>
            </button>
        `;
        container.appendChild(item);
    });

    // Attach delete handlers for media items
    container.querySelectorAll(".media-delete-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const idx = parseInt(e.currentTarget.getAttribute("data-index"));
            uploadedFiles.splice(idx, 1);
            renderMediaList();
        });
    });
}

// Fetch published announcements from Firestore
async function loadAnnouncements() {
    const listContainer = document.getElementById("announceListContainer");
    const subTitle = document.getElementById("pubCountSubtitle");
    if (!listContainer) return;

    try {
        const querySnapshot = await getDocs(collection(firestore, "Announcement"));
        listContainer.innerHTML = "";
        
        let announcements = [];
        querySnapshot.forEach((docSnap) => {
            announcements.push({ id: docSnap.id, ...docSnap.data() });
        });

        subTitle.textContent = `${announcements.length} published this month`;

        if (announcements.length === 0) {
            listContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--grey);">No published announcements yet.</div>`;
            return;
        }

        announcements.forEach((ann) => {
            let formattedDate = "Recent";
            if (ann.createdOn && ann.createdOn.toDate) {
                formattedDate = ann.createdOn.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " · " + 
                                ann.createdOn.toDate().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
            }

            // --- Robust photo parser: handles both Arrays and comma-separated Strings ---
            let photoList = [];
            if (Array.isArray(ann.photos)) {
                photoList = ann.photos.map(p => String(p).trim()).filter(Boolean);
            } else if (typeof ann.photos === "string" && ann.photos.trim() !== "") {
                photoList = ann.photos.split(",").map(p => p.trim()).filter(Boolean);
            }

            // Render thumbnail previews
            let photoThumbnails = "";
            if (photoList.length > 0) {
                photoThumbnails = `<div class="photo-preview-list" style="display:flex; gap:6px; margin-top:8px;">` +
                    photoList.map(url => `<img src="${escapeHTML(url)}" style="width:48px; height:48px; object-fit:cover; border-radius:4px;" />`).join("") +
                    `</div>`;
            }

            const item = document.createElement("div");
            item.className = "announce-item";
            item.innerHTML = `
                <div class="content">
                    <div class="title">${escapeHTML(ann.title || "Untitled")}</div>
                    <div class="desc">${escapeHTML(ann.message || "")}</div>
                    ${photoThumbnails}
                    <div class="meta" style="margin-top: 8px;">
                        <span>${escapeHTML(ann.annID || ann.id)}</span>
                        <span>${formattedDate}</span>
                        <span>${escapeHTML(ann.category || "General")}</span>
                        <span>By: ${escapeHTML(ann.createdBy || "Admin")}</span>
                    </div>
                </div>
                <div class="actions">
                    <button class="btn edit" data-id="${ann.id}" data-title="${escapeHTML(ann.title)}" data-message="${escapeHTML(ann.message)}">Edit</button>
                    <button class="btn del" data-id="${ann.id}" data-photos="${escapeHTML(photoList.join(","))}">Delete</button>
                </div>
            `;
            listContainer.appendChild(item);
        });

        // Bind delete action triggers (Deletes images in Storage + document in Firestore)
        listContainer.querySelectorAll(".btn.del").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const docId = e.currentTarget.getAttribute("data-id");
                const photosStr = e.currentTarget.getAttribute("data-photos");
                const annTitle = e.currentTarget.closest(".announce-item")?.querySelector(".title")?.textContent || docId;

                if (await confirmDelete({ id: docId, name: annTitle, type: "Announcements" })) {
                    try {
                        // Delete associated image files from Firebase Storage if present
                        if (photosStr) {
                            const photoUrls = photosStr.split(",").map(p => p.trim()).filter(Boolean);
                            for (const url of photoUrls) {
                                try {
                                    const photoRef = ref(storage, url);
                                    await deleteObject(photoRef);
                                } catch (imgErr) {
                                    console.warn(`Could not delete image (${url}) from Storage:`, imgErr);
                                }
                            }
                        }

                        // Delete the announcement document from Firestore
                        await deleteDoc(doc(firestore, "Announcement", docId));
                        writeLog("Delete", "Removed Announcement", docId, `Deleted announcement ${docId}`);
                        await loadAnnouncements();
                    } catch (err) {
                        console.error("Error deleting announcement:", err);
                        alert("Failed to delete announcement.");
                    }
                }
            });
        });

        // Bind edit action triggers to open modal
        listContainer.querySelectorAll(".btn.edit").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const target = e.currentTarget;
                activeEditId = target.getAttribute("data-id");
                document.getElementById("editAnnTitle").value = target.getAttribute("data-title");
                document.getElementById("editAnnMessage").value = target.getAttribute("data-message");
                annOriginal = annCurrentValues();
                refreshAnnSaveState();
                
                const modal = document.getElementById("editAnnouncement");
                if (modal) modal.style.display = "flex";
            });
        });

    } catch (err) {
        console.error("Error loading announcements:", err);
    }
}

// Upload selected files to Firebase Storage in "announcement/(postID)/(count_cleanedFileName)" format
async function handlePublishAnnouncement() {
    const titleInput = document.getElementById("annTitleInput");
    const msgInput = document.getElementById("annMessageInput");
    const categorySelect = document.getElementById("annCategorySelect");
    const publishBtn = document.getElementById("publishAnnBtn");

    const title = titleInput.value.trim();
    const message = msgInput.value.trim();
    const category = categorySelect.value;

    if (!title || !message) {
        alert("Please fill in both the title and message fields.");
        return;
    }

    try {
        publishBtn.disabled = true;
        publishBtn.textContent = "Publishing...";

        const outcome = await runWithLoading({
            loadingAction: "Posting Announcement",
            loadingDescription: "post your announcement",
            successAction: "Announcement Posted",
            task: async () => {
        // 1. Generate unique sequential custom ID like AN26-0001
        const querySnapshot = await getDocs(collection(firestore, "Announcement"));
        let nextNum = querySnapshot.size + 1;
        let annID = `AN26-${String(nextNum).padStart(4, '0')}`;
        
        while(querySnapshot.docs.some(d => d.data().annID === annID)) {
            nextNum++;
            annID = `AN26-${String(nextNum).padStart(4, '0')}`;
        }

        // 2. Upload files to Firebase Storage using format: announcement/(postID)/(count_cleanedName)
        const downloadUrls = [];
        for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            const cleanName = sanitizeFileName(file.name, i);
            const fileRef = ref(storage, `announcement/${annID}/${cleanName}`);
            
            const snapshot = await uploadBytes(fileRef, file);
            const url = await getDownloadURL(snapshot.ref);
            downloadUrls.push(url);
        }

        // 3. Save announcement with image URLs to Firestore
        const newDocRef = doc(collection(firestore, "Announcement"), annID);
        await setDoc(newDocRef, {
            annID: annID,
            category: category,
            createdBy: currentStaffId,
            createdOn: new Date(),
            message: message,
            photos: downloadUrls,
            title: title
        });

        // Reset form inputs
        titleInput.value = "";
        msgInput.value = "";
        uploadedFiles = [];
        renderMediaList();

        writeLog("Add", "New Announcement", annID, `Published "${title}"`);
        await loadAnnouncements();
        return `${title} Announcement has been posted successfully`;
            }
        });
        if (!outcome.ok) throw outcome.error;
    } catch (err) {
        console.error("Error publishing announcement:", err);
        alert("Failed to publish announcement: " + err.message);
    } finally {
        publishBtn.disabled = false;
        publishBtn.innerHTML = `
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Publish
        `;
    }
}

// Modal Edit Interactivity Logic
function initEditModalLogic() {
    const modal = document.getElementById("editAnnouncement");
    const cancelBtn = document.getElementById("cancelEditAnnBtn");
    const saveBtn = document.getElementById("saveEditAnnBtn");

    if (!modal) return;

    document.getElementById("editAnnTitle").addEventListener("input", refreshAnnSaveState);
    document.getElementById("editAnnMessage").addEventListener("input", refreshAnnSaveState);

    cancelBtn.addEventListener("click", () => {
        modal.style.display = "none";
        activeEditId = null;
    });

    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.style.display = "none";
            activeEditId = null;
        }
    });

    saveBtn.addEventListener("click", async () => {
        if (!activeEditId) return;

        const annChanges = getChanges(annOriginal, annCurrentValues(), ANN_LABELS);
        if (annChanges.length === 0) return;

        const newTitle = document.getElementById("editAnnTitle").value.trim();
        const newMessage = document.getElementById("editAnnMessage").value.trim();

        if (!newTitle || !newMessage) {
            alert("Title and message cannot be empty.");
            return;
        }

        // Ask first — the edit popup is swapped for the confirmation dialog
        if (!(await confirmChanges("announcement", modal))) return;

        try {
            saveBtn.textContent = "Saving...";
            saveBtn.disabled = true;

            const annRef = doc(firestore, "Announcement", activeEditId);
            await updateDoc(annRef, {
                title: newTitle,
                message: newMessage
            });
            writeLog("Edit", "Edited Announcement", activeEditId, describeChanges(`"${annOriginal.title}"`, annChanges));

            modal.style.display = "none";
            activeEditId = null;
            saveBtn.textContent = "Save";
            saveBtn.disabled = false;

            await loadAnnouncements();
            alert("Announcement updated successfully.");
        } catch (err) {
            console.error("Error updating announcement:", err);
            modal.style.display = "flex";
            saveBtn.textContent = "Save";
            saveBtn.disabled = false;
            alert("Failed to update announcement.");
        }
    });
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}