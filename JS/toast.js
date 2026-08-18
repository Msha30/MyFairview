// Small, dependency-free toast so save/delete feedback doesn't block the UI
// the way alert() does. Call showToast() AFTER closing a modal so the user
// sees the popup dismiss and then a confirmation that the action landed.

let container = null;

function ensureContainer() {
    if (container) return container;
    container = document.createElement("div");
    container.id = "mfv-toast-container";
    container.style.cssText = `
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        display: flex; flex-direction: column; gap: 8px; z-index: 9999;
        align-items: center; pointer-events: none;
    `;
    document.body.appendChild(container);
    return container;
}

export function showToast(message, type = "success") {
    const box = ensureContainer();
    const toast = document.createElement("div");
    toast.textContent = message;
    const bg = type === "error" ? "#D93025" : "#1E8E3E";
    toast.style.cssText = `
        background: ${bg}; color: #fff; padding: 10px 18px; border-radius: 8px;
        font-family: inherit; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.18);
        opacity: 0; transform: translateY(8px); transition: opacity .2s ease, transform .2s ease;
        max-width: 320px; text-align: center;
    `;
    box.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
    });
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(8px)";
        setTimeout(() => toast.remove(), 200);
    }, 2400);
}