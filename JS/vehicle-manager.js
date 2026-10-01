import { getDatabase, ref, onValue, get, set, remove, update } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-database.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { initCardMap } from "./gmapComponent.js";
import { loadGoogleMaps } from "./gmaps.js";
import { database, app } from "./auth.js";
import { isValidLatLng, dropPin, computeAndDrawRoute, fitMapToPositions } from "./map-helper.js";
import { showToast } from "./toast.js";
import { writeLog } from "./logging.js";
import { getChanges, describeChanges, setApplyState } from "./edit-tracker.js";
import { confirmChanges, confirmDelete, confirmAction } from "./dialogs.js";

const db = database;
const firestore = getFirestore(app);

let vehicleMap = null;
let activeMarkers = [];
let activePolylines = [];
let allVehiclesData = {};
let verifiedUsers = [];
const stationCenter = { lat: 14.6760, lng: 121.0437 };
const MAP_ID = "MYFAIRVIEW_MAP_ID";

document.addEventListener("DOMContentLoaded", async () => {
    await loadExternalModals();
    vehicleMap = await initCardMap("vehicleMapCard", stationCenter, 14, []);
    listenToVehicles();
    fetchVerifiedUsers();
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
            data.docId = doc.id;
            if (data.status === "Verified") verifiedUsers.push(data);
        });
    } catch (e) { console.error("Error fetching users: ", e); }
}

// --- RTDB Listeners & Main Vehicle Map ---
let vehicleMapFitted = false;

let liveVehicleMarkers = {};
let liveDestMarkers = {};
let livePolylines = {};
let lastTargetCoords = {};

function listenToVehicles() {
    onValue(ref(db, "vehicles"), async (snapshot) => {
        const listContainer = document.querySelector(".vehicle-list");
        if (!listContainer) return;

        if (!snapshot.exists()) {
            allVehiclesData = {};
            listContainer.innerHTML = "";
            clearMapMarkers();
            return;
        }
        
        allVehiclesData = snapshot.val();
        const maps = await loadGoogleMaps();
        const markerLib = await maps.importLibrary("marker");
        const routeLib = await maps.importLibrary("routes");

        const sortedEntries = Object.entries(allVehiclesData).sort(([keyA, a], [keyB, b]) => {
            const depA = a.deployed ? 1 : 0;
            const depB = b.deployed ? 1 : 0;
            if (depA !== depB) return depA - depB;
            const plateA = (a.plateNo || keyA).toString();
            const plateB = (b.plateNo || keyB).toString();
            return plateA.localeCompare(plateB);
        });

        const allPinPositions = [];
        const currentVehicleIds = new Set();

        for (const [vKey, v] of sortedEntries) {
            currentVehicleIds.add(vKey);
            const isDep = v.deployed;
            if (isValidLatLng(v.currentLoc)) allPinPositions.push(v.currentLoc);
            if (isDep && isValidLatLng(v.targetLocCoords)) allPinPositions.push(v.targetLocCoords);

            // ============================================================
            // 1. UPDATE LIST (Without Flashing)
            // ============================================================
            let item = listContainer.querySelector(`.vehicle[data-id='${vKey}']`);
            const statusHtml = `
                <span class="badge">${isDep ? "◉ Deployed" : "● Available"}</span>
                <span>${escapeHTML(v.vehicleColor)}</span>
            `;

            if (!item) {
                // Build it for the first time
                item = document.createElement("div");
                item.className = `vehicle ${isDep ? "deployed" : "available"}`;
                item.setAttribute("data-id", vKey);
                item.innerHTML = `
                    <div class="line"></div>
                    <div class="content">
                        <div class="title">${escapeHTML(v.plateNo)} — ${escapeHTML(v.vehicleModel)}</div>
                        ${v.details ? `<div class="desc">${escapeHTML(v.details)}</div>` : ""}
                        <div class="meta">${statusHtml}</div>
                    </div>
                `;
                listContainer.appendChild(item);
            } else {
                // Only update what changed to prevent UI flashing
                item.className = `vehicle ${isDep ? "deployed" : "available"}`;
                const metaDiv = item.querySelector(".meta");
                if (metaDiv.innerHTML !== statusHtml) metaDiv.innerHTML = statusHtml;
                
                let descDiv = item.querySelector(".desc");
                if (v.details) {
                    if (!descDiv) {
                        item.querySelector(".content").insertAdjacentHTML('beforeend', `<div class="desc">${escapeHTML(v.details)}</div>`);
                    } else if (descDiv.textContent !== v.details) {
                        descDiv.textContent = v.details;
                    }
                } else if (descDiv) {
                    descDiv.remove();
                }
            }

            // ============================================================
            // 2. UPDATE VEHICLE PINS
            // ============================================================
            if (isValidLatLng(v.currentLoc)) {
                if (liveVehicleMarkers[vKey]) {
                    // Update location smoothly instead of recreating
                    liveVehicleMarkers[vKey].position = v.currentLoc;
                } else {
                    const pinColor = isDep ? "#FF6D00" : "#34A853";
                    const pinBorder = isDep ? "#B34A00" : "#1E7E34";
                    const marker = dropPin(markerLib, vehicleMap, v.currentLoc, pinColor, pinBorder);
                    if (marker) {
                        const infoWindow = new google.maps.InfoWindow({
                            content: `
                                <div style="font-family: 'Inter', sans-serif; padding: 6px; color: #1a1a1a; min-width: 180px;">
                                    <strong style="font-size: 14px;">${escapeHTML(v.plateNo)}</strong><br/>
                                    <span style="font-size: 12px; color: #555;">${escapeHTML(v.vehicleModel)} • ${escapeHTML(v.vehicleColor)}</span><br/>
                                    <span style="font-size: 12px; color: #555;">Capacity: ${v.capacity}</span><br/>
                                    <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #eee; font-size: 12px;">
                                        <span style="font-weight: bold; color: ${isDep ? '#d32f2f' : '#2e7d32'};">
                                            ${isDep ? '◉ Deployed' : '● Available'}
                                        </span>
                                        ${isDep && v.contactPerson ? `<br/><b>Contact:</b> ${escapeHTML(v.contactPerson)}` : ''}
                                        ${isDep && v.targetLoc ? `<br/><b>To:</b> ${escapeHTML(v.targetLoc)}` : ''}
                                    </div>
                                </div>
                            `
                        });
                        marker.addListener("click", () => { infoWindow.open({ anchor: marker, map: vehicleMap }); });
                        liveVehicleMarkers[vKey] = marker;
                    }
                }
            }

            // ============================================================
            // 3. UPDATE DESTINATION PINS (Circles) & ROUTES
            // ============================================================
            if (isDep && isValidLatLng(v.targetLocCoords)) {
                // Only create/recalculate if the target location actually changed
                if (!lastTargetCoords[vKey] || JSON.stringify(lastTargetCoords[vKey]) !== JSON.stringify(v.targetLocCoords)) {
                    lastTargetCoords[vKey] = v.targetLocCoords;
                    
                    // Clear old target and route
                    if (liveDestMarkers[vKey]) liveDestMarkers[vKey].map = null;
                    if (livePolylines[vKey]) livePolylines[vKey].forEach(p => p.setMap(null));

                    // Make a circle instead of a vehicle pin
                    const circleDiv = document.createElement("div");
                    circleDiv.style.cssText = "width: 16px; height: 16px; background-color: #EA4335; border: 2px solid #B31412; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);";
                    
                    const destMarker = new markerLib.AdvancedMarkerElement({
                        map: vehicleMap,
                        position: v.targetLocCoords,
                        content: circleDiv,
                        title: `Target: ${v.plateNo}`
                    });
                    destMarker.addListener("click", () => {
                        const info = new google.maps.InfoWindow({ 
                            content: `
                                <div style="font-family: 'Inter', sans-serif; padding: 6px; color: #1a1a1a; min-width: 160px;">
                                    <strong style="font-size: 14px; color: #d32f2f;">📍 Destination</strong><br/>
                                    <div style="font-size: 12px; margin-top: 4px;">
                                        <b>Vehicle:</b> ${escapeHTML(v.plateNo)}<br/>
                                        <b>Address:</b> ${escapeHTML(v.targetLoc || 'Map Pin Location')}<br/>
                                        ${v.contactPerson ? `<b>Contact:</b> ${escapeHTML(v.contactPerson)}<br/>` : ''}
                                        ${v.details ? `<div style="margin-top:4px; padding-top:4px; border-top:1px solid #eee; color:#666;"><i>"${escapeHTML(v.details)}"</i></div>` : ''}
                                    </div>
                                </div>
                            ` 
                        });
                        info.open({ anchor: destMarker, map: vehicleMap });
                    });
                    
                    liveDestMarkers[vKey] = destMarker;

                    // Compute route
                    if (isValidLatLng(v.currentLoc)) {
                        const polylines = await computeAndDrawRoute(routeLib, vehicleMap, v.currentLoc, v.targetLocCoords);
                        if (polylines) livePolylines[vKey] = polylines;
                    }
                }
            } else {
                // Not deployed - wipe its target and route
                if (liveDestMarkers[vKey]) { liveDestMarkers[vKey].map = null; delete liveDestMarkers[vKey]; }
                if (livePolylines[vKey]) { livePolylines[vKey].forEach(p => p.setMap(null)); delete livePolylines[vKey]; }
                delete lastTargetCoords[vKey];
            }
        }

        // ============================================================
        // 4. CLEANUP REMOVED VEHICLES AND MAINTAIN SORT ORDER
        // ============================================================
        Array.from(listContainer.children).forEach(child => {
            const id = child.getAttribute("data-id");
            if (!currentVehicleIds.has(id)) child.remove(); // Remove UI element
        });
        
        Object.keys(liveVehicleMarkers).forEach(id => {
            if (!currentVehicleIds.has(id)) { // Remove map elements
                liveVehicleMarkers[id].map = null; delete liveVehicleMarkers[id];
                if (liveDestMarkers[id]) { liveDestMarkers[id].map = null; delete liveDestMarkers[id]; }
                if (livePolylines[id]) { livePolylines[id].forEach(p => p.setMap(null)); delete livePolylines[id]; }
                delete lastTargetCoords[id];
            }
        });

        // Re-append existing elements to smoothly force the correct sort order
        sortedEntries.forEach(([vKey, _]) => {
            const item = listContainer.querySelector(`.vehicle[data-id='${vKey}']`);
            if (item) listContainer.appendChild(item);
        });

        if (!vehicleMapFitted && allPinPositions.length > 0) {
            fitMapToPositions(vehicleMap, allPinPositions);
            vehicleMapFitted = true;
        }
    });
}

function clearMapMarkers() { 
    Object.values(liveVehicleMarkers).forEach(m => { if(m) m.map = null; });
    Object.values(liveDestMarkers).forEach(m => { if(m) m.map = null; });
    Object.values(livePolylines).forEach(polys => polys.forEach(p => p.setMap(null)));
    liveVehicleMarkers = {}; liveDestMarkers = {}; livePolylines = {}; lastTargetCoords = {};
}

// --- Popup Interactions ---
function setupAllModals() {
    setupAddVehicle();
    setupDeployVehicle();

    document.querySelector(".vehicle-list")?.addEventListener("click", (e) => {
        const item = e.target.closest(".vehicle");
        if (!item) return;
        const vId = item.getAttribute("data-id");
        if (!allVehiclesData[vId]) return;

        allVehiclesData[vId].deployed 
            ? openDeployedInfo(allVehiclesData[vId], vId) 
            : openAvailableInfo(allVehiclesData[vId], vId);
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
        // Validation Checks
        const plate = document.getElementById("addPlateNo").value.trim().toUpperCase();
        const model = document.getElementById("addModel").value.trim();
        const color = document.getElementById("addColor").value.trim();
        const capacity = parseInt(document.getElementById("addCapacity").value);

        if (!plate) return showToast("Plate number is required.", "error");
        if (!model) return showToast("Vehicle model is required.", "error");
        if (!color) return showToast("Vehicle color is required.", "error");
        if (isNaN(capacity) || capacity <= 0) return showToast("Capacity must be greater than 0.", "error");

        const currentStaffId = getActiveStaffID(); // Fetch the exact staffID

        try {
            await set(ref(db, `vehicles/${plate.replace(/\s+/g, "")}`), {
                plateNo: plate, 
                vehicleModel: model,
                vehicleColor: color, 
                capacity: capacity,
                deployed: false, 
                currentLoc: stationCenter, 
                addedBy: currentStaffId, // <--- SAVED AS STAFF ID
                addedOn: new Date().toISOString(), 
                details: "", 
                contactPerson: "", 
                targetLoc: "",
                targetLocCoords: null
            });
            
            // Clear inputs after success
            document.getElementById("addPlateNo").value = "";
            document.getElementById("addModel").value = "";
            document.getElementById("addColor").value = "";
            document.getElementById("addCapacity").value = "";

            modal.style.display = "none";
            showToast("Vehicle added.");
            writeLog("Add", "New Vehicle", plate, `Added vehicle ${plate} by ${currentStaffId}`);
        } catch (err) {
            console.error("Failed to add vehicle:", err);
            showToast("Couldn't add vehicle.", "error");
        }
    });
}

// === B. DEPLOY VEHICLE LOGIC (Google Maps Routes, Vehicle Pins, & Destination Pins) ===
function setupDeployVehicle() {
    const modal = document.getElementById("deployVehicle");
    let deployMap, routeLib, markerLib, destMarker, vehicleMarker, addressAutocomplete;
    let selectedVehicleLoc = stationCenter;
    let selectedAddress = "";
    let selectedDestLoc = null;
    let routePolylines = [];

    document.getElementById("openDeployVehicleBtn")?.addEventListener("click", async (e) => {
        e.preventDefault();
        const select = document.getElementById("deployVehicleSelect");
        select.innerHTML = '<option value="">Select a vehicle...</option>';
        Object.keys(allVehiclesData).forEach(id => {
            if (!allVehiclesData[id].deployed) select.innerHTML += `<option value="${id}">${allVehiclesData[id].plateNo}</option>`;
        });

        const callerInput = document.getElementById("callerInput");
        if (callerInput) {
            callerInput.value = "";
            delete callerInput.dataset.userid;
        }

        setSelectedAddress("");
        selectedDestLoc = null;
        clearRoute();
        if (destMarker) { destMarker.map = null; destMarker = null; }
        if (vehicleMarker) { vehicleMarker.map = null; vehicleMarker = null; }

        modal.style.display = "flex";

        const maps = await loadGoogleMaps();
        const placesLib = await maps.importLibrary("places");
        routeLib = await maps.importLibrary("routes");
        markerLib = await maps.importLibrary("marker");

        if (!deployMap) {
            deployMap = new maps.Map(document.getElementById("deployMapCard"), {
                center: stationCenter, zoom: 14, disableDefaultUI: true, mapId: MAP_ID
            });

            addressAutocomplete = new placesLib.PlaceAutocompleteElement({
                componentRestrictions: { country: "ph" }
            });
            addressAutocomplete.id = "deployAddressInput";
            const addressContainer = document.getElementById("deployAddressContainer");
            if (addressContainer) {
                addressContainer.innerHTML = "";
                addressContainer.appendChild(addressAutocomplete);
            }

            const handlePlaceSelect = async (e) => {
                const placePrediction = e.placePrediction || e.detail?.placePrediction;
                if (!placePrediction) return;
                const place = placePrediction.toPlace();
                await place.fetchFields({ fields: ["location", "formattedAddress"] });
                const loc = { lat: place.location.lat(), lng: place.location.lng() };
                setSelectedAddress(place.formattedAddress || "");
                setDestination(loc);
            };

            addressAutocomplete.addEventListener("gmp-placeselect", handlePlaceSelect);
            addressAutocomplete.addEventListener("gmp-select", handlePlaceSelect);

            const geocoder = new maps.Geocoder();
            deployMap.addListener("click", (e) => {
                const loc = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                setDestination(loc);
                geocoder.geocode({ location: e.latLng }, (results, status) => {
                    if (status === "OK" && results && results[0]) setSelectedAddress(results[0].formatted_address);
                });
            });
        } else {
            deployMap.setCenter(stationCenter);
        }
    });

    // Update vehicle pin & route when a vehicle is selected from dropdown
    document.getElementById("deployVehicleSelect")?.addEventListener("change", (e) => {
        const selectedId = e.target.value;
        if (selectedId && allVehiclesData[selectedId]) {
            const vehicle = allVehiclesData[selectedId];
            selectedVehicleLoc = vehicle.currentLoc || stationCenter;

            // Render Blue Vehicle Pin
            if (vehicleMarker) vehicleMarker.map = null;
            vehicleMarker = dropPin(markerLib, deployMap, selectedVehicleLoc, "#1A73E8", "#0B4EA2");
            if (vehicleMarker) {
                const infoWindow = new google.maps.InfoWindow({
                    content: `<div style="font-family: sans-serif; padding: 4px;">
                                <strong>${escapeHTML(vehicle.plateNo)}</strong><br/>
                                <span style="font-size: 12px; color: #555;">${escapeHTML(vehicle.vehicleModel)} (${escapeHTML(vehicle.vehicleColor)})</span>
                              </div>`
                });

                vehicleMarker.addListener("click", () => {
                    infoWindow.open({ anchor: vehicleMarker, map: deployMap });
                });
            }

            fitDeployPins();

            // Re-calculate route if destination exists
            if (selectedDestLoc) {
                clearRoute();
                computeAndDrawRoute(routeLib, deployMap, selectedVehicleLoc, selectedDestLoc).then(p => routePolylines = p || []);
            }
        } else {
            if (vehicleMarker) { vehicleMarker.map = null; vehicleMarker = null; }
            clearRoute();
        }
    });

    function setSelectedAddress(addr) {
        selectedAddress = addr || "";
        const readout = document.getElementById("deploySelectedAddress");
        if (readout) readout.textContent = selectedAddress;
    }

    function fitDeployPins() {
        fitMapToPositions(deployMap, [vehicleMarker ? selectedVehicleLoc : null, selectedDestLoc]);
    }

    function setDestination(loc) {
        if (!isValidLatLng(loc)) {
            clearDestination();
            return;
        }
        selectedDestLoc = loc;
        if (destMarker) destMarker.map = null;

        // NEW: Render Red Target Circle
        const circleDiv = document.createElement("div");
        circleDiv.style.cssText = "width: 16px; height: 16px; background-color: #EA4335; border: 2px solid #B31412; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);";
        destMarker = new markerLib.AdvancedMarkerElement({
            map: deployMap,
            position: loc,
            content: circleDiv
        });
        destMarker.addListener("click", () => {
            const info = new google.maps.InfoWindow({ 
                content: `
                    <div style="font-family: 'Inter', sans-serif; padding: 6px; color: #1a1a1a; min-width: 140px;">
                        <strong style="font-size: 14px; color: #d32f2f;">📍 Target Area</strong><br/>
                        <div style="font-size: 12px; margin-top: 4px;">
                            <b>Address:</b> ${escapeHTML(selectedAddress || 'Custom Map Pin')}
                        </div>
                    </div>
                ` 
            });
            info.open({ anchor: destMarker, map: deployMap });
        });

        clearRoute();
        computeAndDrawRoute(routeLib, deployMap, selectedVehicleLoc, loc).then(p => routePolylines = p || []);
        fitDeployPins();
    }

    function clearDestination() {
        selectedDestLoc = null;
        if (destMarker) { destMarker.map = null; destMarker = null; }
        clearRoute();
    }

    function clearRoute() {
        routePolylines.forEach(p => { if (p) p.setMap(null); });
        routePolylines = [];
    }

    // User Search Dropdown
    const callerInput = document.getElementById("callerInput");
    const callerDropdown = document.getElementById("callerDropdown");

    callerInput?.addEventListener("input", (e) => {
        delete e.target.dataset.userid;
        const val = e.target.value.toLowerCase();
        if (!callerDropdown) return;
        callerDropdown.innerHTML = "";
        if (!val) { callerDropdown.style.display = "none"; return; }

        const matches = verifiedUsers.filter(u => `${u.fName} ${u.lName}`.toLowerCase().includes(val));
        if (matches.length > 0) {
            callerDropdown.style.display = "block";
            matches.forEach(m => {
                const div = document.createElement("div");
                div.innerHTML = `<span class="title">${escapeHTML(m.fName)} ${escapeHTML(m.lName)}</span><span class="sub">${escapeHTML(m.contactMain || '')}</span>`;
                div.onclick = async () => {
                    callerInput.value = `${m.fName} ${m.lName}`;
                    callerInput.dataset.userid = m.userID || m.docId || "";
                    callerDropdown.style.display = "none";

                    const lat = Number(m.pinLocation?.latitude);
                    const lng = Number(m.pinLocation?.longitude);
                    const hasValidPin = Number.isFinite(lat) && Number.isFinite(lng);

                    if (hasValidPin) {
                        setSelectedAddress(m.address || "Saved Pin Location");
                        setDestination({ lat, lng });
                    } else if (m.address) {
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

    document.getElementById("cancelDeployBtn")?.addEventListener("click", () => { modal.style.display = "none"; });

    document.getElementById("confirmDeployBtn")?.addEventListener("click", async () => {
        const vId = document.getElementById("deployVehicleSelect").value;
        
        // 1. Validate Vehicle Selection
        if (!vId) {
            return showToast("Please select a vehicle first.", "error");
        }

        // 2. Validate Destination / Map Pin
        if (!selectedDestLoc || !isValidLatLng(selectedDestLoc)) {
            return showToast("Please set a valid destination on the map.", "error");
        }

        // 3. Validate Contact Person
        const callerInputElem = document.getElementById("callerInput");
        const contactToSave = callerInputElem?.dataset.userid || callerInputElem?.value.trim() || "";
        
        if (!contactToSave) {
            return showToast("Please enter or select a contact person.", "error");
        }

        try {
            await update(ref(db, `vehicles/${vId}`), {
                deployed: true,
                contactPerson: contactToSave,
                targetLoc: selectedAddress,
                targetLocCoords: selectedDestLoc,
                details: document.getElementById("deployDetailsInput")?.value || ""
            });
            modal.style.display = "none";
            showToast("Vehicle deployed successfully.");
            writeLog("Verify", "Deployed Vehicle", vId, `Deployed ${vId} to ${contactToSave}`);
        } catch (err) {
            console.error("Failed to deploy vehicle:", err);
            showToast("Couldn't deploy vehicle.", "error");
        }
    });
}

// === C. INFO & REMOVE VEHICLE LOGIC ===
function openAvailableInfo(v, vId) {
    const modal = document.getElementById("infoVehicle");
    const inputs = modal.querySelectorAll(".input");
    inputs[0].value = v.plateNo || ""; inputs[1].value = v.vehicleModel || "";
    inputs[2].value = v.vehicleColor || ""; inputs[3].value = v.capacity || 0;
    
    // Inject Dynamic "Added on" and "Added by" details
    const addedOnEl = document.getElementById("infoVehicleAddedOn");
    const addedByEl = document.getElementById("infoVehicleAddedBy");
    if (addedOnEl) {
        const d = v.addedOn ? new Date(v.addedOn) : null;
        addedOnEl.textContent = (d && !isNaN(d)) 
            ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : "—";
    }
    if (addedByEl) addedByEl.textContent = v.addedBy || "—";

    modal.style.display = "flex";

    const VEHICLE_LABELS = { plateNo: "plate number", vehicleModel: "model", vehicleColor: "color", capacity: "capacity" };
    const readVehicle = () => ({ plateNo: inputs[0].value, vehicleModel: inputs[1].value, vehicleColor: inputs[2].value, capacity: inputs[3].value });
    const originalVehicle = readVehicle();
    const applyBtn = modal.querySelector(".button.accept");
    const deleteBtn = modal.querySelector(".button.delete");

    const refreshApply = () => setApplyState(applyBtn, getChanges(originalVehicle, readVehicle(), VEHICLE_LABELS).length > 0);
    inputs.forEach(i => { i.oninput = refreshApply; });
    refreshApply();

    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            // Trigger customized confirmation dialog instead of browser alert
            if (!(await confirmDelete({ id: vId, name: v.plateNo, type: "Vehicles", parent: modal }))) return;
            
            try {
                await remove(ref(db, `vehicles/${vId}`));
                modal.style.display = "none";
                showToast("Vehicle removed.");
                writeLog("Delete", "Removed Vehicle", vId, `Removed vehicle ${vId}`);
            } catch (err) {
                console.error("Failed to remove vehicle:", err);
                if (modal) modal.style.display = "flex";
                showToast("Couldn't remove vehicle.", "error");
            }
        };
    }

    if (applyBtn) {
        applyBtn.onclick = async () => {
            const changes = getChanges(originalVehicle, readVehicle(), VEHICLE_LABELS);
            if (changes.length === 0) { modal.style.display = "none"; return; }

            // Trigger customized confirmation dialog
            if (!(await confirmChanges("vehicle", modal))) return;
            if (modal) modal.style.display = "flex";

            // Validate edits before saving
            const newPlate = inputs[0].value.trim().toUpperCase();
            const newModel = inputs[1].value.trim();
            const newColor = inputs[2].value.trim();
            const newCap = parseInt(inputs[3].value);
            
            if (!newPlate || !newModel || !newColor || isNaN(newCap) || newCap <= 0) {
                 showToast("Please provide valid vehicle details.", "error");
                 return;
            }

            try {
                await update(ref(db, `vehicles/${vId}`), {
                    plateNo: newPlate, 
                    vehicleModel: newModel,
                    vehicleColor: newColor, 
                    capacity: newCap
                });
                modal.style.display = "none";
                showToast("Changes saved.");
                writeLog("Edit", "Edited Vehicle Info", vId, describeChanges(originalVehicle.plateNo || vId, changes));
            } catch (err) {
                console.error("Failed to update vehicle:", err);
                showToast("Couldn't save changes.", "error");
            }
        };
    }
}

let deployedInfoMap = null;
let deployedInfoMarkers = [];
let deployedInfoPolylines = [];
let deployedInfoInterval = null;
let deployedInfoObserver = null;

async function openDeployedInfo(v, vId) {
    const modal = document.getElementById("infoDeployedVehicleModal");

    renderDeployedInfo(v);
    modal.style.display = "flex";
    await drawDeployedMap(v, /* recenter */ true);

    // --- Keep the pin/route live while the popup stays open, polling
    // Realtime Database every 3s, instead of requiring a close + reopen. ---
    if (deployedInfoInterval) clearInterval(deployedInfoInterval);
    deployedInfoInterval = setInterval(async () => {
        try {
            const snap = await get(ref(db, `vehicles/${vId}`));
            if (!snap.exists()) return;
            const latestV = snap.val();
            renderDeployedInfo(latestV);
            await drawDeployedMap(latestV, /* recenter */ false);
        } catch (err) {
            console.error("Failed to refresh deployed vehicle info:", err);
        }
    }, 3000);

    // Stop polling whenever the popup closes, however that happens
    // (Recall button, clicking the overlay background, etc).
    if (deployedInfoObserver) deployedInfoObserver.disconnect();
    deployedInfoObserver = new MutationObserver(() => {
        if (modal.style.display === "none" && deployedInfoInterval) {
            clearInterval(deployedInfoInterval);
            deployedInfoInterval = null;
        }
    });
    deployedInfoObserver.observe(modal, { attributes: true, attributeFilter: ["style"] });

    const acceptBtn = modal.querySelector(".button.accept");
    if (acceptBtn) {
        acceptBtn.onclick = async () => {
            // Trigger customized confirmation dialog instead of browser alert
            const isConfirmed = await confirmAction({ 
                title: "Recall Vehicle", 
                message: `Are you sure you want to recall ${v.plateNo}?`, 
                confirmText: "Recall", 
                parent: modal 
            });
            
            if (!isConfirmed) return;

            try {
                await update(ref(db, `vehicles/${vId}`), { 
                    deployed: false, 
                    details: "", 
                    targetLoc: "", 
                    targetLocCoords: null, 
                    contactPerson: "" 
                });
                modal.style.display = "none";
                showToast("Vehicle recalled.");
                writeLog("Verify", "Recalled Vehicle", vId, `Recalled vehicle ${vId}`);
            } catch (err) {
                console.error("Failed to recall vehicle:", err);
                showToast("Couldn't recall vehicle.", "error");
            }
        };
    }
}

function renderDeployedInfo(v) {
    setText("deployedInfoPlate", v.plateNo);
    setText("deployedInfoModel", v.vehicleModel);
    setText("deployedInfoColor", v.vehicleColor);
    setText("deployedInfoCapacity", v.capacity);
    setText("deployedInfoContact", v.contactPerson);
    setText("deployedInfoAddress", v.targetLoc);
    setText("deployedInfoDetails", v.details);
}

async function drawDeployedMap(v, recenter) {
    deployedInfoMarkers.forEach(m => { if (m) m.map = null; });
    deployedInfoMarkers = [];
    deployedInfoPolylines.forEach(p => { if (p) p.setMap(null); });
    deployedInfoPolylines = [];

    const maps = await loadGoogleMaps();
    const markerLib = await maps.importLibrary("marker");
    const routeLib = await maps.importLibrary("routes");
    const currentLoc = v.currentLoc || stationCenter;

    let justCreated = false;
    if (!deployedInfoMap) {
        deployedInfoMap = new maps.Map(document.getElementById("deployedInfoMapCard"), {
            center: currentLoc, zoom: 14, disableDefaultUI: true, mapId: MAP_ID
        });
        justCreated = true;
    } else if (recenter) {
        deployedInfoMap.setCenter(currentLoc);
    }

    // On open, show both the vehicle and its destination. Live 3-second refreshes leave the view alone.
    if (recenter || justCreated) {
        fitMapToPositions(deployedInfoMap, [currentLoc, v.targetLocCoords]);
    }

    if (isValidLatLng(currentLoc)) {
        deployedInfoMarkers.push(dropPin(markerLib, deployedInfoMap, currentLoc, "#1A73E8", "#0B4EA2"));
    }

    if (isValidLatLng(v.targetLocCoords)) {
        // NEW: Render Red Target Circle
        const circleDiv = document.createElement("div");
        circleDiv.style.cssText = "width: 16px; height: 16px; background-color: #EA4335; border: 2px solid #B31412; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);";
        
        const targetPin = new markerLib.AdvancedMarkerElement({
            map: deployedInfoMap,
            position: v.targetLocCoords,
            content: circleDiv
        });
        
        // This is the missing listener!
        targetPin.addListener("click", () => {
            const info = new google.maps.InfoWindow({ 
                content: `
                    <div style="font-family: 'Inter', sans-serif; padding: 6px; color: #1a1a1a; min-width: 160px;">
                        <strong style="font-size: 14px; color: #d32f2f;">📍 Destination</strong><br/>
                        <div style="font-size: 12px; margin-top: 4px;">
                            <b>Address:</b> ${escapeHTML(v.targetLoc || 'Map Pin Location')}<br/>
                            ${v.contactPerson ? `<b>Contact:</b> ${escapeHTML(v.contactPerson)}<br/>` : ''}
                            ${v.details ? `<div style="margin-top:4px; padding-top:4px; border-top:1px solid #eee; color:#666;"><i>"${escapeHTML(v.details)}"</i></div>` : ''}
                        </div>
                    </div>
                ` 
            });
            info.open({ anchor: targetPin, map: deployedInfoMap });
        });
        
        deployedInfoMarkers.push(targetPin);
        
        deployedInfoPolylines = await computeAndDrawRoute(routeLib, deployedInfoMap, currentLoc, v.targetLocCoords) || [];
    }
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = (value === undefined || value === null || value === "") ? "—" : value;
}

function escapeHTML(str) { 
    return str ? String(str).replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t)) : ""; 
}

function getActiveStaffID() {
    try {
        const rawData = sessionStorage.getItem("userData") || localStorage.getItem("userData") || "{}";
        const staffData = JSON.parse(rawData);
        return staffData.staffID || "BFVS-26-00000"; // Fallback to a default ID if testing
    } catch (e) {
        return "BFVS-26-00000";
    }
}