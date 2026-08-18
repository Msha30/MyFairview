import { loadGoogleMaps } from "./gmaps.js";

/**
 * Render a map inside a designated card div container.
 * @param {string} containerId - The ID of the div card element.
 * @param {Object} center - { lat, lng } map center coordinates.
 * @param {number} zoom - Map zoom scale.
 * @param {Array} markers - Array of markers: [{ lat, lng, title, snippet }]
 */
export async function initCardMap(containerId, center, zoom = 15, markers = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
        await loadGoogleMaps();

        // Officially supported asynchronous library imports
        const { Map } = await google.maps.importLibrary("maps");
        const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

        const map = new Map(container, {
            center: center,
            zoom: zoom,
            mapId: "MYFAIRVIEW_MAP_ID", // Required for AdvancedMarkerElement styling
            disableDefaultUI: false,
            zoomControl: true,
            streetViewControl: false
        });

        // Add pins using AdvancedMarkerElement
        markers.forEach(markerData => {
            const marker = new AdvancedMarkerElement({
                position: { lat: markerData.lat, lng: markerData.lng },
                map: map,
                title: markerData.title || ""
            });

            if (markerData.snippet) {
                const infoWindow = new google.maps.InfoWindow({
                    content: `<div style="font-family: 'Inter', sans-serif; padding: 4px;">
                                <strong>${markerData.title}</strong>
                                <p style="margin: 4px 0 0; font-size: 12px;">${markerData.snippet}</p>
                              </div>`
                });

                // AdvancedMarkerElement strictly requires 'gmp-click' on its DOM element
                marker.element.addEventListener("gmp-click", () => {
                    infoWindow.open({
                        anchor: marker,
                        map: map,
                    });
                });
            }
        })
        return map;
    } catch (err) {
        console.error("Failed to load Google Maps:", err);
        container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--grey);">Map failed to load.</div>`;
    }
}