// --------- Config keys ----------
const OWM_KEY = 'acb1cca3909af69db3b2b8a8512a873d'
const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
const GEO_BASE = 'https://api.openweathermap.org/geo/1.0';
const MAX_RECENT = 8;

let currentData = null;
let unit = 'C';
let recentCities = [];
let activeCtrl = null;


const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const locationBtn = document.getElementById('locationBtn');
const clearSearchBtn = document.getElementById('clearSearch');
const recentDropdown = document.getElementById('recentDropdown');
const recentList     = document.getElementById('recentList');
const clearRecentBtn = document.getElementById('clearRecent');
const btnC = document.getElementById('btnC');
const btnF = document.getElementById('btnF');

function attachEventListeners() {
    searchBtn.addEventListener('click', handleSearch)

    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleSearch();
        if (e.key === 'Escape') closeDropDown();
    });

    searchInput.addEventListener('input', () => {
        const val = searchInput.value.trim();
        clearSearchBtn.classList.toggle('hidden', val.length === 0);
        if(val.length === 0 && recentCities.length > 0) openDropdown();
        else closeDropDown()
    })

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim() === '' && recentCities.length > 0) openDropdown()
    })

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.classList.add('hidden');
        searchInput.focus();
        if (recentCities.length > 0) openDropdown();
        else closeDropDown()
    });

    // locationBtn.addEventListener('click', handleSearch);

    clearRecentBtn.addEventListener('click',e => {
        e.stopPropagation();
        recentCities = [];
        saveRecent()
        closeDropDown();
        showToast('Search history cleared')
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('#searchWrapper')) closeDropDown();
    })

    recentList.addEventListener('click', e => {
    const removeBtn = e.target.closest('[data-remove]');
    const item      = e.target.closest('[data-city]');
    if (removeBtn) {
      e.stopPropagation();
      removeRecent(removeBtn.dataset.remove);
      return;
    }
    if (item && !e.target.closest('.recent-item-remove')) {
      selectRecent(item.dataset.city);
    }
    });

    btnC.addEventListener('click', () => setUnit('C'));
    btnF.addEventListener('click', () => setUnit('F'));
}

// --------------- search & Validation ------------
function handleSearch() {
    const query = searchInput.value.trim();
    if(!query) {
        showInputError('Please enter a city name.')
        return;
    }
    if(query.length < 2) {
        showInputError('City name must be at least 2 characters.')
        return;
    }
    if (!/^[a-zA-Z\s,\-'\.À-ÖØ-öø-ÿ]+$/.test(query)){
        showInputError('Please enter a valid city name (letters only).')
        return;
    }
    closeDropDown();
    fetchWeather(query) 
}

// --------------- Unit Toggle ----------------
function setUnit(u) {
  unit = u;
  btnC.classList.toggle('active', u === 'C');
  btnF.classList.toggle('active', u === 'F');
  if (!currentData) return;
  const { current: c, forecast: f } = currentData;
  const isDay = c.dt > c.sys.sunrise && c.dt < c.sys.sunset;
  renderTemps(c, f);
  renderHourly(f, isDay);
  renderForecast(f);
  renderDetails(c, isDay);
}

// ------------ Recent Cities (sessionStorage) ---------------
function loadRecent() {
  try { recentCities = JSON.parse(sessionStorage.getItem('skypulse_recent') || '[]'); }
  catch { recentCities = []; }
}
function saveRecent() {
  sessionStorage.setItem('skypulse_recent', JSON.stringify(recentCities));
}
function addRecent(name, country) {
  recentCities = recentCities.filter(c => c.name.toLowerCase() !== name.toLowerCase());
  recentCities.unshift({ name, country });
  if (recentCities.length > MAX_RECENT) recentCities = recentCities.slice(0, MAX_RECENT);
  saveRecent();
  renderRecent();
}
function removeRecent(name) {
  recentCities = recentCities.filter(c => c.name !== name);
  saveRecent();

  if (recentCities.length === 0) {
    closeDropdown();
    return;
  }

  const li = recentList.querySelector(`[data-city="${CSS.escape(name)}"]`);
  if (li) {
    li.style.transition = 'opacity 0.15s, transform 0.15s';
    li.style.opacity    = '0';
    li.style.transform  = 'translateX(8px)';
    setTimeout(() => li.remove(), 150);
  }
}

function renderRecent() {
  if (recentCities.length === 0) { closeDropdown(); return; }
  recentList.innerHTML = buildRecentHTML();
}


function buildRecentHTML() {
  return recentCities.map(c => `
    <li class="recent-item" role="option" data-city="${escHtml(c.name)}" data-country="${escHtml(c.country)}">
      <span class="recent-item-icon">🕐</span>
      <span class="recent-item-name">${escHtml(c.name)}, ${escHtml(c.country)}</span>
      <button class="recent-item-remove" data-remove="${escHtml(c.name)}" title="Remove" aria-label="Remove ${escHtml(c.name)}">✕</button>
    </li>
  `).join('');
}

// --------------- Dropdown ------------

function openDropdown() {
    if (recentCities.length === 0) return;
    renderRecent();
    recentDropdown.classList.remove('hidden');
}

function closeDropDown() {
    recentDropdown.classList.add('hidden');
}


function showInputError(msg) {
    showToast(msg, 'error');
    searchInput.focus();
    searchInput.classList.add('input-error');
    setTimeout(() => searchInput.classList.remove('input-error'), 2000)
}

// ---------- Toast -------------
let toastTimer;
function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type} show`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000)
}