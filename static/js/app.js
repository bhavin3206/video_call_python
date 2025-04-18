// Global variables
let currentUsername = '';
let socket = null;
let onlineUsers = [];
let peer = null;
let localStream = null;
let remoteStream = null;
let currentCall = null;
let callType = 'video'; // 'video' or 'audio'
let isInCall = false;

// DOM elements
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const usernameInput = document.getElementById('username-input');
const loginButton = document.getElementById('login-button');
const currentUserSpan = document.getElementById('current-user');
const onlineUsersList = document.getElementById('online-users-list');

// Call state screens
const waitingScreen = document.getElementById('waiting-screen');
const callingScreen = document.getElementById('calling-screen');
const incomingCallScreen = document.getElementById('incoming-call-screen');
const callScreen = document.getElementById('call-screen');

// Call UI elements
const callingUserSpan = document.getElementById('calling-user');
const callerUserSpan = document.getElementById('caller-user');
const remoteUsernameSpan = document.getElementById('remote-username');
const cancelCallButton = document.getElementById('cancel-call-button');
const acceptCallButton = document.getElementById('accept-call-button');
const rejectCallButton = document.getElementById('reject-call-button');
const endCallButton = document.getElementById('end-call-button');

// Media controls
const toggleVideoButton = document.getElementById('toggle-video-button');
const toggleAudioButton = document.getElementById('toggle-audio-button');
const switchCallTypeButton = document.getElementById('switch-call-type-button');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');

// Media state
let isVideoEnabled = true;
let isAudioEnabled = true;
let isPeerVideoEnabled = true;
let isPeerAudioEnabled = true;

// Initialize app
function initApp() {
    initEventListeners();
}

// Set up event listeners
function initEventListeners() {
    // Login form
    loginButton.addEventListener('click', handleLogin);
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // Call controls
    cancelCallButton.addEventListener('click', cancelCall);
    acceptCallButton.addEventListener('click', () => acceptCall(true));
    rejectCallButton.addEventListener('click', () => acceptCall(false));
    endCallButton.addEventListener('click', endCall);

    // Media controls
    toggleVideoButton.addEventListener('click', toggleVideo);
    toggleAudioButton.addEventListener('click', toggleAudio);
    switchCallTypeButton.addEventListener('click', switchCallType);

    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
        
        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (event) => {
            const isClickInsideSidebar = sidebar.contains(event.target);
            const isClickOnToggle = menuToggle.contains(event.target);
            
            if (!isClickInsideSidebar && !isClickOnToggle && sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
            }
        });
        
        // Close sidebar when user makes a call
        onlineUsersList.addEventListener('click', (event) => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
            }
        });
    }
    
    // Ensure proper sizing on orientation change
    window.addEventListener('resize', () => {
        adjustVideoContainerSize();
    });
    
    window.addEventListener('orientationchange', () => {
        setTimeout(adjustVideoContainerSize, 100);
    });
}

function adjustVideoContainerSize() {
    const videoContainer = document.querySelector('.video-container');
    if (videoContainer) {
        // Ensure video container fits within the viewport
        const mainContent = document.querySelector('.main-content');
        const callControls = document.querySelector('.call-controls');
        
        if (mainContent && callControls) {
            const mainContentHeight = mainContent.clientHeight;
            const callControlsHeight = callControls.clientHeight;
            videoContainer.style.height = `${mainContentHeight - callControlsHeight - 20}px`;
        }
    }
}

// Handle user login
function handleLogin() {
    const username = usernameInput.value.trim();
    if (!username) {
        showNotification('Please enter a username', 'error');
        return;
    }

    // Initialize Socket.IO connection
    currentUsername = username;
    initializeSocketConnection();

    // Initialize PeerJS
    initializePeerConnection();

    // Update UI
    currentUserSpan.textContent = currentUsername;
    showScreen(mainScreen);
    hideScreen(loginScreen);
}

// Initialize Socket.IO connection
function initializeSocketConnection() {
    // Connect to Socket.IO server
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socketUrl = `${protocol}://${window.location.host}`;

    socket = io(socketUrl, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ['websocket', 'polling'] // Try WebSocket first, fall back to polling
    });

    // Socket.IO connection events for debugging
    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        // Register user
        socket.emit('register_user', { username: currentUsername });
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        showNotification('Connection error. Please try again.', 'error');
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log('Reconnected after', attemptNumber, 'attempts');
        showNotification('Reconnected to server', 'success');
        // Re-register after reconnection
        if (currentUsername) {
            socket.emit('register_user', { username: currentUsername });
        }
    });

    socket.on('online_users', ({ users }) => {
        onlineUsers = users;
        updateOnlineUsersList();
    });

    socket.on('user_connected', ({ username }) => {
        if (!onlineUsers.includes(username)) {
            onlineUsers.push(username);
            updateOnlineUsersList();
            showNotification(`${username} is now online`, 'success');
        }
    });

    socket.on('user_disconnected', ({ username }) => {
        onlineUsers = onlineUsers.filter(user => user !== username);
        updateOnlineUsersList();
        showNotification(`${username} disconnected`, 'info');
        
        // If in call with disconnected user, end the call
        if (isInCall && remoteUsernameSpan.textContent === username) {
            showNotification(`Call ended: ${username} disconnected`, 'error');
            resetCallState();
        }
    });

    socket.on('incoming_call', ({ caller, type }) => {
        if (isInCall) {
            // Already in a call, automatically reject
            socket.emit('call_response', {
                caller: caller,
                accepted: false,
                responder: currentUsername
            });
            return;
        }

        // Show incoming call screen
        callerUserSpan.textContent = caller;
        callType = type;
        showCallState(incomingCallScreen);
    });

    socket.on('call_accepted', ({ responder }) => {
        // Call was accepted, initialize WebRTC connection
        showNotification(`${responder} accepted the call`, 'success');
        remoteUsernameSpan.textContent = responder;
        startCall(responder);
    });

    socket.on('call_rejected', ({ responder }) => {
        showNotification(`${responder} rejected the call`, 'error');
        resetCallState();
    });

    socket.on('peer_ended_call', ({ peer }) => {
        showNotification(`${peer} ended the call`, 'info');
        resetCallState();
    });

    socket.on('peer_toggled_media', ({ peer, type, enabled }) => {
        if (type === 'video') {
            isPeerVideoEnabled = enabled;
            updateRemoteVideoStatus();
        } else if (type === 'audio') {
            isPeerAudioEnabled = enabled;
            updateRemoteAudioStatus();
        }
    });

    socket.on('signal', async ({ from, signal }) => {
        console.log('Received signal from', from, signal);
        // We don't use this for the fixed implementation
    });

    socket.on('call_error', ({ message }) => {
        showNotification(message, 'error');
        resetCallState();
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showNotification('Disconnected from server. Please refresh the page.', 'error');
    });
}

// Initialize PeerJS connection
function initializePeerConnection() {
    const peerOptions = {
        debug: 2,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        }
    };
    
    peer = new Peer(currentUsername, peerOptions);

    peer.on('open', (id) => {
        console.log('PeerJS connected with ID:', id);
    });

    // THIS IS THE KEY ADDITION: Handle incoming calls
    peer.on('call', (incomingCall) => {
        console.log('Received incoming peer call');
        
        if (!isInCall && localStream) {
            // If we have our local stream ready and not in a call
            currentCall = incomingCall;
            
            // Answer the call with our local stream
            currentCall.answer(localStream);
            
            // Handle the incoming stream from remote peer
            currentCall.on('stream', (stream) => {
                console.log('Received remote stream from answer');
                remoteStream = stream;
                remoteVideo.srcObject = stream;
                updateRemoteVideoStatus();
                updateRemoteAudioStatus();
            });
            
            currentCall.on('error', (err) => {
                console.error('Peer connection error on answer:', err);
                showNotification(`Call error: ${err.message}`, 'error');
            });
        } else {
            console.warn('Received call but already in call or no local stream');
            incomingCall.close();
        }
    });

    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        showNotification(`Connection error: ${err.message}`, 'error');
    });

    peer.on('close', () => {
        console.log('PeerJS connection closed');
    });

    peer.on('disconnected', () => {
        console.log('PeerJS disconnected');
        // Try to reconnect
        peer.reconnect();
    });
}

// Update online users list
function updateOnlineUsersList() {
    onlineUsersList.innerHTML = '';
    
    // Filter out current user
    const filteredUsers = onlineUsers.filter(user => user !== currentUsername);
    
    if (filteredUsers.length === 0) {
        const noUsersItem = document.createElement('li');
        noUsersItem.textContent = 'No other users online';
        noUsersItem.classList.add('user-item', 'no-users');
        onlineUsersList.appendChild(noUsersItem);
        return;
    }
    
    // Create user list items
    filteredUsers.forEach(username => {
        const userItem = document.createElement('li');
        userItem.classList.add('user-item');
        
        const usernameSpan = document.createElement('span');
        usernameSpan.textContent = username;
        userItem.appendChild(usernameSpan);
        
        const callButtonsDiv = document.createElement('div');
        callButtonsDiv.classList.add('call-buttons');
        
        // Video call button
        const videoCallButton = document.createElement('button');
        videoCallButton.classList.add('call-button', 'video');
        videoCallButton.textContent = 'Video';
        videoCallButton.addEventListener('click', () => initiateCall(username, 'video'));
        callButtonsDiv.appendChild(videoCallButton);
        
        // Audio call button
        const audioCallButton = document.createElement('button');
        audioCallButton.classList.add('call-button', 'audio');
        audioCallButton.textContent = 'Voice';
        audioCallButton.addEventListener('click', () => initiateCall(username, 'audio'));
        callButtonsDiv.appendChild(audioCallButton);
        
        userItem.appendChild(callButtonsDiv);
        onlineUsersList.appendChild(userItem);
    });
}

// Initiate a call
async function initiateCall(username, type) {
    if (isInCall) {
        showNotification('You are already in a call', 'error');
        return;
    }
    
    callType = type;
    callingUserSpan.textContent = username;
    showCallState(callingScreen);
    
    try {
        // Request user media according to call type
        const constraints = {
            audio: true,
            video: type === 'video'
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Display local video
        localVideo.srcObject = localStream;
        localVideo.muted = true; // Important: Mute local audio to prevent feedback
        
        // Send call request to the server
        socket.emit('request_call', {
            caller: currentUsername,
            callee: username,
            type: type
        });
        
    } catch (err) {
        console.error('Error accessing media devices:', err);
        showNotification(`Could not access ${type === 'video' ? 'camera' : 'microphone'}. ${err.message}`, 'error');
        resetCallState();
    }
}

// Accept or reject an incoming call
async function acceptCall(accept) {
    if (accept) {
        try {
            const callerUsername = callerUserSpan.textContent;
            console.log("call accepted", callerUsername);
            
            // Get user media based on call type
            const constraints = {
                audio: true,
                video: callType === 'video'
            };
            
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            localVideo.srcObject = localStream;
            localVideo.muted = true; // Important: Mute local audio to prevent feedback
            
            // Send acceptance to the server
            socket.emit('call_response', {
                caller: callerUsername,
                accepted: true,
                responder: currentUsername
            });
            
            // Set up the call
            remoteUsernameSpan.textContent = callerUsername;
            
            // THIS IS THE NEW CODE: Set up the peer connection
            if (peer && localStream) {
                console.log("Connecting to peer:", callerUsername);
                currentCall = peer.call(callerUsername, localStream);
                
                currentCall.on('stream', (stream) => {
                    console.log('Received remote stream in acceptCall');
                    remoteStream = stream;
                    remoteVideo.srcObject = stream;
                    updateRemoteVideoStatus();
                    updateRemoteAudioStatus();
                });
                
                currentCall.on('error', (err) => {
                    console.error('Peer connection error:', err);
                    showNotification(`Call error: ${err.message}`, 'error');
                    resetCallState();
                });
            }
            
            // Actually show the call interface
            showCallState(callScreen);
            updateCallScreenForType();
            isInCall = true;
            
        } catch (err) {
            console.error('Error accessing media devices:', err);
            showNotification(`Could not access ${callType === 'video' ? 'camera' : 'microphone'}. ${err.message}`, 'error');
            
            // Reject the call if we can't access media
            socket.emit('call_response', {
                caller: callerUserSpan.textContent,
                accepted: false,
                responder: currentUsername
            });
            
            resetCallState();
        }
    } else {
        // Reject the call
        socket.emit('call_response', {
            caller: callerUserSpan.textContent,
            accepted: false,
            responder: currentUsername
        });
        
        resetCallState();
    }
}

// Start the call after acceptance
async function startCall(peerUsername) {
    console.log('startCall init:', peerUsername);
    
    // Update UI for call type
    updateCallScreenForType();
    showCallState(callScreen);
    
    try {
        console.log('Making call to:', peerUsername);
        
        // Create a call to the peer
        if (peer && localStream) {
            currentCall = peer.call(peerUsername, localStream);
            
            if (!currentCall) {
                console.error('Failed to create call object');
                showNotification('Failed to establish call connection', 'error');
                resetCallState();
                return;
            }
            
            console.log('Call created:', currentCall);
            
            // Handle the incoming stream from the remote peer
            currentCall.on('stream', (stream) => {
                console.log('Received remote stream from call:', stream);
                
                // Set remote stream to video element
                remoteStream = stream;
                remoteVideo.srcObject = stream;
                
                // Update remote media status indicators
                updateRemoteVideoStatus();
                updateRemoteAudioStatus();
            });
            
            currentCall.on('close', () => {
                console.log('Peer connection closed');
                resetCallState();
            });
            
            currentCall.on('error', (err) => {
                console.error('Peer connection error:', err);
                showNotification(`Call error: ${err.message}`, 'error');
                resetCallState();
            });
        } else {
            console.error('Peer or localStream not available');
            showNotification('Connection not ready. Please try again.', 'error');
            resetCallState();
        }
    } catch (err) {
        console.error('Error starting call:', err);
        showNotification(`Error starting call: ${err.message}`, 'error');
        resetCallState();
    }
}

// Cancel an outgoing call
function cancelCall() {
    socket.emit('call_response', {
        caller: currentUsername,
        accepted: false,
        responder: callingUserSpan.textContent
    });
    
    resetCallState();
}

// End an ongoing call
function endCall() {
    const remotePeer = remoteUsernameSpan.textContent;
    
    socket.emit('call_ended', {
        user: currentUsername,
        peer: remotePeer
    });
    
    resetCallState();
}

// Toggle video on/off
function toggleVideo() {
    if (!localStream) return;
    
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks().forEach(track => {
        track.enabled = isVideoEnabled;
    });
    
    // Update UI
    toggleVideoButton.classList.toggle('video-on', isVideoEnabled);
    toggleVideoButton.classList.toggle('video-off', !isVideoEnabled);
    
    // Notify peer
    socket.emit('toggle_media', {
        user: currentUsername,
        peer: remoteUsernameSpan.textContent,
        type: 'video',
        enabled: isVideoEnabled
    });
}

// Toggle audio on/off
function toggleAudio() {
    if (!localStream) return;
    
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = isAudioEnabled;
    });
    
    // Update UI
    toggleAudioButton.classList.toggle('audio-on', isAudioEnabled);
    toggleAudioButton.classList.toggle('audio-off', !isAudioEnabled);
    
    // Notify peer
    socket.emit('toggle_media', {
        user: currentUsername,
        peer: remoteUsernameSpan.textContent,
        type: 'audio',
        enabled: isAudioEnabled
    });
}

// Switch between video and voice call
async function switchCallType() {
    if (!isInCall) return;
    
    try {
        if (callType === 'video') {
            // Switch to voice call
            callType = 'audio';
            
            // Stop video tracks
            localStream.getVideoTracks().forEach(track => {
                track.stop();
            });
            
            // Get new stream with audio only
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Replace local stream
            localStream = audioStream;
            localVideo.srcObject = audioStream;
            
            // Update UI
            document.querySelector('.video-container').classList.add('voice-call-mode');
            switchCallTypeButton.querySelector('.to-audio-icon').style.display = 'none';
            switchCallTypeButton.querySelector('.to-video-icon').style.display = 'inline';
            
        } else {
            // Switch to video call
            callType = 'video';
            
            // Get new stream with video and audio
            const videoStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            
            // Replace local stream
            localStream = videoStream;
            localVideo.srcObject = videoStream;
            
            // Update UI
            document.querySelector('.video-container').classList.remove('voice-call-mode');
            switchCallTypeButton.querySelector('.to-audio-icon').style.display = 'inline';
            switchCallTypeButton.querySelector('.to-video-icon').style.display = 'none';
        }
        
        // Update the call with new stream
        if (currentCall) {
            // For PeerJS, you need to replace the stream differently
            if (localStream) {
                currentCall.peerConnection.getSenders().forEach(sender => {
                    const track = localStream.getTracks().find(t => t.kind === sender.track.kind);
                    if (track) sender.replaceTrack(track);
                });
            }
        }
        
        // Reset media state
        isVideoEnabled = callType === 'video';
        isAudioEnabled = true;
        
        // Update UI
        updateCallScreenForType();
        
    } catch (err) {
        console.error('Error switching call type:', err);
        showNotification(`Error switching call type: ${err.message}`, 'error');
    }
}

// Update UI based on call type
function updateCallScreenForType() {
    if (callType === 'video') {
        document.querySelector('.video-container').classList.remove('voice-call-mode');
        switchCallTypeButton.querySelector('.to-audio-icon').style.display = 'inline';
        switchCallTypeButton.querySelector('.to-video-icon').style.display = 'none';
    } else {
        document.querySelector('.video-container').classList.add('voice-call-mode');
        switchCallTypeButton.querySelector('.to-audio-icon').style.display = 'none';
        switchCallTypeButton.querySelector('.to-video-icon').style.display = 'inline';
    }
}

// Update remote video status in UI
function updateRemoteVideoStatus() {
    const remoteStatus = document.getElementById('remote-status');
    if (!isPeerVideoEnabled) {
        remoteStatus.classList.add('video-off');
    } else {
        remoteStatus.classList.remove('video-off');
    }
}

// Update remote audio status in UI
function updateRemoteAudioStatus() {
    const remoteStatus = document.getElementById('remote-status');
    if (!isPeerAudioEnabled) {
        remoteStatus.classList.add('audio-off');
    } else {
        remoteStatus.classList.remove('audio-off');
    }
}

// Reset call state
function resetCallState() {
    isInCall = false;
    
    // Close the PeerJS call if exists
    if (currentCall) {
        try {
            currentCall.close();
        } catch (e) {
            console.log('Error closing call:', e);
        }
        currentCall = null;
    }
    
    // Stop media streams
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (remoteStream) {
        remoteStream = null;
    }
    
    // Clear video elements
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    
    // Reset call type to video by default
    callType = 'video';
    
    // Reset media state
    isVideoEnabled = true;
    isAudioEnabled = true;
    isPeerVideoEnabled = true;
    isPeerAudioEnabled = true;
    
    // Reset UI
    showCallState(waitingScreen);
    
    // Reset buttons state
    toggleVideoButton.classList.remove('video-off');
    toggleVideoButton.classList.add('video-on');
    toggleAudioButton.classList.remove('audio-off');
    toggleAudioButton.classList.add('audio-on');
}

// Show a specific call state screen
function showCallState(screen) {
    // Hide all call state screens
    waitingScreen.classList.add('hidden');
    callingScreen.classList.add('hidden');
    incomingCallScreen.classList.add('hidden');
    callScreen.classList.add('hidden');
    
    // Show the requested screen
    screen.classList.remove('hidden');
}

// Show/hide a screen
function showScreen(screen) {
    screen.classList.add('active');
}

function hideScreen(screen) {
    screen.classList.remove('active');
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.classList.add('notification', type);
    notification.textContent = message;
    
    document.getElementById('notification-container').appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 5000);
}

// Initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', initApp);