# Ultra-Low Latency Video Calling System

A WebRTC-based video calling system with ultra-low latency and high video resolution. Built with FastAPI, Socket.IO, and PeerJS.

## Features

- One-on-one video and voice calls
- Ultra-low latency for near-instantaneous communication
- High video resolution (based on user's internet connection and device capabilities)
- Real-time user presence (online users list)
- Call requests for both video and voice calls
- Ability to switch between video and voice call modes during a call
- Media controls (mute/unmute, camera on/off)
- Responsive design for both desktop and mobile

## Tech Stack

- **Backend**:
  - FastAPI for the API server
  - Socket.IO for real-time communication
  - Python for server-side logic

- **Frontend**:
  - Vanilla JavaScript
  - PeerJS for WebRTC peer-to-peer connections
  - Socket.IO client for real-time events
  - CSS for styling

## Project Structure

```
.
├── backend/
│   ├── main.py           # FastAPI main application
│   ├── requirements.txt  # Backend dependencies
│   └── static/           # Static files served by FastAPI
│       ├── css/
│       │   └── style.css
│       ├── js/
│       │   ├── app.js    # Main frontend logic
│       │   └── call.js   # Call handling logic
│       └── index.html    # Main page
└── README.md             # Project documentation
```

## Setup

### Prerequisites

- Python 3.8+
- pip (Python package manager)

### Installation

1. Clone the repository
2. Install backend dependencies:
   ```
   cd backend
   pip install -r requirements.txt
   ```

### Running the Application

1. Start the backend server:
   ```
   cd backend
   python main.py
   ```
2. Access the application in your browser at `http://localhost:8000`

## How to Use

1. Enter your username to join
2. View the list of online users
3. Click "Video" or "Voice" button next to a user to initiate a call
4. When receiving a call, choose to accept or reject
5. During a call:
   - Toggle video on/off
   - Toggle audio on/off
   - Switch between video and voice call modes
   - End the call when finished

## WebRTC Optimization

This application uses several techniques to achieve ultra-low latency:

- Optimized PeerJS configuration
- STUN server configuration for efficient NAT traversal
- Video encoding optimization (VP9/H.264)
- Bitrate management for optimal quality
- ICE connection optimization

## Limitations

- Only supports one-on-one calls (no group calls)
- No call recording functionality
- No chat functionality during calls
- No screen sharing
- Free server hosting may have bandwidth and processing limitations

## Future Enhancements

- Add chat functionality during calls
- Implement screen sharing
- Add call recording option
- Support group calls
- Add end-to-end encryption
- Implement user authentication
- Add call history