const svg = document.getElementById("waterchart");

svg.setAttribute("viewBox", "0 0 700 120");
svg.setAttribute("preserveAspectRatio", "none");

const points = [
    [34,30], [94,32], [154,38], [214,42], [274,40],
    [334,35], [394,28], [454,33], [514,36],
    [574,38], [634,34], [694,33]
];

// Create polyline string
const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");

polyline.setAttribute(
    "points",
    points.map(p => p.join(",")).join(" ")
);

polyline.setAttribute("fill", "none");
polyline.setAttribute("stroke", "var(--blue)");
polyline.setAttribute("stroke-width", "3");
polyline.setAttribute("stroke-linejoin", "round");

svg.appendChild(polyline);

// Create dots
points.forEach(p => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", p[0]);
    circle.setAttribute("cy", p[1]);
    circle.setAttribute("r", "4");
    circle.setAttribute("fill", "var(--blue)");
    svg.appendChild(circle);
});

// Y-axis labels
const yLabels = [
    { text: "30 ft", y: 10 },
    { text: "20 ft", y: 42 },
    { text: "10 ft", y: 74 },
    { text: "0 ft",  y: 106 }
];

yLabels.forEach(label => {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", 0);
    t.setAttribute("y", label.y);
    t.setAttribute("fill", "var(--blue)");
    t.setAttribute("font-size", "var(--textsmall)");
    t.textContent = label.text;
    svg.appendChild(t);
});

// X-axis labels
const xLabels = [
    "Jan 1","Jan 8","Jan 15","Jan 22","Jan 29",
    "Feb 5","Feb 12","Feb 19","Feb 26","Mar 5","Mar 12","Mar 19"
];

xLabels.forEach((label, i) => {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", 26 + i * 60);
    t.setAttribute("y", 115);
    t.setAttribute("fill", "var(--blue)");
    t.setAttribute("font-size", "var(--textsmall)");
    t.textContent = label;
    svg.appendChild(t);
});