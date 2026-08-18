// Shared helpers for anything that drops pins or draws routes on a Google Map.
// The rule everywhere in this app: only REAL coordinates (a map click, a resolved
// Place from search, or a saved GeoPoint) ever drive a marker or route. Free-text
// addresses are labels only and never get treated as a location.

export function isValidLatLng(loc) {
    return !!loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng);
}

export function dropPin(markerLib, map, location, color = "#EA4335", borderColor = "#B31412") {
    if (!isValidLatLng(location)) {
        console.warn("dropPin: ignored invalid location", location);
        return null;
    }
    const pin = new markerLib.PinElement({ background: color, borderColor, glyphColor: "#FFFFFF" });
    return new markerLib.AdvancedMarkerElement({ position: location, map, content: pin.element });
}

export async function computeAndDrawRoute(routeLib, map, start, end) {
    if (!isValidLatLng(start) || !isValidLatLng(end)) {
        console.warn("computeAndDrawRoute: ignored invalid start/end", start, end);
        return [];
    }
    try {
        const { Route } = routeLib;
        const { routes } = await Route.computeRoutes({ origin: start, destination: end, travelMode: "DRIVING", fields: ["path"] });
        if (!routes || !routes.length) {
            console.warn("No route found between the given points.");
            return [];
        }
        const polylines = routes[0].createPolylines();
        polylines.forEach(p => p.setMap(map));
        return polylines;
    } catch (err) {
        console.error("Failed to compute route:", err);
        return [];
    }
}

// Firestore GeoPoint -> plain {lat, lng}, validated as real numbers.
export function geopointToLatLng(gp) {
    if (!gp) return null;
    return { lat: Number(gp.latitude), lng: Number(gp.longitude) };
}