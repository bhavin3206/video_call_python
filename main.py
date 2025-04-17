from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import socketio
import uvicorn
import os
from typing import Dict, List, Set
from fastapi.middleware.cors import CORSMiddleware

# Apply CORS middleware (optional but helpful for debugging in browsers)
app = FastAPI(title="Video Calling System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize FastAPI app

# Create a Socket.IO server
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*', engineio_logger=True)
socket_app = socketio.ASGIApp(sio)

# Add Socket.IO to the FastAPI app
app.mount("/socket.io", socket_app)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# In-memory data storage
connected_users: Dict[str, str] = {}  # username -> sid
online_users: Set[str] = set()  # Set of usernames
active_calls: Dict[str, Dict] = {}  # sid -> call info

# Home route
@app.get("/", response_class=HTMLResponse)
async def get_home(request: Request):
    with open(os.path.join("static", "index.html"), "r") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content)

# Socket.IO events
@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    # Find username by sid
    username = None
    for uname, user_sid in connected_users.items():
        if user_sid == sid:
            username = uname
            break
    
    if username:
        # Remove user from connected users
        del connected_users[username]
        online_users.discard(username)
        
        # Notify all clients about user disconnection
        await sio.emit('user_disconnected', {'username': username})
        print(f"User disconnected: {username} ({sid})")
    else:
        print(f"Unknown client disconnected: {sid}")

@sio.event
async def register_user(sid, data):
    username = data.get('username')
    if username:
        connected_users[username] = sid
        online_users.add(username)
        
        # Send the current online users list to the newly connected user
        await sio.emit('online_users', {'users': list(online_users)}, room=sid)
        
        # Notify all other users about the new user
        await sio.emit('user_connected', {'username': username}, skip_sid=sid)
        print(f"User registered: {username} ({sid})")

@sio.event
async def request_call(sid, data):
    caller = data.get('caller')
    callee = data.get('callee')
    call_type = data.get('type', 'video')  # Default to video call
    
    if callee in connected_users:
        callee_sid = connected_users[callee]
        
        # Send call request to callee
        await sio.emit('incoming_call', {
            'caller': caller,
            'type': call_type
        }, room=callee_sid)
        
        print(f"Call request from {caller} to {callee} ({call_type})")
    else:
        # User is offline or doesn't exist
        await sio.emit('call_error', {
            'message': f"User {callee} is not available"
        }, room=sid)

@sio.event
async def call_response(sid, data):
    caller = data.get('caller')
    accepted = data.get('accepted')
    responder = data.get('responder')
    
    if caller in connected_users:
        caller_sid = connected_users[caller]
        
        if accepted:
            # Call was accepted
            await sio.emit('call_accepted', {
                'responder': responder
            }, room=caller_sid)
            
            # Store call information
            active_calls[caller_sid] = {
                'peer': responder,
                'start_time': None  # Can be set when call actually starts
            }
            active_calls[sid] = {
                'peer': caller,
                'start_time': None
            }
            
            print(f"Call accepted: {caller} and {responder}")
        else:
            # Call was rejected
            await sio.emit('call_rejected', {
                'responder': responder
            }, room=caller_sid)
            print(f"Call rejected: {caller} by {responder}")

@sio.event
async def call_ended(sid, data):
    user = data.get('user')
    peer = data.get('peer')
    
    if peer in connected_users:
        peer_sid = connected_users[peer]
        await sio.emit('peer_ended_call', {'peer': user}, room=peer_sid)
    
    # Clean up call data
    if sid in active_calls:
        del active_calls[sid]
    
    print(f"Call ended between {user} and {peer}")

@sio.event
async def toggle_media(sid, data):
    user = data.get('user')
    peer = data.get('peer')
    media_type = data.get('type')  # 'audio' or 'video'
    enabled = data.get('enabled')  # boolean
    
    if peer in connected_users:
        peer_sid = connected_users[peer]
        await sio.emit('peer_toggled_media', {
            'peer': user,
            'type': media_type,
            'enabled': enabled
        }, room=peer_sid)
        
        print(f"User {user} toggled {media_type} to {enabled} for {peer}")

@sio.event
async def signal(sid, data):
    """Relay WebRTC signaling data between peers"""
    to_username = data.get('to')
    if to_username in connected_users:
        to_sid = connected_users[to_username]
        # Pass the signaling data to the peer
        await sio.emit('signal', {
            'from': data.get('from'),
            'signal': data.get('signal')
        }, room=to_sid)

combined_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Run the app
if __name__ == "__main__":
    uvicorn.run("main:combined_app", host="0.0.0.0", port=8000, reload=True)
