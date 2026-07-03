/**
 * Song Request Form Handler
 * Christopher & Jordan Wedding Website
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        apiBaseUrl: '/api', // Will be proxied through Cloudflare Worker
        testMode: false, // Set to false in production
        maxRecentSongs: 10
    };

    // State
    let recentSongs = [];

    // DOM Elements
    const elements = {
        recentSongsSection: document.getElementById('recent-songs-section'),
        recentSongsList: document.getElementById('recent-songs-list'),
        songFormSection: document.getElementById('song-form-section'),
        successSection: document.getElementById('success-section'),
        loadingSection: document.getElementById('loading-section'),
        songForm: document.getElementById('song-form'),
        songTitle: document.getElementById('song-title'),
        titleCount: document.getElementById('title-count'),
        artist: document.getElementById('artist'),
        artistCount: document.getElementById('artist-count'),
        genre: document.getElementById('genre'),
        requester: document.getElementById('requester'),
        requesterCount: document.getElementById('requester-count'),
        formError: document.getElementById('form-error'),
        duplicateWarning: document.getElementById('duplicate-warning'),
        submitBtn: document.getElementById('submit-song-btn'),
        successMessage: document.getElementById('success-message'),
        addAnotherBtn: document.getElementById('add-another-btn')
    };

    // Initialize
    function init() {
        setupEventListeners();
        setupCharacterCounters();
        loadRecentSongs();
    }

    // Event Listeners
    function setupEventListeners() {
        // Form submission
        elements.songForm.addEventListener('submit', handleFormSubmit);

        // Song title and artist input for duplicate checking
        elements.songTitle.addEventListener('blur', checkForDuplicate);
        elements.artist.addEventListener('blur', checkForDuplicate);

        // Add another song button
        elements.addAnotherBtn.addEventListener('click', resetForm);
    }

    // Character counters
    function setupCharacterCounters() {
        elements.songTitle.addEventListener('input', function() {
            updateCharCount(this, elements.titleCount, 100);
        });

        elements.artist.addEventListener('input', function() {
            updateCharCount(this, elements.artistCount, 100);
        });

        elements.requester.addEventListener('input', function() {
            updateCharCount(this, elements.requesterCount, 50);
        });
    }

    function updateCharCount(input, countEl, max) {
        const count = input.value.length;
        countEl.textContent = count;
        countEl.parentElement.classList.remove('warning', 'limit');
        if (count >= max) {
            countEl.parentElement.classList.add('limit');
        } else if (count >= max * 0.8) {
            countEl.parentElement.classList.add('warning');
        }
    }

    // Load recent songs
    async function loadRecentSongs() {
        try {
            let songs;

            if (CONFIG.testMode) {
                // Test data
                songs = [
                    { title: 'September', artist: 'Earth, Wind & Fire', genre: 'Dance' },
                    { title: 'At Last', artist: 'Etta James', genre: 'Classic' },
                    { title: 'Uptown Funk', artist: 'Bruno Mars', genre: 'Pop' },
                    { title: 'I Gotta Feeling', artist: 'Black Eyed Peas', genre: 'Dance' },
                    { title: 'Signed, Sealed, Delivered', artist: 'Stevie Wonder', genre: 'R&B' }
                ];
                await simulateDelay(500);
            } else {
                const response = await fetch(`${CONFIG.apiBaseUrl}/recent-songs`);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to load songs');
                }

                songs = result.data || [];
            }

            recentSongs = songs;
            displayRecentSongs(songs);

        } catch (error) {
            console.error('Failed to load recent songs:', error);
            elements.recentSongsList.innerHTML = `
                <p class="no-songs">Could not load recent requests. Please try again later.</p>
            `;
        }
    }

    // Display recent songs
    function displayRecentSongs(songs) {
        if (!songs || songs.length === 0) {
            elements.recentSongsList.innerHTML = `
                <p class="no-songs">No songs have been requested yet. Be the first!</p>
            `;
            return;
        }

        const html = songs.slice(0, CONFIG.maxRecentSongs).map(song => `
            <div class="song-item">
                <div class="song-info">
                    <div class="song-title">${escapeHtml(song.title)}</div>
                    <div class="song-artist">${escapeHtml(song.artist)}</div>
                </div>
                ${song.genre ? `<span class="song-genre">${escapeHtml(song.genre)}</span>` : ''}
            </div>
        `).join('');

        elements.recentSongsList.innerHTML = html;
    }

    // Check for duplicate song
    function checkForDuplicate() {
        const title = elements.songTitle.value.trim().toLowerCase();
        const artist = elements.artist.value.trim().toLowerCase();

        if (!title || !artist) {
            hideDuplicateWarning();
            return;
        }

        const isDuplicate = recentSongs.some(song =>
            song.title.toLowerCase() === title &&
            song.artist.toLowerCase() === artist
        );

        if (isDuplicate) {
            showDuplicateWarning();
        } else {
            hideDuplicateWarning();
        }
    }

    function showDuplicateWarning() {
        elements.duplicateWarning.textContent = 'This song has already been requested! You can still submit it if you want to show extra love for this song.';
        elements.duplicateWarning.classList.remove('hidden');
    }

    function hideDuplicateWarning() {
        elements.duplicateWarning.classList.add('hidden');
    }

    // Handle form submission
    async function handleFormSubmit(e) {
        e.preventDefault();

        const title = elements.songTitle.value.trim();
        const artist = elements.artist.value.trim();
        const genre = elements.genre.value;
        const requester = elements.requester.value.trim();

        // Validation
        if (!title) {
            showError('Please enter a song title.');
            elements.songTitle.focus();
            return;
        }

        if (!artist) {
            showError('Please enter the artist name.');
            elements.artist.focus();
            return;
        }

        showLoading();
        hideError();

        try {
            const submitData = {
                title: title,
                artist: artist,
                genre: genre || null,
                requester: requester || null
            };

            if (CONFIG.testMode) {
                await simulateDelay(1000);
                // Add to local list for display
                recentSongs.unshift({
                    title: title,
                    artist: artist,
                    genre: genre
                });
                showSuccess(title, artist);
                return;
            }

            const response = await fetch(`${CONFIG.apiBaseUrl}/submit-song`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(submitData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to submit song request. Please try again.');
            }

            // Add to local list
            recentSongs.unshift({
                title: title,
                artist: artist,
                genre: genre
            });

            showSuccess(title, artist);

        } catch (error) {
            showError(error.message);
            hideLoading();
        }
    }

    // Show success message
    function showSuccess(title, artist) {
        hideLoading();
        elements.songFormSection.classList.add('hidden');
        elements.recentSongsSection.classList.add('hidden');

        elements.successMessage.innerHTML = `
            <strong>"${escapeHtml(title)}"</strong> by <strong>${escapeHtml(artist)}</strong>
            has been added to our playlist consideration!<br><br>
            Thank you for helping us create the perfect celebration soundtrack!
        `;

        elements.successSection.classList.remove('hidden');
    }

    // Reset form for another submission
    function resetForm() {
        elements.songForm.reset();
        elements.titleCount.textContent = '0';
        elements.artistCount.textContent = '0';
        elements.requesterCount.textContent = '0';
        hideDuplicateWarning();
        hideError();

        // Show form again
        elements.successSection.classList.add('hidden');
        elements.songFormSection.classList.remove('hidden');
        elements.recentSongsSection.classList.remove('hidden');

        // Refresh recent songs
        displayRecentSongs(recentSongs);

        elements.songTitle.focus();
    }

    // UI Helpers
    function showLoading() {
        elements.loadingSection.classList.remove('hidden');
        elements.songFormSection.classList.add('hidden');
        elements.recentSongsSection.classList.add('hidden');
    }

    function hideLoading() {
        elements.loadingSection.classList.add('hidden');
    }

    function showError(message) {
        elements.formError.textContent = message;
        elements.formError.classList.remove('hidden');
    }

    function hideError() {
        elements.formError.classList.add('hidden');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function simulateDelay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
