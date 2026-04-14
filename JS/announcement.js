/**
 * announcement.js
 * Handles the Announcement page:
 *  - Add / remove media files
 *  - Post announcement (prepends to feed)
 *  - Cancel clears form
 *  - Feed search filter
 */

(function () {
  'use strict';

  let mediaFiles = [];   // Array of File objects added by user

  // ── Render media file list ───────────────────────────────
  function renderMediaList() {
    const list = document.getElementById('announcementMediaList');
    if (!list) return;

    list.innerHTML = mediaFiles.map((file, idx) => `
      <div class="mediaFileItem" data-media-idx="${idx}">
        <span class="mediaFileItemDrag">⋮⋮</span>
        <div class="mediaFileThumbnail"></div>
        <span class="mediaFileName">${file.name}</span>
        <button class="btnDeleteMedia" data-delete-idx="${idx}" title="Remove">🗑</button>
      </div>
    `).join('');

    // Attach delete button events
    list.querySelectorAll('.btnDeleteMedia').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-delete-idx'), 10);
        mediaFiles.splice(idx, 1);
        renderMediaList();
      });
    });
  }

  // ── Add Photos button ────────────────────────────────────
  function initAddPhotos() {
    const btnAddPhotos      = document.getElementById('btnAnnouncementAddPhotos');
    const announcementFileInput = document.getElementById('announcementFileInput');
    if (!btnAddPhotos || !announcementFileInput) return;

    btnAddPhotos.addEventListener('click', () => {
      announcementFileInput.click();
    });

    announcementFileInput.addEventListener('change', () => {
      const newFiles = Array.from(announcementFileInput.files);
      const remaining = 10 - mediaFiles.length;
      if (newFiles.length > remaining) {
        alert(`You can only add ${remaining} more photo(s). Maximum is 10.`);
        mediaFiles = [...mediaFiles, ...newFiles.slice(0, remaining)];
      } else {
        mediaFiles = [...mediaFiles, ...newFiles];
      }
      renderMediaList();
      announcementFileInput.value = ''; // Reset so same file can be re-added
    });
  }

  // ── Post announcement ────────────────────────────────────
  function initPost() {
    const btnPost   = document.getElementById('btnAnnouncementPost');
    const textarea  = document.getElementById('announcementTextInput');
    const feedList  = document.getElementById('announcementFeedList');
    if (!btnPost || !textarea || !feedList) return;

    btnPost.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (!text) {
        alert('Please enter announcement text before posting.');
        return;
      }

      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

      // Build image placeholders
      const imagesHtml = mediaFiles.length > 0
        ? `<div class="feedCardImages">${mediaFiles.slice(0, 3).map(() => '<div class="feedCardImage"></div>').join('')}</div>`
        : '';

      const cardHtml = `
        <div class="announcementFeedCard">
          <div class="feedCardHeader">
            <span class="feedCardTitle">New Announcement</span>
            <button class="btnRowMenu">⋮</button>
          </div>
          <p class="feedCardBody">${text}</p>
          ${imagesHtml}
          <div class="feedCardFooter">
            <span>Admin</span>
            <span>${today}</span>
          </div>
        </div>
        <hr class="feedCardDivider" />
      `;

      feedList.insertAdjacentHTML('afterbegin', cardHtml);

      // Clear form
      textarea.value = '';
      mediaFiles = [];
      renderMediaList();
    });
  }

  // ── Cancel button ────────────────────────────────────────
  function initCancel() {
    const btnCancel = document.getElementById('btnAnnouncementCancel');
    const textarea  = document.getElementById('announcementTextInput');
    if (!btnCancel || !textarea) return;

    btnCancel.addEventListener('click', () => {
      textarea.value = '';
      mediaFiles = [];
      renderMediaList();
    });
  }

  // ── Feed search ──────────────────────────────────────────
  function initFeedSearch() {
    const searchInput = document.getElementById('announcementFeedSearchInput');
    const feedList    = document.getElementById('announcementFeedList');
    if (!searchInput || !feedList) return;

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      feedList.querySelectorAll('.announcementFeedCard').forEach((card) => {
        const text = card.textContent.toLowerCase();
        card.style.display = !query || text.includes(query) ? '' : 'none';
      });
    });
  }

  // ── Init ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    renderMediaList();
    initAddPhotos();
    initPost();
    initCancel();
    initFeedSearch();
  });

})();
