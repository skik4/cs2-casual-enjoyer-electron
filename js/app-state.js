// =====================
// App State
// =====================

/**
 * AppState stores the application state
 */
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

export default AppState;