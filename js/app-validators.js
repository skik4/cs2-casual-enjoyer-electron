// =====================
// Validators
// =====================

/**
 * Validate SteamID64
 * @param {string} steamId
 * @returns {boolean}
 */
export function validateSteamId(steamId) {
    return /^\d{17}$/.test(steamId);
}

/**
 * Validate API key or token
 * @param {string} auth
 * @returns {boolean}
 */
export function validateApiAuth(auth) {
    const keyRegex = /^[A-Z0-9]{32}$/i;
    const tokenRegex = /^[\w-]+\.[\w-]+\.[\w-]+$/;
    try {
        const parsed = JSON.parse(auth);
        if (parsed?.data?.webapi_token) return true;
    } catch { }
    return keyRegex.test(auth) || tokenRegex.test(auth);
}