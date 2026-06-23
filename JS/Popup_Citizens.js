function openInfoCitizens() {
    const modal = document.getElementById("infoCitizens");

    if (modal) {
        modal.style.display = "flex";
    }
}

function closeInfoCitizens() {
    const modal = document.getElementById("infoCitizens");

    if (modal) {
        modal.style.display = "none";
    }
}

// Close when clicking outside modal
document.addEventListener("click", function (e) {
    const modal = document.getElementById("infoCitizens");

    if (!modal) return;

    if (e.target === modal) {
        closeInfoCitizens();
    }
});