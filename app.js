const API = '/cid-api';
const FALLBACK = {
  directory: 'data/directory.json',
  restaurant: 'data/terra-cucina.json',
  pricing: 'data/pricing.json'
};

const state = {
  restaurants: [],
  allergens: [],
  selectedRestaurant: null,
  restaurantPayload: null,
  selectedRestrictions: new Set(['gluten', 'tree nuts']),
  menuFilter: 'all',
  directoryOffset: 0,
  usingLiveData: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const titleCase = value => String(value || '').replace(/\b\w/g, letter => letter.toUpperCase());
const formatMoney = value => `$${Number(value || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}`;
let toastTimer;

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
}

async function getJSON(url, fallback) {
  try {
    const response = await fetch(url, {headers: {'Accept': 'application/json'}});
    if (!response.ok) throw new Error(`${response.status}`);
    const data = await response.json();
    state.usingLiveData = url.startsWith(API) || state.usingLiveData;
    return data;
  } catch (error) {
    if (!fallback) throw error;
    const response = await fetch(fallback);
    if (!response.ok) throw error;
    return response.json();
  }
}

function directoryList(payload) {
  return Array.isArray(payload) ? payload : (payload.restaurants || []);
}

function menuList(payload) {
  return payload?.menu || payload?.menu_items || payload?.items || [];
}

function restaurantRecord(payload) {
  return payload?.restaurant || payload || {};
}

function colorForCuisine(cuisine = '') {
  const palette = ['#285c45','#9b4f31','#526d3b','#405c72','#7a4938','#3f6b67','#6c5337','#744c5d'];
  const hash = [...cuisine].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

function orderedRestaurants(items) {
  const preferred = ['terra-cucina','brasserie-parisienne','sakura-garden','spice-route-india','jerk-at-nite','bangkok-street-kitchen'];
  return [...items].sort((a, b) => {
    const ai = preferred.indexOf(a.slug), bi = preferred.indexOf(b.slug);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return (a.name || '').localeCompare(b.name || '');
  });
}

function renderDirectory() {
  const track = $('#directoryTrack');
  const visible = state.restaurants.slice(state.directoryOffset, state.directoryOffset + 4);
  track.innerHTML = visible.map(restaurant => {
    const selected = restaurant.slug === state.selectedRestaurant?.slug;
    return `<article class="restaurant-card${selected ? ' selected' : ''}" data-slug="${escapeHTML(restaurant.slug)}">
      <div class="restaurant-art" style="--card-color:${colorForCuisine(restaurant.cuisine || restaurant.name)}"><small>CANIDINE PUBLIC MENU</small><strong>${escapeHTML(restaurant.tagline || restaurant.cuisine || 'Guest-ready menu')}</strong></div>
      <div class="restaurant-card-body"><span>${escapeHTML(restaurant.cuisine || 'Restaurant')}</span><h3>${escapeHTML(restaurant.name)}</h3><p>${escapeHTML(restaurant.description || 'Explore this restaurant’s current public Canidine menu.')}</p><button data-select-restaurant="${escapeHTML(restaurant.slug)}">Use this real menu <span>↘</span></button></div>
    </article>`;
  }).join('');
  $$('[data-select-restaurant]', track).forEach(button => button.addEventListener('click', () => selectRestaurant(button.dataset.selectRestaurant, true)));
}

function renderRestaurantPicker() {
  $('#restaurantPicker').innerHTML = state.restaurants.map(item => `<button data-picker-slug="${escapeHTML(item.slug)}"><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.cuisine || item.tagline || 'Public menu')}</small></button>`).join('');
  $$('[data-picker-slug]').forEach(button => button.addEventListener('click', () => {
    $('#restaurantPicker').hidden = true;
    selectRestaurant(button.dataset.pickerSlug);
  }));
}

function expandedRestrictions() {
  const result = new Set(state.selectedRestrictions);
  if (result.has('celiac')) { result.add('gluten'); result.add('wheat'); }
  if (result.has('milk')) result.add('dairy');
  if (result.has('peanuts')) result.add('peanut');
  return result;
}

function resultForItem(item) {
  const selected = expandedRestrictions();
  const tags = new Set([...(item.allergens || []), ...(item.rule_allergens || []), ...(item.intrinsic_rule_allergens || []), ...(item.cross_contact_allergens || [])].map(value => String(value).toLowerCase()));
  const conflicts = [...selected].filter(value => tags.has(value));
  const modifiable = new Set((item.modifiable_for || []).map(value => String(value).toLowerCase()));
  const modifiableConflicts = conflicts.filter(value => modifiable.has(value));
  if (conflicts.length && (modifiableConflicts.length || item.modification_notes)) return {status:'modify', conflicts, label:'Ask / Modify', instruction:item.modification_notes || `Ask whether ${conflicts.join(', ')} can be removed.`};
  if (conflicts.length) return {status:'avoid', conflicts, label:'Avoid', instruction:`Detected: ${conflicts.join(', ')}.`};
  return {status:'clear', conflicts:[], label:'No conflict detected', instruction:'No selected conflict found in current public menu data.'};
}

function renderHeroDishes(items) {
  const chosen = items.slice(0, 3);
  $('#heroDishes').innerHTML = chosen.map(item => {
    const result = resultForItem(item);
    return `<article><div><span class="clear-dot"></span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.category || item.description || 'Menu item')}</small></div><b class="tag ${result.status}">${escapeHTML(result.label)}</b></article>`;
  }).join('') || '<article><div><span class="clear-dot"></span><strong>Menu data unavailable</strong><small>Try again shortly</small></div><b class="tag modify">Review</b></article>';
}

function renderRestrictions() {
  $('#restrictionChips').innerHTML = [...state.selectedRestrictions].map(value => `<button data-remove-restriction="${escapeHTML(value)}">${escapeHTML(titleCase(value))}<span>×</span></button>`).join('');
  $$('[data-remove-restriction]').forEach(button => button.addEventListener('click', () => {
    state.selectedRestrictions.delete(button.dataset.removeRestriction);
    renderRestrictions(); renderMenu();
    toast(`${titleCase(button.dataset.removeRestriction)} removed from Safety Passport`);
  }));
  $('#allRestrictionOptions').innerHTML = state.allergens.map(value => `<button class="${state.selectedRestrictions.has(value) ? 'active' : ''}" data-restriction-option="${escapeHTML(value)}">${escapeHTML(titleCase(value))}</button>`).join('');
  $$('[data-restriction-option]').forEach(button => button.addEventListener('click', () => {
    const value = button.dataset.restrictionOption;
    state.selectedRestrictions.has(value) ? state.selectedRestrictions.delete(value) : state.selectedRestrictions.add(value);
    renderRestrictions(); renderMenu();
  }));
}

function statusStyles(status) {
  if (status === 'modify') return '--status-color:#d3a231;--status-bg:#fff4d5;--status-text:#80601d';
  if (status === 'avoid') return '--status-color:#a7473e;--status-bg:#f9e8e4;--status-text:#91372f';
  return '--status-color:#679264;--status-bg:#eaf2e6;--status-text:#315e37';
}

function renderMenu() {
  const items = menuList(state.restaurantPayload);
  const results = items.map(item => ({item, result:resultForItem(item)}));
  const counts = results.reduce((acc, entry) => (acc[entry.result.status]++, acc), {clear:0,modify:0,avoid:0});
  const visible = state.menuFilter === 'all' ? results : results.filter(entry => entry.result.status === state.menuFilter);
  $('#menuMeta').textContent = `${items.length} real dishes · ${counts.clear} no conflict · ${counts.modify} modify · ${counts.avoid} avoid`;
  $('#realMenuGrid').innerHTML = visible.map(({item,result}) => {
    const details = [...new Set([...(item.rule_allergens || []), ...(item.allergens || [])])].slice(0, 8);
    return `<article class="real-menu-card" style="${statusStyles(result.status)}" data-card-status="${result.status}"><div><div class="card-top"><h5>${escapeHTML(item.name)}</h5><span class="price">${item.price ? formatMoney(item.price) : ''}</span></div><p>${escapeHTML(item.description || (item.ingredients || []).slice(0,5).join(', ') || 'Restaurant menu item')}</p><div class="result-line"><strong>${escapeHTML(result.label)}</strong><small>${escapeHTML(result.instruction)}</small></div><button class="item-details" aria-expanded="false">Why this result? <span>＋</span></button><div class="details"><b>Public menu evidence:</b> ${escapeHTML(details.length ? details.join(', ') : 'No selected restriction tags detected')}.<br><b>Source:</b> ${escapeHTML(state.selectedRestaurant?.name || 'Canidine public menu')}.</div></div></article>`;
  }).join('') || '<div class="menu-loading"><span>No dishes match this result filter.</span></div>';
  $$('.item-details').forEach(button => button.addEventListener('click', () => {
    const card = button.closest('.real-menu-card');
    const expanded = card.classList.toggle('expanded');
    button.setAttribute('aria-expanded', String(expanded));
    $('span', button).textContent = expanded ? '−' : '＋';
  }));
  renderHeroDishes(items);
  renderConsole(items, results);
}

function renderConsole(items, results) {
  const withIngredients = items.filter(item => (item.ingredients || []).length).length;
  const coverage = items.length ? Math.round(withIngredients / items.length * 100) : 0;
  const issues = [];
  items.forEach(item => {
    if (!(item.ingredients || []).length) issues.push({level:'HIGH', name:item.name, copy:'Ingredient detail is incomplete in the public menu record.'});
    else if ((item.modifiable_for || []).length && !item.modification_notes) issues.push({level:'REVIEW', name:item.name, copy:'A modifiable restriction is listed without a guest-ready handoff.'});
    else if ((item.rule_allergens || []).length && !(item.cross_contact_sources || []).length) issues.push({level:'REVIEW', name:item.name, copy:'Cross-contact source details are not listed in the public record.'});
  });
  const open = Math.min(issues.length, items.length);
  const score = items.length ? Math.max(62, Math.round(100 - (open / items.length * 30) - ((100 - coverage) * .25))) : 0;
  $('#ingredientCoverage').textContent = `${coverage}%`;
  $('#openDecisions').textContent = open;
  $('#queueBadge').textContent = open;
  $('#readinessScore').innerHTML = `${score}<small>%</small>`;
  $('.readiness-ring').style.setProperty('--score', `${score}%`);
  $('#readinessBar').style.width = `${score}%`;
  $('#readinessLabel').textContent = score >= 90 ? 'Ready for service review' : 'Almost ready for service';
  $('#readinessCopy').textContent = `${items.length - open} of ${items.length} public dishes have no generated evidence gap.`;
  $('#verificationQueue').innerHTML = issues.slice(0, 4).map(issue => `<article class="queue-item"><span class="queue-priority ${issue.level === 'REVIEW' ? 'review' : ''}">${issue.level}</span><div class="queue-copy"><strong>${escapeHTML(issue.name)}</strong><span>${escapeHTML(issue.copy)}</span></div><button class="demo-decision">Review</button></article>`).join('') || '<article class="queue-item"><span class="queue-priority review">CLEAR</span><div class="queue-copy"><strong>No generated gaps</strong><span>This concept found complete public menu detail.</span></div></article>';
  $$('.demo-decision').forEach(button => button.addEventListener('click', () => toast('Demo only—no production restaurant data was changed')));
  const restaurant = restaurantRecord(state.restaurantPayload);
  $('#sourceDishes').textContent = items.length;
  $('#sourceHouse').textContent = (restaurant.house_ingredients || []).length;
  $('#sourceRestrictions').textContent = state.allergens.length;
}

function updateRestaurantIdentity(restaurant, payload) {
  const actual = restaurantRecord(payload);
  const name = actual.name || restaurant.name;
  const cuisine = actual.cuisine || restaurant.cuisine || 'Restaurant';
  const tagline = actual.tagline || restaurant.tagline || actual.description || 'A guest-ready public menu';
  const initial = name.trim().charAt(0).toUpperCase();
  $('#heroRestaurant').textContent = name;
  $('.restaurant-monogram').textContent = initial;
  $('#sidebarMonogram').textContent = initial;
  $('#sidebarRestaurant').textContent = name;
  $('#sidebarCuisine').textContent = cuisine;
  $('#guestGreeting').textContent = `Good evening at ${name}.`;
  $('#guestTagline').textContent = tagline;
  $('#menuTitle').textContent = `${name} menu`;
  $('#sidebarMenuCount').textContent = menuList(payload).length;
  $('#consoleRestaurant').textContent = name;
  $('#consoleGreeting').textContent = `${name} is nearly ready.`;
  $('#sourceRestaurant').textContent = name;
  const reviewed = actual.last_accuracy_ack_at ? new Date(actual.last_accuracy_ack_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : null;
  $('#reviewStatus').textContent = reviewed ? 'Restaurant review recorded' : 'Public menu available';
  $('#reviewDate').textContent = reviewed ? `Acknowledged ${reviewed}` : 'Current public Canidine record';
}

async function selectRestaurant(slug, scroll = false) {
  const restaurant = state.restaurants.find(item => item.slug === slug);
  if (!restaurant) return;
  state.selectedRestaurant = restaurant;
  $('#realMenuGrid').innerHTML = '<div class="menu-loading"><i></i><span>Loading real restaurant menu…</span></div>';
  renderDirectory();
  try {
    const fallback = slug === 'terra-cucina' ? FALLBACK.restaurant : null;
    const payload = await getJSON(`${API}/public/restaurant/${encodeURIComponent(slug)}`, fallback);
    state.restaurantPayload = payload;
    updateRestaurantIdentity(restaurant, payload);
    renderMenu();
    if (scroll) $('#live-menu').scrollIntoView({behavior:'smooth',block:'start'});
  } catch (error) {
    toast('This public menu could not be loaded; keeping the current menu.');
    if (!state.restaurantPayload) await selectRestaurant('terra-cucina');
  }
}

function renderPricing(payload) {
  const plans = payload.plans || [];
  const features = {
    single:['One restaurant location','Branded QR guest menu','Menu intelligence and translations'],
    premium:['Everything in Individual','Expanded team access','Advanced verification workflow'],
    enterprise:['Multi-location restaurant group','Centralized menu governance','Group onboarding and support']
  };
  const descriptions = {single:'For one room ready to make dietary service clearer.',premium:'For busy restaurants coordinating a larger team.',enterprise:'For hospitality groups standardizing every location.'};
  $('#pricingGrid').innerHTML = plans.map((plan,index) => `<article class="pricing-card ${index === 1 ? 'featured' : ''}"><span>${plan.founding_offer_active ? 'FOUNDING MEMBER' : 'CURRENT PLAN'}</span><h3>${escapeHTML(plan.name)}</h3><p>${escapeHTML(descriptions[plan.plan] || '')}</p><div class="price-row"><strong>${formatMoney(plan.current_base)}</strong><span>/ month</span><small>${formatMoney(plan.current_total)} including current card-processing fee</small></div><ul>${(features[plan.plan] || []).map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul><a href="https://canidine.com/pricing">${index === 2 ? 'Talk to Canidine' : 'Choose this plan'} →</a></article>`).join('');
  const status = $('#pricingStatus');
  status.classList.add('live');
  status.innerHTML = `<i></i> ${state.usingLiveData ? 'Loaded from live public pricing' : 'Loaded from packaged public snapshot'}`;
  $('#pricingFineprint').textContent = payload.founding_offer_active && payload.founding_offer_ends_at ? `Founding-member pricing currently shown through ${new Date(payload.founding_offer_ends_at).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'})}. Card-processing totals come from the live Canidine pricing response.` : 'Current public pricing shown. See the live pricing page for checkout terms.';
}

function bindStaticInteractions() {
  $$('.experience-toggle button').forEach(button => button.addEventListener('click', () => {
    const value = button.dataset.experience;
    $$('.experience-toggle button').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active)); });
    $$('[data-experience-panel]').forEach(panel => panel.hidden = panel.dataset.experiencePanel !== value);
  }));
  $$('.menu-filters button').forEach(button => button.addEventListener('click', () => {
    $$('.menu-filters button').forEach(item => item.classList.remove('active'));
    button.classList.add('active'); state.menuFilter = button.dataset.menuFilter; renderMenu();
  }));
  $('#restaurantPickerButton').addEventListener('click', () => $('#restaurantPicker').hidden = !$('#restaurantPicker').hidden);
  $('#addRestriction').addEventListener('click', () => $('#restrictionDrawer').hidden = false);
  $('#closeRestriction').addEventListener('click', () => $('#restrictionDrawer').hidden = true);
  $('#publishDemo').addEventListener('click', () => toast('Demo only—no production restaurant data was changed'));
  let languageIndex = 0; const languages = ['English','Español','Français','العربية'];
  $('#languageCycle').addEventListener('click', event => { languageIndex=(languageIndex+1)%languages.length; event.currentTarget.textContent=`Aあ ${languages[languageIndex]}⌄`; toast(`Guest language preview: ${languages[languageIndex]}`); });
  $('#nextRestaurants').addEventListener('click', () => { state.directoryOffset = Math.min(Math.max(0,state.restaurants.length-4),state.directoryOffset+4); renderDirectory(); });
  $('#previousRestaurants').addEventListener('click', () => { state.directoryOffset = Math.max(0,state.directoryOffset-4); renderDirectory(); });
  const menuButton = $('.menu-button');
  menuButton.addEventListener('click', () => { const menu=$('.mobile-menu'); menu.hidden=!menu.hidden; menuButton.setAttribute('aria-expanded',String(!menu.hidden)); });
  $$('.mobile-menu a').forEach(link => link.addEventListener('click', () => { $('.mobile-menu').hidden=true; menuButton.setAttribute('aria-expanded','false'); }));
  const steps = $$('.step'); const proofImages=['assets/real-menu-console.webp','assets/real-crosscontact-console.webp','assets/real-qr-console.webp']; const captions=['01 · Menu intelligence','02 · Cross-contact workflow','03 · Branded QR publishing'];
  steps.forEach((step,index) => step.addEventListener('click', () => { steps.forEach(item=>item.classList.remove('active')); step.classList.add('active'); $('#proofImage').src=proofImages[index]; $('#proofCaption').textContent=captions[index]; }));
}

async function initialize() {
  bindStaticInteractions();
  const [directoryPayload, allergenPayload, pricingPayload] = await Promise.all([
    getJSON(`${API}/public/directory`, FALLBACK.directory),
    getJSON(`${API}/allergens`, null).catch(() => ['gluten','wheat','dairy','milk','eggs','peanuts','tree nuts','soy','fish','shellfish','sesame','mustard','celery','lupin','sulfites','corn','mushroom','citrus','garlic','allium','onion','nightshades','tomato','potato','pepper','eggplant','meat','red meat','poultry','pork','honey','celiac']),
    getJSON(`${API}/pricing`, FALLBACK.pricing)
  ]);
  state.restaurants = orderedRestaurants(directoryList(directoryPayload));
  state.allergens = (Array.isArray(allergenPayload) ? allergenPayload : allergenPayload.allergens || []).map(value => String(value).toLowerCase());
  $('#publicCount').textContent = state.restaurants.length;
  $('#allergenCount').textContent = state.allergens.length;
  const dataStatus = $('#dataStatus'); dataStatus.classList.add('live'); dataStatus.innerHTML = `<i></i><span>${state.usingLiveData ? 'Connected to live public Canidine data' : 'Using packaged public Canidine snapshot'}</span>`;
  renderDirectory(); renderRestaurantPicker(); renderRestrictions(); renderPricing(pricingPayload);
  await selectRestaurant('terra-cucina');
}

initialize().catch(error => {
  console.error(error);
  $('#dataStatus').innerHTML = '<i></i><span>Public data temporarily unavailable</span>';
  toast('The public Canidine data could not be loaded.');
});
