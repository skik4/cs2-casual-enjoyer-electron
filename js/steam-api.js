/**
 * Steam API client module
 * Handles all interactions with the Steam API
 */

const STEAM_API_BASE = "https://api.steampowered.com";

/**
 * Return true if the string is a JWT-like webapi_token
 * @param {string} keyOrToken
 * @returns {boolean}
 */
function isWebApiToken(keyOrToken) {
    return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(keyOrToken);
}

/**
 * Return a Steam API client object with unified API for token or key
 * @param {string} auth - Steam Web API token or key
 * @returns {object}
 */
function createSteamApiClient(auth) {
    const isToken = isWebApiToken(auth);

    return {
        /**
         * Get the user's friends list
         * @param {string} steam_id
         * @returns {Promise<Array<string>>}
         */
        async getFriendsList(steam_id) {
            if (isToken) {
                let url = `${STEAM_API_BASE}/IFriendsListService/GetFriendsList/v1/?access_token=${encodeURIComponent(auth)}`;
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`API_ERROR_${resp.status}`);
                const data = await resp.json();
                if (!data.response || !data.response.friendslist || !Array.isArray(data.response.friendslist.friends)) {
                    throw new Error('EMPTY_FRIENDS_LIST');
                }
                return data.response.friendslist.friends.map(f => f.ulfriendid);
            } else {
                let url = `${STEAM_API_BASE}/ISteamUser/GetFriendList/v1/?steamid=${encodeURIComponent(steam_id)}&relationship=friend&key=${encodeURIComponent(auth)}`;
                const resp = await fetch(url);
                if (resp.status === 401) throw new Error('PRIVATE_FRIENDS_LIST');
                if (!resp.ok) throw new Error(`API_ERROR_${resp.status}`);
                const data = await resp.json();
                if (!data.friendslist || !data.friendslist.friends) throw new Error('EMPTY_FRIENDS_LIST');
                return data.friendslist.friends.map(f => f.steamid);
            }
        },
        /**
         * Fetch player summaries for up to 100 SteamIDs at a time
         * @param {Array<string>|string} steamids
         * @returns {Promise<Object>}
         */
        async getPlayerSummaries(steamids) {
            if (!Array.isArray(steamids)) {
                if (typeof steamids === "string" && steamids.length > 0) {
                    steamids = [steamids];
                } else if (!steamids) {
                    return {};
                } else {
                    throw new Error("steamids must be an array or string");
                }
            }
            if (!steamids.length) return {};
            const result = {};
            for (let i = 0; i < steamids.length; i += 100) {
                const chunk = steamids.slice(i, i + 100).map(String);
                let url;
                if (isToken) {
                    url = `${STEAM_API_BASE}/ISteamUserOAuth/GetUserSummaries/v1/?access_token=${encodeURIComponent(auth)}&steamids=${chunk.join(',')}`;
                } else {
                    url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(auth)}&steamids=${chunk.join(',')}`;
                }
                const resp = await fetch(url);
                if (!resp.ok) continue;
                const data = await resp.json();
                let players = [];
                if (isToken) {
                    if (Array.isArray(data.players)) {
                        players = data.players;
                    }
                } else {
                    if (data.response && Array.isArray(data.response.players)) {
                        players = data.response.players;
                    }
                }
                for (const player of players) {
                    result[player.steamid] = player;
                }
            }
            return result;
        },
        /**
         * Get details about friends including their game status and avatars
         * @param {Array<string>} friend_ids
         * @param {Object} [avatarsCache]
         * @returns {Promise<Array>}
         */
        async getFriendsStatuses(friend_ids, avatarsCache = {}) {
            if (!friend_ids.length) return [];
            try {
                const params = new URLSearchParams();
                if (isToken) {
                    params.append("access_token", auth);
                } else {
                    params.append("key", auth);
                }
                friend_ids.forEach((sid, idx) => params.append(`steamids[${idx}]`, sid));
                const url = `${STEAM_API_BASE}/IPlayerService/GetPlayerLinkDetails/v1/?${params.toString()}`;
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`Failed to fetch player link details: ${resp.status} ${resp.statusText}`);
                const data = await resp.json();
                const accounts = (data.response && data.response.accounts) ? data.response.accounts : [];

                let avatarMap = avatarsCache;
                if (!avatarMap || Object.keys(avatarMap).length === 0) {
                    const steamids = accounts.map(acc => (acc.public_data || {}).steamid).filter(Boolean);
                    avatarMap = await this.getPlayerSummaries(steamids);
                }

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
                        const can_join = rp.game_mode === "casual" && !["", null, "lobby"].includes(rp.game_state);
                        const join_available = can_join && connect_val.startsWith("+gcconnect");
                        const steamid = pub.steamid || "";
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
        },
        /**
         * Get connect information for a specific friend
         * @param {string} friend_id
         * @returns {Promise<string|null>}
         */
        async getFriendConnectInfo(friend_id) {
            try {
                const params = new URLSearchParams();
                if (isToken) {
                    params.append("access_token", auth);
                } else {
                    params.append("key", auth);
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
        },
        /**
         * Get the game server Steam ID for a user
         * @param {string} steam_id
         * @returns {Promise<string|null>}
         */
        async getUserGameServerSteamId(steam_id) {
            try {
                const params = new URLSearchParams();
                if (isToken) {
                    params.append("access_token", auth);
                } else {
                    params.append("key", auth);
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
        },
        /**
         * Resolve vanity URL to SteamID64
         * @param {string} vanityUrl
         * @returns {Promise<string|null>}
         */
        async resolveVanityUrl(vanityUrl) {
            try {
                const params = new URLSearchParams();
                if (isToken) {
                    params.append("access_token", auth);
                } else {
                    params.append("key", auth);
                }
                params.append("vanityurl", vanityUrl);
                const url = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/?${params.toString()}`;
                const resp = await fetch(url);
                if (!resp.ok) return null;
                const data = await resp.json();
                if (data.response && data.response.success === 1) {
                    return data.response.steamid;
                }
                return null;
            } catch (error) {
                console.error("Error resolving vanity URL:", error);
                return null;
            }
        },
        isToken
    };
}

/**
 * Extract webapi_token from input (JSON or token string)
 * @param {string} authInput
 * @returns {string|null}
 */
function extractTokenIfAny(authInput) {
    try {
        const parsed = JSON.parse(authInput);
        if (parsed?.data?.webapi_token) return parsed.data.webapi_token;
    } catch { }
    if (isWebApiToken(authInput)) return authInput;
    return null;
}

/**
 * Extract API key or token from input (JSON, token, or key)
 * @param {string} authInput
 * @returns {string}
 */
function extractApiKeyOrToken(authInput) {
    try {
        const parsed = JSON.parse(authInput);
        if (parsed?.data?.webapi_token) return parsed.data.webapi_token;
    } catch { }
    if (isWebApiToken(authInput)) return authInput;
    return authInput;
}

/**
 * Parse JWT webapi_token for steamid and expiry
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

const SteamAPI = {
    createSteamApiClient,
    extractTokenIfAny,
    extractApiKeyOrToken,
    parseWebApiToken,
    parseRichPresence
};

export default SteamAPI;
