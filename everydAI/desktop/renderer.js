// DOM Elements
const loginSection = document.getElementById('login-section');
const mainSection = document.getElementById('main-section');
const loginBtn = document.getElementById('login-btn');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const navLinks = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view');
const saveSettingsBtn = document.getElementById('save-settings');
const logoutBtn = document.getElementById('logout-btn');

// Form elements
const serverUrlInput = document.getElementById('server-url');
const wsUrlInput = document.getElementById('ws-url');
const notificationsEnabledInput = document.getElementById('notifications-enabled');
const startMinimizedInput = document.getElementById('start-minimized');

// Activity tracking
let notificationCount = 0;
let messageCount = 0;
let callCount = 0;
const activityList = [];

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Get settings
    window.api.getSettings();
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up API callbacks
    setupApiCallbacks();
});

// Set up event listeners
function setupEventListeners() {
    // Login form
    loginBtn.addEventListener('click', handleLogin);
    
    // Navigation
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Update active state
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // Show corresponding view
            const target = link.getAttribute('data-target');
            views.forEach(view => {
                view.classList.add('hidden');
                if (view.id === `${target}-view`) {
                    view.classList.remove('hidden');
                }
            });
        });
    });
    
    // Settings form
    saveSettingsBtn.addEventListener('click', saveSettings);
    logoutBtn.addEventListener('click', logout);
}

// Set up API callbacks
function setupApiCallbacks() {
    // Login result
    window.api.onLoginResult(result => {
        if (result.success) {
            loginSection.classList.add('hidden');
            mainSection.classList.remove('hidden');
            loginError.textContent = '';
        } else {
            loginError.textContent = result.message || 'Login failed';
        }
    });
    
    // Settings
    window.api.onSettings(settings => {
        serverUrlInput.value = settings.serverUrl;
        wsUrlInput.value = settings.wsUrl;
        notificationsEnabledInput.checked = settings.notifications;
        startMinimizedInput.checked = settings.startMinimized;
    });
    
    // Connection status
    window.api.onConnectionStatus(status => {
        if (status.status === 'connected') {
            statusIndicator.classList.add('connected');
            statusText.textContent = 'Connected';
        } else {
            statusIndicator.classList.remove('connected');
            statusText.textContent = status.status === 'error' ? 
                `Error: ${status.message}` : 'Disconnected';
        }
    });
    
    // Notification
    window.api.onNotification(data => {
        notificationCount++;
        updateNotificationCount();
        addNotificationToList(data);
        addActivityItem({
            type: 'notification',
            title: data.title || 'Notification',
            content: data.text || '',
            time: new Date(),
            data: data
        });
    });
    
    // SMS
    window.api.onSMS(data => {
        messageCount++;
        updateMessageCount();
        addMessageToList(data);
        addActivityItem({
            type: 'sms',
            title: `SMS from ${data.phoneNumber}`,
            content: data.messageBody || '',
            time: new Date(),
            data: data
        });
    });
    
    // Call
    window.api.onCall(data => {
        callCount++;
        updateCallCount();
        addCallToList(data);
        
        let title = 'Call';
        switch (data.callType) {
            case 'CALL_INCOMING': title = `Incoming call from ${data.phoneNumber}`; break;
            case 'CALL_ANSWERED': title = `Call answered with ${data.phoneNumber}`; break;
            case 'CALL_ENDED': title = `Call ended with ${data.phoneNumber}`; break;
        }
        
        addActivityItem({
            type: 'call',
            title: title,
            content: data.callType === 'CALL_ENDED' ? `Duration: ${formatDuration(data.duration)}` : '',
            time: new Date(),
            data: data
        });
    });
    
    // Navigation events
    window.api.onShowSettings(() => {
        navLinks.forEach(l => l.classList.remove('active'));
        document.querySelector('[data-target="settings"]').classList.add('active');
        views.forEach(view => view.classList.add('hidden'));
        document.getElementById('settings-view').classList.remove('hidden');
    });
    
    window.api.onShowNotification(id => {
        navLinks.forEach(l => l.classList.remove('active'));
        document.querySelector('[data-target="notifications"]').classList.add('active');
        views.forEach(view => view.classList.add('hidden'));
        document.getElementById('notifications-view').classList.remove('hidden');
    });
    
    window.api.onShowSMS(id => {
        navLinks.forEach(l => l.classList.remove('active'));
        document.querySelector('[data-target="messages"]').classList.add('active');
        views.forEach(view => view.classList.add('hidden'));
        document.getElementById('messages-view').classList.remove('hidden');
    });
    
    window.api.onShowCall(id => {
        navLinks.forEach(l => l.classList.remove('active'));
        document.querySelector('[data-target="calls"]').classList.add('active');
        views.forEach(view => view.classList.add('hidden'));
        document.getElementById('calls-view').classList.remove('hidden');
    });
}

// Login handler
function handleLogin() {
    const username = usernameInput.value;
    const password = passwordInput.value;
    
    if (!username || !password) {
        loginError.textContent = 'Username and password are required';
        return;
    }
    
    window.api.login({ username, password });
}

// Save settings handler
function saveSettings() {
    const settings = {
        serverUrl: serverUrlInput.value,
        wsUrl: wsUrlInput.value,
        notifications: notificationsEnabledInput.checked,
        startMinimized: startMinimizedInput.checked
    };
    
    window.api.updateSettings(settings);
}

// Logout handler
function logout() {
    window.api.updateSettings({ token: '' });
    mainSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
    usernameInput.value = '';
    passwordInput.value = '';
}

// Update counters
function updateNotificationCount() {
    document.getElementById('notification-count').textContent = notificationCount;
}

function updateMessageCount() {
    document.getElementById('message-count').textContent = messageCount;
}

function updateCallCount() {
    document.getElementById('call-count').textContent = callCount;
}

// Add items to lists
function addNotificationToList(notification) {
    const notificationsList = document.getElementById('notifications-list');
    
    const listItem = document.createElement('div');
    listItem.className = 'list-item';
    listItem.innerHTML = `
        <div class="header">
            <span class="title">${notification.title || 'Notification'}</span>
            <span class="time">${formatTime(new Date())}</span>
        </div>
        <div class="content">${notification.text || ''}</div>
        <div class="app">${notification.appName || notification.packageName || 'Unknown app'}</div>
    `;
    
    notificationsList.prepend(listItem);
}

function addMessageToList(message) {
    const messagesList = document.getElementById('messages-list');
    
    const listItem = document.createElement('div');
    listItem.className = 'list-item';
    listItem.innerHTML = `
        <div class="header">
            <span class="title">${message.phoneNumber || 'Unknown'}</span>
            <span class="time">${formatTime(new Date())}</span>
        </div>
        <div class="content">${message.messageBody || ''}</div>
    `;
    
    messagesList.prepend(listItem);
}

function addCallToList(call) {
    const callsList = document.getElementById('calls-list');
    
    const listItem = document.createElement('div');
    listItem.className = 'list-item';
    
    let typeText = '';
    switch (call.callType) {
        case 'CALL_INCOMING': typeText = 'Incoming'; break;
        case 'CALL_ANSWERED': typeText = 'Answered'; break;
        case 'CALL_ENDED': typeText = 'Ended'; break;
    }
    
    listItem.innerHTML = `
        <div class="header">
            <span class="title">${call.phoneNumber || 'Unknown'}</span>
            <span class="time">${formatTime(new Date())}</span>
        </div>
        <div class="content">
            <div>Status: ${typeText}</div>
            ${call.duration ? `<div>Duration: ${formatDuration(call.duration)}</div>` : ''}
        </div>
    `;
    
    callsList.prepend(listItem);
}

function addActivityItem(activity) {
    const activityListEl = document.getElementById('activity-list');
    
    // Add to tracking array (limit to 50 items)
    activityList.unshift(activity);
    if (activityList.length > 50) {
        activityList.pop();
    }
    
    const listItem = document.createElement('div');
    listItem.className = 'list-item';
    listItem.innerHTML = `
        <div class="header">
            <span class="title">${activity.title}</span>
            <span class="time">${formatTime(activity.time)}</span>
        </div>
        <div class="content">${activity.content}</div>
    `;
    
    activityListEl.prepend(listItem);
}

// Helper functions
function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    if (mins === 0) {
        return `${secs} seconds`;
    } else if (mins === 1) {
        return `1 minute ${secs} seconds`;
    } else {
        return `${mins} minutes ${secs} seconds`;
    }
}
