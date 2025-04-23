/**
 * Steam API client module
 * Handles all interactions with the Steam API
 */

const STEAM_API_BASE = "https://api.steampowered.com";

/**
 * Returns true if the string is a JWT-like webapi_token
 * @param {string} keyOrToken
 */
function isWebApiToken(keyOrToken) {
    return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(keyOrToken);
}

/**
 * Parse Rich Presence data from Steam
 * @param {string} kv - Key-value string from Steam rich presence
 * @returns {Object} - Parsed rich presence fields
 */
function parseRichPresence(kv) {
    function extract(key) {
        const re = new RegExp('"' + key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '"\\s+"([^"]+)"');
        const m = kv.match(re);
        return m ? m[1] : null;
    }
    return {
        status: extract("status"),
        game_state: extract("game:state"),
        game_mode: extract("game:mode"),
        game_map: extract("game:map"),
        game_score: extract("game:score"),
        connect: extract("connect"),
        game_server_steam_id: extract("game_server_steam_id"),
    };
}

/**
 * Get the user's friends list
 * @param {string} steam_id - SteamID64 of the user
 * @param {string} api_key - Steam Web API key or webapi_token
 * @returns {Promise<Array>} - Array of friend SteamIDs
 */
async function getFriendsList(steam_id, api_key) {
    try {
        if (isWebApiToken(api_key)) {
            // Use IFriendsListService for tokens
            let url = `${STEAM_API_BASE}/IFriendsListService/GetFriendsList/v1/?access_token=${encodeURIComponent(api_key)}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`API_ERROR_${resp.status}`);
            const data = await resp.json();
            if (!data.response || !data.response.friendslist || !Array.isArray(data.response.friendslist.friends)) {
                throw new Error('EMPTY_FRIENDS_LIST');
            }
            // friends: [{ ulfriendid, efriendrelationship }]
            return data.response.friendslist.friends.map(f => f.ulfriendid);
        } else {
            // Use ISteamUser for classic API key
            let url = `${STEAM_API_BASE}/ISteamUser/GetFriendList/v1/?steamid=${encodeURIComponent(steam_id)}&relationship=friend&key=${encodeURIComponent(api_key)}`;
            const resp = await fetch(url);
            if (resp.status === 401) throw new Error('PRIVATE_FRIENDS_LIST');
            if (!resp.ok) throw new Error(`API_ERROR_${resp.status}`);
            const data = await resp.json();
            if (!data.friendslist || !data.friendslist.friends) throw new Error('EMPTY_FRIENDS_LIST');
            return data.friendslist.friends.map(f => f.steamid);
        }
    } catch (error) {
        console.error("Error fetching friends list:", error);
        throw error;
    }
}

/**
 * Fetch player summaries (including avatar URLs) for up to 100 SteamIDs at a time.
 * @param {Array<string>} steamids - Array of SteamID64 strings (max 100 per call)
 * @param {string} api_key
 * @returns {Promise<Object>} - Map of steamid -> player summary object
 */
async function getPlayerSummaries(steamids, api_key) {
    if (!steamids.length) return {};
    const result = {};
    // Split into chunks of 100
    for (let i = 0; i < steamids.length; i += 100) {
        const chunk = steamids.slice(i, i + 100);
        let url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?steamids=${chunk.join(',')}`;
        if (isWebApiToken(api_key)) {
            url += `&access_token=${encodeURIComponent(api_key)}`;
        } else {
            url += `&key=${encodeURIComponent(api_key)}`;
        }
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.response && data.response.players) {
            for (const player of data.response.players) {
                result[player.steamid] = player;
            }
        }
    }
    return result;
}

/**
 * Get details about friends including their game status and avatars
 * @param {Array} friend_ids - Array of SteamIDs
 * @param {string} api_key - Steam Web API key or webapi_token
 * @param {Object} [avatarsCache] - Optional: map of steamid -> avatar URL
 * @returns {Promise<Array>} - Array of friend status objects
 */
async function getFriendsStatuses(friend_ids, api_key, avatarsCache = {}) {
    if (!friend_ids.length) return [];
    try {
        const params = new URLSearchParams();
        if (isWebApiToken(api_key)) {
            params.append("access_token", api_key);
        } else {
            params.append("key", api_key);
        }
        friend_ids.forEach((sid, idx) => params.append(`steamids[${idx}]`, sid));
        const url = `${STEAM_API_BASE}/IPlayerService/GetPlayerLinkDetails/v1/?${params.toString()}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch player link details: ${resp.status} ${resp.statusText}`);
        const data = await resp.json();
        const accounts = (data.response && data.response.accounts) ? data.response.accounts : [];

        // Fetch avatars if not provided in cache
        let avatarMap = avatarsCache;
        if (!avatarMap || Object.keys(avatarMap).length === 0) {
            const steamids = accounts.map(acc => (acc.public_data || {}).steamid).filter(Boolean);
            avatarMap = await getPlayerSummaries(steamids, api_key);
        }

        // Filter for friends playing CS:GO (app id 730)
        return accounts
            .filter(acc => (acc.private_data || {}).game_id === "730")
            .map(acc => {
                const priv = acc.private_data || {};
                const pub = acc.public_data || {};
                const rich_presence_kv = priv.rich_presence_kv || "";
                const rp = parseRichPresence(rich_presence_kv);
                const status_str = rp.status || "";
                const game_server_id = rp.game_server_steam_id;
                const game_map = rp.game_map || "";
                const game_score = rp.game_score || "";
                const connect_val = rp.connect || "";
                // Determine if friend is joinable in casual mode
                const can_join = rp.game_mode === "casual" && !["", null, "lobby"].includes(rp.game_state);
                const join_available = can_join && connect_val.startsWith("+gcconnect");
                const steamid = pub.steamid || "";
                // Get avatar from avatarMap if available
                const avatar = avatarMap[steamid]?.avatarfull || avatarMap[steamid]?.avatar || "";
                return {
                    steamid,
                    personaname: pub.persona_name || "",
                    status: status_str,
                    can_join,
                    join_available,
                    game_map,
                    game_score,
                    game_server_steam_id: game_server_id,
                    connect: connect_val,
                    avatar
                };
            });
    } catch (error) {
        console.error("Error fetching friend statuses:", error);
        throw error;
    }
}

/**
 * Get connect information for a specific friend
 * @param {string} friend_id - SteamID64 of the friend
 * @param {string} api_key - Steam Web API key or webapi_token
 * @returns {Promise<string|null>} - Connect string or null if unavailable
 */
async function getFriendConnectInfo(friend_id, api_key) {
    try {
        const params = new URLSearchParams();
        if (isWebApiToken(api_key)) {
            params.append("access_token", api_key);
        } else {
            params.append("key", api_key);
        }
        params.append("steamids[0]", friend_id);
        const url = `${STEAM_API_BASE}/IPlayerService/GetPlayerLinkDetails/v1/?${params.toString()}`;
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const data = await resp.json();
        const accounts = (data.response && data.response.accounts) ? data.response.accounts : [];
        if (!accounts.length) return null;
        const priv = accounts[0].private_data || {};
        if (priv.game_id !== "730") return null;
        const rp = parseRichPresence(priv.rich_presence_kv || "");
        if (rp.game_mode === "casual" && !["", null, "lobby"].includes(rp.game_state)) {
            return rp.connect;
        }
        return null;
    } catch (error) {
        console.error("Error fetching connect info:", error);
        return null;
    }
}

/**
 * Get the game server Steam ID for a user
 * @param {string} steam_id - SteamID64 of the user
 * @param {string} api_key - Steam Web API key or webapi_token
 * @returns {Promise<string|null>} - Server SteamID or null
 */
async function getUserGameServerSteamId(steam_id, api_key) {
    try {
        const params = new URLSearchParams();
        if (isWebApiToken(api_key)) {
            params.append("access_token", api_key);
        } else {
            params.append("key", api_key);
        }
        params.append("steamids[0]", steam_id);
        const url = `${STEAM_API_BASE}/IPlayerService/GetPlayerLinkDetails/v1/?${params.toString()}`;
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const data = await resp.json();
        const accounts = (data.response && data.response.accounts) ? data.response.accounts : [];
        if (!accounts.length) return null;
        const priv = accounts[0].private_data || {};
        const rp = parseRichPresence(priv.rich_presence_kv || "");
        return rp.game_server_steam_id || priv.game_server_steam_id;
    } catch (error) {
        console.error("Error fetching server ID:", error);
        return null;
    }
}

/**
 * Get all casual friends in one call
 * @param {string} steam_id - SteamID64 of the user
 * @param {string} api_key - Steam Web API key
 * @returns {Promise<Array>} - Array of friends in casual mode
 */
async function getCasualFriends(steam_id, api_key) {
    try {
        const friends = await getFriendsList(steam_id, api_key);
        const statuses = await getFriendsStatuses(friends, api_key);
        return statuses.filter(f => f.can_join);
    } catch (error) {
        console.error("Error getting casual friends:", error);
        throw error;
    }
}

// Public API for SteamAPI
const SteamAPI = {
    getFriendsList,
    getFriendsStatuses,
    getFriendConnectInfo,
    getUserGameServerSteamId,
    getCasualFriends,
    parseRichPresence,
    getPlayerSummaries // export for caching
};
