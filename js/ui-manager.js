/**
 * UI Manager module
 * Handles all UI rendering and updates
 */

// Utility: Get element by ID
const $id = (id) => document.getElementById(id);

// Status dot CSS class mapping
const STATUS_DOT_CLASSES = {
    waiting: 'dot-waiting',
    connecting: 'dot-connecting',
    joined: 'dot-joined',
    cancelled: 'dot-cancelled',
    missing: 'dot-missing' // Фиолетовый — временно пропал из casual, но идет попытка подключения
};

/**
 * Get the appropriate CSS class for a status dot
 * @param {string} status - Join status
 * @returns {string} - CSS class for the status dot
 */
function getStatusDotClass(status) {
    return STATUS_DOT_CLASSES[status] || STATUS_DOT_CLASSES.cancelled;
}

/**
 * Update the status dot appearance based on join status
 * @param {string} friend_id - Steam ID of the friend
 * @param {string} status - Join status
 */
function updateDot(friend_id, status) {
    const dot = $id('dot-' + friend_id);
    if (dot) dot.className = 'status-dot ' + getStatusDotClass(status);
}

/**
 * Update the join button appearance and behavior
 * @param {string} friend_id - Steam ID of the friend
 * @param {string} status - Join status
 */
function updateJoinButton(friend_id, status) {
    const btn = $id('join-btn-' + friend_id);
    if (!btn) return;
    if (status === 'waiting' || status === 'connecting') {
        btn.textContent = "Cancel";
        btn.classList.add('cancel-btn');
    } else {
        btn.textContent = "Join";
        btn.classList.remove('cancel-btn');
    }
    btn.disabled = (status === 'joined');
}

/**
 * Render the list of friends in the UI
 * @param {Array} friends - Array of friend objects
 * @param {Object} joinStates - Map of join states by friend Steam ID
 */
function renderFriendsList(friends, joinStates = {}) {
    const friendsContainer = $id('friends');
    if (!friendsContainer) return;

    window.lastRenderedFriends = Array.isArray(friends) ? [...friends] : [];

    let sortedFriends = [...friends].sort((a, b) => {
        const nameA = (a.personaname || '').toLowerCase();
        const nameB = (b.personaname || '').toLowerCase();
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });

    updateFriendsStatus(sortedFriends);

    let filterValue = '';
    const filterInput = $id('friend-filter-input');
    if (filterInput) {
        filterValue = filterInput.value.trim().toLowerCase();
    }
    let filteredFriends = sortedFriends;
    if (filterValue) {
        filteredFriends = sortedFriends.filter(f => {
            const name = (f.personaname || '').toLowerCase();
            return name.includes(filterValue);
        });
    }

    if (!filteredFriends.length) {
        friendsContainer.innerHTML = '<div style="text-align:center;color:#aaa;padding:1.5em 0;">No friends found.</div>';
        return;
    }

    let html = '';
    for (const friend of filteredFriends) {
        const avatarUrl = friend.avatarfull || friend.avatar || friend.avatarmedium || '';
        // Если у друга есть статус missing в joinStates — показываем как missing
        const joinState = joinStates[friend.steamid];
        const isMissing = joinState && joinState.status === 'missing';
        html += `
            <div class="friend" id="friend-${friend.steamid}">
                <div class="friend-info-row">
                    <img src="${avatarUrl}" alt="avatar" class="friend-avatar">
                    <div class="friend-info">
                        <span class="personaname">${friend.personaname}</span>
                        ${friend.status || isMissing ? `<span class="game-status" style="font-weight:400;color:#bfc9d8;">${isMissing ? 'Temporarily not in Casual' : friend.status}</span>` : ''}
                    </div>
                </div>
                <div class="join-section" id="join-section-${friend.steamid}">
                    <span class="status-dot ${isMissing ? 'dot-missing' : 'dot-cancelled'}" id="dot-${friend.steamid}"></span>
                    <button id="join-btn-${friend.steamid}" class="action-btn${(joinState && (joinState.status === 'waiting' || joinState.status === 'connecting' || isMissing)) ? ' cancel-btn' : ''}">${(joinState && (joinState.status === 'waiting' || joinState.status === 'connecting' || isMissing)) ? 'Cancel' : 'Join'}</button>
                </div>
            </div>
        `;
    }
    friendsContainer.innerHTML = html;
    for (const friend of filteredFriends) {
        const btn = $id(`join-btn-${friend.steamid}`);
        if (btn) {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('cancel-btn')) {
                    JoinManager.cancelJoin(friend.steamid);
                } else {
                    JoinManager.startJoin(friend.steamid);
                }
            });
        }
        if (joinStates[friend.steamid]) {
            updateDot(friend.steamid, joinStates[friend.steamid].status);
            updateJoinButton(friend.steamid, joinStates[friend.steamid].status);
        }
    }
}

/**
 * Показывает уведомление с возможностью закрытия
 * @param {string} html - HTML-содержимое уведомления
 */
function showNotification(html) {
    const errorElement = $id('error');
    if (!errorElement) return;

    // Flex-шапка с кнопкой закрытия
    const closeBtnHtml = `<div class="notification-header"><span class="notification-close-btn" title="Close">&times;</span></div>`;
    // Весь текст уведомления — в отдельном div для рамки и центрирования
    errorElement.innerHTML = closeBtnHtml + `<div class="notification-content">${html}</div>`;
    errorElement.style.display = 'block';

    // Кнопка закрытия
    const closeBtn = errorElement.querySelector('.notification-close-btn');
    if (closeBtn) {
        closeBtn.onclick = () => {
            errorElement.style.display = 'none';
        };
    }
}

/**
 * Показывает постоянное уведомление о токене (steamid и срок действия)
 * @param {{steamid: string, expires: number, expiresDate: Date}} tokenInfo
 */
function showTokenInfoNotification(tokenInfo) {
    hideTokenInfoNotification();
    const errorElement = $id('error');
    if (!errorElement) return;
    const now = Date.now();
    const expiresMs = tokenInfo.expires * 1000;
    const expiresStr = tokenInfo.expiresDate.toLocaleString();
    let expired = expiresMs < now;
    let warnHtml = '';
    if (expired) {
        warnHtml = `
            <div style="color:#ff4444;font-weight:500;margin-top:8px;">
                Your token has expired.<br>
                Please get a new one by clicking <b>Steam Web API Key</b> above or <a href="steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" class="privacy-link" target="_self">Get your Steam Web API Token in Steam</a>.<br>
                Note: Steam will only issue a new token after the previous one fully expires.
            </div>
        `;
    }
    const html = `
        <div class="notification-content" style="border-color:#2d8cf0;">
            <div style="color:#2d8cf0;font-weight:500;">
                Steam Web API Token detected.<br>
                <span style="font-size:0.98em;">SteamID: <b>${tokenInfo.steamid}</b></span><br>
                <span style="font-size:0.98em;">Token expires: <b>${expiresStr}</b></span>
            </div>
            ${warnHtml}
        </div>
    `;
    const infoDiv = document.createElement('div');
    infoDiv.id = 'token-info-notification';
    infoDiv.innerHTML = html;
    infoDiv.style.marginBottom = '8px';
    errorElement.parentNode.insertBefore(infoDiv, errorElement);
}

/**
 * Скрыть уведомление о токене
 */
function hideTokenInfoNotification() {
    const infoDiv = $id('token-info-notification');
    if (infoDiv && infoDiv.parentNode) infoDiv.parentNode.removeChild(infoDiv);
}

/**
 * Получить HTML для предупреждения о приватности
 * @param {string} linkHtml - HTML для ссылки на настройки приватности
 * @returns {string}
 */
function getPrivacyWarningHtml(linkHtml) {
    return `
        <div class="notification-main-text" style="color:#ff4444;font-weight:500;">
            No friends list returned. This could be because your friends list is set to private in your Steam privacy settings or you don't have any friends :(
        </div>
        <div style="margin:8px 0 8px 0;">
            ${linkHtml}
        </div>
        <div class="note" style="color:#aaa;font-size:0.95em;margin-bottom:2px;">
            <b>Note:</b> After setting your friends list to Public and successfully loading friends, you can set it back to Private. The app will continue using the saved friends list.
        </div>
        <div class="note" style="color:#aaa;font-size:0.95em;">
            If you need to update your friends list later (e.g., for new friends), you'll need to set it Public again and click "Refresh Friends List".
        </div>
    `;
}

/**
 * Показать ошибку обновления списка друзей (использует showNotification)
 * @param {string} steamId
 */
function showUpdateError(steamId = '') {
    const currentSteamId = steamId || ($id('steam_id') && $id('steam_id').value.trim());
    const privacyUrl = currentSteamId
        ? `steam://openurl/https://steamcommunity.com/profiles/${currentSteamId}/edit/settings/`
        : '';
    const linkHtml = privacyUrl
        ? `<a href="${privacyUrl}" class="privacy-link" style="color:#2d8cf0;text-decoration:underline;" 
            title="Open privacy settings in Steam">Open your Steam privacy settings</a>`
        : '';
    showNotification(getPrivacyWarningHtml(linkHtml));
}

/**
 * Показать ошибку пользователю (использует showNotification)
 * @param {string|Error} message
 * @param {string} steamId
 */
function showError(message, steamId = '') {
    let errorMessage = '';
    let isPrivacyError = false;
    if (message instanceof Error) {
        const errorCode = message.message;
        if (errorCode === 'PRIVATE_FRIENDS_LIST' || errorCode === 'EMPTY_FRIENDS_LIST') {
            isPrivacyError = true;
        } else if (errorCode === 'API_ERROR_403') {
            errorMessage = "Invalid or missing Steam API Key. Please check your API Key and try again.";
        } else {
            errorMessage = message.message;
        }
    } else {
        errorMessage = message;
    }
    if (isPrivacyError) {
        showUpdateError(steamId);
    } else {
        showNotification(
            `<div class="notification-main-text" style="color:#ff4444;font-weight:500;">${errorMessage}</div>`
        );
    }
}

/**
 * Скрыть уведомление
 */
function hideError() {
    const errorElement = $id('error');
    if (errorElement) errorElement.style.display = 'none';
}

/**
 * Update friends status message
 * @param {Array|string} friendsInCasual - Array of friends currently in casual mode or a status message string (HTML allowed)
 */
function updateFriendsStatus(friendsInCasual) {
    let statusMessage = $id('friends-status-message');
    if (!statusMessage) {
        statusMessage = document.createElement('div');
        statusMessage.id = 'friends-status-message';
        statusMessage.className = 'friends-status-message';
        const centerRow = document.querySelector('.center-row');
        centerRow.parentNode.insertBefore(statusMessage, centerRow.nextSibling);
    }
    if (typeof friendsInCasual === 'string') {
        statusMessage.innerHTML = `<p>${friendsInCasual}</p>`;
        return;
    }
    if (Array.isArray(friendsInCasual) && friendsInCasual.length === 0) {
        statusMessage.innerHTML = `
            <p>None of your friends are currently playing Casual mode.</p>
            <p class="note">The friends list is automatically updated periodically. When your friends enter Casual mode, they will appear here.</p>
        `;
    } else if (Array.isArray(friendsInCasual)) {
        statusMessage.innerHTML = `<p>${friendsInCasual.length} friend(s) currently in Casual mode.</p>`;
    }
}

/**
 * Show help notification for Steam ID
 */
function showSteamIdHelp() {
    const helpHtml = `
        <div class="notification-main-text" style="color:#2d8cf0;font-weight:500;">
            How to get your Steam ID
        </div>
        <div style="margin:10px 0;text-align:left;">
            <ol style="margin-left:20px;padding-left:0;">
                <li>Your Steam profile will open in the Steam</li>
                <li>Copy the URL of your profile from the address bar</li>
                <li>Paste it into the SteamID64 field</li>
            </ol>
        </div>
        <div class="note" style="color:#aaa;font-size:0.95em;margin-top:10px;text-align:left;">
            The app will automatically convert your profile URL to a SteamID64.
        </div>
    `;
    
    showNotification(helpHtml);
}

/**
 * Show help notification for API Key
 */
function showApiKeyHelp() {
    const helpHtml = `
        <div class="notification-main-text" style="color:#2d8cf0;font-weight:500;">
            How to get your Steam API Token or Key
        </div>
        <div style="margin:10px 0;text-align:left;">
            <ol style="margin-left:20px;padding-left:0;">
                <li>
                    <b>Option 1: Token (Recommended)</b><br>
                    <a href="steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" class="privacy-link" target="_self">Get your Steam Web API Token in Steam</a><br>
                    On the opened page, just press <b>Ctrl+A</b> (select all), then <b>Ctrl+C</b> (copy), and paste it into the API Key field.<br>
                    <span style="color:#aaa;font-size:0.97em;">
                        The app will extract the token automatically.<br>
                        If you use a token, your Friend List can stay <b>Private</b> and the app will still load your friends.<br>
                        <b>Note:</b> The token is valid for about 24 hours. When it expires, you will need to get a new one.
                    </span>
                </li>
                <li style="margin-top:10px;">
                    <b>Option 2: API Key</b><br>
                    <a href="steam://openurl/https://steamcommunity.com/dev/apikey" class="privacy-link" target="_self">Get your Steam Web API Key in Steam</a><br>
                    Register a new API key by entering <strong>localhost</strong> as your domain, accept the terms, and copy your key.<br>
                    <span style="color:#aaa;font-size:0.97em;">
                        You may also need to confirm the action via Steam Guard Mobile or email.<br>
                        <b>Note:</b> If you use an API key, you must set your Friend List to <b>Public</b> in Steam privacy settings and manually enter your SteamID64 in the field.
                    </span>
                </li>
            </ol>
        </div>
        <div class="note" style="color:#aaa;font-size:0.95em;margin-top:10px;text-align:left;">
            You can use either a classic API key (32 characters) or a token (long string with dots).<br>
            Your credentials are stored locally only.
        </div>
    `;
    showNotification(helpHtml);
}

/**
 * UIManager public API
 * @namespace UIManager
 */
const UIManager = {
    updateDot,
    updateJoinButton,
    renderFriendsList,
    showError,
    hideError,
    showUpdateError,
    updateFriendsStatus,
    showNotification,
    showSteamIdHelp,
    showApiKeyHelp,
    showTokenInfoNotification,
    hideTokenInfoNotification
};

// --- Add filter handler immediately ---
document.addEventListener('DOMContentLoaded', () => {
    const filterInput = $id('friend-filter-input');
    if (filterInput) {
        filterInput.addEventListener('input', () => {
            if (window.lastRenderedFriends && typeof UIManager.renderFriendsList === 'function') {
                UIManager.renderFriendsList(window.lastRenderedFriends, (window.JoinManager && window.JoinManager.getJoinStates && window.JoinManager.getJoinStates()) || {});
            }
        });
    }
});
