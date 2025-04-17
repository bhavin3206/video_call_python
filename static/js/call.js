/**
 * WebRTC and PeerJS call handling utilities
 */

// Configure PeerJS for optimal low-latency video quality
const peerConfig = {
    // Use public STUN servers for NAT traversal
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ],
        // Set ICE transport policy to all for better connectivity
        iceTransportPolicy: 'all',
        // Enable ICE Lite for faster connections
        iceLite: true
    },
    // Set debug level (0-3)
    debug: 1
};

// Video constraints for optimal quality and low latency
const videoConstraints = {
    // Set to true for capturing desktop
    // Set to deviceId for specific camera
    video: {
        width: { ideal: 1280, max: 1920 },  // HD resolution
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 60 },  // Higher frame rate for smoothness
        facingMode: 'user',                 // Front camera by default
        // Modern codecs for better compression
        // Note: These may not be supported in all browsers
        advanced: [
            { videoCodec: "VP9" },          // Prefer VP9 for better quality/bitrate
            { videoCodec: "H264" }          // Fallback to H.264
        ]
    },
    // Audio constraints
    audio: {
        echoCancellation: true,             // Reduce echo
        noiseSuppression: true,             // Reduce background noise
        autoGainControl: true               // Automatically adjust volume
    }
};

// Audio-only constraints
const audioConstraints = {
    video: false,
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    }
};

// Optimize peer connection for video quality
const peerConnectionConfig = {
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
    // Set bandwidth constraints for video
    bandwidth: {
        video: 1500,  // 1.5 Mbps for good quality
        audio: 50     // 50 Kbps for audio
    }
};

/**
 * Get optimal media stream based on call type
 * @param {string} type - 'video' or 'audio'
 * @returns {Promise<MediaStream>} - Media stream
 */
async function getOptimalStream(type) {
    try {
        const constraints = type === 'video' ? videoConstraints : audioConstraints;
        return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
        console.error('Error getting media stream:', error);
        
        // Try fallback with simpler constraints
        const fallbackConstraints = {
            video: type === 'video',
            audio: true
        };
        
        return await navigator.mediaDevices.getUserMedia(fallbackConstraints);
    }
}

/**
 * Optimize RTC peer connection settings for low latency
 * @param {RTCPeerConnection} peerConnection - The WebRTC peer connection
 */
function optimizePeerConnection(peerConnection) {
    if (!peerConnection) return;
    
    // Set priority for video
    peerConnection.getSenders().forEach(sender => {
        if (sender.track.kind === 'video') {
            const parameters = sender.getParameters();
            if (!parameters.degradationPreference) {
                parameters.degradationPreference = 'maintain-framerate';
                sender.setParameters(parameters);
            }
        }
    });
    
    // Set connection to prefer UDP (faster but less reliable)
    // This helps achieve lower latency at potential cost of quality
    if (peerConnection.setOption) {
        peerConnection.setOption('DtlsSrtpKeyAgreement', true);
    }
}

/**
 * Create PeerJS instance with optimal configuration
 * @param {string} userId - User identifier
 * @returns {Peer} - PeerJS instance
 */
function createOptimizedPeer(userId) {
    return new Peer(userId, peerConfig);
}

/**
 * Handle connection state changes for debugging
 * @param {RTCPeerConnection} pc - The WebRTC peer connection
 */
function monitorConnectionState(pc) {
    if (!pc) return;
    
    pc.oniceconnectionstatechange = () => {
        console.log('ICE Connection State:', pc.iceConnectionState);
    };
    
    pc.onconnectionstatechange = () => {
        console.log('Connection State:', pc.connectionState);
    };
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('ICE Candidate:', event.candidate.type);
        }
    };
}

/**
 * Set bitrates for video and audio tracks
 * @param {RTCPeerConnection} pc - The WebRTC peer connection
 * @param {number} videoBitrate - Video bitrate in kbps
 * @param {number} audioBitrate - Audio bitrate in kbps
 * @returns {Promise<void>}
 */
async function setBitrates(pc, videoBitrate = 1500, audioBitrate = 50) {
    try {
        const senders = pc.getSenders();
        for (const sender of senders) {
            if (!sender.track) continue;
            
            const parameters = sender.getParameters();
            if (!parameters.encodings) {
                parameters.encodings = [{}];
            }
            
            if (sender.track.kind === 'video') {
                parameters.encodings[0].maxBitrate = videoBitrate * 1000;
            } else if (sender.track.kind === 'audio') {
                parameters.encodings[0].maxBitrate = audioBitrate * 1000;
            }
            
            await sender.setParameters(parameters);
        }
    } catch (e) {
        console.error('Error setting bitrates:', e);
    }
}

/**
 * Toggle track enabled state
 * @param {MediaStream} stream - Media stream
 * @param {string} kind - 'audio' or 'video'
 * @param {boolean} enabled - Whether to enable the track
 */
function toggleTrack(stream, kind, enabled) {
    if (!stream) return;
    
    stream.getTracks()
        .filter(track => track.kind === kind)
        .forEach(track => {
            track.enabled = enabled;
        });
}

/**
 * Switch from video to audio call
 * @param {MediaStream} stream - The current media stream
 * @returns {Promise<MediaStream>} - Audio-only media stream
 */
async function switchToAudioCall(stream) {
    if (stream) {
        // Stop video tracks
        stream.getVideoTracks().forEach(track => track.stop());
    }
    
    // Get new audio-only stream
    return await navigator.mediaDevices.getUserMedia(audioConstraints);
}

/**
 * Switch from audio to video call
 * @returns {Promise<MediaStream>} - Video and audio media stream
 */
async function switchToVideoCall() {
    return await navigator.mediaDevices.getUserMedia(videoConstraints);
}

// Export utility functions if using modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getOptimalStream,
        optimizePeerConnection,
        createOptimizedPeer,
        monitorConnectionState,
        setBitrates,
        toggleTrack,
        switchToAudioCall,
        switchToVideoCall
    };
}