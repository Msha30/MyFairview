import { getDatabase, ref, onValue, set, remove, update } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { initCardMap } from "./gmapComponent.js";
import { loadGoogleMaps } from "./gmaps.js";
import { database, app } from "./auth.js"; // Ensure app is exported from auth.js to init firestore
import { isValidLatLng, dropPin, computeAndDrawRoute } from "./map-helper.js";
import { showToast } from "./toast.js";

const db = database;
const firestore = getFirestore(app);

let vehicleMap = null;
let activeMarkers = [];
let allVehiclesData = {};
let verifiedUsers = []; // Cache for Firestore users
const stationCenter = { lat: 14.6760, lng: 121.0437 };
const MAP_ID = "MYFAIRVIEW_MAP_ID"; // Required for AdvancedMarkerElement / Route markers

document.addEventListener("DOMContentLoaded", async () => {
    await loadExternalModals();
    vehicleMap = await initCardMap("vehicleMapCard", stationCenter, 14, []);
    listenToVehicles();
    fetchVerifiedUsers(); // Pre-fetch users for the search dropdown
    setupAllModals();
});

// --- Modal Loader ---
async function loadExternalModals() {
    const modals = ['../Popups/Add_Vehicle.html', '../Popups/Deploy_Vehicle.html', '../Popups/Info_Vehicle.html', '../Popups/Info_VehicleDeployed.html'];
    const container = document.createElement('div');
    container.id = 'modals-container';
    document.body.appendChild(container);

    for (const file of modals) {
        try {
            const res = await fetch(`./${file}`);
            if (res.ok) {
                let html = await res.text();
                if (file.includes('Info_VehicleDeployed.html')) {
                    html = html.replace('id="deployVehicle"', 'id="infoDeployedVehicleModal"').replace('id="modalMapCard"', 'id="deployedInfoMapCard"');
                }
                if (file.includes('Deploy_Vehicle.html')) {
                    html = html.replace('id="modalMapCard"', 'id="deployMapCard"');
                }
                container.insertAdjacentHTML('beforeend', html);
            }
        } catch (error) { console.error(`Error loading popup ${file}:`, error); }
    }
}

// --- Fetch Firestore Users ---
async function fetchVerifiedUsers() {
    try {
        const querySnapshot = await getDocs(collection(firestore, "Info_User"));
        verifiedUsers = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            data.docId = doc.id; // Capture document ID for the BFV ID
            if (data.status === "Verified") verifiedUsers.push(data);
        });
    } catch (e) { console.error("Error fetching users: ", e); }
}

// --- RTDB Listeners & UI List ---
function listenToVehicles() {
    onValue(ref(db, "vehicles"), async (snapshot) => {
        const listContainer = document.querySelector(".vehicle-list");
        if (!listContainer) return;
        listContainer.innerHTML = "";
        clearMapMarkers();

        if (!snapshot.exists()) {
            allVehiclesData = {};
            return;
        }
        allVehiclesData = snapshot.val();
        const maps = await loadGoogleMaps();

        Object.keys(allVehiclesData).forEach((vKey) => {
            const v = allVehiclesData[vKey];
            const isDep = v.deployed;

            const item = document.createElement("div");
            item.className = `vehicle ${isDep ? "deployed" : "available"}`;
            item.setAttribute("data-id", vKey);
            item.innerHTML = `
                <div class="line"></div>
                <div class="content">
                    <div class="title">${escapeHTML(v.plateNo)} — ${escapeHTML(v.vehicleModel)}</div>
                    ${v.details ? `<div class="desc">${escapeHTML(v.details)}</div>` : ""}
                    <div class="meta">
                        <span class="badge">${isDep ? "◉ Deployed" : "● Available"}</span>
                        <span>${escapeHTML(v.vehicleColor)}</span>
                    </div>
                </div>
            `;
            listContainer.appendChild(item);

            if (v.currentLoc && typeof v.currentLoc.lat === "number") {
                const mOpts = { position: v.currentLoc, map: vehicleMap, title: v.plateNo };
                const marker = (maps.marker && maps.marker.AdvancedMarkerElement) ? new maps.marker.AdvancedMarkerElement(mOpts) : new maps.Marker(mOpts);
                activeMarkers.push(marker);
            }
        });
    });
}
function clearMapMarkers() { activeMarkers.forEach((m) => (m.map = null)); activeMarkers = []; }

// --- Popup Interactions ---
function setupAllModals() {
    setupAddVehicle();
    setupDeployVehicle();

    document.querySelector(".vehicle-list").addEventListener("click", (e) => {
        const item = e.target.closest(".vehicle");
        if (!item) return;
        const vId = item.getAttribute("data-id");
        allVehiclesData[vId].deployed ? openDeployedInfo(allVehiclesData[vId], vId) : openAvailableInfo(allVehiclesData[vId], vId);
    });

    document.querySelectorAll(".modal-overlay").forEach(modal => {
        modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    });
}

// === A. ADD VEHICLE LOGIC ===
function setupAddVehicle() {
    const modal = document.getElementById("addVehicleModal");
    document.getElementById("openAddVehicleBtn")?.addEventListener("click", (e) => { e.preventDefault(); modal.style.display = "flex"; });
    document.getElementById("cancelAddVehicleBtn")?.addEventListener("click", () => modal.style.display = "none");

    document.getElementById("confirmAddVehicleBtn")?.addEventListener("click", async () => {
        const plate = document.getElementById("addPlateNo").value.trim().toUpperCase();
        if (!plate) return showToast("Plate number is required.", "error");
        try {
            await set(ref(db, `vehicles/${plate.replace(/\s+/g, "")}`), {
                plateNo: plate, vehicleModel: document.getElementById("addModel").value.trim(),
                vehicleColor: document.getElementById("addColor").value.trim(), capacity: parseInt(document.getElementById("addCapacity").value) || 0,
                deployed: false, currentLoc: stationCenter, addedBy: "Admin", addedOn: new Date().toISOString(), details: "", contactPerson: "", targetLoc: ""
            });
            modal.style.display = "none"; // Close first so the toast reads as confirmation, not an interruption
            showToast("Vehicle added.");
        } catch (err) {
            console.error("Failed to add vehicle:", err);
            showToast("Couldn't add vehicle.", "error");
        }
    });
}

// === B. DEPLOY VEHICLE LOGIC (Google Maps Routes Library & Firestore) ===
function setupDeployVehicle() {
    const modal = document.getElementById("deployVehicle");
    let deployMap, routeLib, markerLib, destMarker, addressAutocomplete;
    let selectedVehicleLoc = stationCenter;
    let selectedAddress = "";   // Human-readable label only — never used as coordinates
    let selectedDestLoc = null; // Real {lat,lng} — the only thing that ever drives the pin/route
    let routePolylines = [];

    document.getElementById("openDeployVehicleBtn")?.addEventListener("click", async (e) => {
        e.preventDefault();
        const select = document.getElementById("deployVehicleSelect");
        select.innerHTML = '<option value="">Select a vehicle...</option>';
        Object.keys(allVehiclesData).forEach(id => {
            if (!allVehiclesData[id].deployed) select.innerHTML += `<option value="${id}">${allVehiclesData[id].plateNo}</option>`;
        });

        // Reset inputs and destination state each time the modal opens
        const callerInput = document.getElementById("callerInput");
        if(callerInput) {
            callerInput.value = "";
            delete callerInput.dataset.userid;
        }

        setSelectedAddress("");
        selectedDestLoc = null;
        clearRoute();
        if (destMarker) { destMarker.map = null; destMarker = null; }

        modal.style.display = "flex";

        // Initialize Map & Libraries (dynamic imports pull in whichever libs are needed)
        const maps = await loadGoogleMaps();
        const placesLib = await maps.importLibrary("places");
        routeLib = await maps.importLibrary("routes");
        markerLib = await maps.importLibrary("marker");

        if (!deployMap) {
            deployMap = new maps.Map(document.getElementById("deployMapCard"), {
                center: stationCenter, zoom: 14, disableDefaultUI: true, mapId: MAP_ID
            });

            // --- New Place Autocomplete widget (replaces google.maps.places.Autocomplete) ---
            addressAutocomplete = new placesLib.PlaceAutocompleteElement({
                componentRestrictions: { country: "ph" }
            });
            addressAutocomplete.id = "deployAddressInput";
            const addressContainer = document.getElementById("deployAddressContainer");
            addressContainer.innerHTML = "";
            addressContainer.appendChild(addressAutocomplete);

            addressAutocomplete.addEventListener("gmp-select", async ({ placePrediction }) => {
                const place = placePrediction.toPlace();
                await place.fetchFields({ fields: ["location", "formattedAddress"] });
                const loc = { lat: place.location.lat(), lng: place.location.lng() };
                setSelectedAddress(place.formattedAddress || "");
                setDestination(loc);
            });

            // Map click is the primary, always-accurate way to set the destination
            const geocoder = new maps.Geocoder();
            deployMap.addListener("click", (e) => {
                const loc = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                setDestination(loc);
                // Reverse geocode just to fill in a human-readable label
                geocoder.geocode({ location: e.latLng }, (results, status) => {
                    if (status === "OK" && results[0]) setSelectedAddress(results[0].formatted_address);
                });
            });
        }
    });

    // Update start loc when vehicle selected
    document.getElementById("deployVehicleSelect")?.addEventListener("change", (e) => {
        if (e.target.value) selectedVehicleLoc = allVehiclesData[e.target.value].currentLoc || stationCenter;
    });

    // Helper: track + display the chosen destination label
    function setSelectedAddress(addr) {
        selectedAddress = addr || "";
        const readout = document.getElementById("deploySelectedAddress");
        if (readout) readout.textContent = selectedAddress;
    }

    // Helper: set the real destination coordinates and update the pin + route to match
    function setDestination(loc) {
        if (!isValidLatLng(loc)) {
            console.warn("setDestination: ignored invalid location", loc);
            clearDestination();
            return;
        }
        selectedDestLoc = loc;
        if (destMarker) destMarker.map = null;
        destMarker = dropPin(markerLib, deployMap, loc);
        clearRoute();
        computeAndDrawRoute(routeLib, deployMap, selectedVehicleLoc, loc).then(p => routePolylines = p);
    }

    // Helper: clear the pin + route when there's no real destination to show
    function clearDestination() {
        selectedDestLoc = null;
        if (destMarker) { destMarker.map = null; destMarker = null; }
        clearRoute();
    }

    function clearRoute() {
        routePolylines.forEach(p => p.setMap(null));
        routePolylines = [];
    }

    // User Search Dropdown
    const callerInput = document.getElementById("callerInput");
    const callerDropdown = document.getElementById("callerDropdown");

    callerInput?.addEventListener("input", (e) => {
        // Clear saved user ID dataset if the user modifies the input manually
        delete e.target.dataset.userid; 

        const val = e.target.value.toLowerCase();
        callerDropdown.innerHTML = "";
        if (!val) { callerDropdown.style.display = "none"; return; }

        const matches = verifiedUsers.filter(u => `${u.fName} ${u.lName}`.toLowerCase().includes(val));
        if (matches.length > 0) {
            callerDropdown.style.display = "block";
            matches.forEach(m => {
                const div = document.createElement("div");
                div.innerHTML = `<span class="title">${m.fName} ${m.lName}</span><span class="sub">${m.contactMain}</span>`;
                div.onclick = async () => {
                    callerInput.value = `${m.fName} ${m.lName}`;
                    
                    // Bind the BFV-26-**** userID to the dataset for database extraction
                    callerInput.dataset.userid = m.userID || m.docId || ""; 
                    callerDropdown.style.display = "none";

                    // Firestore GeoPoint exposes .latitude / .longitude, but never trust
                    // it blindly — validate as real finite numbers before touching the map.
                    // If it's missing or malformed, we do NOT use the user's position at all.
                    const lat = Number(m.pinLocation?.latitude);
                    const lng = Number(m.pinLocation?.longitude);
                    const hasValidPin = Number.isFinite(lat) && Number.isFinite(lng);

                    if (hasValidPin) {
                        setSelectedAddress(m.address || "Saved Pin Location");
                        setDestination({ lat, lng });
                    } else if (m.address) {
                        // m.address is just text typed by the user at signup — it is NOT
                        // coordinates, so we don't geocode it or drop a pin from it. Just
                        // show it as a label and let the map (click / search) set the real spot.
                        setSelectedAddress(m.address);
                        clearDestination();
                    } else {
                        setSelectedAddress("");
                        clearDestination();
                    }
                };
                callerDropdown.appendChild(div);
            });
        } else {
            callerDropdown.style.display = "none";
        }
    });

    // Close logic
    document.getElementById("cancelDeployBtn").onclick = () => { modal.style.display = "none"; };

    // Deploy logic
    document.getElementById("confirmDeployBtn").onclick = async () => {
        const vId = document.getElementById("deployVehicleSelect").value;
        if (!vId) return showToast("Select a vehicle first.", "error");

        // Attempt to extract the BFV ID from the dataset, fallback to value if they typed manually
        const callerInputElem = document.getElementById("callerInput");
        const contactToSave = callerInputElem.dataset.userid || callerInputElem.value;

        try {
            await update(ref(db, `vehicles/${vId}`), {
                deployed: true,
                contactPerson: contactToSave,
                targetLoc: selectedAddress,
                targetLocCoords: selectedDestLoc, // real {lat,lng} if we have one, else null
                details: document.getElementById("deployDetailsInput").value
            });
            modal.style.display = "none"; // Close first so the toast reads as confirmation, not an interruption
            showToast("Vehicle deployed.");
        } catch (err) {
            console.error("Failed to deploy vehicle:", err);
            showToast("Couldn't deploy vehicle.", "error");
        }
    };
}

// === C. INFO & REMOVE VEHICLE LOGIC ===
function openAvailableInfo(v, vId) {
    const modal = document.getElementById("infoVehicle");
    const inputs = modal.querySelectorAll(".input");
    inputs[0].value = v.plateNo; inputs[1].value = v.vehicleModel;
    inputs[2].value = v.vehicleColor; inputs[3].value = v.capacity;
    modal.style.display = "flex";

    modal.querySelector(".button.delete").onclick = async () => {
        if (!confirm(`Remove ${v.plateNo}?`)) return;
        try {
            await remove(ref(db, `vehicles/${vId}`));
            modal.style.display = "none"; // Close first so the toast reads as confirmation
            showToast("Vehicle removed.");
        } catch (err) {
            console.error("Failed to remove vehicle:", err);
            showToast("Couldn't remove vehicle.", "error");
        }
    };
    modal.querySelector(".button.accept").onclick = async () => {
        try {
            await update(ref(db, `vehicles/${vId}`), {
                plateNo: inputs[0].value, vehicleModel: inputs[1].value,
                vehicleColor: inputs[2].value, capacity: parseInt(inputs[3].value) || 0
            });
            modal.style.display = "none";
            showToast("Changes saved.");
        } catch (err) {
            console.error("Failed to update vehicle:", err);
            showToast("Couldn't save changes.", "error");
        }
    };
}

let deployedInfoMap = null; // Reused across opens of the deployed-info modal
let deployedInfoMarkers = [];
let deployedInfoPolylines = [];

async function openDeployedInfo(v, vId) {
    const modal = document.getElementById("infoDeployedVehicleModal");

    // Populate the info table with the vehicle's actual data
    setText("deployedInfoPlate", v.plateNo);
    setText("deployedInfoModel", v.vehicleModel);
    setText("deployedInfoColor", v.vehicleColor);
    setText("deployedInfoCapacity", v.capacity);
    setText("deployedInfoContact", v.contactPerson);
    setText("deployedInfoAddress", v.targetLoc);
    setText("deployedInfoDetails", v.details);

    modal.style.display = "flex";

    // Clear whatever was drawn for the previously-viewed vehicle
    deployedInfoMarkers.forEach(m => { if (m) m.map = null; });
    deployedInfoMarkers = [];
    deployedInfoPolylines.forEach(p => p.setMap(null));
    deployedInfoPolylines = [];

    const maps = await loadGoogleMaps();
    const markerLib = await maps.importLibrary("marker");
    const routeLib = await maps.importLibrary("routes");
    const currentLoc = v.currentLoc || stationCenter;

    if (!deployedInfoMap) {
        deployedInfoMap = new maps.Map(document.getElementById("deployedInfoMapCard"), {
            center: currentLoc, zoom: 14, disableDefaultUI: true, mapId: MAP_ID
        });
    } else {
        deployedInfoMap.setCenter(currentLoc);
    }

    // The vehicle's currentLoc is always real coordinates — always show it.
    if (isValidLatLng(currentLoc)) {
        deployedInfoMarkers.push(dropPin(markerLib, deployedInfoMap, currentLoc, "#1A73E8", "#0B4EA2"));
    }

    // Only draw a destination pin/route if we actually captured real coordinates for it
    // (map click, resolved address search, or a contact's saved pinLocation). A plain
    // address string is never treated as a location.
    if (isValidLatLng(v.targetLocCoords)) {
        deployedInfoMarkers.push(dropPin(markerLib, deployedInfoMap, v.targetLocCoords));
        deployedInfoPolylines = await computeAndDrawRoute(routeLib, deployedInfoMap, currentLoc, v.targetLocCoords);
    }

    modal.querySelector(".button.accept").onclick = async () => {
        if (!confirm(`Recall ${v.plateNo}?`)) return;
        try {
            await update(ref(db, `vehicles/${vId}`), { deployed: false, details: "", targetLoc: "", targetLocCoords: null, contactPerson: "" });
            modal.style.display = "none"; // Close first so the toast reads as confirmation
            showToast("Vehicle recalled.");
        } catch (err) {
            console.error("Failed to recall vehicle:", err);
            showToast("Couldn't recall vehicle.", "error");
        }
    };
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = (value === undefined || value === null || value === "") ? "—" : value;
}

function escapeHTML(str) { return str ? String(str).replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t)) : ""; }