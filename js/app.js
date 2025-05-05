import SteamAPI from './steam-api.js';
import UIManager from './ui-manager.js';
import JoinManager from './join-manager.js';

// =====================
// App State
// =====================

/**
 * @typedef {Object} AppStateType
 * @property {Array} friendsData
 * @property {number|null} friendsRefreshInterval
 * @property {Object|null} savedSettings
 * @property {boolean} usingSavedFriends
 * @property {Array} savedFriendsIds
 * @property {Object} savedAvatars
 * @property {number} autoRefreshIntervalMs
 * @property {boolean} initialLoadAttempted
 */

/** @type {AppStateType} */
const AppState = {
    friendsData: [],
    friendsRefreshInterval: null,
    savedSettings: null,
    usingSavedFriends: false,
    savedFriendsIds: [],
    savedAvatars: {},
    autoRefreshIntervalMs: 3000,
    initialLoadAttempted: false
};

// =====================
// Cached DOM Elements & Getters
// =====================

const steamIdInput = document.getElementById('steam_id');
const authInput = document.getElementById('auth');
const updateFriendsBtn = document.getElementById('updateFriendsBtn');

/**
 * Get trimmed SteamID64 from input
 * @returns {string}
 */
function getSteamId() {
    return steamIdInput ? steamIdInput.value.trim() : '';
}

/**
 * Get normalized API key or token from input
 * @returns {string}
 */
function getAuth() {
    if (!authInput) return '';
    return SteamAPI.extractApiKeyOrToken(authInput.value.trim());
}

// =====================
// Validation and UI
// =====================

/**
 * Validate SteamID64
 * @param {string} steamId
 * @returns {boolean}
 */
function validateSteamId(steamId) {
    return /^\d{17}$/.test(steamId);
}

/**
 * Validate API key or token
 * @param {string} auth
 * @returns {boolean}
 */
function validateApiAuth(auth) {
    const keyRegex = /^[A-Z0-9]{32}$/i;
    const tokenRegex = /^[\w-]+\.[\w-]+\.[\w-]+$/;
    try {
        const parsed = JSON.parse(auth);
        if (parsed?.data?.webapi_token) return true;
    } catch { }
    return keyRegex.test(auth) || tokenRegex.test(auth);
}

/**
 * Validate input fields and update UI
 */
function validateInputs() {
    const steamId = getSteamId();
    const auth = getAuth();
    const updateBtn = updateFriendsBtn;
    const privacyLink = document.querySelector('.privacy-link');

    const validSteamId = validateSteamId(steamId);
    const validApiKey = validateApiAuth(auth);
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

// =====================
// Event Handlers
// =====================

/**
 * Handle paste event for SteamID input
 * @param {ClipboardEvent} event
 */
function handleSteamIdPaste(event) {
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

// =====================
// API Calls and Data Flow
// =====================

/**
 * Fetch and render friends by their IDs
 * @param {Array} friendIds
 * @param {string} auth
 * @param {boolean} [keepStates=false]
 * @returns {Promise<Array>}
 */
async function fetchAndRenderFriendsByIds(friendIds, auth, keepStates = false) {
    if (!friendIds || !friendIds.length) {
        console.error("No friend IDs provided to fetchAndRenderFriendsByIds");
        return [];
    }
    try {
        const apiClient = SteamAPI.createSteamApiClient(auth);
        const allStatuses = await apiClient.getFriendsStatuses(friendIds, AppState.savedAvatars);
        const casualFriends = allStatuses.filter(f => f.can_join);
        console.log(`[DEBUG] Friends in Casual mode (${casualFriends.length}):`, casualFriends.map(f => ({
            steamid: f.steamid,
            personaname: f.personaname,
            status: f.status,
            game_map: f.game_map,
            connect: f.connect
        })));
        AppState.friendsData = casualFriends;
        const joinStates = keepStates ? JoinManager.getJoinStates() : {};
        UIManager.renderFriendsList(AppState.friendsData, joinStates);
        return AppState.friendsData;
    } catch (error) {
        console.error("Error in fetchAndRenderFriendsByIds:", error);
        if (!keepStates) UIManager.showError(error.message || error);
        throw error;
    }
}

/**
 * Update friends list
 */
async function updateFriendsList() {
    let steam_id = getSteamId();
    let auth = getAuth();
    if ((!steam_id || !auth) && AppState.savedSettings) {
        if (!steam_id && AppState.savedSettings.steam_id) steam_id = AppState.savedSettings.steam_id;
        if (!auth && AppState.savedSettings.auth) auth = AppState.savedSettings.auth;
    }
    auth = SteamAPI.extractApiKeyOrToken(auth);
    if (!steam_id || !auth) {
        UIManager.showError("Please enter your SteamID64 and API Key");
        return;
    }
    if (!validateSteamId(steam_id)) {
        UIManager.showError("Invalid SteamID64. It should be a 17-digit number.");
        return;
    }
    if (!validateApiAuth(auth)) {
        UIManager.showError("Invalid API Key or token.");
        return;
    }
    if (AppState.savedSettings &&
        (AppState.savedSettings.steam_id !== steam_id || AppState.savedSettings.auth !== auth)) {
        localStorage.removeItem('hide_privacy_warning');
        AppState.usingSavedFriends = false;
    }
    const apiClient = SteamAPI.createSteamApiClient(auth);
    const updateBtn = updateFriendsBtn;
    if (updateBtn) {
        updateBtn.disabled = true;
        updateBtn.textContent = "Updating...";
    }
    try {
        let allFriendIds = [];
        try {
            allFriendIds = await apiClient.getFriendsList(steam_id);
            console.log(`[DEBUG] Total friends fetched: ${allFriendIds.length}`);
            UIManager.hideError();
        } catch (err) {
            UIManager.showError(err, steam_id);
            return;
        } finally {
            if (updateBtn) {
                updateBtn.disabled = false;
                updateBtn.textContent = "Update Friends List";
            }
        }
        if (!allFriendIds.length) {
            UIManager.showError("No friends found in your friends list.", steam_id);
            return;
        }
        const avatarsMap = await apiClient.getPlayerSummaries(allFriendIds);
        AppState.savedAvatars = {};
        for (const sid of allFriendIds) {
            if (avatarsMap[sid]) {
                AppState.savedAvatars[sid] = {
                    avatarfull: avatarsMap[sid].avatarfull
                };
            }
        }
        AppState.savedFriendsIds = allFriendIds;
        const saveResult = await window.electronAPI.saveSettings({
            steam_id,
            auth: auth,
            friends_ids: AppState.savedFriendsIds,
            avatars: AppState.savedAvatars
        });
        AppState.usingSavedFriends = true;
        if (window.JoinManager && typeof window.JoinManager.resetAll === "function") {
            window.JoinManager.resetAll();
        }
        await fetchAndRenderFriendsByIds(AppState.savedFriendsIds, auth);
        startAutoRefresh();
    } catch (error) {
        console.error("Error during friends refresh:", error);
        UIManager.showError(error.message || error, steam_id);
    } finally {
        if (updateBtn) {
            updateBtn.disabled = false;
            updateBtn.textContent = "Update Friends List";
        }
    }
}

/**
 * Start auto-refresh for friends list
 */
async function startAutoRefresh() {
    const auth = getAuth();
    const apiClient = SteamAPI.createSteamApiClient(auth);
    UIManager.updateFriendsStatus('Loading friends in Casual mode...');
    window.electronAPI.log('info', `Starting auto-refresh with ${AppState.savedFriendsIds.length} saved friends`);
    try {
        await fetchAndRenderFriendsByIds(AppState.savedFriendsIds, auth, true);
        if (AppState.friendsRefreshInterval) clearInterval(AppState.friendsRefreshInterval);
        AppState.friendsRefreshInterval = setInterval(() => {
            if (AppState.usingSavedFriends && AppState.savedFriendsIds.length) {
                fetchAndRenderFriendsByIds(AppState.savedFriendsIds, auth, true)
                    .catch(error => {
                        window.electronAPI.log('warn', "Auto-refresh fetch failed: " + error.message);
                    });
            }
        }, AppState.autoRefreshIntervalMs);
        window.electronAPI.log('info', "Auto-refresh of casual friends status started");
    } catch (error) {
        window.electronAPI.log('error', "Failed to start auto-refresh: " + error.message);
        throw error;
    }
}

// =====================
// Initialization
// =====================

document.addEventListener('DOMContentLoaded', async () => {
    const updateBtn = updateFriendsBtn;
    if (updateBtn) updateBtn.disabled = true;

    updateFriendsBtn.addEventListener('click', updateFriendsList);
    steamIdInput.addEventListener('input', validateInputs);
    authInput.addEventListener('input', validateInputs);
    steamIdInput.addEventListener('paste', handleSteamIdPaste);
    document.querySelector('.param-label-text[title*="Steam profile"]').addEventListener('click', UIManager.showSteamIdHelp);
    document.querySelector('.param-label-text[title*="API Key"]').addEventListener('click', (e) => {
        e.preventDefault();
        UIManager.showApiKeyHelp();
    });

    if (!document.getElementById('error')) {
        const errorDiv = document.createElement('div');
        errorDiv.id = 'error';
        errorDiv.style.display = 'none';
        const container = document.querySelector('.container');
        container.insertBefore(errorDiv, container.firstChild);
    }

    try {
        AppState.savedSettings = await window.electronAPI.loadSettings();
        if (AppState.savedSettings && AppState.savedSettings.api_key) {
            AppState.savedSettings.auth = SteamAPI.extractApiKeyOrToken(AppState.savedSettings.api_key);
            delete AppState.savedSettings.api_key;
            await window.electronAPI.saveSettings({ ...AppState.savedSettings });
        }
        window.electronAPI.log('info', 'Settings loaded: ' + JSON.stringify(AppState.savedSettings ? {
            has_steam_id: !!AppState.savedSettings.steam_id,
            has_auth: !!AppState.savedSettings.auth,
            friend_count: AppState.savedSettings.friends_ids?.length || 0
        } : null));
        if (AppState.savedSettings) {
            if (AppState.savedSettings.steam_id && steamIdInput) steamIdInput.value = AppState.savedSettings.steam_id;
            if (AppState.savedSettings.auth && authInput) authInput.value = AppState.savedSettings.auth;
            if (AppState.savedSettings.friends_ids && Array.isArray(AppState.savedSettings.friends_ids)) {
                AppState.savedFriendsIds = AppState.savedSettings.friends_ids;
                AppState.usingSavedFriends = true;
            }
            if (AppState.savedSettings.avatars && typeof AppState.savedSettings.avatars === 'object') {
                AppState.savedAvatars = AppState.savedSettings.avatars;
            }
            validateInputs();
            const token = SteamAPI.extractTokenIfAny(AppState.savedSettings.auth || "");
            if (token) {
                const info = SteamAPI.parseWebApiToken(token);
                if (info && info.expires && info.expires * 1000 > Date.now()) {
                    window.electronAPI.log('info', "Detected valid saved token, auto-refreshing friends list via API (privacy ignored)");
                    setTimeout(() => {
                        AppState.initialLoadAttempted = true;
                        updateFriendsList();
                    }, 500);
                } else {
                    window.electronAPI.log('info', "Token is missing or expired, not auto-refreshing friends list");
                    UIManager.updateFriendsStatus('Your Steam Web API Token is expired. Please get a new one and click "Update Friends List".');
                }
            } else if (
                AppState.savedSettings.steam_id &&
                AppState.savedSettings.auth &&
                AppState.savedSettings.friends_ids &&
                AppState.savedSettings.friends_ids.length > 0 &&
                validateApiAuth(AppState.savedSettings.auth)
            ) {
                window.electronAPI.log('info', `Found ${AppState.savedSettings.friends_ids.length} saved friend IDs in settings`);
                setTimeout(() => {
                    AppState.initialLoadAttempted = true;
                    startAutoRefresh()
                        .catch(error => {
                            window.electronAPI.log('error', 'Auto-refresh startup failed: ' + error.message);
                            UIManager.updateFriendsStatus(`Could not automatically load friends list.<br>Error: ${error.message || 'Unknown error'}<br>Please click "Update Friends List" to try again.`);
                        });
                }, 500);
            } else {
                window.electronAPI.log('info', "Missing required settings for auto-loading friends");
                UIManager.updateFriendsStatus('Click "Update Friends List" to load your friends');
            }
        } else {
            window.electronAPI.log('info', "No saved settings found");
            UIManager.updateFriendsStatus(
                'Enter your <b>Steam Web API Token</b> (recommended) or <b>API Key</b> (with Steam ID),<br>' +
                'then click <b>Update Friends List</b>.<br>' +
                'To get them, click <b>Steam Web API Token / Key</b> or <b>SteamID64</b> above.'
            );
        }
    } catch (error) {
        window.electronAPI.log('error', 'Error during app initialization: ' + error.message);
        UIManager.showError('Failed to initialize app: ' + error.message);
    }

    if (authInput) {
        authInput.addEventListener('input', () => {
            const val = authInput.value.trim();
            let token = null;
            try {
                const parsed = JSON.parse(val);
                if (parsed?.data?.webapi_token) token = parsed.data.webapi_token;
            } catch { }
            if (!token && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(val)) token = val;
            if (window.JoinManager && typeof window.JoinManager.resetAll === "function") {
                window.JoinManager.resetAll();
            }
            if (token) {
                const info = SteamAPI.parseWebApiToken(token);
                if (info && info.steamid) {
                    if (steamIdInput && (!steamIdInput.value || steamIdInput.value !== info.steamid)) {
                        steamIdInput.value = info.steamid;
                        validateInputs();
                    }
                    UIManager.showTokenInfoNotification(info);
                } else {
                    UIManager.hideTokenInfoNotification();
                }
            } else {
                UIManager.hideTokenInfoNotification();
            }
        });
        setTimeout(() => {
            const event = new Event('input');
            authInput.dispatchEvent(event);
        }, 0);
    }
});
