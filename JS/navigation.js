/**
 * navigation.js
 * Handles sidebar navigation: switching pages, active states,
 * and persisting the current page via sessionStorage.
 */

(function () {
  'use strict';

  // ── Page map: data-page value → section element ID ─────
  const pageMap = {
    overview:      'pageOverview',
    announcement:  'pageAnnouncement',
    citizens:      'pageCitizens',
    vehicles:      'pageVehicles',
    surveillance:  'pageSurveillance',
    reports:       'pageReports',
    waterLevel:    'pageWaterLevel',
    evacuation:    'pageEvacuation',
  };

  const SESSION_KEY = 'mfv_currentPage';

  // ── Navigate to a page by key ───────────────────────────
  function navigateTo(pageKey) {
    if (!pageMap[pageKey]) return;

    // Hide all sections
    Object.values(pageMap).forEach((sectionId) => {
      const el = document.getElementById(sectionId);
      if (el) el.classList.remove('active');
    });

    // Show target section
    const target = document.getElementById(pageMap[pageKey]);
    if (target) target.classList.add('active');

    // Update nav item active state
    document.querySelectorAll('.sidebarNavItem').forEach((item) => {
      item.classList.remove('active');
    });

    const activeNav = document.querySelector(`[data-page="${pageKey}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Persist
    sessionStorage.setItem(SESSION_KEY, pageKey);
  }

  // ── Attach click listeners to all nav items ─────────────
  function initNavListeners() {
    document.querySelectorAll('.sidebarNavItem').forEach((item) => {
      item.addEventListener('click', () => {
        const pageKey = item.getAttribute('data-page');
        if (pageKey) navigateTo(pageKey);
      });
    });
  }

  // ── Sign out ─────────────────────────────────────────────
  function initSignOut() {
    const btnSignOut = document.getElementById('btnSignOut');
    if (btnSignOut) {
      btnSignOut.addEventListener('click', () => {
        sessionStorage.removeItem(SESSION_KEY);
        window.location.href = 'Login.html';
      });
    }
  }

  // ── Restore page on load ─────────────────────────────────
  function restorePage() {
    const saved = sessionStorage.getItem(SESSION_KEY) || 'overview';
    navigateTo(saved);
  }

  // ── Init ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    initNavListeners();
    initSignOut();
    restorePage();
  });

  // Expose globally so other scripts can navigate
  window.mfvNavigateTo = navigateTo;

})();
