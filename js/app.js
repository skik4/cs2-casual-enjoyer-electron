/**
 * Main application module
 * Initialize the application and handle global state
 */

// Global state variables
let friendsData = [];
let friendsRefreshInterval = null;
let savedSettings = null;
let usingSavedFriends = false;
let savedFriendsIds = [];
let savedAvatars = {}; // steamid -> avatar url
let autoRefreshIntervalMs = 3000; // Auto-refresh interval in ms
let initialLoadAttempted = false;

// Извлекает токен из строки (JWT или JSON)
function extractTokenIfAny(authInput) {
    try {
        const parsed = JSON.parse(authInput);
        if (parsed?.data?.webapi_token) return parsed.data.webapi_token;
    } catch {}
    if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(authInput)) return authInput;
    return null;
}

/**
 * Extracts the actual API key or webapi_token from input
 * @param {string} apiKeyInput
 * @returns {string}
 */
function extractApiKeyOrToken(apiKeyInput) {
    // If it's a JSON response, extract webapi_token
    try {
        const parsed = JSON.parse(apiKeyInput);
        if (parsed?.data?.webapi_token) return parsed.data.webapi_token;
    } catch {}
    // If it's a JWT-like token, return as is
    if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(apiKeyInput)) return apiKeyInput;
    // Otherwise, assume it's a classic API key
    return apiKeyInput;
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Disable update button by default on app start
    const updateBtn = document.getElementById('updateFriendsBtn');
    if (updateBtn) updateBtn.disabled = true;

    // Set up event listeners for UI controls
    document.getElementById('updateFriendsBtn').addEventListener('click', updateFriendsList);
    
    // Add input validation event listeners
    document.getElementById('steam_id').addEventListener('input', validateInputs);
    document.getElementById('api_key').addEventListener('input', validateInputs);
    
    // Add paste event listener for Steam ID URL processing
    document.getElementById('steam_id').addEventListener('paste', handleSteamIdPaste);
    
    // Add click handlers for labels to show help notifications
    document.querySelector('.param-label-text[title*="Steam profile"]').addEventListener('click', UIManager.showSteamIdHelp);
    document.querySelector('.param-label-text[title*="API Key"]').addEventListener('click', (e) => {
        e.preventDefault();
        UIManager.showApiKeyHelp();
    });

    // Create error message container if it doesn't exist
    if (!document.getElementById('error')) {
        const errorDiv = document.createElement('div');
        errorDiv.id = 'error';
        errorDiv.style.display = 'none';
        errorDiv.style.color = 'red';
        errorDiv.style.margin = '10px 0';
        errorDiv.style.padding = '10px';
        errorDiv.style.border = '1px solid red';
        errorDiv.style.borderRadius = '5px';
        errorDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
        errorDiv.style.textAlign = 'center';
        
        const container = document.querySelector('.container');
        container.insertBefore(errorDiv, container.firstChild);
    }

    try {
        // Load settings from file
        savedSettings = await window.electronAPI.loadSettings();
        // --- normalize auth on load ---
        if (savedSettings && savedSettings.api_key) {
            // migrate old field to new
            savedSettings.auth = extractApiKeyOrToken(savedSettings.api_key);
            delete savedSettings.api_key;
            await window.electronAPI.saveSettings({ ...savedSettings });
        }
        window.electronAPI.log('info', 'Settings loaded: ' + JSON.stringify(savedSettings ? { 
            has_steam_id: !!savedSettings.steam_id,
            has_auth: !!savedSettings.auth,
            friend_count: savedSettings.friends_ids?.length || 0
        } : null));
        
        if (savedSettings) {
            // Restore saved settings to input fields
            if (savedSettings.steam_id) document.getElementById('steam_id').value = savedSettings.steam_id;
            if (savedSettings.auth) document.getElementById('api_key').value = savedSettings.auth;
            if (savedSettings.friends_ids && Array.isArray(savedSettings.friends_ids)) {
                savedFriendsIds = savedSettings.friends_ids;
                usingSavedFriends = true;
            }
            if (savedSettings.avatars && typeof savedSettings.avatars === 'object') {
                savedAvatars = savedSettings.avatars;
            }
            
            // Trigger validation after loading settings to show validation indicators
            validateInputs();

            // --- Автоматически обновлять список друзей, если сохранён токен ---
            const token = extractTokenIfAny(savedSettings.auth || "");
            if (token) {
                // Если токен, всегда обновлять список друзей через API (неважна приватность)
                window.electronAPI.log('info', "Detected saved token, auto-refreshing friends list via API (privacy ignored)");
                setTimeout(() => {
                    initialLoadAttempted = true;
                    updateFriendsList();
                }, 500);
            } else if (savedSettings.steam_id && savedSettings.auth && savedSettings.friends_ids && savedSettings.friends_ids.length > 0) {
                window.electronAPI.log('info', `Found ${savedSettings.friends_ids.length} saved friend IDs in settings`);
                setTimeout(() => {
                    initialLoadAttempted = true;
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
            UIManager.updateFriendsStatus('Enter your Steam ID and API Key, then click "Update Friends List"');
        }
    } catch (error) {
        window.electronAPI.log('error', 'Error during app initialization: ' + error.message);
        UIManager.showError('Failed to initialize app: ' + error.message);
    }

    const apiKeyInput = document.getElementById('api_key');
    if (apiKeyInput) {
        apiKeyInput.addEventListener('input', () => {
            const val = apiKeyInput.value.trim();
            let token = null;
            // Try to extract token from JSON or direct input
            try {
                const parsed = JSON.parse(val);
                if (parsed?.data?.webapi_token) token = parsed.data.webapi_token;
            } catch {}
            if (!token && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(val)) token = val;
            if (token) {
                const info = parseWebApiToken(token);
                if (info && info.steamid) {
                    // Autofill steamid if empty or different
                    const steamIdInput = document.getElementById('steam_id');
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
        // Trigger on load if value already exists
        setTimeout(() => {
            const event = new Event('input');
            apiKeyInput.dispatchEvent(event);
        }, 0);
    }
});

/**
 * Start auto refresh of casual friends status
 * @returns {Promise} A promise that resolves when the initial refresh is complete
 */
async function startAutoRefresh() {
    const auth = document.getElementById('api_key').value.trim();
    const apiKeyOrToken = extractApiKeyOrToken(auth);
    UIManager.updateFriendsStatus('Loading friends in Casual mode...');
    window.electronAPI.log('info', `Starting auto-refresh with ${savedFriendsIds.length} saved friends`);
    
    try {
        // Initial fetch to display immediately
        const data = await fetchAndRenderFriendsByIds(savedFriendsIds, apiKeyOrToken, true);
        window.electronAPI.log('info', `Successfully loaded ${data.length} friends in casual mode`);
        
        // Setup periodic refresh of casual status only
        if (friendsRefreshInterval) clearInterval(friendsRefreshInterval);
        friendsRefreshInterval = setInterval(() => {
            if (usingSavedFriends && savedFriendsIds.length) {
                fetchAndRenderFriendsByIds(savedFriendsIds, apiKeyOrToken, true)
                    .then(data => {
                        // Success - don't need to do anything as UI is updated in fetchAndRenderFriendsByIds
                    })
                    .catch(error => {
                        window.electronAPI.log('warn', "Auto-refresh fetch failed: " + error.message);
                    });
            }
        }, autoRefreshIntervalMs);
        
        window.electronAPI.log('info', "Auto-refresh of casual friends status started");
    } catch (error) {
        window.electronAPI.log('error', "Failed to start auto-refresh: " + error.message);
        throw error; // Re-throw to be caught by the caller
    }
}

/**
 * Validates inputs and updates UI accordingly
 */
function validateInputs() {
    const steamId = document.getElementById('steam_id').value.trim();
    const auth = document.getElementById('api_key').value.trim();
    const updateBtn = document.getElementById('updateFriendsBtn');
    const privacyLink = document.querySelector('.privacy-link');

    // Check Steam ID and auth validity
    const validSteamId = validateSteamId(steamId);
    const validApiKey = validateApiKey(auth);

    // Доступность кнопки: если есть валидные данные или сохранённые в settings
    const hasSaved = savedSettings && savedSettings.steam_id && savedSettings.auth;
    const enableBtn = (validSteamId && validApiKey) || hasSaved;

    if (updateBtn) {
        updateBtn.disabled = !enableBtn;
    }

    // Add visual indicators for input validity (только если не пусто)
    const steamIdInput = document.getElementById('steam_id');
    const apiKeyInput = document.getElementById('api_key');

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

    if (apiKeyInput) {
        if (auth && validApiKey) {
            apiKeyInput.classList.remove('invalid-input');
            apiKeyInput.classList.add('valid-input');
        } else {
            apiKeyInput.classList.remove('valid-input');
            if (auth) apiKeyInput.classList.add('invalid-input');
            else apiKeyInput.classList.remove('invalid-input');
        }
    }

    // If privacy link exists, update its state too
    if (privacyLink) {
        privacyLink.classList.toggle('disabled-link', !(steamId || hasSaved));
    }
}

/**
 * Validates a Steam ID
 * @param {string} steamId - The Steam ID to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function validateSteamId(steamId) {
    // SteamID64 is always 17 digits
    const regex = /^\d{17}$/;
    return regex.test(steamId);
}

/**
 * Validates a Steam API Key or webapi_token
 * @param {string} apiKey - The API key or token to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function validateApiKey(apiKey) {
    // Steam API keys are 32 character hexadecimal strings
    const keyRegex = /^[A-Z0-9]{32}$/i;
    // webapi_token is a JWT-like string with at least 2 dots
    const tokenRegex = /^[\w-]+\.[\w-]+\.[\w-]+$/;
    // Or full JSON response from Steam token endpoint
    try {
        const parsed = JSON.parse(apiKey);
        if (parsed?.data?.webapi_token) return true;
    } catch {}
    return keyRegex.test(apiKey) || tokenRegex.test(apiKey);
}

/**
 * Try to decode webapi_token and extract steamid/exp info
 * @param {string} token
 * @returns {{steamid: string, expires: number, expiresDate: Date}|null}
 */
function parseWebApiToken(token) {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const payload = JSON.parse(atob(parts[1]));
        return {
            steamid: payload.sub,
            expires: payload.exp,
            expiresDate: new Date(payload.exp * 1000)
        };
    } catch {
        return null;
    }
}

/**
 * Fetch friends statuses and render to UI using saved steam IDs
 * @param {Array} friendIds - List of steam IDs
 * @param {string} auth
 * @param {boolean} keepStates
 * @returns {Promise<Array>} - Promise resolving to the filtered casual friends data
 */
async function fetchAndRenderFriendsByIds(friendIds, auth, keepStates = false) {
    if (!friendIds || !friendIds.length) {
        console.error("No friend IDs provided to fetchAndRenderFriendsByIds");
        return [];
    }
    
    console.log(`Fetching statuses for ${friendIds.length} friends from API...`);
    
    try {
        // Get statuses for all friends from the API, use cached avatars if available
        const apiKeyOrToken = extractApiKeyOrToken(auth);
        const allStatuses = await SteamAPI.getFriendsStatuses(friendIds, apiKeyOrToken, savedAvatars);
        console.log(`Received ${allStatuses.length} friend statuses, filtering for casual players...`);
        
        // Filter for those in casual mode
        friendsData = allStatuses.filter(f => f.can_join);
        console.log(`Found ${friendsData.length} friends in casual mode`);
        
        // Get current join states to maintain UI consistency
        const joinStates = keepStates ? JoinManager.getJoinStates() : {};
        
        // Update the UI
        UIManager.renderFriendsList(friendsData, joinStates);
        return friendsData;
    } catch (error) {
        console.error("Error in fetchAndRenderFriendsByIds:", error);
        if (!keepStates) {
            // Only show error to user if this was a manual refresh, not auto-refresh
            UIManager.showError(error.message || error);
        }
        throw error;
    }
}

/**
 * Update or initially load friends list from Steam API
 * This function is for the initial creation or manual update of the friends list
 */
async function updateFriendsList() {
    // Получаем значения из инпутов
    let steam_id = document.getElementById('steam_id').value.trim();
    let auth = document.getElementById('api_key').value.trim();

    // Если не введено, но есть в settings — используем из settings
    if ((!steam_id || !auth) && savedSettings) {
        if (!steam_id && savedSettings.steam_id) steam_id = savedSettings.steam_id;
        if (!auth && savedSettings.auth) auth = savedSettings.auth;
    }

    // Если всё равно нет — просим ввести
    if (!steam_id || !auth) {
        UIManager.showError("Please enter your SteamID64 and API Key");
        return;
    }

    // Validate Steam ID
    if (!validateSteamId(steam_id)) {
        UIManager.showError("Invalid SteamID64. It should be a 17-digit number.");
        return;
    }

    // Validate API Key
    if (!validateApiKey(auth)) {
        UIManager.showError("Invalid API Key or webapi_token.");
        return;
    }
    
    // Reset stored state if IDs changed
    if (savedSettings && 
        (savedSettings.steam_id !== steam_id || savedSettings.auth !== auth)) {
        localStorage.removeItem('hide_privacy_warning');
        usingSavedFriends = false;
    }
    
    // extract token if needed
    const apiKeyOrToken = extractApiKeyOrToken(auth);
    
    // UI update - show loading state
    const updateBtn = document.getElementById('updateFriendsBtn');
    if (updateBtn) {
        updateBtn.disabled = true;
        updateBtn.textContent = "Updating...";
    }
    
    try {
        // Always fetch fresh list of friends when button is clicked
        let allFriendIds = [];
        try {
            allFriendIds = await SteamAPI.getFriendsList(steam_id, apiKeyOrToken);
            // Hide error message after successful friends list fetch
            UIManager.hideError();
        } catch (err) {
            UIManager.showError(err, steam_id);
            return;
        } finally {
            // Always re-enable buttons and restore text
            if (updateBtn) {
                updateBtn.disabled = false;
                updateBtn.textContent = "Update Friends List";
            }
        }
        
        if (!allFriendIds.length) {
            UIManager.showError("No friends found in your friends list.", steam_id);
            return;
        }

        // Fetch avatars for all friends and cache them
        const avatarsMap = await SteamAPI.getPlayerSummaries(allFriendIds, apiKeyOrToken);
        savedAvatars = {};
        for (const sid of allFriendIds) {
            if (avatarsMap[sid]) {
                savedAvatars[sid] = {
                    avatar: avatarsMap[sid].avatar,
                    avatarmedium: avatarsMap[sid].avatarmedium,
                    avatarfull: avatarsMap[sid].avatarfull
                };
            }
        }
        
        savedFriendsIds = allFriendIds;
        await window.electronAPI.saveSettings({
            steam_id,
            auth: apiKeyOrToken, // сохраняем только ключ или токен!
            friends_ids: savedFriendsIds,
            avatars: savedAvatars
        });
        usingSavedFriends = true;
        
        // Fetch and render the casual friends from the newly updated friends list
        await fetchAndRenderFriendsByIds(savedFriendsIds, apiKeyOrToken);
        
        // Start or restart the auto-refresh process
        startAutoRefresh();
    } catch (error) {
        console.error("Error during friends refresh:", error);
        UIManager.showError(error.message || error, steam_id);
    } finally {
        // Make sure buttons are re-enabled
        if (updateBtn) {
            updateBtn.disabled = false;
            updateBtn.textContent = "Update Friends List";
        }
    }
}

/**
 * Handle paste events in the Steam ID field to process Steam profile URLs
 * @param {ClipboardEvent} event - The paste event
 */
function handleSteamIdPaste(event) {
    // Get pasted content from clipboard
    const pastedText = (event.clipboardData || window.clipboardData).getData('text');
    
    // Only process if it looks like a Steam URL
    if (pastedText.includes('steamcommunity.com')) {
        event.preventDefault(); // Prevent default paste
        
        try {
            // Check if it's a profiles URL (contains direct SteamID64)
            if (pastedText.includes('/profiles/')) {
                const steamIdMatch = pastedText.match(/\/profiles\/(\d{17})/);
                if (steamIdMatch && steamIdMatch[1]) {
                    document.getElementById('steam_id').value = steamIdMatch[1];
                    validateInputs();
                    return;
                }
            }
            
            // Check if it's a vanity URL
            if (pastedText.includes('/id/')) {
                const vanityMatch = pastedText.match(/\/id\/([^\/]+)/);
                if (vanityMatch && vanityMatch[1]) {
                    const vanityUrl = vanityMatch[1];
                    // Get auth from input
                    const auth = document.getElementById('api_key').value.trim();
                    
                    if (!auth) {
                        UIManager.showError("Please enter your API Key first to resolve vanity URLs");
                        return;
                    }
                    
                    // Show loading state in the input
                    const steamIdInput = document.getElementById('steam_id');
                    const originalValue = steamIdInput.value;
                    steamIdInput.value = "Resolving vanity URL...";
                    steamIdInput.disabled = true;
                    
                    // Call Steam API to resolve vanity URL
                    resolveVanityUrl(vanityUrl, auth)
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
            
            // If we get here, it might be a Steam URL but not in a format we can process
            UIManager.showError("Unrecognized Steam URL format. Please enter SteamID64 manually.");
        } catch (error) {
            console.error("Error processing pasted Steam URL:", error);
            UIManager.showError("Error processing URL: " + error.message);
        }
    }
    // If not a Steam URL, let default paste behavior happen
}

/**
 * Resolve a vanity URL to a SteamID64
 * @param {string} vanityUrl - The vanity URL name
 * @param {string} auth - Steam API key or token
 * @returns {Promise<string|null>} - Promise resolving to SteamID64 or null if not found
 */
async function resolveVanityUrl(vanityUrl, auth) {
    try {
        window.electronAPI.log('info', `Resolving vanity URL: ${vanityUrl}`);
        const apiKeyOrToken = extractApiKeyOrToken(auth);
        let url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?vanityurl=${vanityUrl}&url_type=1`;
        if (/^[A-Z0-9]{32}$/i.test(apiKeyOrToken)) {
            url += `&key=${apiKeyOrToken}`;
        } else if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(apiKeyOrToken)) {
            url += `&access_token=${apiKeyOrToken}`;
        }
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.response && data.response.success === 1 && data.response.steamid) {
            window.electronAPI.log('info', `Resolved vanity URL to SteamID64: ${data.response.steamid}`);
            return data.response.steamid;
        } else {
            window.electronAPI.log('warn', `Failed to resolve vanity URL: ${JSON.stringify(data.response)}`);
            return null;
        }
    } catch (error) {
        window.electronAPI.log('error', `Error resolving vanity URL: ${error.message}`);
        throw error;
    }
}

// Add some CSS for validation indicators
const styleElement = document.createElement('style');
styleElement.textContent = `
    .valid-input {
        border: 1px solid green !important;
        background-color: rgba(0, 255, 0, 0.05) !important;
    }
    .invalid-input {
        border: 1px solid red !important;
        background-color: rgba(255, 0, 0, 0.05) !important;
    }
    .disabled-link {
        opacity: 0.5;
        cursor: not-allowed !important;
    }
`;
document.head.appendChild(styleElement);
