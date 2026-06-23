// State Management
let currentPage = 1;
let currentCategory = 'trending';
let currentQuery = '';
let isLoading = false;
let loadedMovies = [];
let displayedCount = 0;
let isLanguageSwitching = false;
const ITEMS_PER_PAGE = 24;

// DOM Elements
const moviesGrid = document.getElementById('movies-grid');
const categoryList = document.getElementById('category-list');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const loadMoreBtn = document.getElementById('load-more-btn');
const paginationContainer = document.getElementById('pagination-container');
const filterBanner = document.getElementById('filter-banner');
const filterTitle = document.getElementById('filter-title');
const clearFilterBtn = document.getElementById('clear-filter');
const detailsModal = document.getElementById('details-modal');
const modalClose = document.getElementById('modal-close');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalBody = document.getElementById('modal-body');
const navBrand = document.getElementById('nav-brand');

// Cache Layer (Synchronous Map-based client-side caching)
class ClientCache {
  constructor(maxSize = 200, ttl = 300000) { // 5 minutes TTL
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  set(url, data) {
    if (this.cache.has(url)) {
      this.cache.delete(url);
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(url, { data, timestamp: Date.now() });
  }

  async fetch(url, options = {}, abortController = null) {
    if (this.cache.has(url)) {
      const { data, timestamp } = this.cache.get(url);
      if (Date.now() - timestamp < this.ttl) {
        // Refresh position in Map (LRU)
        this.cache.delete(url);
        this.cache.set(url, { data, timestamp });
        return Promise.resolve(data);
      }
      this.cache.delete(url);
    }

    if (this.pendingRequests.has(url)) {
      return this.pendingRequests.get(url);
    }

    const fetchPromise = (async () => {
      try {
        const response = await fetch(url, {
          ...options,
          signal: abortController ? abortController.signal : undefined
        });
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const data = await response.json();
        this.set(url, data);
        return data;
      } finally {
        this.pendingRequests.delete(url);
      }
    })();

    this.pendingRequests.set(url, fetchPromise);
    return fetchPromise;
  }
}
const apiCache = new ClientCache();

// Shared IntersectionObserver for lazy loading images
const lazyImageObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      const targetSrc = img.getAttribute('data-src');
      if (targetSrc) {
        img.src = targetSrc;
        img.removeAttribute('data-src');
      }
      lazyImageObserver.unobserve(img);
    }
  });
}, { rootMargin: '250px 0px' }); // Load ahead of viewport

function loadLazyImage(imgElement, originalUrl) {
  if (!originalUrl) {
    imgElement.src = 'https://via.placeholder.com/200x300?text=No+Poster';
    return;
  }
  
  let proxiedUrl = originalUrl;
  if (originalUrl.startsWith('http')) {
    proxiedUrl = `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
  }
  
  imgElement.classList.add('img-loading');
  imgElement.setAttribute('data-src', proxiedUrl);
  
  let isLoaded = false;
  let timeoutDuration = 1200;
  
  // Dynamic network speed timeout detection
  if (navigator.connection) {
    const type = navigator.connection.effectiveType;
    if (type === '3g' || type === '2g') timeoutDuration = 2200;
    else if (type === '4g') timeoutDuration = 1200;
  }

  const timeoutId = setTimeout(() => {
    if (!isLoaded) {
      console.warn('Proxy slow, falling back to direct CDN:', originalUrl);
      imgElement.src = originalUrl;
    }
  }, timeoutDuration);

  imgElement.onload = () => {
    isLoaded = true;
    clearTimeout(timeoutId);
    imgElement.classList.remove('img-loading');
    imgElement.classList.add('img-loaded');
  };

  imgElement.onerror = () => {
    isLoaded = true;
    clearTimeout(timeoutId);
    imgElement.src = originalUrl; // Fallback to direct CDN on error
  };

  lazyImageObserver.observe(imgElement);
}

// Card Recycler Pool
class CardRecyclerPool {
  constructor(size = 36) {
    this.pool = [];
    for (let i = 0; i < size; i++) {
      this.pool.push(this.createNewCardNode());
    }
  }

  createNewCardNode() {
    const div = document.createElement('div');
    div.className = 'movie-card';
    div.innerHTML = `
      <div class="card-poster-wrapper">
        <img class="card-poster" alt="Poster">
        <div class="card-badge"></div>
      </div>
      <div class="card-info">
        <h4 class="card-title"></h4>
        <div class="card-actions">
          <span class="card-format-badge"></span>
          <span><i class="fa-solid fa-star" style="color: gold;"></i> <span class="rating-text"></span></span>
        </div>
      </div>
    `;
    return div;
  }

  acquire(movie) {
    const card = this.pool.pop() || this.createNewCardNode();
    card.classList.remove('card-hidden');
    this.populate(card, movie);
    return card;
  }

  release(card) {
    card.onclick = null;
    const img = card.querySelector('.card-poster');
    if (img) {
      lazyImageObserver.unobserve(img);
      img.src = 'data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27 width%3D%27200%27 height%3D%27300%27 viewBox%3D%270 0 200 300%27%2F%3E';
      img.onload = null;
      img.onerror = null;
      img.classList.remove('img-loaded', 'img-loading');
    }
    card.classList.add('card-hidden');
    this.pool.push(card);
  }

  populate(card, movie) {
    const img = card.querySelector('.card-poster');
    const badge = card.querySelector('.card-badge');
    const title = card.querySelector('.card-title');
    const format = card.querySelector('.card-format-badge');
    const rating = card.querySelector('.rating-text');

    title.textContent = movie.title;
    title.title = movie.title;
    rating.textContent = movie.vote_average || 'N/A';
    
    const formatBadge = movie.media_type === 'tv' ? 'Series' : 'Movie';
    format.textContent = formatBadge;
    format.className = `card-format-badge ${formatBadge.toLowerCase()}`;

    let audioBadge = 'Multi-Audio';
    const titleLower = movie.title.toLowerCase();
    if (titleLower.includes('[hindi]')) audioBadge = 'Hindi Dubbed';
    else if (titleLower.includes('[english]')) audioBadge = 'English';
    else if (titleLower.includes('[tamil]')) audioBadge = 'Tamil Dubbed';
    else if (titleLower.includes('[telugu]')) audioBadge = 'Telugu Dubbed';

    badge.textContent = audioBadge;
    loadLazyImage(img, movie.poster);
    
    card.onclick = () => {
      window.location.hash = movie.slug;
    };
  }
}
const cardPool = new CardRecyclerPool();

// Infinite Scroll Observer
let infiniteScrollObserver;
function setupInfiniteScroll() {
  if (infiniteScrollObserver) infiniteScrollObserver.disconnect();

  infiniteScrollObserver = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry.isIntersecting && !isLoading) {
      if (loadedMovies.length - displayedCount >= ITEMS_PER_PAGE) {
        renderNextBatch();
      } else {
        currentPage++;
        fetchMoreFromServer();
      }
    }
  }, { rootMargin: '300px' });

  // Watch the pagination container (the bottom of our content)
  if (paginationContainer) {
    infiniteScrollObserver.observe(paginationContainer);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadCategories();
  loadMovies();
  setupEventListeners();
  checkHashRoute();
  setupInfiniteScroll();
});

// Setup Listeners
function setupEventListeners() {
  navBrand.addEventListener('click', (e) => {
    e.preventDefault();
    resetState();
    loadMovies();
  });

  searchBtn.addEventListener('click', handleSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  clearFilterBtn.addEventListener('click', () => {
    resetState();
    loadMovies();
  });

  modalClose.addEventListener('click', () => closeModal(true));
  modalBackdrop.addEventListener('click', () => closeModal(true));

  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('active') && !sidebar.contains(e.target) && e.target !== menuToggle && !menuToggle.contains(e.target)) {
        sidebar.classList.remove('active');
      }
    });
  }

  window.addEventListener('hashchange', checkHashRoute);
}

// Check URL Hash for Route
function checkHashRoute() {
  if (isLanguageSwitching) return;
  const hash = window.location.hash;
  if (hash && hash.startsWith('#')) {
    const slug = hash.substring(1);
    if (slug) {
      openMovieDetail(slug, false);
    }
  } else {
    if (detailsModal.classList.contains('active')) {
      closeModal(false);
    }
  }
}

// Get Skeletons HTML
function getSkeletonsHTML(count = 8) {
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-card">
        <div class="skeleton skeleton-image"></div>
        <div class="skeleton skeleton-title"></div>
      </div>
    `;
  }
  return html;
}

// Load Categories
async function loadCategories() {
  try {
    const data = await apiCache.fetch('/api/categories');
    if (data.success && data.data) {
      categoryList.innerHTML = '';
      data.data.forEach(cat => {
        const li = document.createElement('li');
        if (cat.slug === currentCategory) {
          li.className = 'active';
        }
        li.innerHTML = `<a href="#">${cat.name}</a>`;
        li.addEventListener('click', (e) => {
          e.preventDefault();
          setActiveCategoryLi(li);
          resetCategoryFilter(cat.slug, cat.name);
          loadMovies();

          const sidebar = document.getElementById('sidebar');
          if (sidebar) sidebar.classList.remove('active');
        });
        categoryList.appendChild(li);
      });
    }
  } catch (err) {
    console.error('Error loading categories:', err);
    categoryList.innerHTML = `<li style="padding: 10px; color: var(--accent);">Failed to load categories</li>`;
  }
}

function setActiveCategoryLi(activeLi) {
  categoryList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
  activeLi.classList.add('active');
}

// Render next batch of items (up to ITEMS_PER_PAGE) using DocumentFragment (Zero Layout Shift)
function renderNextBatch() {
  const nextBatch = loadedMovies.slice(displayedCount, displayedCount + ITEMS_PER_PAGE);
  const fragment = document.createDocumentFragment();

  nextBatch.forEach((movie) => {
    const card = cardPool.acquire(movie);
    fragment.appendChild(card);
  });

  moviesGrid.appendChild(fragment);
  displayedCount += nextBatch.length;
  
  // Show infinite scroll indicator container
  paginationContainer.style.display = 'flex';
}

// Fetch more from server
async function fetchMoreFromServer() {
  if (isLoading) return;
  isLoading = true;
  
  try {
    let url = '';
    if (currentQuery) {
      url = `/api/search?query=${encodeURIComponent(currentQuery)}&page=${currentPage}`;
    } else {
      url = `/api/data?page=${currentPage}`;
      if (currentCategory) {
        url += `&category=${encodeURIComponent(currentCategory)}`;
      }
    }
    
    const data = await apiCache.fetch(url);
    if (data.success && data.data && data.data.length > 0) {
      const existingSlugs = new Set(loadedMovies.map(m => m.slug));
      const newUnique = data.data.filter(m => {
        if (existingSlugs.has(m.slug)) return false;
        existingSlugs.add(m.slug);
        return true;
      });
      loadedMovies = loadedMovies.concat(newUnique);
      if (newUnique.length > 0) {
        renderNextBatch();
      }
    } else {
      if (infiniteScrollObserver) infiniteScrollObserver.disconnect();
      paginationContainer.style.display = 'none';
    }
  } catch (err) {
    console.error('Error fetching more:', err);
  } finally {
    isLoading = false;
  }
}

// Load Movies
async function loadMovies() {
  if (isLoading) return;
  isLoading = true;

  currentPage = 1;
  
  // Release current active cards back to pool
  const activeCards = Array.from(moviesGrid.querySelectorAll('.movie-card'));
  activeCards.forEach(c => cardPool.release(c));
  
  moviesGrid.innerHTML = getSkeletonsHTML();
  paginationContainer.style.display = 'none';
  loadedMovies = [];
  displayedCount = 0;

  try {
    let url = `/api/data?page=${currentPage}`;
    if (currentCategory) {
      url += `&category=${encodeURIComponent(currentCategory)}`;
    }

    const data = await apiCache.fetch(url);
    if (data.success && data.data && data.data.length > 0) {
      moviesGrid.innerHTML = '';
      const seen = new Set();
      loadedMovies = data.data.filter(m => {
        if (seen.has(m.slug)) return false;
        seen.add(m.slug);
        return true;
      });
      renderNextBatch();
      setupInfiniteScroll(); // Reactivate infinite scroll observer
    } else {
      moviesGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">
          <i class="fa-solid fa-film" style="font-size: 3rem; margin-bottom: 15px; color: var(--accent);"></i>
          <h3>No content found</h3>
          <p>Try clearing your filter or selecting another category.</p>
        </div>
      `;
      paginationContainer.style.display = 'none';
    }
  } catch (err) {
    console.error('Error loading movies:', err);
    moviesGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--accent);">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem; margin-bottom: 15px;"></i>
        <h3>Error loading content</h3>
        <p>Please check your connection and try again.</p>
      </div>
    `;
  } finally {
    isLoading = false;
  }
}

// Handle Search
async function handleSearch() {
  const query = searchInput.value.trim();
  if (!query) return;

  resetState();
  currentQuery = query;

  filterBanner.style.display = 'flex';
  filterTitle.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Search results for: <strong>${query}</strong>`;

  categoryList.querySelectorAll('li').forEach(li => li.classList.remove('active'));

  // Release current active cards
  const activeCards = Array.from(moviesGrid.querySelectorAll('.movie-card'));
  activeCards.forEach(c => cardPool.release(c));

  moviesGrid.innerHTML = getSkeletonsHTML();
  paginationContainer.style.display = 'none';
  loadedMovies = [];
  displayedCount = 0;
  isLoading = true;

  try {
    const data = await apiCache.fetch(`/api/search?query=${encodeURIComponent(query)}&page=${currentPage}`);
    if (data.success && data.data && data.data.length > 0) {
      moviesGrid.innerHTML = '';
      loadedMovies = data.data;
      renderNextBatch();
      setupInfiniteScroll();
    } else {
      moviesGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">
          <i class="fa-solid fa-circle-question" style="font-size: 3rem; margin-bottom: 15px; color: var(--accent);"></i>
          <h3>No matching content found</h3>
          <p>Try searching for different keywords.</p>
        </div>
      `;
    }
  } catch (err) {
    console.error('Search error:', err);
    moviesGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--accent);">Search request failed.</div>`;
  } finally {
    isLoading = false;
  }
}

// Helper to get episodes list
function getEpisodesArray(ep) {
  if (typeof ep === 'string' && ep.includes(',')) {
    return ep.split(',').map(e => e.trim());
  }
  const count = parseInt(ep) || 0;
  return Array.from({ length: count }, (_, i) => i + 1);
}

// Open Details Modal (Instant Rendering & Memoized Controls Switch)
async function openMovieDetail(slug, updateHash = true, allowAutoSwitch = true, isLanguageSwitch = false) {
  if (updateHash) {
    window.location.hash = slug;
  }

  const isAlreadyOpen = detailsModal.classList.contains('active') && modalBody.querySelector('.player-container');
  if (isAlreadyOpen) {
    const playerContainer = modalBody.querySelector('.player-container');
    if (playerContainer) {
      let overlay = playerContainer.querySelector('.player-loading-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'player-loading-overlay';
        overlay.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--accent);"></i>`;
        playerContainer.appendChild(overlay);
      }
    }
  } else {
    detailsModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    modalBody.innerHTML = `
      <div style="text-align: center; padding: 50px; color: var(--text-secondary);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 3rem; color: var(--accent); margin-bottom: 15px;"></i>
        <p>Loading...</p>
      </div>
    `;
  }

  // Fast Path language Switch
  if (isLanguageSwitch && isAlreadyOpen) {
    isLanguageSwitching = true;
    try {
      const result = await apiCache.fetch(`/api/movie/${slug}`);
      if (result.success && result.data) {
        const movie = result.data;
        const playerContainer = modalBody.querySelector('.player-container');
        if (playerContainer) {
          if (movie.videoUrl) {
            const fallback = playerContainer.querySelector('.no-player-fallback');
            if (fallback) fallback.remove();
            let iframe = playerContainer.querySelector('#player-iframe');
            if (!iframe) {
              playerContainer.innerHTML = `
                <iframe 
                  id="player-iframe"
                  src="${movie.videoUrl}&_cb=${Date.now()}" 
                  width="100%" 
                  height="100%" 
                  frameborder="0" 
                  allowfullscreen="allowfullscreen"
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                  scrolling="no">
                </iframe>
              `;
            } else {
              iframe.src = movie.videoUrl + "&_cb=" + Date.now();
            }
          } else {
            playerContainer.innerHTML = `
              <div class="no-player-fallback">
                <i class="fa-regular fa-face-frown"></i>
                <p>No video player embed available for this title</p>
              </div>
            `;
          }
          const overlay = playerContainer.querySelector('.player-loading-overlay');
          if (overlay) overlay.remove();
        }

        const titleEl = modalBody.querySelector('.details-title');
        if (titleEl) titleEl.textContent = movie.title;

        const descEl = modalBody.querySelector('.details-desc');
        if (descEl) descEl.textContent = movie.description || 'No plot details parsed for this title.';

        const dubSelect = document.getElementById('dub-select');
        if (dubSelect) {
          dubSelect.value = slug;
        }
      }
    } catch (err) {
      console.error('Error switching language:', err);
    } finally {
      isLanguageSwitching = false;
    }
    return;
  }

  try {
    const result = await apiCache.fetch(`/api/movie/${slug}`);
    if (result.success && result.data) {
      const movie = result.data;

      let playerHTML = `
        <div class="no-player-fallback">
          <i class="fa-regular fa-face-frown"></i>
          <p>No video player embed available for this title</p>
        </div>
      `;

      if (movie.videoUrl) {
        playerHTML = `
          <iframe 
            id="player-iframe"
            src="${movie.videoUrl}&_cb=${Date.now()}" 
            width="100%" 
            height="100%" 
            frameborder="0" 
            allowfullscreen="allowfullscreen"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            scrolling="no">
          </iframe>
        `;
      }

      const seriesSelectorsHTML = `
        <div class="series-controls-container" id="details-controls-container">
          <div style="color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-circle-notch fa-spin"></i> Checking dubbed options...
          </div>
        </div>
      `;

      let proxiedDetailPoster = movie.poster || 'https://via.placeholder.com/200x300?text=No+Poster';
      if (proxiedDetailPoster.startsWith('http')) {
        proxiedDetailPoster = `/api/image-proxy?url=${encodeURIComponent(proxiedDetailPoster)}`;
      }

      modalBody.innerHTML = `
        <div class="details-header">
          <h2 class="details-title">${movie.title}</h2>
        </div>

        <div class="player-wrapper-layout">
          <div class="player-container">
            ${playerHTML}
          </div>
          ${seriesSelectorsHTML}
        </div>

        <div class="details-info-grid">
          <div>
            <img src="${proxiedDetailPoster}" alt="Poster" class="details-poster" onerror="this.src='https://via.placeholder.com/200x300?text=No+Poster'">
          </div>
          <div class="details-desc-wrapper">
            <div class="meta-badges">
              <span class="meta-badge"><i class="fa-solid fa-star" style="color: gold;"></i> ${movie.vote_average || 'N/A'}</span>
              <span class="meta-badge"><i class="fa-solid fa-calendar"></i> ${movie.release_date || 'N/A'}</span>
              <span class="meta-badge"><i class="fa-solid fa-earth-americas"></i> ${movie.country || 'N/A'}</span>
            </div>
            <h4>Plot / Details</h4>
            <div class="details-desc-container">
              <p class="details-desc">${movie.description || 'No plot details parsed for this title.'}</p>
              <button class="btn-read-more" id="desc-read-more-btn" style="display: none;">View More</button>
            </div>
            
            ${movie.trailer ? `
              <a href="${movie.trailer}" target="_blank" class="btn-trailer">
                <i class="fa-brands fa-youtube"></i> Watch Official Trailer
              </a>
            ` : ''}
          </div>
        </div>

        <div class="recommended-section" id="recommended-section" style="display: none;">
          <div class="recommended-header">
            <h3><i class="fa-solid fa-thumbs-up"></i> Recommended for You</h3>
            <button class="btn-view-all" id="rec-view-all-btn">View All</button>
          </div>
          <div class="slider-container">
            <button class="slider-arrow prev" id="rec-prev-btn"><i class="fa-solid fa-chevron-left"></i></button>
            <div class="slider-track" id="rec-slider-track"></div>
            <button class="slider-arrow next" id="rec-next-btn"><i class="fa-solid fa-chevron-right"></i></button>
          </div>
        </div>
      `;

      // Fetch related dubbed versions asynchronously
      try {
        const cleanTitle = movie.title.split('[')[0].split('Season')[0].split('S1')[0].split('complete')[0].trim();
        const relatedData = await apiCache.fetch(`/api/movie/${slug}/related?title=${encodeURIComponent(cleanTitle)}`);

        if (relatedData.success && relatedData.data && relatedData.data.length > 0) {
          if (allowAutoSwitch) {
            const currentTitleLower = movie.title.toLowerCase();
            const currentIsHindi = currentTitleLower.includes('[hindi]') || currentTitleLower.includes('hindi dubbed') || currentTitleLower.includes('hindi');
            if (!currentIsHindi) {
              const hindiDubbed = relatedData.data.find(item => {
                const titleLower = item.title.toLowerCase();
                return titleLower.includes('[hindi]') || titleLower.includes('hindi dubbed');
              });
              if (hindiDubbed && hindiDubbed.slug !== slug) {
                console.log('Auto-switching to Hindi Dubbed version:', hindiDubbed.title);
                openMovieDetail(hindiDubbed.slug, updateHash, false);
                return;
              }
            }
          }
        }

        let dubsSelectHTML = '';
        if (relatedData.success && relatedData.data && relatedData.data.length > 0) {
          const dubOptions = [];
          const seenLabels = new Set();

          relatedData.data.forEach(item => {
            let label = '';
            const match = item.title.match(/\[([^\]]+)\]/);
            if (match) {
              label = match[1];
            } else if (item.title.toLowerCase().includes('english')) {
              label = 'English';
            }

            if (!label || label.toLowerCase() === 'multi-audio') return;

            const stdLabel = label.trim().toLowerCase();

            if (seenLabels.has(stdLabel)) {
              const existingIdx = dubOptions.findIndex(opt => opt.stdLabel === stdLabel);
              if (item.slug === slug && existingIdx !== -1) {
                dubOptions[existingIdx] = {
                  html: `<option value="${item.slug}" selected>${label}</option>`,
                  stdLabel,
                  slug: item.slug
                };
              }
              return;
            }

            seenLabels.add(stdLabel);
            dubOptions.push({
              html: `<option value="${item.slug}">${label}</option>`,
              stdLabel,
              slug: item.slug
            });
          });

          if (dubOptions.length > 0) {
            const currentInDubs = dubOptions.some(opt => opt.slug === slug);
            if (!currentInDubs) {
              let currentLabel = 'Original';
              const currentMatch = movie.title.match(/\[([^\]]+)\]/);
              if (currentMatch) currentLabel = currentMatch[1];
              else if (movie.title.toLowerCase().includes('english')) currentLabel = 'English';
              dubOptions.unshift({
                html: `<option value="${slug}" selected>${currentLabel}</option>`,
                stdLabel: currentLabel.trim().toLowerCase(),
                slug: slug
              });
            } else {
              dubOptions.forEach(opt => {
                if (opt.slug === slug) {
                  opt.html = opt.html.replace('<option value=', '<option selected value=');
                }
              });
            }

            dubsSelectHTML = `
              <div class="selector-wrapper">
                <label for="dub-select"><i class="fa-solid fa-language"></i> Dubbed Version:</label>
                <select id="dub-select" class="detail-select">
                  ${dubOptions.map(opt => opt.html).join('')}
                </select>
              </div>
            `;
          }
        }

        let seasonSelectorHTML = '';
        let episodeGridHTML = '';

        if (movie.media_type === 'tv' && movie.seasons && movie.seasons.length > 0) {
          let seasonOptions = movie.seasons.map(s => `<option value="${s.se}">Season ${String(s.se).padStart(2, '0')}</option>`).join('');
          const defaultSeasonObj = movie.seasons[0];
          const episodes = getEpisodesArray(defaultSeasonObj.ep);

          seasonSelectorHTML = `
            <div class="selector-wrapper">
              <label for="season-select"><i class="fa-solid fa-layer-group"></i> Season:</label>
              <select id="season-select" class="detail-select">
                ${seasonOptions}
              </select>
            </div>
          `;

          let episodeButtons = episodes.map(e => `
            <button class="episode-btn ${e === 1 ? 'active' : ''}" data-episode="${e}">
              ${String(e).padStart(2, '0')}
            </button>
          `).join('');

          episodeGridHTML = `
            <div class="episode-grid-wrapper">
              <label class="episode-label"><i class="fa-solid fa-circle-play"></i> Episodes:</label>
              <div class="episode-grid" id="episode-grid">
                ${episodeButtons}
              </div>
            </div>
          `;
        }

        const container = document.getElementById('details-controls-container');
        if (dubsSelectHTML || seasonSelectorHTML || episodeGridHTML) {
          let dropdownsHTML = '';
          if (dubsSelectHTML || seasonSelectorHTML) {
            dropdownsHTML = `
              <div class="controls-row">
                ${dubsSelectHTML}
                ${seasonSelectorHTML}
              </div>
            `;
          }

          container.innerHTML = `
            ${dropdownsHTML}
            ${episodeGridHTML}
          `;

          if (dubsSelectHTML) {
            const dubSelect = document.getElementById('dub-select');
            if (dubSelect) {
              dubSelect.addEventListener('change', () => {
                openMovieDetail(dubSelect.value, true, false, true);
              });
            }
          }

          if (movie.media_type === 'tv' && movie.seasons && movie.seasons.length > 0) {
            const seasonSelect = document.getElementById('season-select');
            const episodeGrid = document.getElementById('episode-grid');

            const attachEpisodeClickListeners = () => {
              const buttons = episodeGrid.querySelectorAll('.episode-btn');
              buttons.forEach(btn => {
                btn.addEventListener('click', () => {
                  buttons.forEach(b => b.classList.remove('active'));
                  btn.classList.add('active');
                  const selectedSe = parseInt(seasonSelect.value);
                  const selectedEp = btn.getAttribute('data-episode');
                  updatePlayerSource(slug, selectedSe, selectedEp, movie.subjectid, movie.title, movie.dp);
                });
              });
            };

            attachEpisodeClickListeners();

            if (seasonSelect) {
              seasonSelect.addEventListener('change', () => {
                const selectedSe = parseInt(seasonSelect.value);
                const seasonObj = movie.seasons.find(s => s.se === selectedSe);
                if (seasonObj) {
                  const eps = getEpisodesArray(seasonObj.ep);
                  episodeGrid.innerHTML = eps.map(e => `
                    <button class="episode-btn ${e === 1 ? 'active' : ''}" data-episode="${e}">
                      ${String(e).padStart(2, '0')}
                    </button>
                  `).join('');
                  attachEpisodeClickListeners();
                  updatePlayerSource(slug, selectedSe, eps[0], movie.subjectid, movie.title, movie.dp);
                }
              });
            }
          }
        } else {
          container.style.display = 'none';
        }
      } catch (err) {
        console.error('Error rendering selectors:', err);
      }

      // Load Recommendations
      const loadRecommendations = async () => {
        try {
          const allCats = ['bollywood', 'south-hindi', 'hollywood', 'anime', 'k-drama', 'c-drama', 'reality-tv'];
          const recCat = allCats[Math.floor(Math.random() * allCats.length)];
          const recData = await apiCache.fetch(`/api/data?category=${encodeURIComponent(recCat)}`);
          if (recData.success && recData.data && recData.data.length > 0) {
            const shuffled = recData.data.filter(item => item.slug !== slug).sort(() => Math.random() - 0.5).slice(0, 12);
            if (shuffled.length > 0) {
              const recSection = document.getElementById('recommended-section');
              const recTrack = document.getElementById('rec-slider-track');
              recTrack.innerHTML = '';
              
              shuffled.forEach(item => {
                const card = cardPool.createNewCardNode();
                cardPool.populate(card, item);
                recTrack.appendChild(card);
              });
              
              recSection.style.display = 'block';

              document.getElementById('rec-prev-btn').onclick = () => {
                recTrack.scrollBy({ left: -300, behavior: 'smooth' });
              };
              document.getElementById('rec-next-btn').onclick = () => {
                recTrack.scrollBy({ left: 300, behavior: 'smooth' });
              };

              document.getElementById('rec-view-all-btn').onclick = () => {
                closeModal(true);
                const categories = categoryList.querySelectorAll('li');
                categories.forEach(li => {
                  li.classList.remove('active');
                  const catLink = li.querySelector('a');
                  if (catLink && catLink.innerText.toLowerCase() === recCat.replace('-', ' ').toLowerCase()) {
                    li.classList.add('active');
                  }
                });
                resetCategoryFilter(recCat, recCat.charAt(0).toUpperCase() + recCat.slice(1).replace('-', ' '));
                loadMovies();
              };
            }
          }
        } catch (recErr) {
          console.error('Error loading recommendations:', recErr);
        }
      };
      loadRecommendations();

      // Expandable plot details
      const descContainer = modalBody.querySelector('.details-desc-container');
      const descText = modalBody.querySelector('.details-desc');
      const readMoreBtn = modalBody.querySelector('#desc-read-more-btn');
      if (descContainer && descText && readMoreBtn && descText.textContent.length > 180) {
        descContainer.classList.add('truncated');
        readMoreBtn.style.display = 'inline-block';
        readMoreBtn.onclick = () => {
          if (descContainer.classList.contains('truncated')) {
            descContainer.classList.remove('truncated');
            readMoreBtn.innerText = 'View Less';
          } else {
            descContainer.classList.add('truncated');
            readMoreBtn.innerText = 'View More';
          }
        };
      }

    } else {
      modalBody.innerHTML = `<div style="color: var(--accent); padding: 40px; text-align: center;">Failed to load details.</div>`;
    }
  } catch (err) {
    console.error(err);
    modalBody.innerHTML = `<div style="color: var(--accent); padding: 40px; text-align: center;">Connection error loading details.</div>`;
  }
}

// Update signed player iframe source
async function updatePlayerSource(slug, season, episode, subjectid, title, dp) {
  const iframe = document.getElementById('player-iframe');
  if (!iframe) return;

  iframe.style.opacity = '0.5';

  try {
    let url = `/api/movie/${slug}/player?se=${season}&ep=${episode}`;
    if (subjectid && title && dp) {
      url += `&subjectid=${encodeURIComponent(subjectid)}&title=${encodeURIComponent(title)}&dp=${encodeURIComponent(dp)}`;
    }
    const data = await apiCache.fetch(url);
    if (data.success && data.videoUrl) {
      iframe.src = data.videoUrl + "&_cb=" + Date.now();
    }
  } catch (err) {
    console.error('Error updating player:', err);
  } finally {
    iframe.style.opacity = '1';
  }
}

// Close Modal
function closeModal(updateHash = true) {
  const iframe = document.getElementById('player-iframe');
  if (iframe) {
    iframe.src = 'about:blank';
  }
  detailsModal.classList.remove('active');
  document.body.style.overflow = '';
  modalBody.innerHTML = '';
  if (updateHash) {
    window.location.hash = '';
  }
}

// Reset / Clear states
function resetState() {
  currentPage = 1;
  currentCategory = 'trending';
  currentQuery = '';
  searchInput.value = '';
  filterBanner.style.display = 'none';
  
  // Release active movie cards
  const activeCards = Array.from(moviesGrid.querySelectorAll('.movie-card'));
  activeCards.forEach(c => cardPool.release(c));
  moviesGrid.innerHTML = '';

  loadedMovies = [];
  displayedCount = 0;

  const categories = categoryList.querySelectorAll('li');
  categories.forEach(li => {
    li.classList.remove('active');
    if (li.innerHTML.toLowerCase().includes('trending')) {
      li.classList.add('active');
    }
  });
}

function resetCategoryFilter(slug, name) {
  resetState();
  currentCategory = slug;
  filterBanner.style.display = 'flex';
  filterTitle.innerHTML = `<i class="fa-solid fa-list"></i> Category: <strong>${name}</strong>`;
}

// Theme Handling
function initTheme() {
  document.documentElement.setAttribute('data-theme', 'dark');
}
