function openModal(modalId) {
    const modal = document.getElementById(modalId);

    if (modal) {
        modal.style.display = "flex";
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);

    if (modal) {
        modal.style.display = "none";
    }
}

// Close when clicking outside any modal
document.addEventListener("click", function (e) {
    const modal = e.target.closest(".modal");

    if (e.target.classList.contains("modal")) {
        e.target.style.display = "none";
    }
});