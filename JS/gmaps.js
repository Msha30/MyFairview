let initPromise = null;

export function loadGoogleMaps() {
    if (initPromise) {
        return initPromise;
    }

    initPromise = new Promise((resolve, reject) => {
        const g = window;

        const callbackName = "__myFairviewGoogleMapsReady";

        g[callbackName] = () => {
            if (window.google?.maps?.importLibrary) {
                resolve(window.google.maps);
            } else {
                reject(
                    new Error(
                        "Google Maps loaded, but importLibrary is unavailable."
                    )
                );
            }

            delete g[callbackName];
        };

        // Google Maps already initialized
        if (window.google?.maps?.importLibrary) {
            resolve(window.google.maps);
            return;
        }

        const script = document.createElement("script");

        const params = new URLSearchParams({
            key: "AIzaSyBohqcb-6HiNcstr_lnwBp7-pQY0iy5K_0",
            v: "weekly",
            loading: "async",
            callback: callbackName
        });

        script.src =
            `https://maps.googleapis.com/maps/api/js?${params.toString()}`;

        script.async = true;
        script.defer = true;

        script.onerror = () => {
            reject(new Error("Google Maps JavaScript API failed to load."));
            delete g[callbackName];
        };

        document.head.appendChild(script);
    });

    return initPromise;
}