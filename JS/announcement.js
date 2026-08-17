import { auth, firestore } from "./auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { collection, getDocs, setDoc, doc, deleteDoc, updateDoc, query, where, limit } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

let currentStaffId = "BFVS-26-00000"; // Default fallback staff ID
let uploadedFiles = [];
let activeEditId = null;

// Track Auth User and retrieve their corresponding staffID
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // Query your staff/users collection to find the document matching this auth UID
            // (Adjust "Users" or "Staff" to match your actual Firestore collection name)
            const staffQuery = query(collection(firestore, "Users"), where("uid", "==", user.uid), limit(1));
            const staffSnap = await getDocs(staffQuery);
            
            if (!staffSnap.empty) {
                const staffData = staffSnap.docs[0].data();
                // Use staffID if available in the document, otherwise fallback to doc id or user property
                currentStaffId = staffData.staffID || staffSnap.docs[0].id;
            } else {
                // Fallback check if user email/uid document itself uses staffID
                const directDoc = await getDocs(doc(firestore, "Users", user.uid));
                // Alternatively, if you store staff ID directly in custom claims or profile
                currentStaffId = user.uid; // Fallback
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

    // 3. Media emulation setup
    const addMediaBtn = document.getElementById("addMediaBtn");
    if (addMediaBtn) {
        addMediaBtn.addEventListener("click", () => {
            if (uploadedFiles.length >= 5) {
                alert("Cannot exceed 5 photos.");
                return;
            }
            const sampleNames = ["barangay_event.jpeg", "community_meeting.png", "advisory_banner.jpg", "flood_map.png", "notice_photo.jpeg"];
            const randomName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
            uploadedFiles.push(randomName);
            renderMediaList();
        });
    }

    // 4. Publish Button Handler
    const publishBtn = document.getElementById("publishAnnBtn");
    if (publishBtn) {
        publishBtn.addEventListener("click", handlePublishAnnouncement);
    }
});

// Render simulated file attachments
function renderMediaList() {
    const container = document.getElementById("mediaListContainer");
    const countNote = document.getElementById("mediaCountNote");
    if (!container) return;

    countNote.textContent = `${uploadedFiles.length} / 5`;
    container.innerHTML = "";

    uploadedFiles.forEach((filename, index) => {
        const item = document.createElement("div");
        item.className = "media-item";
        item.innerHTML = `
            <img src="../Icons/ic_drag.svg" alt="" />
            <div class="media">
                <img src="../Images/imgplaceholder.png" alt="" />
            </div>
            <span class="media-filename">${filename}</span>
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

            const item = document.createElement("div");
            item.className = "announce-item";
            item.innerHTML = `
                <div class="content">
                    <div class="title">${escapeHTML(ann.title || "Untitled")}</div>
                    <div class="desc">${escapeHTML(ann.message || "")}</div>
                    <div class="meta">
                        <span>${escapeHTML(ann.annID || ann.id)}</span>
                        <span>${formattedDate}</span>
                        <span>${escapeHTML(ann.category || "General")}</span>
                        <span>By: ${escapeHTML(ann.createdBy || "Admin")}</span>
                    </div>
                </div>
                <div class="actions">
                    <button class="btn edit" data-id="${ann.id}" data-title="${escapeHTML(ann.title)}" data-message="${escapeHTML(ann.message)}">Edit</button>
                    <button class="btn del" data-id="${ann.id}">Delete</button>
                </div>
            `;
            listContainer.appendChild(item);
        });

        // Bind delete action triggers
        listContainer.querySelectorAll(".btn.del").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const docId = e.currentTarget.getAttribute("data-id");
                if (confirm("Are you sure you want to delete this announcement?")) {
                    await deleteDoc(doc(firestore, "Announcement", docId));
                    await loadAnnouncements();
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
                
                const modal = document.getElementById("editAnnouncement");
                if (modal) modal.style.display = "flex";
            });
        });

    } catch (err) {
        console.error("Error loading announcements:", err);
    }
}

// Handle Publishing New Announcement with Custom ID Generation (AN26-00xx)
async function handlePublishAnnouncement() {
    const titleInput = document.getElementById("annTitleInput");
    const msgInput = document.getElementById("annMessageInput");
    const categorySelect = document.getElementById("annCategorySelect");

    const title = titleInput.value.trim();
    const message = msgInput.value.trim();
    const category = categorySelect.value;

    if (!title || !message) {
        alert("Please fill in both the title and message fields.");
        return;
    }

    try {
        // Generate unique sequential custom ID like AN26-0001
        const querySnapshot = await getDocs(collection(firestore, "Announcement"));
        let nextNum = querySnapshot.size + 1;
        let annID = `AN26-${String(nextNum).padStart(4, '0')}`;
        
        // Ensure uniqueness check loop fallback
        while(querySnapshot.docs.some(d => d.data().annID === annID)) {
            nextNum++;
            annID = `AN26-${String(nextNum).padStart(4, '0')}`;
        }

        const newDocRef = doc(collection(firestore, "Announcement"), annID); // Use custom ID as document ID
        await setDoc(newDocRef, {
            annID: annID,
            category: category,
            createdBy: currentStaffId, // Uses the resolved staffID instead of raw auth UID
            createdOn: new Date(),
            message: message,
            photos: uploadedFiles.join(", "),
            title: title
        });

        // Reset form inputs
        titleInput.value = "";
        msgInput.value = "";
        uploadedFiles = [];
        renderMediaList();

        alert(`Announcement published successfully under ID: ${annID}`);
        await loadAnnouncements();
    } catch (err) {
        console.error("Error publishing announcement:", err);
        alert("Failed to publish announcement.");
    }
}

// Modal Edit Interactivity Logic
function initEditModalLogic() {
    const modal = document.getElementById("editAnnouncement");
    const cancelBtn = document.getElementById("cancelEditAnnBtn");
    const saveBtn = document.getElementById("saveEditAnnBtn");

    if (!modal) return;

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

        const newTitle = document.getElementById("editAnnTitle").value.trim();
        const newMessage = document.getElementById("editAnnMessage").value.trim();

        if (!newTitle || !newMessage) {
            alert("Title and message cannot be empty.");
            return;
        }

        try {
            saveBtn.textContent = "Saving...";
            saveBtn.disabled = true;

            const annRef = doc(firestore, "Announcement", activeEditId);
            await updateDoc(annRef, {
                title: newTitle,
                message: newMessage
            });

            modal.style.display = "none";
            activeEditId = null;
            saveBtn.textContent = "Save";
            saveBtn.disabled = false;

            await loadAnnouncements();
            alert("Announcement updated successfully.");
        } catch (err) {
            console.error("Error updating announcement:", err);
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