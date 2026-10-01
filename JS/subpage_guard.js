import { guardPage } from "./permissions.js";

if (window.self === window.top) {
    // Opened directly (not inside MainLayout's iframe): send it through the layout
    const currentPage = window.location.pathname.split("/").pop();

    if (currentPage) {
        window.location.replace(`../MainLayout.html?page=${currentPage}`);
    }
} else {
    // Inside the layout: enforce this staff member's permissions for this page
    guardPage();
}