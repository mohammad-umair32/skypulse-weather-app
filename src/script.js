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
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const welcomeState = document.getElementById('welcomeState');
const weatherContent = document.getElementById('weatherContent');
const alertBanner = document.getElementById('alertBanner');
const alertText = document.getElementById('alertText');
const btnC = document.getElementById('btnC');
const btnF = document.getElementById('btnF');

//---------------------- Init -------------------
function init() {
  loadRecent();
  // generateParticles();
  attachEventListeners();
  showState('welcome');

  // Hint chips quick-search
  document.querySelectorAll('.hint-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const city = chip.textContent.replace(/^\S+\s*/, '').trim();
      searchInput.value = city;
      fetchWeather(city);
    });
  });
}

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

async function fetchWeather(cityName) {
  if (activeCtrl) activeCtrl.abort();
  activeCtrl = new AbortController();
  const signal = activeCtrl.signal;

  showState('loading');
  try{

    const geoRes = await fetch(
      `${GEO_BASE}/direct?q=${encodeURIComponent(cityName)}&limit=1&appid=${OWM_KEY}`,
      { signal }
    );
    if(!geoRes.ok) throw new Error('Network error. Please check your connection.')
    const geoData = await geoRes.json();

    if(!geoData || geoData.length === 0) {
      throw new Error(`City "${cityName}" not found. Check the spelling and try again.`);
    }

    const { lat, lon, name, country, state } = geoData[0];
    await fetchWeatherByCoords(lat, lon, { name, country, state }, signal);

  } catch (err) {
    if( err.name === 'AbortError') return;
    showError('Unable to Load Weather', err.message || 'Something went wrong. Please try again.')
  }

}

// ── Fetch by coordinates (used by both search and geolocation)
async function fetchWeatherByCoords(lat, lon, geoInfo = null, signal = null) {
  if (!signal) {
    if (activeCtrl) activeCtrl.abort();
    activeCtrl = new AbortController();
    signal = activeCtrl.signal;
    showState('loading');
  }

  try {
    const opts = signal ? { signal } : {};

    // Run current + 5-day forecast in parallel — single fetch per call, no CORS issues
    const [curRes, fcastRes] = await Promise.all([
      fetch(`${OWM_BASE}/weather?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric`, opts),
      fetch(`${OWM_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric&cnt=40`, opts),
    ]);

    if (!curRes.ok || !fcastRes.ok) {
      const errJson = await curRes.json().catch(() => ({}));
      if (errJson.cod === 401) throw new Error('Invalid API key. Please check configuration.');
      if (errJson.cod === 429) throw new Error('Too many requests. Please wait a moment and try again.');
      throw new Error('Weather data unavailable. Please try again.');
    }

    const current  = await curRes.json();
    const forecast = await fcastRes.json();

    // If we got here from geolocation (no geoInfo), build it from current response
    if (!geoInfo) {
      geoInfo = {
        name:    current.name,
        country: current.sys.country,
        state:   '',
      };
    }

    currentData = { current, forecast, geo: geoInfo };

    addRecent(geoInfo.name, geoInfo.country);
    renderWeather(currentData);
    showState('weather');
    showToast(`${geoInfo.name} loaded ✓`, 'success');
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');

  } catch (err) {
    if (err.name === 'AbortError') return;
    showError('Unable to Load Weather', err.message || 'Something went wrong. Please try again.');
  }
}

//----------------------------------- Render Weather ---------------------------------
function renderWeather(data) {
  const { current: c, forecast: f, geo } = data;
  const isDay = c.dt > c.sys.sunrise && c.dt < c.sys.sunset;

  document.getElementById('heroFlag').textContent    = countryFlag(geo.country);
  document.getElementById('heroCity').textContent    = geo.name;
  document.getElementById('heroCountry').textContent = [geo.state, geo.country].filter(Boolean).join(', ');
  document.getElementById('heroCond').textContent    = capitalize(c.weather[0].description);
  document.getElementById('heroCondIcon').textContent = owmEmoji(c.weather[0].id, isDay);
  document.getElementById('heroUpdated').textContent  = `Updated ${formatTime(c.dt)}`;

}

// Own Emoji map
function owmEmoji(id, isDay) {
  if (id >= 200 && id <= 299) return '⛈️';
  if (id >= 300 && id <= 399) return '🌦️';
  if (id >= 500 && id <= 504) return isDay ? '🌧️' : '🌧️';
  if (id === 511)              return '🌨️';
  if (id >= 520 && id <= 531) return '🌧️';
  if (id >= 600 && id <= 622) return '❄️';
  if (id >= 700 && id <= 799) return '🌫️';
  if (id === 800)              return isDay ? '☀️' : '🌙';
  if (id === 801)              return isDay ? '🌤️' : '🌤️';
  if (id === 802)              return '⛅';
  if (id >= 803 && id <= 804) return '☁️';
  return isDay ? '🌤️' : '🌙';
}

// ---------------- Extreme Temperature Alert ------------------
function checkAlert(tempC, cityName) {
  alertBanner.classList.add('hidden');
  if      (tempC >= 45) showAlert(`🔥 Extreme heat in ${cityName}: ${Math.round(tempC)}°C — Stay indoors and stay hydrated!`);
  else if (tempC >= 40) showAlert(`⚠️ Heat alert in ${cityName}: ${Math.round(tempC)}°C — Use sun protection and drink plenty of water.`);
  else if (tempC <= -10) showAlert(`🥶 Severe cold in ${cityName}: ${Math.round(tempC)}°C — Dress warmly and limit time outdoors.`);
  else if (tempC <= 0)  showAlert(`🧊 Freezing in ${cityName}: ${Math.round(tempC)}°C — Watch for icy surfaces.`);
}

function showAlert(msg) {
  alertText.textContent = msg;
  alertBanner.classList.remove('hidden');
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
function selectRecent(name) {
  closeDropDown();
  searchInput.value = name;
  fetchWeather(name);
}

function openDropdown() {
    if (recentCities.length === 0) return;
    renderRecent();
    recentDropdown.classList.remove('hidden');
}

function closeDropDown() { recentDropdown.classList.add('hidden'); }


// ---------------- UI State ---------------
function showState(state) {
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
  welcomeState.classList.add('hidden');
  weatherContent.classList.add('hidden');
  alertBanner.classList.add('hidden');
  if (state === 'loading') loadingState.classList.remove('hidden');
  if (state === 'error')   errorState.classList.remove('hidden');
  if (state === 'welcome') welcomeState.classList.remove('hidden');
  if (state === 'weather') weatherContent.classList.remove('hidden');
}
function showError(title, msg) {
  document.getElementById('errorTitle').textContent = title;
  document.getElementById('errorMsg').textContent   = msg;
  showState('error');
}
function hideError() {
  if (currentData) showState('weather');
  else showState('welcome');
}
function showInputError(msg) {
  showToast(msg, 'error');
  searchInput.focus();
  searchInput.classList.add('input-error');
  setTimeout(() => searchInput.classList.remove('input-error'), 2000);
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

// Helpers 
const capitalize = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function formatTime(unixTs) {
  return new Date(unixTs * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function countryFlag(code) {
  if (!code || code.length !== 2) return '🌍';
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// Start --------------
document.addEventListener('DOMContentLoaded', init);