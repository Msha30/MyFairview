const callerData = [
    { title: "Mary Ann Sanlo", 
        sub: "Blk 0 Lot 0 Lorem ipsum dolor sit amet, Fairview, Quezon City" },
    { title: "Mary Ann Dela Cruz", 
        sub: "Blk 0 Lot 0 Lorem ipsum dolor sit amet, Fairview, Quezon City" },
    { title: "John Doe", 
        sub: "Blk 0 Lot 0 Lorem ipsum dolor sit amet, Fairview, Quezon City" },
    { title: "Jane Smith", 
        sub: "Blk 0 Lot 0 Lorem ipsum dolor sit amet, Fairview, Quezon City" }
];

const input = document.getElementById("callerInput");
const dropdown = document.getElementById("callerDropdown");
const box = document.getElementById("callerSearchBox");

input.addEventListener("input", function () {
    const value = this.value.toLowerCase();
    dropdown.innerHTML = "";

    if (!value) {
        dropdown.style.display = "none";
        return;
    }

    const filtered = callerData.filter(item =>
        item.title.toLowerCase().includes(value)
    );

    filtered.forEach(item => {
        const div = document.createElement("div");
        div.classList.add("item");

        div.innerHTML = `
            <span class="title">${item.title}</span>
            <span class="sub">${item.sub}</span>
        `;

        div.addEventListener("click", () => {
            input.value = item.title;
            dropdown.style.display = "none";
        });

        dropdown.appendChild(div);
    });

    dropdown.style.display = filtered.length ? "block" : "none";
});

// close dropdown when clicking outside
document.addEventListener("click", (e) => {
    if (!box.contains(e.target)) {
        dropdown.style.display = "none";
    }
});