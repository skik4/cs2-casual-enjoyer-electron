import SteamAPI from './steam-api.js';
import UIManager from './ui-manager.js';

/**
 * Join Manager module
 * Handles the process of joining friends' games
 */

// State tracking for join attempts
const joinStates = {};

/**
 * Start the process of joining a friend's game
 * @param {string} friend_id - Steam ID of the friend to join
 */
async function startJoin(friend_id) {
    const steam_id = document.getElementById('steam_id').value.trim();
    const auth_raw = document.getElementById('auth').value.trim();
    const auth = SteamAPI.extractApiKeyOrToken ? SteamAPI.extractApiKeyOrToken(auth_raw) : auth_raw;
    const interval_ms = 500;
    joinStates[friend_id] = {
        status: 'waiting',
        cancelled: false,
        interval: null
    };
    UIManager.updateJoinButton(friend_id, 'waiting');
    UIManager.updateDot(friend_id, 'waiting');
    // Periodically update UI to reflect join state
    joinStates[friend_id].interval = setInterval(() => {
        const status = joinStates[friend_id]?.status || 'cancelled';
        UIManager.updateDot(friend_id, status);
        UIManager.updateJoinButton(friend_id, status);
        if (status === 'joined' || status === 'cancelled') {
            clearInterval(joinStates[friend_id].interval);
        }
    }, 1000);
    joinLoop(friend_id, steam_id, auth, interval_ms);
}

/**
 * The main loop for joining a friend's game
 * @param {string} friend_id - Steam ID of the friend to join
 * @param {string} user_steam_id - Steam ID of the user
 * @param {string} auth - API key or token for Steam API
 * @param {number} interval_ms - Interval in milliseconds for the loop
 */
async function joinLoop(friend_id, user_steam_id, auth, interval_ms) {
    let interval = Math.max(100, interval_ms);
    let missingSince = null;
    let lastKnownPersona = null;
    let lastKnownAvatar = null;
    while (true) {
        if (joinStates[friend_id]?.cancelled) break;
        // Try to get connect info for the friend
        const current_connect = await SteamAPI.getFriendConnectInfo(friend_id, auth);
        if (!current_connect) {
            // Check if the friend is in casual (via getFriendsStatuses)
            const statuses = await SteamAPI.getFriendsStatuses([friend_id], auth);
            const friendStatus = statuses && statuses.length ? statuses[0] : null;
            if (!friendStatus || !friendStatus.in_casual_mode) {
                // Friend is not in casual — mark as "missing"
                if (!missingSince) {
                    missingSince = Date.now();
                    // Save name and avatar for display
                    lastKnownPersona = friendStatus?.personaname || joinStates[friend_id]?.personaname || 'Unknown';
                    lastKnownAvatar = friendStatus?.avatar || joinStates[friend_id]?.avatar || '';
                }
                joinStates[friend_id].status = "missing";
                joinStates[friend_id].personaname = lastKnownPersona;
                joinStates[friend_id].avatar = lastKnownAvatar;
                // If more than a minute has passed — cancel the connection attempt and remove from the list
                if (Date.now() - missingSince > 60000) {
                    cancelJoin(friend_id);
                    break;
                }
            } else {
                // Friend is back in casual — reset the timer
                missingSince = null;
                lastKnownPersona = friendStatus.personaname;
                lastKnownAvatar = friendStatus.avatar;
                joinStates[friend_id].status = "waiting";
            }
            await new Promise(r => setTimeout(r, interval));
            continue;
        }
        joinStates[friend_id].status = "connecting";
        // Attempt to join the friend's game via Steam protocol
        const url = `steam://rungame/730/${friend_id}/${current_connect}`;
        open(url, "_self");
        await new Promise(r => setTimeout(r, interval));
        // Check if user has joined the same server as the friend
        const user_server = await SteamAPI.getUserGameServerSteamId(user_steam_id, auth);
        const friend_server = await SteamAPI.getUserGameServerSteamId(friend_id, auth);
        if (user_server && friend_server && user_server === friend_server) {
            joinStates[friend_id].status = "joined";
            // Stop all join loops except the current one
            Object.keys(joinStates).forEach(fid => {
                if (fid !== friend_id) cancelJoin(fid);
            });
            // Keep the green status for 1.5 seconds before resetting
            await new Promise(r => setTimeout(r, 1500));
            cancelJoin(friend_id);
            break;
        }
        await new Promise(r => setTimeout(r, interval));
    }
    if (joinStates[friend_id]?.status !== "joined") {
        joinStates[friend_id].status = "cancelled";
    }
}

/**
 * Cancel an ongoing join attempt
 * @param {string} friend_id - Steam ID of the friend whose join attempt to cancel
 */
function cancelJoin(friend_id) {
    if (joinStates[friend_id]?.interval) {
        clearInterval(joinStates[friend_id].interval);
    }
    joinStates[friend_id] = {
        ...joinStates[friend_id],
        status: 'cancelled',
        cancelled: true
    };
    UIManager.updateDot(friend_id, 'cancelled');
    UIManager.updateJoinButton(friend_id, 'cancelled');
    // Reset button and dot after a short time
    setTimeout(() => {
        UIManager.updateDot(friend_id, 'cancelled');
        UIManager.updateJoinButton(friend_id, 'cancelled');
    }, 200);
}

/**
 * Get the current join states for all tracked friends
 * @returns {Object} - Copy of the joinStates object
 */
function getJoinStates() {
    return { ...joinStates };
}

/**
 * Reset all join states and stop all join loops
 */
function resetAll() {
    Object.keys(joinStates).forEach(fid => {
        if (joinStates[fid]?.interval) {
            clearInterval(joinStates[fid].interval);
        }
        delete joinStates[fid];
    });
}

// Public API for JoinManager
const JoinManager = {
    startJoin,
    cancelJoin,
    getJoinStates,
    resetAll
};

export default JoinManager;
