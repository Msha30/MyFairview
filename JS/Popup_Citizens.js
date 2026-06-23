function openCitizenModal() {
    const modal = document.getElementById("citizenModal");

    if (modal) {
        modal.style.display = "flex";
    }
}

function closeCitizenModal() {
    const modal = document.getElementById("citizenModal");

    if (modal) {
        modal.style.display = "none";
    }
}

// Close when clicking outside modal
document.addEventListener("click", function (e) {
    const modal = document.getElementById("citizenModal");

    if (!modal) return;

    if (e.target === modal) {
        closeCitizenModal();
    }
});