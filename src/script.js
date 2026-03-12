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

  // Mini Stats
  document.getElementById('miniHumidity').textContent  = `${c.main.humidity}%`;
  document.getElementById('miniWind').textContent       = `${Math.round(c.wind.speed * 3.6)} km/h`;
  document.getElementById('miniVisibility').textContent = `${(c.visibility / 1000).toFixed(1)} km`;

  renderTemps(c, f)
  renderHourly(f, isDay);
  renderForecast(f);
  renderDetails(c, isDay);
}

//------------------ Todays Temperature ---------------
function renderTemps(c, f) {
  const tempC = c.main.temp;
  const feelsC = c.main.feels_like;

  const todaySlots = f.list.filter(s => {
    const d = new Date(s.dt * 1000);
    const now = new Date();
    return d.getDate() === now.getDate();
  });
  const hiC = todaySlots.length ? Math.max(...todaySlots.map(s => s.main.temp_max)) : c.main.temp_max;
  const loC = todaySlots.length ? Math.min(...todaySlots.map(s => s.main.temp_min)) : c.main.temp_min;

  const t  = unit === 'C' ? `${Math.round(tempC)}°`  : `${toF(tempC)}°`;
  const fl = unit === 'C' ? `${Math.round(feelsC)}°` : `${toF(feelsC)}°`;
  const hi = unit === 'C' ? Math.round(hiC) : toF(hiC);
  const lo = unit === 'C' ? Math.round(loC) : toF(loC);

  document.getElementById('heroTemp').textContent  = t;
  document.getElementById('heroHiLo').textContent  = `H:${hi}° · L:${lo}°`;
  document.getElementById('heroFeels').textContent = `Feels like ${fl}`;
}

// -------- Hourly ---------
function renderHourly(f, isDay) {
  const slots = f.list.slice(0, 8); 
  const container = document.getElementById('hourlyRow');

  container.style.gridTemplateColumns = `repeat(${slots.length}, 1fr)`;

  container.innerHTML = slots.map((s, i) => {
    const date  = new Date(s.dt * 1000);
    const label = i === 0 ? 'Now' : formatHour(date);
    const temp  = unit === 'C' ? `${Math.round(s.main.temp)}°` : `${toF(s.main.temp)}°`;
    const slotDay = s.sys?.pod === 'd' || (date.getHours() >= 6 && date.getHours() < 20);
    const rain  = s.pop > 0 ? `<div class="text-[11px] text-blue-200/80">💧${Math.round(s.pop * 100)}%</div>` : '';
    return `
      <div class="hour-item">
        <div class="text-xs text-white/65 font-medium whitespace-nowrap">${label}</div>
        <div class="text-[22px]">${owmEmoji(s.weather[0].id, slotDay)}</div>
        <div class="text-base font-medium">${temp}</div>
        ${rain}
      </div>
    `;
  }).join('');
}

//---------------- 5-Days Forecast ------------------
function renderForecast(f) {

  const byDay = {};
  f.list.forEach(s => {
    const key = new Date(s.dt * 1000).toLocaleDateString('en-CA'); 
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(s);
  });

  const days = Object.entries(byDay).slice(0, 5); 

  const labelEl = document.getElementById('forecastLabel');
  if (labelEl) labelEl.textContent = `${days.length}-Day Forecast`;

  const allHiC = days.map(([, slots]) => Math.max(...slots.map(s => s.main.temp_max)));
  const allLoC = days.map(([, slots]) => Math.min(...slots.map(s => s.main.temp_min)));
  const absHi  = Math.max(...allHiC);
  const absLo  = Math.min(...allLoC);
  const range  = absHi - absLo || 1;

  const todayKey = new Date().toLocaleDateString('en-CA');

  document.getElementById('forecastGrid').innerHTML = days.map(([dateKey, slots], i) => {
    const hiC  = Math.max(...slots.map(s => s.main.temp_max));
    const loC  = Math.min(...slots.map(s => s.main.temp_min));
    const hi   = unit === 'C' ? Math.round(hiC)  : toF(hiC);
    const lo   = unit === 'C' ? Math.round(loC)  : toF(loC);
    const rep  = slots.find(s => new Date(s.dt * 1000).getHours() === 12) || slots[0];
    const avgHumidity = Math.round(slots.reduce((a, s) => a + s.main.humidity, 0) / slots.length);
    const maxWind     = Math.round(Math.max(...slots.map(s => s.wind.speed)) * 3.6);
    const maxRain     = Math.round(Math.max(...slots.map(s => s.pop)) * 100);
    const loOff = ((loC - absLo) / range * 100).toFixed(1);
    const hiOff = ((hiC - absLo) / range * 100).toFixed(1);
    const isToday  = dateKey === todayKey;
    const dayLabel = isToday ? 'Today' : formatDay(dateKey);

    return `
      <div class="glass-tile${isToday ? ' today-card' : ''} px-3.5 py-4 text-center">
        <div class="text-[13px] font-semibold text-white/65 mb-2.5">${dayLabel}</div>
        <div class="text-3xl mb-2.5">${owmEmoji(rep.weather[0].id, 1)}</div>
        <div class="text-[22px] font-light mb-0.5">${hi}°</div>
        <div class="text-sm text-white/40 mb-3">${lo}°</div>
        <div class="h-px bg-white/10 my-2.5"></div>
        <div class="flex items-center justify-center gap-1 text-xs text-white/65 mb-1.5">
          <span>💧</span><span>${maxRain}%</span>
        </div>
        <div class="flex items-center justify-center gap-1 text-xs text-white/65 mb-1.5">
          <span>💨</span><span>${maxWind} km/h</span>
        </div>
        <div class="flex items-center justify-center gap-1 text-xs text-white/65 mb-1.5">
          <span>🌡️</span><span>${avgHumidity}%</span>
        </div>
        <div class="fc-bar">
          <div class="fc-bar-fill" style="left:${loOff}%;width:${Math.max(hiOff - loOff, 4)}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

//--------------------- Details Cards ----------------------
function renderDetails(c, isDay) {
  const tempC  = c.main.temp;
  const feelsC = c.main.feels_like;
  const visKm  = (c.visibility / 1000).toFixed(1);
  const windKph = Math.round(c.wind.speed * 3.6);
  const gustKph = c.wind.gust ? Math.round(c.wind.gust * 3.6) : windKph;
  const wDir   = windDirLabel(c.wind.deg);
  const wDeg   = c.wind.deg || 0;
  const fl     = unit === 'C' ? `${Math.round(feelsC)}°C` : `${toF(feelsC)}°F`;
  const visDesc = visKm >= 10 ? 'Perfectly clear' : visKm >= 6 ? 'Good visibility' : 'Reduced visibility';
  const pressDesc = c.main.pressure > 1013 ? '↑ High pressure' : '↓ Low pressure';
  const feelsDesc = feelsC > tempC + 2 ? 'Feels hotter' : feelsC < tempC - 2 ? 'Feels cooler' : 'Similar to actual';

  const sunrise = formatTime(c.sys.sunrise);
  const sunset  = formatTime(c.sys.sunset);

  const precip = (c.rain?.['1h'] ?? c.snow?.['1h'] ?? 0).toFixed(1);

  const clouds = c.clouds.all;
  const uvProxy = Math.round((1 - clouds / 100) * 8); // rough estimate
  const uvLabel = uvProxy <= 2 ? 'Low' : uvProxy <= 5 ? 'Moderate' : uvProxy <= 7 ? 'High' : 'Very High';
  const uvPct   = Math.min(uvProxy / 11 * 100, 100).toFixed(1);

  document.getElementById('detailsGrid').innerHTML = `
    <div class="glass-tile dc">
      <div class="dc-label">💧 Humidity</div>
      <div class="dc-val">${c.main.humidity}<span class="dc-unit">%</span></div>
      <div class="dc-sub">Pressure: ${c.main.pressure} hPa</div>
    </div>
    <div class="glass-tile dc">
      <div class="dc-label">🌡️ Feels Like</div>
      <div class="dc-val">${fl}</div>
      <div class="dc-sub">${feelsDesc}</div>
    </div>
    <div class="glass-tile dc">
      <div class="dc-label">☁️ Cloud Cover</div>
      <div class="dc-val">${clouds}<span class="dc-unit">%</span></div>
      <div class="dc-sub">UV est: ${uvLabel}</div>
      <div class="uv-bar"><div class="uv-needle" style="left:${uvPct}%"></div></div>
    </div>
    <div class="glass-tile dc">
      <div class="dc-label">💨 Wind</div>
      <div class="dc-val">${windKph}<span class="dc-unit"> km/h</span></div>
      <div class="dc-sub">${wDir} · Gusts ${gustKph} km/h</div>
      <div class="compass">
        <span class="compass-n">N</span>
        <div class="compass-needle" style="transform:translateX(-50%) rotate(${wDeg}deg);"></div>
      </div>
    </div>
    <div class="glass-tile dc">
      <div class="dc-label">👁️ Visibility</div>
      <div class="dc-val">${visKm}<span class="dc-unit"> km</span></div>
      <div class="dc-sub">${visDesc}</div>
      <div class="vis-dots">
        ${Array.from({length:10},(_,i)=>`<div class="vis-dot${i < Math.round(visKm / 2) ? ' on' : ''}"></div>`).join('')}
      </div>
    </div>
    <div class="glass-tile dc">
      <div class="dc-label">🌅 Sunrise · Sunset</div>
      <div class="dc-val" style="font-size:17px;">${sunrise}</div>
      <div class="sun-times-row"><span>Sunrise</span><span>${sunset}</span></div>
      <svg class="sun-arc-svg" viewBox="0 0 200 54" fill="none">
        <path d="M10 50 Q100 -4 190 50" stroke="rgba(255,210,80,0.4)" stroke-width="1.5"
              stroke-dasharray="4 3" fill="none"/>
        <circle cx="105" cy="18" r="6" fill="#ffd60a" opacity="0.9"/>
        <circle cx="10"  cy="50" r="3" fill="rgba(255,160,40,0.6)"/>
        <circle cx="190" cy="50" r="3" fill="rgba(255,160,40,0.6)"/>
      </svg>
    </div>
    <div class="glass-tile dc">
      <div class="dc-label">🌧️ Precipitation</div>
      <div class="dc-val">${precip}<span class="dc-unit"> mm</span></div>
      <div class="dc-sub">Last hour</div>
    </div>
    <div class="glass-tile dc">
      <div class="dc-label">📊 Pressure</div>
      <div class="dc-val">${c.main.pressure}<span class="dc-unit"> hPa</span></div>
      <div class="dc-sub">${pressDesc}</div>
    </div>
  `
}

// Own Emoji map
function owmEmoji(id, isDay) {
  if (id >= 200 && id <= 299) return '⛈️';
  if (id >= 300 && id <= 399) return '🌦️';
  if (id >= 500 && id <= 504) return isDay ? '🌧️' : '🌧️';
  if (id === 511) return '🌨️';
  if (id >= 520 && id <= 531) return '🌧️';
  if (id >= 600 && id <= 622) return '❄️';
  if (id >= 700 && id <= 799) return '🌫️';
  if (id === 800) return isDay ? '☀️' : '🌙';
  if (id === 801) return isDay ? '🌤️' : '🌤️';
  if (id === 802) return '⛅';
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
const toF = c => Math.round(c * 9/5 +32);
const capitalize = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function formatHour(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
}
function formatTime(unixTs) {
  return new Date(unixTs * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function formatDay(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}
function windDirLabel(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
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