import { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, getDocs, GeoPoint, Timestamp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { initCardMap } from "./gmapComponent.js";
import { loadGoogleMaps } from "./gmaps.js";
import { app } from "./auth.js";
import { isValidLatLng, dropPin, geopointToLatLng } from "./map-helper.js";
import { showToast } from "./toast.js";
import { writeLog } from "./logging.js";
import { getChanges, describeChanges, setApplyState } from "./edit-tracker.js";

const firestore = getFirestore(app);
const evacCollection = collection(firestore, "EvacuationCenter");

let evacMap = null;
let activeMarkers = [];
let allEvacData = {}; // keyed by Firestore doc id (matches evacID, e.g. "EC-002")
const stationCenter = { lat: 14.6760, lng: 121.0437 };
const MAP_ID = "MYFAIRVIEW_MAP_ID"; // Same map ID used across the app for AdvancedMarkerElement

document.addEventListener("DOMContentLoaded", async () => {
    await loadExternalModals();
    evacMap = await initCardMap("evacMapCard", stationCenter, 14, []);
    listenToEvacCenters();
    setupAllModals();
});

// --- Modal Loader (mirrors vehicle-manager.js) ---
async function loadExternalModals() {
    const modals = ['../Popups/Add_EvacCenter.html', '../Popups/Info_EvacCenter.html'];
    const container = document.createElement('div');
    container.id = 'evac-modals-container';
    document.body.appendChild(container);

    for (const file of modals) {
        try {
            const res = await fetch(`./${file}`);
            if (res.ok) {
                const html = await res.text();
                container.insertAdjacentHTML('beforeend', html);
            }
        } catch (error) { console.error(`Error loading popup ${file}:`, error); }
    }
}

// --- Firestore Listener & UI List ---
function listenToEvacCenters() {
    onSnapshot(evacCollection, async (snapshot) => {
        const listContainer = document.querySelector(".evac-list");
        if (!listContainer) return;
        listContainer.innerHTML = "";
        clearMapMarkers();

        allEvacData = {};
        snapshot.forEach(docSnap => { allEvacData[docSnap.id] = docSnap.data(); });

        const maps = await loadGoogleMaps();
        const markerLib = await maps.importLibrary("marker");

        Object.keys(allEvacData).forEach((id) => {
            const v = allEvacData[id];

            const item = document.createElement("div");
            item.className = "evac-item";
            item.setAttribute("data-id", id);
            item.innerHTML = `
                <div class="line"></div>
                <div class="content">
                    <div class="title">${escapeHTML(v.placeName)}</div>
                    <div class="desc">${escapeHTML(v.address)}</div>
                    <div class="meta">
                        <span>${escapeHTML(v.evacID || id)}</span>
                        <span>Capacity : ${escapeHTML(String(v.capacity ?? "0"))}</span>
                    </div>
                </div>
                <div class="actions">
                    <a class="btn edit" href="#">Edit</a>
                </div>
            `;
            listContainer.appendChild(item);

            const loc = geopointToLatLng(v.pinLocation);
            if (isValidLatLng(loc)) {
                activeMarkers.push(dropPin(markerLib, evacMap, loc, "#1E8E3E", "#0F5C22"));
            }
        });
    }, (err) => {
        console.error("Error listening to evacuation centers:", err);
        showToast("Couldn't load evacuation centers.", "error");
    });
}

function clearMapMarkers() {
    activeMarkers.forEach(m => { if (m) m.map = null; });
    activeMarkers = [];
}

// --- Popup Interactions ---
function setupAllModals() {
    setupAddEvacCenter();

    document.querySelector(".evac-list")?.addEventListener("click", (e) => {
        const item = e.target.closest(".evac-item");
        if (!item) return;
        e.preventDefault();
        const id = item.getAttribute("data-id");
        if (allEvacData[id]) openEvacInfo(allEvacData[id], id);
    });

    document.querySelectorAll(".modal-overlay").forEach(modal => {
        modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    });
}

// === A. ADD EVACUATION CENTER LOGIC ===
function setupAddEvacCenter() {
    const modal = document.getElementById("addEvacCenter");
    let addMap, markerLib, addressAutocomplete, pinMarker;
    let selectedLoc = null; // Only ever real {lat,lng} from a map click or a resolved Place

    document.getElementById("openAddEvacBtn")?.addEventListener("click", async (e) => {
        e.preventDefault();

        // Reset form + map state each time the modal opens
        document.getElementById("addEvacName").value = "";
        document.getElementById("addEvacCapacity").value = "";
        selectedLoc = null;
        setAddrLabel("");
        if (pinMarker) { pinMarker.map = null; pinMarker = null; }

        modal.style.display = "flex";

        const maps = await loadGoogleMaps();
        const placesLib = await maps.importLibrary("places");
        markerLib = await maps.importLibrary("marker");

        if (!addMap) {
            addMap = new maps.Map(document.getElementById("addEvacMapCard"), {
                center: stationCenter, zoom: 14, disableDefaultUI: true, mapId: MAP_ID
            });

            // Search widget is a convenience — it only sets the pin because a resolved
            // Place carries real coordinates. Typing alone never moves the pin.
            addressAutocomplete = new placesLib.PlaceAutocompleteElement({
                componentRestrictions: { country: "ph" }
            });
            addressAutocomplete.id = "addEvacAddressInput";
            const addressContainer = document.getElementById("addEvacAddressContainer");
            addressContainer.innerHTML = "";
            addressContainer.appendChild(addressAutocomplete);

            addressAutocomplete.addEventListener("gmp-select", async ({ placePrediction }) => {
                const place = placePrediction.toPlace();
                await place.fetchFields({ fields: ["location", "formattedAddress"] });
                const loc = { lat: place.location.lat(), lng: place.location.lng() };
                setAddrLabel(place.formattedAddress || "");
                setPin(loc);
                addMap.setCenter(loc);
            });

            // Map click is the primary way to set the exact pin
            const geocoder = new maps.Geocoder();
            addMap.addListener("click", (e) => {
                const loc = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                setPin(loc);
                geocoder.geocode({ location: e.latLng }, (results, status) => {
                    if (status === "OK" && results[0]) setAddrLabel(results[0].formatted_address);
                });
            });
        } else {
            addMap.setCenter(stationCenter);
        }
    });

    function setAddrLabel(text) {
        const readout = document.getElementById("addEvacSelectedAddress");
        if (readout) readout.textContent = text;
    }

    function setPin(loc) {
        if (!isValidLatLng(loc)) return;
        selectedLoc = loc;
        if (pinMarker) pinMarker.map = null;
        pinMarker = dropPin(markerLib, addMap, loc, "#1E8E3E", "#0F5C22");
    }

    document.getElementById("cancelAddEvacBtn")?.addEventListener("click", () => modal.style.display = "none");

    document.getElementById("confirmAddEvacBtn")?.addEventListener("click", async () => {
        const name = document.getElementById("addEvacName").value.trim();
        const capacity = document.getElementById("addEvacCapacity").value.trim();
        const addressLabel = document.getElementById("addEvacSelectedAddress")?.textContent?.trim() || "";

        if (!name) return showToast("Place name is required.", "error");
        if (!isValidLatLng(selectedLoc)) return showToast("Click the map to drop a pin for the location.", "error");

        try {
            const newId = await nextEvacId();
            await setDoc(doc(firestore, "EvacuationCenter", newId), {
                evacID: newId,
                placeName: name,
                address: addressLabel,
                capacity: capacity || "0",
                pinLocation: new GeoPoint(selectedLoc.lat, selectedLoc.lng),
                createdBy: "Admin",
                createdOn: Timestamp.now()
            });
            modal.style.display = "none"; // Close first so the toast reads as confirmation, not an interruption
            showToast("Evacuation center added.");
            writeLog("Add", "New Evacuation Center", newId, `Added ${name}`);
        } catch (err) {
            console.error("Failed to add evacuation center:", err);
            showToast("Couldn't add evacuation center.", "error");
        }
    });
}

// Generates the next sequential EC-### id by scanning existing doc ids.
async function nextEvacId() {
    const snapshot = await getDocs(evacCollection);
    let max = 0;
    snapshot.forEach(d => {
        const m = /EC-(\d+)/.exec(d.id);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `EC-${String(max + 1).padStart(3, "0")}`;
}

// === B. INFO / EDIT / REMOVE EVACUATION CENTER LOGIC ===
let infoMap = null;
let infoMarker = null;
let infoMarkerLib = null;
let isEvacEditing = false;
let evacEditedLoc = null; // Only updates if the user clicks the map while editing
let evacRefreshApply = null; // Re-checks Apply/Cancel state (set per opened popup)

async function openEvacInfo(v, id) {
    const modal = document.getElementById("infoEvacCenter");

    const nameInput = document.getElementById("infoEvacName");
    const addressInput = document.getElementById("infoEvacAddress");
    const capacityInput = document.getElementById("infoEvacCapacity");
    const editBtn = document.getElementById("btn-edit-evac");
    const deleteBtn = modal.querySelector(".button.delete");
    const applyBtn = modal.querySelector(".button.accept");

    nameInput.value = v.placeName || "";
    addressInput.value = v.address || "";
    capacityInput.value = v.capacity || "";
    setText("infoEvacIDNum", v.evacID || id);
    setText("infoEvacAddedOn", formatTimestamp(v.createdOn));
    setText("infoEvacAddedBy", v.createdBy);

    const currentLoc = geopointToLatLng(v.pinLocation);
    evacEditedLoc = currentLoc; // address text never touches this — only the pin

    // Always open in read-only view mode; Edit unlocks everything below.
    isEvacEditing = false;
    [nameInput, addressInput, capacityInput].forEach(el => el.disabled = true);
    if (deleteBtn) deleteBtn.style.display = "none";
    if (applyBtn) applyBtn.style.display = "none";

    // Track real changes so an untouched edit shows a grey "Cancel" and logs nothing
    const EVAC_LABELS = { placeName: "name", address: "address", capacity: "capacity" };
    const originalEvac = { placeName: nameInput.value, address: addressInput.value, capacity: capacityInput.value };
    const readEvac = () => ({ placeName: nameInput.value, address: addressInput.value, capacity: capacityInput.value });
    const fmtLoc = (l) => isValidLatLng(l) ? `${Number(l.lat).toFixed(6)}, ${Number(l.lng).toFixed(6)}` : "";
    const collectEvacChanges = () => {
        const list = getChanges(originalEvac, readEvac(), EVAC_LABELS);
        if (isValidLatLng(evacEditedLoc) && fmtLoc(evacEditedLoc) !== fmtLoc(currentLoc)) {
            list.push({ key: "pinLocation", label: "pin location", from: fmtLoc(currentLoc), to: fmtLoc(evacEditedLoc) });
        }
        return list;
    };
    evacRefreshApply = () => { if (isEvacEditing) setApplyState(applyBtn, collectEvacChanges().length > 0); };
    [nameInput, addressInput, capacityInput].forEach(el => { el.oninput = evacRefreshApply; });

    const exitEvacEdit = () => {
        // Discard edits and go back to the normal viewing state
        nameInput.value = originalEvac.placeName;
        addressInput.value = originalEvac.address;
        capacityInput.value = originalEvac.capacity;
        evacEditedLoc = currentLoc;
        if (isValidLatLng(currentLoc)) placeInfoPin(currentLoc);
        isEvacEditing = false;
        [nameInput, addressInput, capacityInput].forEach(el => el.disabled = true);
        if (deleteBtn) deleteBtn.style.display = "none";
        if (applyBtn) applyBtn.style.display = "none";
    };

    if (editBtn) {
        editBtn.onclick = (e) => {
            e.preventDefault();
            isEvacEditing = true;
            [nameInput, addressInput, capacityInput].forEach(el => el.disabled = false);
            if (deleteBtn) deleteBtn.style.display = "block";
            if (applyBtn) applyBtn.style.display = "block";
            evacRefreshApply();
        };
    }

    modal.style.display = "flex";

    const maps = await loadGoogleMaps();
    infoMarkerLib = await maps.importLibrary("marker");
    const center = isValidLatLng(currentLoc) ? currentLoc : stationCenter;

    if (!infoMap) {
        infoMap = new maps.Map(document.getElementById("infoEvacMapCard"), {
            center, zoom: 15, disableDefaultUI: true, mapId: MAP_ID
        });
        infoMap.addListener("click", (e) => {
            if (!isEvacEditing) return; // Pin isn't moveable until Edit is clicked
            evacEditedLoc = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            placeInfoPin(evacEditedLoc);
            if (evacRefreshApply) evacRefreshApply();
        });
    } else {
        infoMap.setCenter(center);
    }

    if (infoMarker) { infoMarker.map = null; infoMarker = null; }
    if (isValidLatLng(currentLoc)) placeInfoPin(currentLoc);

    function placeInfoPin(loc) {
        if (infoMarker) infoMarker.map = null;
        infoMarker = dropPin(infoMarkerLib, infoMap, loc, "#1E8E3E", "#0F5C22");
    }

    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if (!confirm(`Remove ${v.placeName}?`)) return;
            try {
                await deleteDoc(doc(firestore, "EvacuationCenter", id));
                modal.style.display = "none"; // Close first so the toast reads as confirmation
                showToast("Evacuation center removed.");
                writeLog("Delete", "Removed Evacuation Center", v.evacID || id, `Removed ${v.placeName}`);
            } catch (err) {
                console.error("Failed to remove evacuation center:", err);
                showToast("Couldn't remove evacuation center.", "error");
            }
        };
    }

    if (applyBtn) {
        applyBtn.onclick = async () => {
            const changes = collectEvacChanges();
            if (changes.length === 0) { exitEvacEdit(); return; } // Cancel
            const updates = {
                placeName: nameInput.value.trim(),
                address: addressInput.value.trim(),
                capacity: capacityInput.value.trim()
            };
            // Only overwrite the saved pin if the user actually clicked a new, valid spot
            if (isValidLatLng(evacEditedLoc)) {
                updates.pinLocation = new GeoPoint(evacEditedLoc.lat, evacEditedLoc.lng);
            }
            try {
                await updateDoc(doc(firestore, "EvacuationCenter", id), updates);
                modal.style.display = "none";
                showToast("Changes saved.");
                writeLog("Edit", "Edited Evacuation Center", v.evacID || id, describeChanges(originalEvac.placeName || id, changes));
            } catch (err) {
                console.error("Failed to update evacuation center:", err);
                showToast("Couldn't save changes.", "error");
            }
        };
    }
}

function formatTimestamp(ts) {
    if (!ts) return "—";
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    } catch {
        return "—";
    }
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = (value === undefined || value === null || value === "") ? "—" : value;
}

function escapeHTML(str) { return str ? String(str).replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t)) : ""; }