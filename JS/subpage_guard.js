if (window.self === window.top) {
    // get the current page name from the URL
    const currentPage = window.location.pathname.split("/").pop();

    // Redirect
    if (currentPage) {
        window.location.replace(`../MainLayout.html?page=${currentPage}`);
    }
}