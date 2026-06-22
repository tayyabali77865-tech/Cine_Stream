// State Management
let currentPage = 1;
let currentCategory = 'trending'; // Set default category to trending
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
  nextBatch.forEach((movie, idx) => {
    const card = createMovieCard(movie, displayedCount + idx);
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
function createMovieCard(movie, index = 100) {
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

  // Use the direct poster URL from the CDN to avoid local server queuing
  const proxiedPoster = movie.poster || 'https://via.placeholder.com/200x300?text=No+Poster';

  // Eager loading and high fetchpriority for the first 8 images above the fold
  const isAboveFold = index < 8 && currentPage === 1;
  const loadingAttr = isAboveFold ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';

  div.innerHTML = `
    <div class="card-poster-wrapper">
      <img src="${proxiedPoster}" alt="${movie.title}" class="card-poster" ${loadingAttr} onerror="this.src='https://via.placeholder.com/200x300?text=No+Poster'">
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

  if (isLanguageSwitch && isAlreadyOpen) {
    isLanguageSwitching = true;
    try {
      const res = await fetch(`/api/movie/${slug}`);
      const result = await res.json();
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

      const proxiedDetailPoster = movie.poster || 'https://via.placeholder.com/200x300?text=No+Poster';

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

      // Fetch related dubbed versions asynchronously and render dropdowns
      try {
        const cleanTitle = movie.title.split('[')[0].split('Season')[0].split('S1')[0].split('complete')[0].trim();
        const relatedRes = await fetch(`/api/movie/${slug}/related?title=${encodeURIComponent(cleanTitle)}`);
        const relatedData = await relatedRes.json();

        if (relatedData.success && relatedData.data && relatedData.data.length > 0) {
          // If auto-switch is enabled and Hindi dubbed version is available, switch to it!
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

            // Skip Multi-Audio options
            if (!label || label.toLowerCase() === 'multi-audio') {
              return;
            }

            const stdLabel = label.trim().toLowerCase();

            // Deduplicate to avoid repeating "Hindi Dubbed"
            if (seenLabels.has(stdLabel)) {
              const existingIdx = dubOptions.findIndex(opt => opt.stdLabel === stdLabel);
              if (item.slug === slug && existingIdx !== -1) {
                dubOptions[existingIdx] = {
                  html: `<option value="${item.slug}" selected>${label}</option>`,
                  stdLabel
                };
              }
              return;
            }

            seenLabels.add(stdLabel);
            const isSelected = item.slug === slug ? 'selected' : '';
            dubOptions.push({
              html: `<option value="${item.slug}" ${isSelected}>${label}</option>`,
              stdLabel
            });
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
                  ${dubOptions.map(opt => opt.html).join('')}
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

      // Fetch recommendations based on current movie category
      const loadRecommendations = async () => {
        try {
          const recCat = movie.category || 'hollywood';
          const recRes = await fetch(`/api/data?category=${encodeURIComponent(recCat)}`);
          const recData = await recRes.json();
          if (recData.success && recData.data && recData.data.length > 0) {
            const filteredRecs = recData.data.filter(item => item.slug !== slug).slice(0, 12);
            if (filteredRecs.length > 0) {
              const recSection = document.getElementById('recommended-section');
              const recTrack = document.getElementById('rec-slider-track');
              recTrack.innerHTML = '';
              
              filteredRecs.forEach(item => {
                const card = createMovieCard(item);
                recTrack.appendChild(card);
              });
              
              recSection.style.display = 'block';

              // Attach slider arrow event listeners
              document.getElementById('rec-prev-btn').addEventListener('click', () => {
                recTrack.scrollBy({ left: -300, behavior: 'smooth' });
              });
              document.getElementById('rec-next-btn').addEventListener('click', () => {
                recTrack.scrollBy({ left: 300, behavior: 'smooth' });
              });

              // Attach View All listener
              document.getElementById('rec-view-all-btn').addEventListener('click', () => {
                closeModal(true);
                // Reset categories sidebar & load category
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
              });
            }
          }
        } catch (recErr) {
          console.error('Error loading recommendations:', recErr);
        }
      };
      loadRecommendations();

      // Truncate description on mobile view if it's too long
      const descContainer = modalBody.querySelector('.details-desc-container');
      const descText = modalBody.querySelector('.details-desc');
      const readMoreBtn = modalBody.querySelector('#desc-read-more-btn');
      if (descContainer && descText && readMoreBtn && descText.textContent.length > 180) {
        descContainer.classList.add('truncated');
        readMoreBtn.style.display = 'inline-block';
        readMoreBtn.addEventListener('click', () => {
          if (descContainer.classList.contains('truncated')) {
            descContainer.classList.remove('truncated');
            readMoreBtn.innerText = 'View Less';
          } else {
            descContainer.classList.add('truncated');
            readMoreBtn.innerText = 'View More';
          }
        });
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
    const res = await fetch(url);
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
  const iframe = document.getElementById('player-iframe');
  if (iframe) {
    iframe.src = 'about:blank';
  }
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

  // Reset category sidebar active states to hollywood
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
