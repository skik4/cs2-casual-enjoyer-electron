// =====================
// Event Handlers and Listeners
// =====================

import SteamAPI from './steam-api.js';
import UIManager from './ui-manager.js';
import App from './app.js';
import AppState from './app-state.js';
import AppValidators from './app-validators.js';

// Cached DOM elements
const steamIdInput = document.getElementById('steam_id');
const authInput = document.getElementById('auth');
const updateFriendsBtn = document.getElementById('updateFriendsBtn');

function getSteamId() {
    return steamIdInput ? steamIdInput.value.trim() : '';
}
function getAuth() {
    if (!authInput) return '';
    return SteamAPI.extractApiKeyOrToken(authInput.value.trim());
}

/**
 * Handle paste event for SteamID input
 * @param {ClipboardEvent} event
 */
export function handleSteamIdPaste(event) {
    const pastedText = (event.clipboardData || window.clipboardData).getData('text');
    if (pastedText.includes('steamcommunity.com')) {
        event.preventDefault();
        try {
            if (pastedText.includes('/profiles/')) {
                const steamIdMatch = pastedText.match(/\/profiles\/(\d{17})/);
                if (steamIdMatch && steamIdMatch[1]) {
                    steamIdInput.value = steamIdMatch[1];
                    validateInputs();
                    return;
                }
            }
            if (pastedText.includes('/id/')) {
                const vanityMatch = pastedText.match(/\/id\/([^\/]+)/);
                if (vanityMatch && vanityMatch[1]) {
                    const vanityUrl = vanityMatch[1];
                    const auth = getAuth();
                    if (!auth) {
                        UIManager.showError("Please enter your API Key first to resolve vanity URLs");
                        return;
                    }
                    const originalValue = steamIdInput.value;
                    steamIdInput.value = "Resolving vanity URL...";
                    steamIdInput.disabled = true;
                    SteamAPI.resolveVanityUrl(vanityUrl, auth)
                        .then(steamId => {
                            if (steamId) {
                                steamIdInput.value = steamId;
                                UIManager.hideError();
                            } else {
                                steamIdInput.value = originalValue;
                                UIManager.showError("Could not resolve vanity URL. Please enter SteamID64 manually.");
                            }
                        })
                        .catch(error => {
                            steamIdInput.value = originalValue;
                            UIManager.showError("Error resolving vanity URL: " + error.message);
                        })
                        .finally(() => {
                            steamIdInput.disabled = false;
                            validateInputs();
                        });
                    return;
                }
            }
            UIManager.showError("Unrecognized Steam URL format. Please enter SteamID64 manually.");
        } catch (error) {
            console.error("Error processing pasted Steam URL:", error);
            UIManager.showError("Error processing URL: " + error.message);
        }
    }
}

/**
 * Validate input fields and update UI
 */
export function validateInputs() {
    const steamId = getSteamId();
    const auth = getAuth();
    const updateBtn = updateFriendsBtn;
    const privacyLink = document.querySelector('.privacy-link');

    const validSteamId = AppValidators.validateSteamId(steamId);
    const validApiKey = AppValidators.validateApiAuth(auth);
    const hasSaved = AppState.savedSettings && AppState.savedSettings.steam_id && AppState.savedSettings.auth;
    const enableBtn = (validSteamId && validApiKey) || hasSaved;

    if (updateBtn) updateBtn.disabled = !enableBtn;

    if (steamIdInput) {
        if (steamId && validSteamId) {
            steamIdInput.classList.remove('invalid-input');
            steamIdInput.classList.add('valid-input');
        } else {
            steamIdInput.classList.remove('valid-input');
            if (steamId) steamIdInput.classList.add('invalid-input');
            else steamIdInput.classList.remove('invalid-input');
        }
    }

    if (authInput) {
        if (authInput.value.trim() && validApiKey) {
            authInput.classList.remove('invalid-input');
            authInput.classList.add('valid-input');
        } else {
            authInput.classList.remove('valid-input');
            if (authInput.value.trim()) authInput.classList.add('invalid-input');
            else authInput.classList.remove('invalid-input');
        }
    }

    if (privacyLink) {
        privacyLink.classList.toggle('disabled-link', !(steamId || hasSaved));
    }
}

/**
 * Setup all main app event listeners
 */
export function setupAppEventListeners() {
    if (updateFriendsBtn) updateFriendsBtn.addEventListener('click', App.updateFriendsList);
    if (steamIdInput) steamIdInput.addEventListener('input', validateInputs);
    if (authInput) authInput.addEventListener('input', validateInputs);
    if (steamIdInput) steamIdInput.addEventListener('paste', handleSteamIdPaste);
    const steamIdHelp = document.querySelector('.param-label-text[title*="Steam profile"]');
    if (steamIdHelp) steamIdHelp.addEventListener('click', UIManager.showSteamIdHelp);
    const apiKeyHelp = document.querySelector('.param-label-text[title*="API Key"]');
    if (apiKeyHelp) apiKeyHelp.addEventListener('click', (e) => {
        e.preventDefault();
        UIManager.showApiKeyHelp();
    });
}

// Public API for AppEvents
const AppEvents = {
    validateInputs,
    setupAppEventListeners
};

export default AppEvents;