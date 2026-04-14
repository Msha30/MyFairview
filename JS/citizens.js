/**
 * citizens.js
 * Handles the Citizens page:
 *  - Renders citizen table rows
 *  - Row click → detail modal popup
 *  - Click outside modal → close
 *  - Filter panel toggle
 *  - Search filtering
 *  - "Unverified Citizens" button → navigate to Citizens_InvalidUsers.html
 */

(function () {
  'use strict';

  // ── Sample citizen data ──────────────────────────────────
  const citizensData = [
    { surname: 'Reyes',     firstName: 'Maria',     middleName: 'Santos',    suffix: 'None', household: 4, contact: '0995 123 4567', dob: 'March 12, 1988',  address: '12 Sampaguita St, Fairview Heights', proof: 'Barangay Certificate', attachment: 'barangay_cert.pdf', regDate: 'January 5, 2025', verDate: 'January 10, 2025', verBy: 'Staff Cruz', id: 'PhilSys 1234-5678' },
    { surname: 'dela Cruz', firstName: 'Juan',      middleName: 'Lopez',     suffix: 'Jr.',  household: 6, contact: '0917 234 5678', dob: 'July 4, 1975',     address: '45 Rosal St, Greenview',            proof: 'Utility Bill',       attachment: 'utility_bill.jpg', regDate: 'February 2, 2025', verDate: 'February 8, 2025', verBy: 'Staff Lim', id: 'Drivers License' },
    { surname: 'Gonzales',  firstName: 'Ana',       middleName: 'Rivera',    suffix: 'None', household: 3, contact: '0908 345 6789', dob: 'November 20, 1992',address: '7 Mabini Ave, Ridgewood',           proof: 'Lease Contract',     attachment: 'lease.pdf',      regDate: 'March 15, 2025',   verDate: 'March 20, 2025',   verBy: 'Staff Torres', id: 'Passport' },
    { surname: 'Bautista',  firstName: 'Jose',      middleName: 'Mendoza',   suffix: 'III',  household: 7, contact: '0922 456 7890', dob: 'May 1, 1980',      address: '88 Rizal Blvd, Lakeside',          proof: 'Barangay Certificate',attachment: 'barangay2.pdf',  regDate: 'January 20, 2025', verDate: 'January 25, 2025', verBy: 'Staff Cruz', id: 'SSS ID' },
    { surname: 'Ramos',     firstName: 'Luz',       middleName: 'Castillo',  suffix: 'None', household: 2, contact: '0933 567 8901', dob: 'August 15, 1995',  address: '3 Pines St, Elmwood',              proof: 'Utility Bill',       attachment: 'utility2.jpg',   regDate: 'April 5, 2025',    verDate: 'April 10, 2025',   verBy: 'Staff Lim', id: 'PhilSys 2345-6789' },
    { surname: 'Flores',    firstName: 'Carlos',    middleName: 'Aquino',    suffix: 'None', household: 5, contact: '0944 678 9012', dob: 'December 3, 1983', address: '22 Orchid Lane, Fairview Heights',  proof: 'Barangay Certificate',attachment: 'barangay3.pdf',  regDate: 'May 12, 2025',     verDate: 'May 18, 2025',     verBy: 'Staff Torres', id: 'Drivers License' },
    { surname: 'Santos',    firstName: 'Rosa',      middleName: 'Villanueva',suffix: 'None', household: 4, contact: '0955 789 0123', dob: 'January 28, 1990', address: '9 Dahlia St, Greenview',           proof: 'Lease Contract',     attachment: 'lease2.pdf',     regDate: 'June 1, 2025',     verDate: 'June 6, 2025',     verBy: 'Staff Cruz', id: 'PhilSys 3456-7890' },
    { surname: 'Torres',    firstName: 'Miguel',    middleName: 'Bernardo',  suffix: 'Sr.',  household: 8, contact: '0966 890 1234', dob: 'September 9, 1960',address: '51 Acacia Ave, Ridgewood',         proof: 'Utility Bill',       attachment: 'utility3.jpg',   regDate: 'February 18, 2025',verDate: 'February 22, 2025',verBy: 'Staff Lim', id: 'Passport' },
    { surname: 'Lim',       firstName: 'Patricia',  middleName: 'Chan',      suffix: 'None', household: 3, contact: '0977 901 2345', dob: 'June 17, 1997',    address: '66 Cedar St, Lakeside',            proof: 'Barangay Certificate',attachment: 'barangay4.pdf',  regDate: 'March 30, 2025',   verDate: 'April 4, 2025',    verBy: 'Staff Torres', id: 'UMID' },
    { surname: 'Garcia',    firstName: 'Emmanuel',  middleName: 'Padilla',   suffix: 'None', household: 5, contact: '0988 012 3456', dob: 'April 22, 1972',   address: '34 Maple Drive, Elmwood',          proof: 'Lease Contract',     attachment: 'lease3.pdf',     regDate: 'January 8, 2025',  verDate: 'January 14, 2025', verBy: 'Staff Cruz', id: 'Drivers License' },
    { surname: 'Mendoza',   firstName: 'Claire',    middleName: 'Soriano',   suffix: 'None', household: 2, contact: '0999 123 4560', dob: 'February 11, 2001',address: '18 Jasmine St, Fairview Heights',  proof: 'Barangay Certificate',attachment: 'barangay5.pdf',  regDate: 'May 5, 2025',      verDate: 'May 9, 2025',      verBy: 'Staff Lim', id: 'PhilSys 4567-8901' },
    { surname: 'Villanueva',firstName: 'Roberto',   middleName: 'Reyes',     suffix: 'Jr.',  household: 6, contact: '0912 234 5670', dob: 'October 30, 1986', address: '77 Bamboo Rd, Greenview',          proof: 'Utility Bill',       attachment: 'utility4.jpg',   regDate: 'April 20, 2025',   verDate: 'April 28, 2025',   verBy: 'Staff Torres', id: 'SSS ID' },
    { surname: 'Aquino',    firstName: 'Teresa',    middleName: 'Guinto',    suffix: 'None', household: 3, contact: '0923 345 6780', dob: 'March 8, 1994',    address: '5 Sunflower Ct, Ridgewood',        proof: 'Lease Contract',     attachment: 'lease4.pdf',     regDate: 'June 15, 2025',    verDate: 'June 20, 2025',    verBy: 'Staff Cruz', id: 'Passport' },
    { surname: 'Castillo',  firstName: 'Fernando',  middleName: 'Navarro',   suffix: 'None', household: 4, contact: '0934 456 7891', dob: 'July 14, 1979',    address: '43 Palm St, Lakeside',             proof: 'Barangay Certificate',attachment: 'barangay6.pdf',  regDate: 'February 10, 2025',verDate: 'February 17, 2025',verBy: 'Staff Lim', id: 'PhilSys 5678-9012' },
    { surname: 'Cruz',      firstName: 'Maricel',   middleName: 'Espiritu',  suffix: 'None', household: 5, contact: '0945 567 8902', dob: 'August 25, 1988',  address: '29 Lotus Ave, Elmwood',            proof: 'Utility Bill',       attachment: 'utility5.jpg',   regDate: 'March 3, 2025',    verDate: 'March 9, 2025',    verBy: 'Staff Torres', id: 'Drivers License' },
  ];

  let filteredData = [...citizensData];

  // ── Render table rows ───────────────────────────────────
  function renderCitizensTable(data) {
    const tbody = document.getElementById('citizensTableBody');
    if (!tbody) return;

    tbody.innerHTML = data.map((citizen, idx) => `
      <tr class="rowClickable" data-citizen-idx="${idx}">
        <td>${citizen.surname}</td>
        <td>${citizen.firstName}</td>
        <td>${citizen.middleName}</td>
        <td>${citizen.suffix}</td>
        <td>${citizen.household}</td>
        <td>${citizen.contact}</td>
        <td><button class="btnRowMenu" data-no-row-click>⋮</button></td>
      </tr>
    `).join('');

    // Attach row click events
    tbody.querySelectorAll('tr.rowClickable').forEach((row) => {
      row.addEventListener('click', (e) => {
        // Don't open modal if the three-dot menu was clicked
        if (e.target.closest('[data-no-row-click]')) return;
        const idx = parseInt(row.getAttribute('data-citizen-idx'), 10);
        openCitizenModal(data[idx]);
      });
    });
  }

  // ── Open citizen detail modal ────────────────────────────
  function openCitizenModal(citizen) {
    document.getElementById('citizenDetailSurname').textContent    = citizen.surname;
    document.getElementById('citizenDetailFirstName').textContent  = citizen.firstName;
    document.getElementById('citizenDetailMiddleName').textContent = citizen.middleName;
    document.getElementById('citizenDetailSuffix').textContent     = citizen.suffix;
    document.getElementById('citizenDetailContact').textContent    = citizen.contact;
    document.getElementById('citizenDetailDOB').textContent        = citizen.dob;
    document.getElementById('citizenDetailID').textContent         = citizen.id;
    document.getElementById('citizenDetailAddress').textContent    = citizen.address;
    document.getElementById('citizenDetailProof').textContent      = citizen.proof;
    document.getElementById('citizenDetailAttachment').textContent = citizen.attachment;
    document.getElementById('citizenDetailRegDate').textContent    = citizen.regDate;
    document.getElementById('citizenDetailVerDate').textContent    = citizen.verDate;
    document.getElementById('citizenDetailVerBy').textContent      = citizen.verBy;

    const overlay = document.getElementById('citizenDetailOverlay');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // ── Close citizen detail modal ───────────────────────────
  function closeCitizenModal() {
    const overlay = document.getElementById('citizenDetailOverlay');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Click outside modal box → close ─────────────────────
  function initModalDismiss() {
    const overlay  = document.getElementById('citizenDetailOverlay');
    const modalBox = document.getElementById('citizenModalBox');
    if (!overlay || !modalBox) return;

    overlay.addEventListener('click', (e) => {
      if (!modalBox.contains(e.target)) {
        closeCitizenModal();
      }
    });
  }

  // ── Accordion (Household Members / Vehicle Information) ─
  function initAccordions() {
    ['accordionHouseholdHeader', 'accordionVehicleHeader'].forEach((headerId) => {
      const header = document.getElementById(headerId);
      if (!header) return;

      header.addEventListener('click', () => {
        const isOpen = header.classList.toggle('open');
        const bodyId = headerId.replace('Header', 'Body');
        const body   = document.getElementById(bodyId);
        if (body) body.classList.toggle('open', isOpen);
      });
    });
  }

  // ── Filter panel toggle ──────────────────────────────────
  function initFilterPanel() {
    const btnToggle = document.getElementById('btnCitizensFilterToggle');
    const btnClose  = document.getElementById('btnCitizensFilterClose');
    const panel     = document.getElementById('citizensFilterPanel');
    if (!btnToggle || !panel) return;

    btnToggle.addEventListener('click', () => {
      const isOpen = panel.classList.toggle('open');
      btnToggle.classList.toggle('active', isOpen);
    });

    if (btnClose) {
      btnClose.addEventListener('click', () => {
        panel.classList.remove('open');
        btnToggle.classList.remove('active');
      });
    }
  }

  // ── Search citizens ──────────────────────────────────────
  function initSearch() {
    const searchInput = document.getElementById('citizensSearchInput');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      if (!query) {
        filteredData = [...citizensData];
      } else {
        filteredData = citizensData.filter((c) =>
          `${c.surname} ${c.firstName} ${c.middleName} ${c.contact}`.toLowerCase().includes(query)
        );
      }
      renderCitizensTable(filteredData);
    });
  }

  // ── Unverified Citizens button → open Citizens_InvalidUsers.html ──
  function initUnverifiedBtn() {
    const btn = document.getElementById('btnCitizensUnverified');
    if (!btn) return;
    btn.addEventListener('click', () => {
      window.location.href = 'Citizens_InvalidUsers.html';
    });
  }

  // ── Apply filter button (stub) ───────────────────────────
  function initApplyFilter() {
    const btnApply = document.getElementById('btnCitizensApplyFilter');
    if (!btnApply) return;
    btnApply.addEventListener('click', () => {
      // TODO: apply filter logic based on radio values
      const selected = document.querySelector('input[name="filterHousehold"]:checked');
      const val      = selected ? selected.value : null;
      if (!val || val === 'custom') {
        renderCitizensTable(citizensData);
        return;
      }
      const ranges = { '1-3': [1, 3], '4-6': [4, 6], '7+': [7, 999] };
      const [min, max] = ranges[val] || [0, 999];
      filteredData = citizensData.filter((c) => c.household >= min && c.household <= max);
      renderCitizensTable(filteredData);
    });
  }

  // ── Export stub ──────────────────────────────────────────
  function initExport() {
    const btnExport = document.getElementById('btnCitizensExport1');
    if (!btnExport) return;
    btnExport.addEventListener('click', () => {
      alert('Export functionality coming soon.');
    });
  }

  // ── Init ─────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    renderCitizensTable(citizensData);
    initModalDismiss();
    initAccordions();
    initFilterPanel();
    initSearch();
    initUnverifiedBtn();
    initApplyFilter();
    initExport();
  });

})();
