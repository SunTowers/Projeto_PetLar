// PetLar shared JavaScript

const pageSize = 6;
let animalListingData = [];
let filteredAnimalListingData = [];
let activeAnimalFilters = {
  species: '',
  age: '',
  gender: '',
  size: '',
  city: ''
};
let nextItemIndex = 0;
let isLoading = false;
let listObserver = null;
let currentUser = null;
let notificationArea = null;

function formatAgeMonths(ageMonths) {
  const numericAge = Number(ageMonths);
  if (!Number.isFinite(numericAge) || numericAge <= 0) {
    return 'Idade não informada';
  }
  if (numericAge < 12) {
    return `${numericAge} ${numericAge === 1 ? 'mês' : 'meses'}`;
  }
  const years = Math.floor(numericAge / 12);
  const remainingMonths = numericAge % 12;
  if (remainingMonths === 0) {
    return `${years} ${years === 1 ? 'ano' : 'anos'}`;
  }
  return `${years} ${years === 1 ? 'ano' : 'anos'} e ${remainingMonths} ${remainingMonths === 1 ? 'mês' : 'meses'}`;
}

function parseAgeInput(value) {
  const numericAge = Number(value);
  return Number.isFinite(numericAge) && numericAge >= 0 ? Math.round(numericAge) : null;
}

function getAnimalAgeMonths(animal) {
  if (animal && Number.isFinite(Number(animal.age_months))) {
    return Number(animal.age_months);
  }
  return null;
}

function getAnimalAgeLabel(animal) {
  if (!animal) {
    return 'Idade não informada';
  }
  if (animal.age_label) {
    return animal.age_label;
  }
  return formatAgeMonths(getAnimalAgeMonths(animal));
}

function ensureNotificationArea() {
  if (notificationArea) {
    return notificationArea;
  }

  notificationArea = document.createElement('div');
  notificationArea.className = 'notification-area';
  notificationArea.setAttribute('aria-live', 'polite');
  notificationArea.setAttribute('aria-atomic', 'true');
  document.body.appendChild(notificationArea);
  return notificationArea;
}

function showMessage(message, type = 'info') {
  const area = ensureNotificationArea();
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.setAttribute('role', type === 'error' ? 'alert' : 'status');
  notification.innerHTML = `
    <span class="notification-message">${message}</span>
    <button class="notification-close" type="button" aria-label="Fechar notificação">×</button>
  `;

  const closeNotification = () => {
    notification.classList.add('notification-hiding');
    window.setTimeout(() => notification.remove(), 180);
  };

  notification.querySelector('.notification-close').addEventListener('click', closeNotification);
  area.appendChild(notification);

  window.setTimeout(closeNotification, type === 'error' ? 7000 : 4500);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTime(value) {
  if (!value) {
    return 'Não informado';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Não informado';
  }
  return date.toLocaleString('pt-BR');
}

function attachInlineConfirm(button, options) {
  const {
    initialLabel,
    confirmLabel,
    promptMessage,
    timeoutMs = 4000,
    onConfirm
  } = options;

  let confirmTimer = null;
  let awaitingConfirmation = false;

  const resetState = () => {
    awaitingConfirmation = false;
    button.textContent = initialLabel;
    button.dataset.confirmState = 'idle';
    if (confirmTimer) {
      window.clearTimeout(confirmTimer);
      confirmTimer = null;
    }
  };

  button.addEventListener('click', async () => {
    if (!awaitingConfirmation) {
      awaitingConfirmation = true;
      button.textContent = confirmLabel;
      button.dataset.confirmState = 'armed';
      showMessage(promptMessage, 'info');
      confirmTimer = window.setTimeout(resetState, timeoutMs);
      return;
    }

    resetState();
    await onConfirm();
  });
}

async function loadCurrentUser() {
  if (!getAuthToken()) {
    currentUser = null;
    localStorage.removeItem('userProfileImage');
    return null;
  }
  if (currentUser) {
    return currentUser;
  }
  try {
    currentUser = await fetchCurrentUser();
    if (currentUser && currentUser.profile_image_url) {
      localStorage.setItem('userProfileImage', resolveAssetUrl(currentUser.profile_image_url));
    } else {
      localStorage.removeItem('userProfileImage');
    }
    return currentUser;
  } catch (error) {
    currentUser = null;
    return null;
  }
}

function createAnimalCard(animal) {
  const article = document.createElement('article');
  article.className = 'card';
  const imageUrl = getAnimalImageUrl(animal, '/fotos_animais_mockups/dog1.jfif');
  article.innerHTML = `
    <div class="card-image-wrapper">
      <img class="card-image" src="${imageUrl}" alt="Foto de ${animal.name}">
    </div>
    <div class="card-content">
      <div class="card-meta">
        <span>${animal.type}</span>
        <span>${animal.location}</span>
      </div>
      <h2>${animal.name} • ${animal.gender}</h2>
      <p>${animal.description}</p>
      <div class="card-extra">
        <div class="card-details">
          <span class="detail-pill">${getAnimalAgeLabel(animal)}</span>
          <span class="detail-pill">${animal.type}</span>
          <span class="detail-pill">${animal.location}</span>
        </div>
        <div class="card-actions">
          <button class="button button-secondary card-detail-button" type="button">Ver detalhes</button>
          <button class="button button-primary card-adopt-button" type="button">Adotar</button>
        </div>
      </div>
    </div>
  `;

  const animalId = animal.id || '';
  article.tabIndex = 0;
  article.addEventListener('click', () => {
    window.location.href = `animal_details.html?animalId=${animalId}`;
  });

  article.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      window.location.href = `animal_details.html?animalId=${animalId}`;
    }
  });

  const adoptButton = article.querySelector('.card-adopt-button');
  const detailButton = article.querySelector('.card-detail-button');

  const isOwner = currentUser && animal.created_by && Number(animal.created_by) === Number(currentUser.id);
  if (isOwner && adoptButton) {
    adoptButton.textContent = 'Editar detalhes';
  }

  if (!getAuthToken() && adoptButton && !isOwner) {
    adoptButton.textContent = 'Entrar para adotar';
  }

  if (adoptButton) {
    adoptButton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!getAuthToken() && !isOwner) {
        window.location.href = 'user_login.html';
        return;
      }
      window.location.href = isOwner ? `animal_edit.html?animalId=${animalId}` : `animal_adoption.html?animalId=${animalId}`;
    });
  }

  if (detailButton) {
    detailButton.addEventListener('click', (event) => {
      event.stopPropagation();
      window.location.href = `animal_details.html?animalId=${animalId}`;
    });
  }

  return article;
}

function getAnimalCity(animal) {
  if (!animal || !animal.location) {
    return '';
  }
  return String(animal.location).split(',')[0].trim().toLowerCase();
}

function matchesAgeFilter(animal, ageFilter) {
  const ageMonths = getAnimalAgeMonths(animal);
  if (!ageFilter) {
    return true;
  }
  if (ageMonths === null) {
    return false;
  }
  if (ageFilter === '0-6') return ageMonths <= 6;
  if (ageFilter === '7-12') return ageMonths >= 7 && ageMonths <= 12;
  if (ageFilter === '13-36') return ageMonths >= 13 && ageMonths <= 36;
  if (ageFilter === '37+') return ageMonths >= 37;
  return true;
}

function matchesAnimalFilters(animal) {
  const species = (activeAnimalFilters.species || '').trim().toLowerCase();
  const gender = (activeAnimalFilters.gender || '').trim().toLowerCase();
  const size = (activeAnimalFilters.size || '').trim().toLowerCase();
  const city = (activeAnimalFilters.city || '').trim().toLowerCase();

  const animalSpecies = String(animal.type || animal.species || '').toLowerCase();
  const animalGender = String(animal.gender || '').toLowerCase();
  const animalSize = String(animal.size || '').toLowerCase();
  const animalCity = getAnimalCity(animal);

  if (species && animalSpecies !== species) return false;
  if (gender && animalGender !== gender) return false;
  if (size && animalSize !== size) return false;
  if (city && !animalCity.includes(city)) return false;
  return matchesAgeFilter(animal, activeAnimalFilters.age);
}

function updateFilterSummary() {
  const summary = document.getElementById('filterSummary');
  if (!summary) {
    return;
  }

  const activeLabels = [];
  if (activeAnimalFilters.species) activeLabels.push(`Espécie: ${activeAnimalFilters.species}`);
  if (activeAnimalFilters.age) activeLabels.push(`Idade: ${activeAnimalFilters.age}`);
  if (activeAnimalFilters.gender) activeLabels.push(`Sexo: ${activeAnimalFilters.gender}`);
  if (activeAnimalFilters.size) activeLabels.push(`Porte: ${activeAnimalFilters.size}`);
  if (activeAnimalFilters.city) activeLabels.push(`Cidade: ${activeAnimalFilters.city}`);

  summary.textContent = activeLabels.length > 0
    ? `Filtros ativos: ${activeLabels.join(' · ')}`
    : 'Mostrando todos os animais disponíveis.';
}

function renderFilteredAnimalListing() {
  const cardContainer = document.getElementById('animalCards');
  const loader = document.getElementById('loadingIndicator');

  if (!cardContainer) {
    return;
  }

  filteredAnimalListingData = animalListingData.filter(matchesAnimalFilters);
  nextItemIndex = 0;
  isLoading = false;
  cardContainer.innerHTML = '';

  if (listObserver) {
    listObserver.disconnect();
    listObserver = null;
  }

  if (loader) {
    loader.classList.remove('is-hidden');
    loader.textContent = 'Carregando mais pets…';
  }

  updateFilterSummary();

  if (filteredAnimalListingData.length === 0) {
    cardContainer.innerHTML = '<p>Nenhum animal encontrado com os filtros selecionados.</p>';
    if (loader) {
      loader.classList.add('is-hidden');
    }
    return;
  }

  loadMoreAnimals();
}

function bindAnimalFilters() {
  const filterSpecies = document.getElementById('filterSpecies');
  const filterAge = document.getElementById('filterAge');
  const filterGender = document.getElementById('filterGender');
  const filterSize = document.getElementById('filterSize');
  const filterCity = document.getElementById('filterCity');
  const clearButton = document.getElementById('clearFiltersButton');

  if (!filterSpecies || !filterAge || !filterGender || !filterSize || !filterCity || !clearButton) {
    return;
  }

  const applyFilters = () => {
    activeAnimalFilters = {
      species: filterSpecies.value,
      age: filterAge.value,
      gender: filterGender.value,
      size: filterSize.value,
      city: filterCity.value
    };
    renderFilteredAnimalListing();
  };

  [filterSpecies, filterAge, filterGender, filterSize].forEach((element) => {
    element.addEventListener('change', applyFilters);
  });

  let cityTimer = null;
  filterCity.addEventListener('input', () => {
    if (cityTimer) {
      window.clearTimeout(cityTimer);
    }
    cityTimer = window.setTimeout(applyFilters, 180);
  });

  clearButton.addEventListener('click', () => {
    filterSpecies.value = '';
    filterAge.value = '';
    filterGender.value = '';
    filterSize.value = '';
    filterCity.value = '';
    activeAnimalFilters = { species: '', age: '', gender: '', size: '', city: '' };
    renderFilteredAnimalListing();
  });
}

function loadMoreAnimals() {
  const cardContainer = document.getElementById('animalCards');
  const loader = document.getElementById('loadingIndicator');
  const sourceData = filteredAnimalListingData.length > 0 || Object.values(activeAnimalFilters).some(Boolean)
    ? filteredAnimalListingData
    : animalListingData;

  if (!cardContainer || isLoading || nextItemIndex >= sourceData.length) {
    return;
  }

  isLoading = true;
  if (loader) {
    loader.classList.remove('is-hidden');
  }

  window.setTimeout(() => {
    const nextItems = sourceData.slice(nextItemIndex, nextItemIndex + pageSize);
    nextItems.forEach((pet) => cardContainer.appendChild(createAnimalCard(pet)));
    nextItemIndex += nextItems.length;

    if (loader && nextItemIndex >= sourceData.length) {
      loader.textContent = 'Você alcançou o final da lista.';
      if (listObserver) {
        listObserver.disconnect();
      }
    }

    isLoading = false;
  }, 300);
}

function getAuthToken() {
  return window.localStorage.getItem('petlar_token');
}

function setAuthToken(token) {
  window.localStorage.setItem('petlar_token', token);
}

function clearAuthToken() {
  window.localStorage.removeItem('petlar_token');
  window.localStorage.removeItem('userProfileImage');
}

function getApiBaseUrl() {
  const origin = window.location.origin;
  if (!origin || origin === 'null' || origin.startsWith('file:')) {
    return 'http://localhost:3000';
  }

  try {
    const parsed = new URL(origin);
    if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && parsed.port === '3000') {
      return origin;
    }

    // In deployed environments (e.g. Render), call the API on the same host.
    return origin;
  } catch (error) {
    return 'http://localhost:3000';
  }
}

function resolveAssetUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '';
  }

  const value = rawUrl.trim();
  if (!value) {
    return '';
  }

  if (value.startsWith('data:')) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${getApiBaseUrl()}${value}`;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    const appHost = window.location.hostname;
    const isAppLocalHost = appHost === 'localhost' || appHost === '127.0.0.1';
    const isSourceLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

    // Records created in local/dev may persist localhost URLs in DB/localStorage.
    if (!isAppLocalHost && isSourceLocalHost) {
      return `${getApiBaseUrl()}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.toString();
  } catch (error) {
    return value;
  }
}

function getAnimalImageUrl(animal, fallback = '/fotos_animais_mockups/dog1.jfif') {
  const candidate = (animal && (animal.image_url || animal.image)) || fallback;
  return resolveAssetUrl(candidate) || fallback;
}

function withImageFallback(imgElement, fallback = '/fotos_animais_mockups/dog1.jfif') {
  if (!imgElement) {
    return;
  }

  const fallbackUrl = resolveAssetUrl(fallback) || fallback;
  const applyFallback = () => {
    if (imgElement.dataset.fallbackApplied === '1') {
      return;
    }
    imgElement.dataset.fallbackApplied = '1';
    imgElement.src = fallbackUrl;
  };

  imgElement.addEventListener('error', () => {
    applyFallback();
  });

  // If load failure happened before the handler was attached, recover immediately.
  if (imgElement.complete && imgElement.naturalWidth === 0) {
    applyFallback();
  }
}

async function apiFetch(url, options = {}) {
  const requestOptions = { ...options, headers: { ...(options.headers || {}) } };

  if (!(requestOptions.body instanceof FormData)) {
    requestOptions.headers['Content-Type'] = 'application/json';
  }

  const token = getAuthToken();
  if (token) {
    requestOptions.headers.Authorization = `Bearer ${token}`;
  }

  const requestUrl = url.startsWith('http')
    ? url
    : `${getApiBaseUrl()}${url}`;

  try {
    const response = await fetch(requestUrl, requestOptions);
    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.success === false) {
      const serverError = data && data.error ? data.error : 'Ocorreu um erro ao se comunicar com o servidor.';
      const httpError = new Error(serverError);
      httpError.details = data ? data.details : null;
      httpError.isHttpError = true;
      throw httpError;
    }

    return data && Object.prototype.hasOwnProperty.call(data, 'data') ? data.data : data;
  } catch (error) {
    if (error && error.isHttpError) {
      throw error;
    }
    throw error || new Error('Ocorreu um erro ao se comunicar com o servidor.');
  }
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

async function fetchAnimalById(animalId) {
  if (!animalId) {
    return { animal: null, owner: null };
  }

  try {
    const response = await apiFetch(`/api/animals/${animalId}`);
    if (response && response.animal) {
      return { animal: response.animal, owner: response.owner || null };
    }
  } catch (error) {
    console.warn('Não foi possível carregar o animal por ID via API:', error.message || error);
  }

  return { animal: null, owner: null };
}

function renderAnimalDetails(animal) {
  const image = document.getElementById('detailHeroImage');
  const title = document.getElementById('animalDetailTitle');
  const subtitle = document.getElementById('animalDetailSubtitle');
  const location = document.getElementById('animalDetailLocation');
  const age = document.getElementById('animalDetailAge');
  const size = document.getElementById('animalDetailSize');
  const gender = document.getElementById('animalDetailGender');
  const healthTags = document.getElementById('animalHealthTags');
  const description = document.getElementById('animalDetailDescription');
  const adoptButton = document.getElementById('adoptAnimalButton');

  if (!animal || !title || !subtitle || !location || !age || !size || !gender || !healthTags || !description || !image || !adoptButton) {
    return;
  }

  // Populate images and thumbnails
  const thumbsContainer = document.getElementById('detailThumbs');
  thumbsContainer.innerHTML = '';

  const images = [];
  if (animal.image_url) images.push(resolveAssetUrl(animal.image_url));
  if (animal.image) {
    const normalized = resolveAssetUrl(animal.image);
    if (normalized && !images.includes(normalized)) images.push(normalized);
  }
  if (Array.isArray(animal.images)) {
    for (const img of animal.images) {
      const normalized = resolveAssetUrl(img);
      if (normalized && !images.includes(normalized)) images.push(normalized);
    }
  }

  const heroSrc = images[0] || resolveAssetUrl('/fotos_animais_mockups/gato1.jfif');
  image.src = heroSrc;
  withImageFallback(image, '/fotos_animais_mockups/gato1.jfif');
  image.alt = `Foto de ${animal.name || 'animal'}`;
  title.textContent = animal.name || 'Nome não disponível';
  subtitle.textContent = `${animal.type || 'Espécie não informada'} · ${animal.species || ''}`.trim();
  location.textContent = `📍 ${animal.location || 'Local não informado'}`;
  age.textContent = getAnimalAgeLabel(animal);
  size.textContent = animal.size || 'Não informado';
  gender.textContent = animal.gender || 'Não informado';
  description.textContent = animal.description || 'Descrição não disponível.';

  const isOwner = currentUser && animal.created_by && Number(animal.created_by) === Number(currentUser.id);
  if (adoptButton) {
    adoptButton.textContent = isOwner ? 'Editar detalhes' : 'Quero Adotar';
    adoptButton.href = isOwner ? `animal_edit.html?animalId=${encodeURIComponent(animal.id)}` : `animal_adoption.html?animalId=${encodeURIComponent(animal.id)}`;
  }

  // Render thumbnails
  const thumbsContainerFinal = document.getElementById('detailThumbs');
  if (images.length > 1 && thumbsContainerFinal) {
    for (let i = 0; i < images.length; i++) {
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'detail-thumb';
      const imgEl = document.createElement('img');
      imgEl.src = images[i];
      withImageFallback(imgEl, '/fotos_animais_mockups/gato1.jfif');
      imgEl.alt = `${animal.name || 'animal'} - miniatura ${i + 1}`;
      imgEl.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('detailHeroImage').src = images[i];
      });
      thumbWrap.appendChild(imgEl);
      thumbsContainerFinal.appendChild(thumbWrap);
    }
  }

  const tags = Array.isArray(animal.tags) ? animal.tags : JSON.parse(animal.tags || '[]');
  if (tags.length > 0) {
    healthTags.innerHTML = tags.map((tag) => `<span class="health-tag">${tag}</span>`).join('');
  } else {
    healthTags.innerHTML = '<span class="health-tag">Informações não disponíveis</span>';
  }
}

function renderOwnerContact(owner) {
  const ownerNameEl = document.getElementById('ownerName');
  const ownerPhoneEl = document.getElementById('ownerPhone');
  const ownerEmailEl = document.getElementById('ownerEmail');

  if (!owner) {
    if (ownerNameEl) ownerNameEl.textContent = 'Não disponível';
    if (ownerPhoneEl) ownerPhoneEl.textContent = 'Não disponível';
    if (ownerEmailEl) ownerEmailEl.textContent = 'Não disponível';
    return;
  }

  if (ownerNameEl) ownerNameEl.textContent = owner.name || 'Não disponível';
  if (ownerPhoneEl) ownerPhoneEl.textContent = owner.phone || 'Não disponível';
  if (ownerEmailEl) ownerEmailEl.textContent = owner.email || 'Não disponível';
}

function formatOwnerLocation(owner) {
  if (!owner) {
    return null;
  }

  const parts = [];
  if (owner.city) {
    parts.push(owner.city);
  }
  if (owner.state) {
    parts.push(owner.state);
  }
  if (parts.length === 0) {
    return null;
  }
  return `${parts.join(', ')}.`;
}

async function wireAnimalDetailsPage() {
  const animalId = getQueryParam('animalId');
  const result = await fetchAnimalById(animalId);
  const animal = result && result.animal ? result.animal : null;
  const owner = result && result.owner ? result.owner : null;

  if (!animal) {
    showMessage('Animal não encontrado. Verifique se você acessou a página corretamente.');
    return;
  }

  await loadCurrentUser();

  const ownerLocation = formatOwnerLocation(owner);
  if (ownerLocation) {
    animal.location = ownerLocation;
  }

  renderAnimalDetails(animal);
  renderOwnerContact(owner);
}

function renderAdoptionDetails(animal) {
  const image = document.getElementById('adoptionAnimalImage');
  const name = document.getElementById('adoptionAnimalName');
  const subtitle = document.getElementById('adoptionAnimalSubtitle');
  const meta = document.getElementById('adoptionAnimalMeta');
  const description = document.getElementById('adoptionAnimalDescription');
  const note = document.getElementById('adoptionAnimalNote');

  if (!animal || !name || !subtitle || !meta || !description || !image || !note) {
    return;
  }

  image.src = getAnimalImageUrl(animal, '/fotos_animais_mockups/gato1.jfif');
  withImageFallback(image, '/fotos_animais_mockups/gato1.jfif');
  image.alt = `Foto de ${animal.name}`;
  name.textContent = animal.name || 'Animal desconhecido';
  subtitle.textContent = `${animal.type || 'Animal'} · ${getAnimalAgeLabel(animal)} · ${animal.location || 'Local não informado'}`;

  const metaItems = [];
  if (animal.gender) metaItems.push(animal.gender);
  if (animal.size) metaItems.push(animal.size);
  if (animal.tags) {
    const tags = Array.isArray(animal.tags) ? animal.tags : JSON.parse(animal.tags || '[]');
    metaItems.push(...tags.slice(0, 3));
  }

  meta.innerHTML = metaItems.map((item) => `<span>${item}</span>`).join('');
  description.textContent = animal.description || 'Descrição não disponível.';
  note.textContent = 'Esta solicitação será vinculada ao animal selecionado. Você pode acompanhar o status no painel de gerenciamento.';
}

async function fetchCurrentUser() {
  const response = await apiFetch('/api/me');
  return response.user;
}

async function loadUserAnimals() {
  const response = await apiFetch('/api/user/animals');
  return response.animals || [];
}

async function loadUserAnimalsHistory() {
  const response = await apiFetch('/api/user/animals/history');
  return response.animals || [];
}

function createUserAnimalCard(animal) {
  const article = document.createElement('article');
  article.className = 'card';
  const imageUrl = getAnimalImageUrl(animal, '/fotos_animais_mockups/dog1.jfif');
  article.innerHTML = `
    <div class="card-image-wrapper">
      <img class="card-image" src="${imageUrl}" alt="Foto de ${animal.name}">
    </div>
    <div class="card-content">
      <div class="card-meta">
        <span>${animal.type}</span>
        <span>${animal.location || 'Local não informado'}</span>
      </div>
      <h2>${animal.name} • ${animal.gender || '-'}</h2>
      <p>${animal.description}</p>
      <div class="card-extra">
        <div class="card-details">
          <span class="detail-pill">${getAnimalAgeLabel(animal)}</span>
          <span class="detail-pill">${animal.size || 'Tamanho não informado'}</span>
          <span class="detail-pill">${animal.pending_requests_count || 0} pendente(s)</span>
        </div>
        <div class="card-actions"></div>
      </div>
    </div>
  `;

  const cardImage = article.querySelector('.card-image');
  withImageFallback(cardImage, '/fotos_animais_mockups/dog1.jfif');

  const actions = article.querySelector('.card-actions');
  if (actions) {
    const editButton = document.createElement('button');
    editButton.className = 'button button-secondary';
    editButton.type = 'button';
    editButton.textContent = 'Editar';
    editButton.addEventListener('click', () => {
      window.location.href = `animal_edit.html?animalId=${animal.id}`;
    });
    actions.appendChild(editButton);

    const unpublishButton = document.createElement('button');
    unpublishButton.className = 'button button-primary';
    unpublishButton.type = 'button';
    unpublishButton.textContent = 'Despublicar';
    if (Number(animal.pending_requests_count) > 0) {
      unpublishButton.disabled = true;
      unpublishButton.title = 'Não é possível despublicar com solicitações pendentes.';
    }
    if (!unpublishButton.disabled) {
      attachInlineConfirm(unpublishButton, {
        initialLabel: 'Despublicar',
        confirmLabel: 'Confirmar despublicação',
        promptMessage: 'Clique novamente para mover este animal para o histórico.',
        onConfirm: async () => {
          try {
            await apiFetch(`/api/animals/${animal.id}`, { method: 'DELETE' });
            showMessage('Animal despublicado com sucesso.');
            await loadManageAnimalsPage();
          } catch (error) {
            showMessage(error.message);
          }
        }
      });
    }
    actions.appendChild(unpublishButton);
  }

  return article;
}

function renderManageAnimalsSummary(count) {
  return `
    <div class="summary-card">
      <h3>Meus anúncios</h3>
      <p>Você publicou ${count} animal${count === 1 ? '' : 's'}.</p>
    </div>
  `;
}

function createRequestCard(request, isReceivedRequest) {
  const article = document.createElement('article');
  article.className = 'card';

  const statusLabel = request.status.charAt(0).toUpperCase() + request.status.slice(1);
  const requestDate = new Date(request.created_at).toLocaleDateString('pt-BR');
  const animalName = request.animal_name || 'Animal desconhecido';
  const requesterName = request.requester_name || 'Você';
  const animalLocation = request.animal_location || 'Local não informado';
  const imageUrl = resolveAssetUrl(request.animal_image || '/fotos_animais_mockups/dog1.jfif') || '/fotos_animais_mockups/dog1.jfif';

  article.innerHTML = `
    <div class="card-image-wrapper">
      <img class="card-image" src="${imageUrl}" alt="Foto de ${animalName}">
    </div>
    <div class="card-content">
      <div class="card-meta">
        <span>${statusLabel}</span>
        <span>${requestDate}</span>
      </div>
      <h2>${animalName}</h2>
      <p>${isReceivedRequest ? `Solicitante: ${requesterName}` : `Mensagem: ${request.message || 'Nenhuma mensagem enviada.'}`}</p>
      <div class="card-extra">
        <div class="card-details">
          <span class="detail-pill">${request.animal_type || 'Tipo não informado'}</span>
          <span class="detail-pill">${animalLocation}</span>
        </div>
        <div class="card-actions"></div>
      </div>
    </div>
  `;

  const cardImage = article.querySelector('.card-image');
  withImageFallback(cardImage, '/fotos_animais_mockups/dog1.jfif');

  const actions = article.querySelector('.card-actions');
  if (actions && isReceivedRequest && request.status === 'pending') {
    const approveButton = document.createElement('button');
    approveButton.className = 'button button-primary';
    approveButton.type = 'button';
    approveButton.textContent = 'Aprovar';
    approveButton.addEventListener('click', async () => {
      try {
        await apiFetch(`/api/adoption-requests/${request.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'approved' })
        });
        showMessage('Solicitação aprovada.');
        await loadManageAnimalsPage();
      } catch (error) {
        showMessage(error.message);
      }
    });

    const rejectButton = document.createElement('button');
    rejectButton.className = 'button button-secondary';
    rejectButton.type = 'button';
    rejectButton.textContent = 'Rejeitar';
    rejectButton.addEventListener('click', async () => {
      try {
        await apiFetch(`/api/adoption-requests/${request.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'rejected' })
        });
        showMessage('Solicitação rejeitada.');
        await loadManageAnimalsPage();
      } catch (error) {
        showMessage(error.message);
      }
    });

    actions.appendChild(approveButton);
    actions.appendChild(rejectButton);
  }

  if (actions && !isReceivedRequest && request.status === 'pending') {
    const cancelButton = document.createElement('button');
    cancelButton.className = 'button button-secondary';
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancelar solicitação';
    cancelButton.addEventListener('click', async () => {
      try {
        await apiFetch(`/api/adoption-requests/${request.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'cancelled' })
        });
        showMessage('Solicitação cancelada com sucesso.');
        await loadManageAnimalsPage();
      } catch (error) {
        showMessage(error.message);
      }
    });
    actions.appendChild(cancelButton);
  }

  return article;
}

function createPublicationHistoryCard(animal) {
  const article = document.createElement('article');
  article.className = 'card';

  const imageUrl = getAnimalImageUrl(animal, '/fotos_animais_mockups/dog1.jfif');
  const publicationDate = animal.created_at ? new Date(animal.created_at).toLocaleDateString('pt-BR') : 'Não informado';
  const adoptionDate = animal.adopted_at ? new Date(animal.adopted_at).toLocaleDateString('pt-BR') : null;
  const statusLabel = animal.status === 'adopted' ? 'Adotado/Despublicado' : 'Disponível';

  article.innerHTML = `
    <div class="card-image-wrapper">
      <img class="card-image" src="${imageUrl}" alt="Foto de ${animal.name}">
    </div>
    <div class="card-content">
      <div class="card-meta">
        <span>${statusLabel}</span>
        <span>Publicado em ${publicationDate}</span>
      </div>
      <h2>${animal.name}</h2>
      <p>${animal.description || 'Sem descrição'}</p>
      <div class="card-extra">
        <div class="card-details">
          <span class="detail-pill">${getAnimalAgeLabel(animal)}</span>
          <span class="detail-pill">${animal.type || 'Tipo não informado'}</span>
          <span class="detail-pill">${animal.location || 'Local não informado'}</span>
          <span class="detail-pill">${adoptionDate ? `Adotado em ${adoptionDate}` : 'Sem adoção registrada'}</span>
        </div>
      </div>
    </div>
  `;

  const cardImage = article.querySelector('.card-image');
  withImageFallback(cardImage, '/fotos_animais_mockups/dog1.jfif');

  return article;
}

function setFormValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value || '';
  }
}

function getAdminRoleLabel(role) {
  return role === 'admin' ? 'Administrador' : 'Usuário';
}

function getSuspensionLabel(user) {
  return user && user.is_suspended ? 'Suspenso' : 'Ativo';
}

function getAnimalVisibilityLabel(animal) {
  return animal && animal.is_hidden ? 'Oculto' : 'Visível';
}

function createAdminBadge(label, tone = 'neutral') {
  return `<span class="admin-badge admin-badge-${tone}">${escapeHtml(label)}</span>`;
}

function createAdminUserCard(user) {
  const article = document.createElement('article');
  article.className = 'admin-item-card';

  const city = [user.city, user.state].filter(Boolean).join(', ') || 'Local não informado';
  const suspensionReason = user.suspension_reason ? escapeHtml(user.suspension_reason) : 'Sem motivo registrado';
  const isCurrentUser = currentUser && Number(currentUser.id) === Number(user.id);
  const roleButtonLabel = user.role === 'admin' ? 'Remover admin' : 'Promover a admin';
  const roleButtonClass = user.role === 'admin' ? 'button-secondary' : 'button-primary';
  const suspendButtonLabel = user.is_suspended ? 'Reativar conta' : 'Suspender conta';
  const suspendButtonClass = user.is_suspended ? 'button-primary' : 'button-secondary';

  article.innerHTML = `
    <div class="admin-item-header">
      <div>
        <h3>${escapeHtml(user.name || 'Usuário sem nome')}</h3>
        <p>${escapeHtml(user.email || 'E-mail não informado')}</p>
      </div>
      <div class="admin-badge-row">
        ${createAdminBadge(getAdminRoleLabel(user.role), user.role === 'admin' ? 'accent' : 'neutral')}
        ${createAdminBadge(getSuspensionLabel(user), user.is_suspended ? 'danger' : 'success')}
      </div>
    </div>
    <div class="admin-item-meta">
      <span>Cidade: ${escapeHtml(city)}</span>
      <span>Criado em ${escapeHtml(formatDateTime(user.created_at))}</span>
      <span>${isCurrentUser ? 'Sua conta atual' : `ID ${escapeHtml(user.id)}`}</span>
    </div>
    <div class="admin-inline-note${user.is_suspended ? '' : ' hidden'}">
      <strong>Motivo da suspensão:</strong> ${suspensionReason}
    </div>
    <div class="admin-action-stack">
      <label class="label-group admin-inline-field${user.is_suspended ? ' hidden' : ''}">
        <span>Motivo da suspensão</span>
        <textarea class="admin-reason-input" rows="2" placeholder="Descreva o motivo da ação"></textarea>
      </label>
      <div class="card-actions admin-card-actions">
        <button class="button ${roleButtonClass} admin-role-button" type="button">${roleButtonLabel}</button>
        <button class="button ${suspendButtonClass} admin-suspend-button" type="button" ${isCurrentUser && !user.is_suspended ? 'disabled' : ''}>${suspendButtonLabel}</button>
      </div>
    </div>
  `;

  const cardImage = article.querySelector('.card-image');
  withImageFallback(cardImage, '/fotos_animais_mockups/dog1.jfif');

  const roleButton = article.querySelector('.admin-role-button');
  const suspendButton = article.querySelector('.admin-suspend-button');
  const reasonInput = article.querySelector('.admin-reason-input');

  if (roleButton) {
    attachInlineConfirm(roleButton, {
      initialLabel: roleButtonLabel,
      confirmLabel: user.role === 'admin' ? 'Confirmar remoção' : 'Confirmar promoção',
      promptMessage: user.role === 'admin' ? 'Clique novamente para remover privilégios administrativos.' : 'Clique novamente para promover este usuário a administrador.',
      onConfirm: async () => {
        try {
          await apiFetch(`/api/admin/users/${user.id}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role: user.role === 'admin' ? 'user' : 'admin' })
          });
          showMessage('Permissão atualizada com sucesso.', 'success');
          await loadAdminPanelPage();
        } catch (error) {
          showMessage(error.message, 'error');
        }
      }
    });
  }

  if (suspendButton) {
    if (isCurrentUser && !user.is_suspended) {
      suspendButton.title = 'Você não pode suspender sua própria conta.';
    } else {
      attachInlineConfirm(suspendButton, {
        initialLabel: suspendButtonLabel,
        confirmLabel: user.is_suspended ? 'Confirmar reativação' : 'Confirmar suspensão',
        promptMessage: user.is_suspended ? 'Clique novamente para reativar a conta.' : 'Clique novamente para suspender a conta.',
        onConfirm: async () => {
          try {
            if (user.is_suspended) {
              await apiFetch(`/api/admin/users/${user.id}/reactivate`, { method: 'PATCH' });
              showMessage('Conta reativada com sucesso.', 'success');
            } else {
              const reason = reasonInput ? reasonInput.value.trim() : '';
              await apiFetch(`/api/admin/users/${user.id}/suspend`, {
                method: 'PATCH',
                body: JSON.stringify({ reason })
              });
              showMessage('Conta suspensa com sucesso.', 'success');
            }
            await loadAdminPanelPage();
          } catch (error) {
            showMessage(error.message, 'error');
          }
        }
      });
    }
  }

  return article;
}

function createAdminAnimalCard(animal) {
  const article = document.createElement('article');
  article.className = 'admin-item-card';

  const moderationText = animal.hidden_reason ? escapeHtml(animal.hidden_reason) : 'Sem motivo registrado';
  const actionLabel = animal.is_hidden ? 'Reativar anúncio' : 'Ocultar anúncio';
  const actionClass = animal.is_hidden ? 'button-primary' : 'button-secondary';

  article.innerHTML = `
    <div class="admin-item-header">
      <div>
        <h3>${escapeHtml(animal.name || 'Animal sem nome')}</h3>
        <p>${escapeHtml(animal.type || 'Tipo não informado')} · ${escapeHtml(animal.location || 'Local não informado')}</p>
      </div>
      <div class="admin-badge-row">
        ${createAdminBadge(getAnimalVisibilityLabel(animal), animal.is_hidden ? 'danger' : 'success')}
        ${createAdminBadge(animal.status === 'adopted' ? 'Adotado' : 'Disponível', animal.status === 'adopted' ? 'neutral' : 'accent')}
      </div>
    </div>
    <p class="admin-item-description">${escapeHtml(animal.description || 'Sem descrição cadastrada.')}</p>
    <div class="admin-item-meta">
      <span>${escapeHtml(getAnimalAgeLabel(animal))}</span>
      <span>${escapeHtml(animal.gender || 'Sexo não informado')}</span>
      <span>Doador ID ${escapeHtml(animal.posted_by || 'não informado')}</span>
    </div>
    <div class="admin-inline-note${animal.is_hidden ? '' : ' hidden'}">
      <strong>Motivo da ocultação:</strong> ${moderationText}
    </div>
    <div class="admin-action-stack">
      <label class="label-group admin-inline-field${animal.is_hidden ? ' hidden' : ''}">
        <span>Motivo da moderação</span>
        <textarea class="admin-reason-input" rows="2" placeholder="Explique por que o anúncio está sendo ocultado"></textarea>
      </label>
      <div class="card-actions admin-card-actions">
        <button class="button ${actionClass} admin-visibility-button" type="button">${actionLabel}</button>
      </div>
    </div>
  `;

  const visibilityButton = article.querySelector('.admin-visibility-button');
  const reasonInput = article.querySelector('.admin-reason-input');

  if (visibilityButton) {
    attachInlineConfirm(visibilityButton, {
      initialLabel: actionLabel,
      confirmLabel: animal.is_hidden ? 'Confirmar reativação' : 'Confirmar ocultação',
      promptMessage: animal.is_hidden ? 'Clique novamente para reativar este anúncio.' : 'Clique novamente para ocultar este anúncio.',
      onConfirm: async () => {
        try {
          if (animal.is_hidden) {
            await apiFetch(`/api/admin/animals/${animal.id}/unhide`, { method: 'PATCH' });
            showMessage('Anúncio reativado com sucesso.', 'success');
          } else {
            const reason = reasonInput ? reasonInput.value.trim() : '';
            await apiFetch(`/api/admin/animals/${animal.id}/hide`, {
              method: 'PATCH',
              body: JSON.stringify({ reason })
            });
            showMessage('Anúncio ocultado com sucesso.', 'success');
          }
          await loadAdminPanelPage();
        } catch (error) {
          showMessage(error.message, 'error');
        }
      }
    });
  }

  return article;
}

function createAdminRequestCard(request) {
  const article = document.createElement('article');
  article.className = 'admin-item-card';

  const statusTone = request.status === 'approved'
    ? 'success'
    : request.status === 'rejected' || request.status === 'cancelled'
      ? 'danger'
      : 'accent';
  const message = request.message ? escapeHtml(request.message) : 'Nenhuma mensagem enviada.';

  article.innerHTML = `
    <div class="admin-item-header">
      <div>
        <h3>${escapeHtml(request.animal_name || 'Animal não informado')}</h3>
        <p>Solicitante: ${escapeHtml(request.requester_name || 'Não informado')} · Doador: ${escapeHtml(request.donor_name || 'Não informado')}</p>
      </div>
      <div class="admin-badge-row">
        ${createAdminBadge(escapeHtml(request.status || 'pendente'), statusTone)}
      </div>
    </div>
    <p class="admin-item-description">${message}</p>
    <div class="admin-item-meta">
      <span>${escapeHtml(request.animal_type || 'Tipo não informado')}</span>
      <span>${escapeHtml(request.animal_location || 'Local não informado')}</span>
      <span>Criada em ${escapeHtml(formatDateTime(request.created_at))}</span>
    </div>
  `;

  return article;
}

function renderAdminMetrics(metrics) {
  const mapping = {
    metricActiveUsers: metrics.activeUsers,
    metricSuspendedUsers: metrics.suspendedUsers,
    metricAdmins: metrics.totalAdmins,
    metricAvailableAnimals: metrics.availableAnimals,
    metricHiddenAnimals: metrics.hiddenAnimals,
    metricPendingRequests: metrics.pendingRequests
  };

  Object.entries(mapping).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = Number.isFinite(Number(value)) ? String(value) : '--';
    }
  });
}

function renderAdminList(containerId, emptyId, items, createItem) {
  const container = document.getElementById(containerId);
  const emptyState = document.getElementById(emptyId);
  if (!container || !emptyState) {
    return;
  }

  container.innerHTML = '';
  if (!items.length) {
    container.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  container.classList.remove('hidden');
  emptyState.classList.add('hidden');
  items.forEach((item) => container.appendChild(createItem(item)));
}

async function loadAdminPanelPage() {
  if (!getAuthToken()) {
    window.location.href = 'user_login.html';
    return;
  }

  await loadCurrentUser();
  updateAuthActions();

  if (!currentUser || currentUser.role !== 'admin') {
    showMessage('Acesso restrito ao painel administrativo.', 'error');
    window.setTimeout(() => {
      window.location.href = 'animal_listing.html';
    }, 900);
    return;
  }

  try {
    const [metricsResponse, usersResponse, animalsResponse, requestsResponse] = await Promise.all([
      apiFetch('/api/admin/metrics'),
      apiFetch('/api/admin/users'),
      apiFetch('/api/admin/animals'),
      apiFetch('/api/admin/adoption-requests')
    ]);

    renderAdminMetrics(metricsResponse.metrics || {});
    renderAdminList('adminUsersList', 'adminUsersEmpty', usersResponse.users || [], createAdminUserCard);
    renderAdminList('adminAnimalsList', 'adminAnimalsEmpty', animalsResponse.animals || [], createAdminAnimalCard);
    renderAdminList('adminRequestsList', 'adminRequestsEmpty', requestsResponse.requests || [], createAdminRequestCard);
  } catch (error) {
    showMessage(`Erro ao carregar painel admin: ${error.message}`, 'error');
  }
}

let profileMenuEventsBound = false;

function getProfileImage() {
  const storedImage = localStorage.getItem('userProfileImage');
  if (storedImage) {
    return resolveAssetUrl(storedImage) || storedImage;
  }
  if (currentUser && currentUser.profile_image_url) {
    return resolveAssetUrl(currentUser.profile_image_url) || currentUser.profile_image_url;
  }

  return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="%233c3c3c"%3E%3Ccircle cx="32" cy="32" r="30" fill="%23f4f4f4"/%3E%3Cpath d="M32 18c6.6 0 12 5.4 12 12s-5.4 12-12 12-12-5.4-12-12 5.4-12 12-12zm0 26c10 0 18 5 18 11v3H14v-3c0-6 8-11 18-11z"/%3E%3C/svg%3E';
}

function closeProfileMenu() {
  const button = document.getElementById('profileMenuButton');
  const dropdown = document.getElementById('profileDropdown');

  if (button && dropdown && !dropdown.classList.contains('hidden')) {
    button.setAttribute('aria-expanded', 'false');
    dropdown.classList.add('hidden');
  }
}

function bindProfileMenu() {
  const button = document.getElementById('profileMenuButton');
  const dropdown = document.getElementById('profileDropdown');
  const wrapper = document.querySelector('.profile-dropdown-wrapper');
  const logoutButton = document.getElementById('logoutButton');

  if (!button || !dropdown || !wrapper) {
    return;
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    dropdown.classList.toggle('hidden', expanded);
  });

  wrapper.addEventListener('click', (event) => event.stopPropagation());

  if (!profileMenuEventsBound) {
    document.addEventListener('click', closeProfileMenu);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeProfileMenu();
      }
    });
    profileMenuEventsBound = true;
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      clearAuthToken();
      window.location.reload();
    });
  }
}

function updateMainNav() {
  const nav = document.querySelector('.site-nav');
  if (!nav) {
    return;
  }

  const navItems = [
    { href: 'animal_listing.html', label: 'Animais disponíveis para adoção', className: 'nav-primary-link' }
  ];

  nav.innerHTML = navItems
    .map((item) => `<a class="${item.className}" href="${item.href}">${item.label}</a>`)
    .join('');
}

function updateFooterTermsLink() {
  const footerInner = document.querySelector('.footer-inner');
  if (!footerInner) {
    return;
  }

  const existingLink = footerInner.querySelector('.footer-terms-link');
  if (existingLink) {
    return;
  }

  const termsLink = document.createElement('a');
  termsLink.className = 'footer-terms-link';
  termsLink.href = 'termos_servicos.html';
  termsLink.textContent = 'Termos e Serviços';
  footerInner.appendChild(termsLink);
}

function updateGuestRegistrationLinks() {
  const loggedIn = Boolean(getAuthToken());
  const ctaLinks = Array.from(document.querySelectorAll('a[href="animal_registration.html"]'));

  ctaLinks.forEach((link) => {
    if (loggedIn) {
      link.href = 'animal_registration.html';
      if (link.dataset.guestLabel) {
        link.textContent = link.dataset.authLabel || link.textContent;
      }
      return;
    }

    link.dataset.authLabel = link.textContent;
    link.dataset.guestLabel = 'true';
    link.href = 'user_login.html';

    if (link.closest('.hero-actions')) {
      link.textContent = 'Entrar para cadastrar animal';
    } else if (link.closest('.page-intro-actions')) {
      link.textContent = 'Entrar para anunciar animal';
    }
  });
}

function updateAuthActions() {
  updateFooterTermsLink();
  updateMainNav();
  activateCurrentNavLink();
  updateGuestRegistrationLinks();

  const actions = document.querySelector('.actions');
  if (!actions) {
    return;
  }

  if (getAuthToken()) {
    const profileImage = getProfileImage();
    const adminMenuItem = currentUser && currentUser.role === 'admin'
      ? '<a class="dropdown-item" href="admin_panel.html">Painel admin</a>'
      : '';
    actions.innerHTML = `
      <a class="button button-primary" href="manage_animals.html">Gerenciar animais</a>
      <div class="profile-dropdown-wrapper">
        <button class="profile-button" id="profileMenuButton" type="button" aria-expanded="false" aria-label="Abrir menu do usuário">
          <img class="profile-picture" src="${profileImage}" alt="Foto de perfil">
        </button>
        <div class="profile-dropdown hidden" id="profileDropdown">
          ${adminMenuItem}
          <a class="dropdown-item" href="user_options.html">Opções do usuário</a>
          <button class="dropdown-item dropdown-logout" id="logoutButton" type="button">Sair</button>
        </div>
      </div>
    `;

    bindProfileMenu();
  } else {
    actions.innerHTML = `
      <a class="button button-link" href="user_login.html">Entrar</a>
      <a class="button button-primary" href="user_registration.html">Cadastrar</a>
    `;
  }

}

async function loadAnimalData() {
  try {
    const response = await apiFetch('/api/animals');
    return response.animals || [];
  } catch (error) {
    console.warn('Falha ao carregar animais do servidor.', error.message || error);
    return [];
  }
}

function addTag(tagValue, tagList) {
  const value = tagValue.trim();
  if (!value) {
    return;
  }

  const duplicate = Array.from(tagList.querySelectorAll('.tag')).some((tag) => tag.textContent.trim().toLowerCase() === value.toLowerCase());
  if (duplicate) {
    return;
  }

  const tagEl = document.createElement('span');
  tagEl.className = 'tag';
  tagEl.textContent = value;
  tagEl.addEventListener('click', () => tagEl.remove());
  tagList.appendChild(tagEl);
}

function initializeTagInput() {
  const tagInput = document.getElementById('tag-input');
  const addButton = document.querySelector('.tag-input-group button');
  const tagList = document.querySelector('.tag-list');

  if (!tagInput || !addButton || !tagList) {
    return;
  }

  addButton.addEventListener('click', () => {
    addTag(tagInput.value, tagList);
    tagInput.value = '';
    tagInput.focus();
  });

  tagInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTag(tagInput.value, tagList);
      tagInput.value = '';
    }
  });
}

function getFormTags() {
  return Array.from(document.querySelectorAll('.tag-list .tag')).map((item) => item.textContent.trim());
}

function setFormTags(tags) {
  const tagList = document.querySelector('.tag-list');
  if (!tagList) {
    return;
  }
  tagList.innerHTML = '';
  const parsedTags = Array.isArray(tags) ? tags : JSON.parse(tags || '[]');
  parsedTags.forEach((tag) => addTag(tag, tagList));
}

async function wireAnimalEditPage() {
  const animalId = getQueryParam('animalId');
  if (!animalId) {
    showMessage('Animal não encontrado. Verifique se você acessou a página corretamente.');
    return;
  }

  if (!getAuthToken()) {
    showMessage('Faça login para editar este animal.');
    return;
  }

  initializeTagInput();
  await loadCurrentUser();
  const animalData = await fetchAnimalById(animalId);
  const animal = animalData && animalData.animal ? animalData.animal : null;
  if (!animal) {
    showMessage('Animal não encontrado. Verifique se você acessou a página corretamente.');
    return;
  }

  if (!currentUser || Number(animal.posted_by || animal.created_by) !== Number(currentUser.id)) {
    showMessage('Você não tem permissão para editar este animal.');
    return;
  }

  const heading = document.querySelector('.page-intro h1');
  if (heading) {
    heading.textContent = `Editar ${animal.name}`;
  }

  const petName = document.getElementById('pet-name');
  const species = document.getElementById('species');
  const age = document.getElementById('age');
  const gender = document.getElementById('gender');
  const size = document.getElementById('size');
  const description = document.getElementById('description');

  const currentImageEl = document.getElementById('editCurrentImage');
  if (currentImageEl) {
    currentImageEl.src = getAnimalImageUrl(animal, '/fotos_animais_mockups/gato1.jfif');
    currentImageEl.alt = `Foto atual de ${animal.name || 'animal'}`;
  }

  const mainPhotoInput = document.getElementById('main-photo');
  let previewUrl = null;
  if (mainPhotoInput) {
    mainPhotoInput.addEventListener('change', (evt) => {
      const file = evt.target.files && evt.target.files[0];
      if (!file) return;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      previewUrl = URL.createObjectURL(file);
      if (currentImageEl) currentImageEl.src = previewUrl;
    });
  }

  if (petName) petName.value = animal.name || '';
  if (species) species.value = animal.type || animal.species || 'Gato';
  if (age) age.value = getAnimalAgeMonths(animal) ?? '';
  if (gender) gender.value = animal.gender || 'Fêmea';
  if (size) size.value = animal.size || 'Pequeno';
  if (description) description.value = animal.description || '';
  setFormTags(animal.tags);

  const form = document.querySelector('.registration-form');
  if (!form) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const mainPhoto = document.getElementById('main-photo');
    const petNameInput = document.getElementById('pet-name');
    const speciesInput = document.getElementById('species');
    const ageInput = document.getElementById('age');
    const genderInput = document.getElementById('gender');
    const sizeInput = document.getElementById('size');
    const descriptionInput = document.getElementById('description');

    if (!petNameInput.value || !speciesInput.value || !descriptionInput.value) {
      showMessage('Nome do animal, espécie e descrição são obrigatórios.');
      return;
    }

    const formData = new FormData();
    formData.append('petName', petNameInput.value);
    formData.append('species', speciesInput.value);
    formData.append('age', ageInput.value);
    formData.append('gender', genderInput.value);
    formData.append('size', sizeInput.value);
    formData.append('description', descriptionInput.value);
    formData.append('tags', JSON.stringify(getFormTags()));

    if (mainPhoto && mainPhoto.files && mainPhoto.files[0]) {
      formData.append('mainPhoto', mainPhoto.files[0]);
    }

    try {
      await apiFetch(`/api/animals/${animalId}`, {
        method: 'PATCH',
        body: formData
      });
      showMessage('Dados do animal atualizados com sucesso.');
      window.location.href = `animal_details.html?animalId=${encodeURIComponent(animalId)}`;
    } catch (error) {
      showMessage(error.message);
    }
  });

    const deleteButton = document.getElementById('deleteAnimalButton');
    if (deleteButton) {
      attachInlineConfirm(deleteButton, {
        initialLabel: 'Despublicar animal',
        confirmLabel: 'Confirmar despublicação',
        promptMessage: 'Clique novamente para mover este animal para o histórico.',
        onConfirm: async () => {
          try {
            await apiFetch(`/api/animals/${animalId}`, { method: 'DELETE' });
            showMessage('Animal despublicado com sucesso.');
            window.setTimeout(() => { window.location.href = 'animal_listing.html'; }, 800);
          } catch (err) {
            showMessage(err.message || 'Falha ao despublicar o animal.');
          }
        }
      });
    }
}

function wireRegistrationForm() {
  const form = document.querySelector('.auth-form');
  if (!form) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = document.getElementById('name');
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const phone = document.getElementById('phone');
    const country = document.getElementById('country');
    const city = document.getElementById('city');
    const state = document.getElementById('state');
    const street = document.getElementById('street');
    const apartmentUnit = document.getElementById('apartment-unit');
    const zip = document.getElementById('zip');
    const termsConsent = document.getElementById('termsConsent');

    if (!name.value || !email.value || !password.value) {
      showMessage('Por favor, preencha os campos obrigatórios.');
      return;
    }

    if (termsConsent && !termsConsent.checked) {
      showMessage('Você precisa concordar com os Termos e Serviços para criar a conta.');
      return;
    }

    try {
      const profilePhoto = document.getElementById('profilePhoto');
      const formData = new FormData();
      formData.append('name', name.value);
      formData.append('email', email.value);
      formData.append('password', password.value);
      formData.append('phone', phone.value);
      formData.append('country', country.value);
      formData.append('city', city.value);
      formData.append('state', state.value);
      formData.append('street', street.value);
      formData.append('apartmentUnit', apartmentUnit.value);
      formData.append('zipCode', zip.value);
      if (profilePhoto && profilePhoto.files.length > 0) {
        formData.append('profilePhoto', profilePhoto.files[0]);
      }

      await apiFetch('/api/register', {
        method: 'POST',
        body: formData
      });
      showMessage('Cadastro realizado com sucesso. Faça login para continuar.');
      window.location.href = 'user_login.html';
    } catch (error) {
      showMessage(error.message);
    }
  });
}

function wireLoginForm() {
  const form = document.querySelector('.auth-form');
  if (!form) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email-login');
    const password = document.getElementById('password-login');

    if (!email.value || !password.value) {
      showMessage('Por favor, preencha o e-mail e a senha.');
      return;
    }

    try {
      const response = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.value,
          password: password.value
        })
      });

      setAuthToken(response.token);
      showMessage('Login realizado com sucesso.');
      window.location.href = 'animal_listing.html';
    } catch (error) {
      showMessage(error.message);
    }
  });
}

async function wireAdoptionPage() {
  const authSection = document.getElementById('adoptionAuthSection');
  const requestSection = document.getElementById('adoptionRequestSection');
  const requestButton = document.getElementById('requestAdoptionButton');
  const animalId = getQueryParam('animalId');

  if (!authSection || !requestSection) {
    return;
  }

  const animalData = await fetchAnimalById(animalId);
  const animal = animalData && animalData.animal ? animalData.animal : null;
  if (animal) {
    renderAdoptionDetails(animal);
  }

  if (!animal) {
    authSection.classList.add('hidden');
    requestSection.classList.remove('hidden');
    requestSection.innerHTML = '<div class="auth-form"><h2>Animal não encontrado</h2><p>Não foi possível carregar este animal.</p></div>';
    return;
  }

  const loggedIn = Boolean(getAuthToken());
  if (!loggedIn) {
    authSection.classList.remove('hidden');
    requestSection.classList.add('hidden');
    return;
  }

  await loadCurrentUser();
  const isOwner = currentUser && Number(animal.posted_by) === Number(currentUser.id);
  if (isOwner) {
    authSection.classList.add('hidden');
    requestSection.classList.remove('hidden');
    requestSection.innerHTML = `
      <div class="auth-form">
        <h2>Este animal é seu anúncio</h2>
        <p>Você não pode solicitar adoção do próprio animal.</p>
        <div class="form-actions">
          <a class="button button-primary detail-action" href="animal_edit.html?animalId=${encodeURIComponent(animal.id)}">Editar detalhes</a>
        </div>
      </div>
    `;
    return;
  }

  if (animal.status !== 'available') {
    authSection.classList.add('hidden');
    requestSection.classList.remove('hidden');
    requestSection.innerHTML = '<div class="auth-form"><h2>Adoção encerrada</h2><p>Este animal já foi adotado e não recebe novas solicitações.</p></div>';
    return;
  }

  let myRequestsForAnimal = [];
  try {
    const allMyRequests = await apiFetch('/api/adoption-requests/my').then((data) => data.requests || []);
    myRequestsForAnimal = allMyRequests.filter((item) => Number(item.animal_id) === Number(animal.id));
  } catch (error) {
    showMessage(error.message);
    return;
  }

  const hasApproved = myRequestsForAnimal.some((item) => item.status === 'approved');
  if (hasApproved) {
    authSection.classList.add('hidden');
    requestSection.classList.remove('hidden');
    requestSection.innerHTML = '<div class="auth-form"><h2>Solicitação já aprovada</h2><p>Você já possui uma adoção aprovada para este animal.</p></div>';
    return;
  }

  const hasPending = myRequestsForAnimal.some((item) => item.status === 'pending');
  if (hasPending) {
    authSection.classList.add('hidden');
    requestSection.classList.remove('hidden');
    requestSection.innerHTML = '<div class="auth-form"><h2>Solicitação enviada</h2><p>Seu pedido está em análise pelo doador.</p></div>';
    return;
  }

  authSection.classList.add('hidden');
  requestSection.classList.remove('hidden');

  if (requestButton) {
    requestButton.addEventListener('click', async () => {
      if (!animalId) {
        showMessage('ID do animal não foi encontrado.');
        return;
      }

      try {
        await apiFetch('/api/adoption-requests', {
          method: 'POST',
          body: JSON.stringify({
            animalId: Number(animalId),
            message: 'Gostaria de adotar este animal.'
          })
        });
        showMessage('Solicitação de adoção enviada com sucesso. Você pode acompanhar o status em Meus animais.');
        requestButton.disabled = true;
        requestButton.textContent = 'Solicitação enviada';
      } catch (error) {
        showMessage(error.message);
      }
    });
  }
}

async function wireUserOptionsPage() {
  const form = document.querySelector('.auth-form');
  if (!form) {
    return;
  }

  try {
    const user = await fetchCurrentUser();
    setFormValue('name', user.name);
    setFormValue('email', user.email);
    setFormValue('phone', user.phone);
    setFormValue('country', user.country);
    setFormValue('state', user.state);
    setFormValue('city', user.city);
    setFormValue('street', user.street);
    setFormValue('zip', user.zip_code);
    setFormValue('apartment-unit', user.apartment_unit);
  } catch (error) {
    showMessage(error.message);
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = document.getElementById('name');
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const phone = document.getElementById('phone');
    const country = document.getElementById('country');
    const city = document.getElementById('city');
    const state = document.getElementById('state');
    const street = document.getElementById('street');
    const apartmentUnit = document.getElementById('apartment-unit');
    const zip = document.getElementById('zip');

    if (!name.value || !email.value) {
      showMessage('Nome e e-mail são obrigatórios.');
      return;
    }

    try {
      const profilePhoto = document.getElementById('profilePhoto');
      const formData = new FormData();
      formData.append('name', name.value);
      formData.append('email', email.value);
      formData.append('phone', phone.value);
      formData.append('country', country.value);
      formData.append('city', city.value);
      formData.append('state', state.value);
      formData.append('street', street.value);
      formData.append('apartmentUnit', apartmentUnit.value);
      formData.append('zipCode', zip.value);
      if (password.value) {
        formData.append('password', password.value);
      }
      if (profilePhoto && profilePhoto.files.length > 0) {
        formData.append('profilePhoto', profilePhoto.files[0]);
      }

      await apiFetch('/api/user', {
        method: 'PATCH',
        body: formData
      });

      showMessage('Dados atualizados com sucesso.');
      if (password.value) {
        clearAuthToken();
        showMessage('Senha atualizada. Faça login novamente.');
        window.location.href = 'user_login.html';
        return;
      }
    } catch (error) {
      showMessage(error.message);
    }
  });

  const deleteButton = document.getElementById('deleteAccountButton');
  if (deleteButton) {
    attachInlineConfirm(deleteButton, {
      initialLabel: 'Excluir conta',
      confirmLabel: 'Confirmar exclusão',
      promptMessage: 'Clique novamente para excluir sua conta permanentemente.',
      onConfirm: async () => {
        try {
          await apiFetch('/api/user', { method: 'DELETE' });
          clearAuthToken();
          showMessage('Conta excluída com sucesso.');
          window.location.href = 'home.html';
        } catch (error) {
          showMessage(error.message);
        }
      }
    });
  }
}

async function loadManageAnimalsPage() {
  if (!getAuthToken()) {
    showMessage('Faça login para acessar o painel de gerenciamento.');
    window.location.href = 'user_login.html';
    return;
  }

  // Animais Adotados - My requests section
  const myRequestCards = document.getElementById('myRequestCards');
  const myRequestsEmpty = document.getElementById('myRequestsEmpty');
  const adoptionHistoryCards = document.getElementById('adoptionHistoryCards');
  const adoptionHistoryEmpty = document.getElementById('adoptionHistoryEmpty');

  // Animais Postados - User animals and received requests section
  const userAnimalCards = document.getElementById('userAnimalCards');
  const userAnimalsEmpty = document.getElementById('userAnimalsEmpty');
  const receivedRequestCards = document.getElementById('receivedRequestCards');
  const receivedRequestsEmpty = document.getElementById('receivedRequestsEmpty');
  const postedHistoryCards = document.getElementById('postedHistoryCards');
  const postedHistoryEmpty = document.getElementById('postedHistoryEmpty');

  if (!myRequestCards || !userAnimalCards || !receivedRequestCards) {
    return;
  }

  try {
    const animals = await loadUserAnimals();
    const animalHistory = await loadUserAnimalsHistory();
    const myRequests = await apiFetch('/api/adoption-requests/my').then((data) => data.requests || []);
    const receivedRequests = await apiFetch('/api/adoption-requests/received').then((data) => data.requests || []);

    // === Animais Adotados Section ===
    // Separate user's adoption requests by status
    const ongoingRequests = myRequests.filter((req) => req.status === 'pending');
    const adoptedHistory = myRequests.filter((req) => req.status === 'approved');

    // Render ongoing requests
    myRequestCards.innerHTML = '';
    if (ongoingRequests.length === 0) {
      myRequestCards.classList.add('hidden');
      if (myRequestsEmpty) myRequestsEmpty.classList.remove('hidden');
    } else {
      myRequestCards.classList.remove('hidden');
      if (myRequestsEmpty) myRequestsEmpty.classList.add('hidden');
      ongoingRequests.forEach((request) => {
        myRequestCards.appendChild(createRequestCard(request, false));
      });
    }

    // Render adoption history
    adoptionHistoryCards.innerHTML = '';
    if (adoptedHistory.length === 0) {
      adoptionHistoryCards.classList.add('hidden');
      if (adoptionHistoryEmpty) adoptionHistoryEmpty.classList.remove('hidden');
    } else {
      adoptionHistoryCards.classList.remove('hidden');
      if (adoptionHistoryEmpty) adoptionHistoryEmpty.classList.add('hidden');
      adoptedHistory.forEach((request) => {
        adoptionHistoryCards.appendChild(createRequestCard(request, false));
      });
    }

    // === Animais Postados Section ===
    // Render currently posted animals
    userAnimalCards.innerHTML = '';
    if (animals.length === 0) {
      userAnimalCards.classList.add('hidden');
      if (userAnimalsEmpty) userAnimalsEmpty.classList.remove('hidden');
    } else {
      userAnimalCards.classList.remove('hidden');
      if (userAnimalsEmpty) userAnimalsEmpty.classList.add('hidden');
      animals.forEach((animal) => {
        userAnimalCards.appendChild(createUserAnimalCard(animal));
      });
    }

    // Separate received requests by status
    const pendingReceivedRequests = receivedRequests.filter((req) => req.status === 'pending');
    // Render received adoption requests (ongoing)
    receivedRequestCards.innerHTML = '';
    if (pendingReceivedRequests.length === 0) {
      receivedRequestCards.classList.add('hidden');
      if (receivedRequestsEmpty) receivedRequestsEmpty.classList.remove('hidden');
    } else {
      receivedRequestCards.classList.remove('hidden');
      if (receivedRequestsEmpty) receivedRequestsEmpty.classList.add('hidden');
      pendingReceivedRequests.forEach((request) => {
        receivedRequestCards.appendChild(createRequestCard(request, true));
      });
    }

    // Render posted history (all published animals, including adopted/unpublished)
    postedHistoryCards.innerHTML = '';
    if (animalHistory.length === 0) {
      postedHistoryCards.classList.add('hidden');
      if (postedHistoryEmpty) postedHistoryEmpty.classList.remove('hidden');
    } else {
      postedHistoryCards.classList.remove('hidden');
      if (postedHistoryEmpty) postedHistoryEmpty.classList.add('hidden');
      animalHistory.forEach((animal) => {
        postedHistoryCards.appendChild(createPublicationHistoryCard(animal));
      });
    }
  } catch (error) {
    showMessage(`Erro ao carregar dados: ${error.message}`);
  }
}

function wireAnimalRegistrationForm() {
  const form = document.querySelector('.registration-form');
  if (!form) {
    return;
  }

  initializeTagInput();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!getAuthToken()) {
      showMessage('Faça login antes de cadastrar um animal.');
      return;
    }

    const mainPhoto = document.getElementById('main-photo');
    const petName = document.getElementById('pet-name');
    const species = document.getElementById('species');
    const age = document.getElementById('age');
    const gender = document.getElementById('gender');
    const size = document.getElementById('size');
    const description = document.getElementById('description');

    if (!petName.value || !species.value || !description.value) {
      showMessage('Nome do animal, espécie e descrição são obrigatórios.');
      return;
    }

    const formData = new FormData();
    formData.append('petName', petName.value);
    formData.append('species', species.value);
    formData.append('age', String(parseAgeInput(age.value) ?? ''));
    formData.append('gender', gender.value);
    formData.append('size', size.value);
    formData.append('description', description.value);
    formData.append('tags', JSON.stringify(getFormTags()));

    if (mainPhoto && mainPhoto.files && mainPhoto.files[0]) {
      formData.append('mainPhoto', mainPhoto.files[0]);
    }

    try {
      await apiFetch('/api/animals', {
        method: 'POST',
        body: formData
      });
      showMessage('Animal cadastrado com sucesso.');
      window.location.href = 'animal_listing.html';
    } catch (error) {
      showMessage(error.message);
    }
  });
}

async function initializeAnimalListing() {
  const sentinel = document.getElementById('scrollTrigger');
  const cardContainer = document.getElementById('animalCards');
  if (!cardContainer) {
    return;
  }

  await loadCurrentUser();

  animalListingData = (await loadAnimalData()).filter((animal) => animal.status !== 'adopted');
  filteredAnimalListingData = animalListingData.slice();
  nextItemIndex = 0;
  isLoading = false;
  bindAnimalFilters();

  if (animalListingData.length === 0) {
    cardContainer.innerHTML = '<p>Nenhum animal disponível no momento.</p>';
    return;
  }

  renderFilteredAnimalListing();

  if (sentinel) {
    listObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadMoreAnimals();
      }
    }, {
      rootMargin: '200px'
    });
    listObserver.observe(sentinel);
  }
}

function getPageName() {
  return window.location.pathname.split('/').pop();
}

function activateCurrentNavLink() {
  const currentPage = getPageName();
  document.querySelectorAll('.site-nav a').forEach((link) => {
    link.classList.remove('active-link');
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active-link');
    }
  });
}

document.addEventListener('DOMContentLoaded', async function () {
  await loadCurrentUser();
  updateAuthActions();

  const pageName = getPageName();
  if (pageName === 'animal_listing.html' || pageName === '') {
    await initializeAnimalListing();
  }

  if (pageName === 'animal_details.html') {
    wireAnimalDetailsPage();
  }

  if (pageName === 'animal_adoption.html') {
    wireAdoptionPage();
  }

  if (pageName === 'user_registration.html') {
    wireRegistrationForm();
  }

  if (pageName === 'user_login.html') {
    wireLoginForm();
  }

  if (pageName === 'user_options.html') {
    wireUserOptionsPage();
  }

  if (pageName === 'animal_edit.html') {
    wireAnimalEditPage();
  }

  if (pageName === 'manage_animals.html') {
    loadManageAnimalsPage();
  }

  if (pageName === 'animal_registration.html') {
    wireAnimalRegistrationForm();
  }

  if (pageName === 'admin_panel.html') {
    loadAdminPanelPage();
  }
});
