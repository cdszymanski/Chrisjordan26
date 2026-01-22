/**
 * RSVP Form Handler
 * Christopher & Jordan Wedding Website
 */

(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        apiBaseUrl: '/api', // Will be proxied through Cloudflare Worker
        testMode: false, // Set to false in production
        testCode: '1234', // Test code for development
        testGuests: {
            names: 'Test Guest & Family',
            maxGuests: 4,
            individualGuests: ['Test Guest', 'Spouse Name', 'Child One', 'Child Two']
        }
    };

    // State
    let turnstileToken = null;
    let currentGuests = null;

    // DOM Elements
    const elements = {
        codeEntrySection: document.getElementById('code-entry-section'),
        rsvpFormSection: document.getElementById('rsvp-form-section'),
        successSection: document.getElementById('success-section'),
        loadingSection: document.getElementById('loading-section'),
        inviteCode: document.getElementById('invite-code'),
        verifyBtn: document.getElementById('verify-code-btn'),
        codeError: document.getElementById('code-error'),
        guestNamesDisplay: document.getElementById('guest-names-display'),
        guestCountDisplay: document.getElementById('guest-count-display'),
        rsvpForm: document.getElementById('rsvp-form'),
        rsvpCode: document.getElementById('rsvp-code'),
        guestCountSection: document.getElementById('guest-count-section'),
        guestCountSelect: document.getElementById('guest-count'),
        individualGuests: document.getElementById('individual-guests'),
        dietary: document.getElementById('dietary'),
        dietaryCount: document.getElementById('dietary-count'),
        notes: document.getElementById('notes'),
        notesCount: document.getElementById('notes-count'),
        formError: document.getElementById('form-error'),
        submitBtn: document.getElementById('submit-rsvp-btn'),
        successMessage: document.getElementById('success-message')
    };

    // Initialize
    function init() {
        setupEventListeners();
        setupCharacterCounters();
    }

    // Event Listeners
    function setupEventListeners() {
        // Code input - allow typing and auto-format
        elements.inviteCode.addEventListener('input', handleCodeInput);
        elements.inviteCode.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (!elements.verifyBtn.disabled) {
                    verifyCode();
                }
            }
        });

        // Verify button
        elements.verifyBtn.addEventListener('click', verifyCode);

        // Attendance radio buttons
        document.querySelectorAll('input[name="attending"]').forEach(radio => {
            radio.addEventListener('change', handleAttendanceChange);
        });

        // Guest count select
        elements.guestCountSelect.addEventListener('change', handleGuestCountChange);

        // Form submission
        elements.rsvpForm.addEventListener('submit', handleFormSubmit);
    }

    // Character counters for textareas
    function setupCharacterCounters() {
        elements.dietary.addEventListener('input', function() {
            updateCharCount(this, elements.dietaryCount, 500);
        });

        elements.notes.addEventListener('input', function() {
            updateCharCount(this, elements.notesCount, 500);
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

    // Handle code input - normalize to uppercase for display but match case-insensitively
    function handleCodeInput(e) {
        // Remove any non-alphanumeric characters except dash
        let value = e.target.value.replace(/[^a-zA-Z0-9-]/g, '');
        e.target.value = value.toUpperCase();
        hideError(elements.codeError);
    }

    // Turnstile callback
    window.onTurnstileSuccess = function(token) {
        turnstileToken = token;
        elements.verifyBtn.disabled = false;
    };

    // Verify invite code
    async function verifyCode() {
        const code = elements.inviteCode.value.trim();

        if (!code) {
            showError(elements.codeError, 'Please enter your invitation code.');
            return;
        }

        // In production, require Turnstile token
        if (!CONFIG.testMode && !turnstileToken) {
            showError(elements.codeError, 'Please complete the security check.');
            return;
        }

        showLoading();

        try {
            let guestData;

            // Test mode - check for test code (case-insensitive)
            if (CONFIG.testMode && code.toLowerCase() === CONFIG.testCode.toLowerCase()) {
                guestData = CONFIG.testGuests;
            } else {
                // Call API to validate code
                const response = await fetch(`${CONFIG.apiBaseUrl}/validate-code`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        code: code.toLowerCase(), // Send lowercase for case-insensitive matching
                        turnstileToken: turnstileToken
                    })
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Invalid code. Please check and try again.');
                }

                guestData = result.data;
            }

            // Store guest data and show form
            currentGuests = guestData;
            displayGuestInfo(guestData);
            elements.rsvpCode.value = code;
            showRsvpForm();

        } catch (error) {
            showError(elements.codeError, error.message);
            hideLoading();
        }
    }

    // Display guest information
    function displayGuestInfo(guestData) {
        elements.guestNamesDisplay.textContent = guestData.names;
        elements.guestCountDisplay.textContent = `Party of ${guestData.maxGuests}`;

        // Populate guest count dropdown
        elements.guestCountSelect.innerHTML = '';
        for (let i = 1; i <= guestData.maxGuests; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i === 1 ? '1 guest' : `${i} guests`;
            if (i === guestData.maxGuests) option.selected = true;
            elements.guestCountSelect.appendChild(option);
        }

        // Populate individual guest checkboxes if multiple guests
        if (guestData.individualGuests && guestData.individualGuests.length > 1) {
            elements.individualGuests.innerHTML = `
                <label style="display: block; margin-bottom: 15px; font-size: 14px; letter-spacing: 1px; color: #666; text-transform: uppercase;">
                    Who will be attending?
                </label>
            `;
            guestData.individualGuests.forEach((name, index) => {
                const div = document.createElement('div');
                div.className = 'guest-item';
                div.innerHTML = `
                    <span class="guest-name">${escapeHtml(name)}</span>
                    <div class="attendance-toggle">
                        <button type="button" class="guest-yes" data-guest="${index}" data-value="yes">Yes</button>
                        <button type="button" class="guest-no" data-guest="${index}" data-value="no">No</button>
                    </div>
                `;
                elements.individualGuests.appendChild(div);
            });

            // Add event listeners for individual guest buttons
            elements.individualGuests.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', handleIndividualGuestToggle);
            });
        }
    }

    // Handle individual guest attendance toggle
    function handleIndividualGuestToggle(e) {
        const btn = e.target;
        const guestIndex = btn.dataset.guest;
        const value = btn.dataset.value;
        const container = btn.closest('.attendance-toggle');

        // Remove selected state from both buttons
        container.querySelectorAll('button').forEach(b => {
            b.classList.remove('selected-yes', 'selected-no');
        });

        // Add selected state to clicked button
        btn.classList.add(value === 'yes' ? 'selected-yes' : 'selected-no');

        // Update guest count
        updateGuestCountFromIndividual();
    }

    // Update guest count based on individual selections
    function updateGuestCountFromIndividual() {
        const yesButtons = elements.individualGuests.querySelectorAll('.selected-yes');
        const count = yesButtons.length;
        if (count > 0) {
            elements.guestCountSelect.value = count;
        }
    }

    // Handle attendance change
    function handleAttendanceChange(e) {
        const attending = e.target.value === 'yes';
        if (attending) {
            elements.guestCountSection.classList.remove('hidden');
            handleGuestCountChange();
        } else {
            elements.guestCountSection.classList.add('hidden');
            elements.individualGuests.classList.add('hidden');
        }
    }

    // Handle guest count change
    function handleGuestCountChange() {
        const count = parseInt(elements.guestCountSelect.value);
        if (currentGuests && currentGuests.individualGuests && currentGuests.individualGuests.length > 1) {
            elements.individualGuests.classList.remove('hidden');
        } else {
            elements.individualGuests.classList.add('hidden');
        }
    }

    // Handle form submission
    async function handleFormSubmit(e) {
        e.preventDefault();

        const formData = new FormData(elements.rsvpForm);
        const attending = formData.get('attending');

        if (!attending) {
            showError(elements.formError, 'Please indicate whether you will be attending.');
            return;
        }

        const isAttending = attending === 'yes';
        let guestCount = 0;
        let attendingNames = [];

        if (isAttending) {
            guestCount = parseInt(formData.get('guestCount')) || 0;

            // Get individual guest selections
            if (currentGuests && currentGuests.individualGuests) {
                elements.individualGuests.querySelectorAll('.selected-yes').forEach(btn => {
                    const index = parseInt(btn.dataset.guest);
                    attendingNames.push(currentGuests.individualGuests[index]);
                });
            }

            if (guestCount === 0) {
                showError(elements.formError, 'Please select how many guests will be attending.');
                return;
            }
        }

        showLoading();
        hideError(elements.formError);

        try {
            const submitData = {
                code: formData.get('code').toLowerCase(),
                attending: isAttending,
                guestCount: guestCount,
                attendingNames: attendingNames.length > 0 ? attendingNames.join(', ') : currentGuests.names,
                dietary: formData.get('dietary') || '',
                notes: formData.get('notes') || '',
                turnstileToken: turnstileToken
            };

            // In test mode, simulate success
            if (CONFIG.testMode && submitData.code === CONFIG.testCode.toLowerCase()) {
                await simulateDelay(1000);
                showSuccess(isAttending, guestCount);
                return;
            }

            const response = await fetch(`${CONFIG.apiBaseUrl}/submit-rsvp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(submitData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to submit RSVP. Please try again.');
            }

            showSuccess(isAttending, guestCount);

        } catch (error) {
            showError(elements.formError, error.message);
            hideLoading();
        }
    }

    // Show success message
    function showSuccess(isAttending, guestCount) {
        hideLoading();
        elements.rsvpFormSection.classList.add('hidden');

        if (isAttending) {
            elements.successMessage.innerHTML = `
                Your RSVP has been received!<br><br>
                We're so excited that ${guestCount === 1 ? "you'll" : "you and your guests will"} be joining us
                on September 19th, 2026.<br><br>
                See you at The Grandview of Ellington!
            `;
        } else {
            elements.successMessage.innerHTML = `
                We're sorry you won't be able to join us,
                but we appreciate you letting us know.<br><br>
                We'll be thinking of you on our special day!
            `;
        }

        elements.successSection.classList.remove('hidden');
    }

    // UI Helpers
    function showLoading() {
        elements.loadingSection.classList.remove('hidden');
        elements.codeEntrySection.classList.add('hidden');
        elements.rsvpFormSection.classList.add('hidden');
    }

    function hideLoading() {
        elements.loadingSection.classList.add('hidden');
    }

    function showRsvpForm() {
        hideLoading();
        elements.codeEntrySection.classList.add('hidden');
        elements.rsvpFormSection.classList.remove('hidden');
    }

    function showError(element, message) {
        element.textContent = message;
        element.classList.remove('hidden');
    }

    function hideError(element) {
        element.classList.add('hidden');
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
