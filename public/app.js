// State Management
let currentPage = 1;
let currentCategory = 'trending'; // Set default category to trending
let currentQuery = '';
let isLoading = false;
let loadedMovies = [];
let displayedCount = 0;
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadCategories();
  loadMovies();
  setupEventListeners();
  checkHashRoute(); // Check for hash on initial load
});

// Setup Listeners
function setupEventListeners() {
  // Brand Click (Reset home)
  navBrand.addEventListener('click', (e) => {
    e.preventDefault();
    resetState();
    loadMovies();
  });

  // Search Action
  searchBtn.addEventListener('click', handleSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });

  // Load More Action
  loadMoreBtn.addEventListener('click', () => {
    if (isLoading) return;
    if (loadedMovies.length - displayedCount >= ITEMS_PER_PAGE) {
      renderNextBatch();
    } else {
      currentPage++;
      fetchMoreFromServer();
    }
  });

  // Clear Category Filter
  clearFilterBtn.addEventListener('click', () => {
    resetState();
    loadMovies();
  });

  // Close Modal Actions
  modalClose.addEventListener('click', () => closeModal(true));
  modalBackdrop.addEventListener('click', () => closeModal(true));

  // Menu Toggle Action (Sidebar)
  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('active');
    });

    // Close sidebar on clicking anywhere outside
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('active') && !sidebar.contains(e.target) && e.target !== menuToggle && !menuToggle.contains(e.target)) {
        sidebar.classList.remove('active');
      }
    });
  }

  // Hashchange Router listener
  window.addEventListener('hashchange', checkHashRoute);
}

// Check URL Hash for Route
function checkHashRoute() {
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
    const res = await fetch('/api/categories');
    const data = await res.json();

    if (data.success && data.data) {
      categoryList.innerHTML = '';

      data.data.forEach(cat => {
        const li = document.createElement('li');
        // Set trending category active by default on load
        if (cat.slug === currentCategory) {
          li.className = 'active';
        }
        li.innerHTML = `<a href="#">${cat.name}</a>`;
        li.addEventListener('click', (e) => {
          e.preventDefault();
          setActiveCategoryLi(li);
          resetCategoryFilter(cat.slug, cat.name);
          loadMovies();

          // Close mobile sidebar on select
          const sidebar = document.getElementById('sidebar');
          if (sidebar) {
            sidebar.classList.remove('active');
          }
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

// Render next batch of items (up to ITEMS_PER_PAGE)
function renderNextBatch() {
  const nextBatch = loadedMovies.slice(displayedCount, displayedCount + ITEMS_PER_PAGE);
  nextBatch.forEach(movie => {
    const card = createMovieCard(movie);
    moviesGrid.appendChild(card);
  });
  displayedCount += nextBatch.length;
  
  if (loadedMovies.length > 0) {
    paginationContainer.style.display = 'flex';
  } else {
    paginationContainer.style.display = 'none';
  }
}

// Fetch more from server
async function fetchMoreFromServer() {
  if (isLoading) return;
  isLoading = true;
  loadMoreBtn.classList.add('loading');
  loadMoreBtn.innerText = 'Loading...';
  
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
    
    const res = await fetch(url);
    const data = await res.json();
    
    loadMoreBtn.classList.remove('loading');
    loadMoreBtn.innerHTML = `<span>Load More Content</span><i class="fa-solid fa-arrow-down-long"></i>`;
    
    if (data.success && data.data && data.data.length > 0) {
      loadedMovies = loadedMovies.concat(data.data);
      renderNextBatch();
    } else {
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
  moviesGrid.innerHTML = getSkeletonsHTML();
  paginationContainer.style.display = 'none';
  loadedMovies = [];
  displayedCount = 0;

  try {
    let url = `/api/data?page=${currentPage}`;
    if (currentCategory) {
      url += `&category=${encodeURIComponent(currentCategory)}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (data.success && data.data && data.data.length > 0) {
      moviesGrid.innerHTML = '';
      loadedMovies = data.data;
      renderNextBatch();
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

  // Show active search banner
  filterBanner.style.display = 'flex';
  filterTitle.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Search results for: <strong>${query}</strong>`;

  // Clear category active states
  categoryList.querySelectorAll('li').forEach(li => li.classList.remove('active'));

  moviesGrid.innerHTML = getSkeletonsHTML();
  paginationContainer.style.display = 'none';
  loadedMovies = [];
  displayedCount = 0;
  isLoading = true;

  try {
    const res = await fetch(`/api/search?query=${encodeURIComponent(query)}&page=${currentPage}`);
    const data = await res.json();

    if (data.success && data.data && data.data.length > 0) {
      moviesGrid.innerHTML = '';
      loadedMovies = data.data;
      renderNextBatch();
    } else {
      moviesGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">
          <i class="fa-solid fa-circle-question" style="font-size: 3rem; margin-bottom: 15px; color: var(--accent);"></i>
          <h3>No matching content found</h3>
          <p>Try searching for different keywords (e.g. Heist, Naruto, One Piece).</p>
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

// Create Card Element
function createMovieCard(movie) {
  const div = document.createElement('div');
  div.className = 'movie-card';

  // Guess audio/type badge
  let audioBadge = 'Multi-Audio';
  const titleLower = movie.title.toLowerCase();
  if (titleLower.includes('[hindi]')) audioBadge = 'Hindi Dubbed';
  else if (titleLower.includes('[english]')) audioBadge = 'English';
  else if (titleLower.includes('[tamil]')) audioBadge = 'Tamil Dubbed';
  else if (titleLower.includes('[telugu]')) audioBadge = 'Telugu Dubbed';

  // Format badge
  const formatBadge = movie.media_type === 'tv' ? 'Series' : 'Movie';

  div.innerHTML = `
    <div class="card-poster-wrapper">
      <img src="${movie.poster || 'https://via.placeholder.com/200x300?text=No+Poster'}" alt="${movie.title}" class="card-poster" loading="lazy" onerror="this.src='https://via.placeholder.com/200x300?text=No+Poster'">
      <div class="card-badge">${audioBadge}</div>
    </div>
    <div class="card-info">
      <h4 class="card-title" title="${movie.title}">${movie.title}</h4>
      <div class="card-actions">
        <span class="card-format-badge ${formatBadge.toLowerCase()}">${formatBadge}</span>
        <span><i class="fa-solid fa-star" style="color: gold;"></i> ${movie.vote_average || 'N/A'}</span>
      </div>
    </div>
  `;

  div.addEventListener('click', () => {
    window.location.hash = movie.slug;
  });
  return div;
}

// Helper to get episodes list
function getEpisodesArray(ep) {
  if (typeof ep === 'string' && ep.includes(',')) {
    return ep.split(',').map(e => e.trim());
  }
  const count = parseInt(ep) || 0;
  return Array.from({ length: count }, (_, i) => i + 1);
}

// Open Details Modal
async function openMovieDetail(slug, updateHash = true, allowAutoSwitch = true) {
  if (updateHash) {
    window.location.hash = slug;
  }

  detailsModal.classList.add('active');
  document.body.style.overflow = 'hidden';
  modalBody.innerHTML = `
    <div style="text-align: center; padding: 50px; color: var(--text-secondary);">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 3rem; color: var(--accent); margin-bottom: 15px;"></i>
      <p>Loading metadata and video player...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/movie/${slug}`);
    const result = await res.json();

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

      // Initial structure of the control bar
      let seriesSelectorsHTML = `
        <div class="series-controls-container" id="details-controls-container">
          <div style="color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-circle-notch fa-spin"></i> Checking dubbed options...
          </div>
        </div>
      `;

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
            <img src="${movie.poster}" alt="Poster" class="details-poster" onerror="this.src='https://via.placeholder.com/200x300?text=No+Poster'">
          </div>
          <div class="details-desc-wrapper">
            <div class="meta-badges">
              <span class="meta-badge"><i class="fa-solid fa-star" style="color: gold;"></i> ${movie.vote_average || 'N/A'}</span>
              <span class="meta-badge"><i class="fa-solid fa-calendar"></i> ${movie.release_date || 'N/A'}</span>
              <span class="meta-badge"><i class="fa-solid fa-earth-americas"></i> ${movie.country || 'N/A'}</span>
            </div>
            <h4>Plot / Details</h4>
            <p class="details-desc">${movie.description || 'No plot details parsed for this title.'}</p>
            
            ${movie.trailer ? `
              <a href="${movie.trailer}" target="_blank" class="btn-trailer">
                <i class="fa-brands fa-youtube"></i> Watch Official Trailer
              </a>
            ` : ''}
          </div>
        </div>
      `;

      // Fetch related dubbed versions asynchronously and render dropdowns
      try {
        const cleanTitle = movie.title.split('[')[0].split('Season')[0].split('S1')[0].split('complete')[0].trim();
        const relatedRes = await fetch(`/api/movie/${slug}/related?title=${encodeURIComponent(cleanTitle)}`);
        const relatedData = await relatedRes.json();

        if (relatedData.success && relatedData.data && relatedData.data.length > 0) {
          // If auto-switch is enabled and Hindi dubbed version is available, switch to it!
          if (allowAutoSwitch) {
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

        let dubsSelectHTML = '';
        if (relatedData.success && relatedData.data && relatedData.data.length > 0) {
          const dubOptions = [];
          relatedData.data.forEach(item => {
            let label = '';
            const match = item.title.match(/\[([^\]]+)\]/);
            if (match) {
              label = match[1];
            } else if (item.title.toLowerCase().includes('english')) {
              label = 'English';
            }

            // Skip Multi-Audio options
            if (!label || label.toLowerCase() === 'multi-audio') {
              return;
            }

            const itemSlug = item.slug;
            const isSelected = itemSlug === slug ? 'selected' : '';
            dubOptions.push(`<option value="${itemSlug}" ${isSelected}>${label}</option>`);
          });

          if (dubOptions.length > 0) {
            const currentInDubs = relatedData.data.some(item => {
              let label = '';
              const match = item.title.match(/\[([^\]]+)\]/);
              if (match) label = match[1];
              else if (item.title.toLowerCase().includes('english')) label = 'English';
              return label && label.toLowerCase() !== 'multi-audio' && item.slug === slug;
            });

            dubsSelectHTML = `
              <div class="selector-wrapper">
                <label for="dub-select"><i class="fa-solid fa-language"></i> Dubbed Version:</label>
                <select id="dub-select" class="detail-select">
                  ${!currentInDubs ? '<option value="" disabled selected>Select Language</option>' : ''}
                  ${dubOptions.join('')}
                </select>
              </div>
            `;
          }
        }

        // Build season/episode selector HTML
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

          // Setup Selector Event Listeners
          if (dubsSelectHTML) {
            const dubSelect = document.getElementById('dub-select');
            if (dubSelect) {
              dubSelect.addEventListener('change', () => {
                openMovieDetail(dubSelect.value, true, false);
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
                  updatePlayerSource(slug, selectedSe, selectedEp);
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
                  updatePlayerSource(slug, selectedSe, eps[0]);
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

    } else {
      modalBody.innerHTML = `<div style="color: var(--accent); padding: 40px; text-align: center;">Failed to load details.</div>`;
    }
  } catch (err) {
    console.error(err);
    modalBody.innerHTML = `<div style="color: var(--accent); padding: 40px; text-align: center;">Connection error loading details.</div>`;
  }
}

// Update signed player iframe source
async function updatePlayerSource(slug, season, episode) {
  const iframe = document.getElementById('player-iframe');
  if (!iframe) return;

  iframe.style.opacity = '0.5';

  try {
    const res = await fetch(`/api/movie/${slug}/player?se=${season}&ep=${episode}`);
    const data = await res.json();
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
  detailsModal.classList.remove('active');
  document.body.style.overflow = '';
  modalBody.innerHTML = '';
  if (updateHash) {
    window.location.hash = ''; // Clear hash route
  }
}

// Reset / Clear states
function resetState() {
  currentPage = 1;
  currentCategory = 'trending';
  currentQuery = '';
  searchInput.value = '';
  filterBanner.style.display = 'none';
  loadedMovies = [];
  displayedCount = 0;

  // Reset category sidebar active states to trending
  const categories = categoryList.querySelectorAll('li');
  categories.forEach(li => {
    li.classList.remove('active');
    if (li.innerHTML.includes('Trending')) {
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
