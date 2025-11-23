from flask import Flask, render_template, request, jsonify, session, redirect, url_for, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
import sqlite3
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from datetime import datetime, timedelta
import json
import uuid
import base64
import threading
import random
import requests
import hashlib
import secrets
import urllib.parse
from dotenv import load_dotenv

app = Flask(__name__)
app.config['mikka'] = 'your_secret_key'  # Replace with a secure key
app.secret_key = 'aptpt'  # Change this to a secure key
socketio = SocketIO(app)

#################
### Main Site ###
#################

tv_sessions = {}  # Store active TV sessions
session_images = {}  # Store images for each session

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/games')
def games():
    return render_template('games.html')

@app.route('/eaglercraft')
def eaglercraft():
    return render_template('eaglercraftx.html')

@app.route('/imagegen')
def imagegen():
    return render_template('imagegen.html') 
    
@app.route('/artistsleak')
def artistsleak():
    return render_template('artistsleak.html') 

@app.route('/tv')
def tv():
    return render_template('tv.html')

@app.route('/generate-session')
def generate_session():
    """Generate a unique 6-digit session code for TV"""
    while True:
        session_code = str(uuid.uuid4().hex)[:6].upper()
        if session_code not in tv_sessions:
            break
    
    tv_sessions[session_code] = {
        'created_at': datetime.now(),
        'active': True
    }
    session_images[session_code] = []
    
    return jsonify({'sessionCode': session_code})

@app.route('/upload-to-session', methods=['POST'])
def upload_to_session():
    """Handle image uploads for a specific TV session"""
    try:
        data = request.get_json()
        session_code = data.get('sessionCode')
        image_data = data.get('imageData')
        file_name = data.get('fileName')
        
        if not session_code or session_code not in tv_sessions:
            return jsonify({'error': 'Invalid session code'}), 400
        
        if not tv_sessions[session_code]['active']:
            return jsonify({'error': 'Session expired'}), 400
        
        # Store the image data
        if session_code not in session_images:
            session_images[session_code] = []
        
        session_images[session_code].append({
            'data': image_data,
            'fileName': file_name,
            'uploadedAt': datetime.now().isoformat()
        })
        
        # Emit to the specific TV session via Socket.IO
        socketio.emit('new_image_uploaded', {
            'sessionCode': session_code,
            'imageData': image_data,
            'fileName': file_name
        }, room=f'tv_session_{session_code}')
        
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get-session-images/<session_code>')
def get_session_images(session_code):
    """Get all images for a specific session"""
    if session_code not in session_images:
        return jsonify({'images': []})
    
    return jsonify({'images': session_images[session_code]})

# Add Socket.IO events for TV sessions

@socketio.on('join_tv_session')
def handle_join_tv_session(data):
    session_code = data.get('sessionCode')
    if session_code and session_code in tv_sessions:
        join_room(f'tv_session_{session_code}')
        emit('tv_session_joined', {'sessionCode': session_code})

@socketio.on('leave_tv_session')
def handle_leave_tv_session(data):
    session_code = data.get('sessionCode')
    if session_code:
        leave_room(f'tv_session_{session_code}')

@app.route('/upload', methods=['POST', 'GET'])
def upload():
    if request.method == 'POST':
        file = request.files['file']
        if file:
            filename = file.filename
            file_path = os.path.join(image_upload_dir, filename)
            file.save(file_path)
            return jsonify({'status': 'success', 'filename': filename})
    return render_template('upload.html')

###############
### TV Page ###
###############

ids_db_file = 'ids.db'    # For auto user IDs and Spotify tokens

# Initialize IDs database (new)
def init_ids_db():
    with sqlite3.connect(ids_db_file) as conn:
        cursor = conn.cursor()
        
        # Create auto_users table for automatic user ID assignment
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS auto_users (
                user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_fingerprint TEXT UNIQUE,
                created_at TEXT,
                last_seen TEXT,
                is_active INTEGER DEFAULT 1
            )
        ''')
        
        # Create user_counter table to track the next available user ID
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_counter (
                id INTEGER PRIMARY KEY,
                next_user_id INTEGER DEFAULT 1
            )
        ''')
        
        # Create spotify_tokens table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS spotify_tokens (
                user_id TEXT PRIMARY KEY,
                access_token TEXT,
                refresh_token TEXT,
                expires_at TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        ''')
        
        # Initialize counter if it doesn't exist
        cursor.execute('SELECT COUNT(*) FROM user_counter')
        if cursor.fetchone()[0] == 0:
            cursor.execute('INSERT INTO user_counter (id, next_user_id) VALUES (1, 1)')
        
        conn.commit()

# Initialize database
init_ids_db()

######################
### User ID System ###
######################

def generate_device_fingerprint(request):
    """Generate a unique device fingerprint based on request headers"""
    user_agent = request.headers.get('User-Agent', '')
    accept_language = request.headers.get('Accept-Language', '')
    accept_encoding = request.headers.get('Accept-Encoding', '')
    
    # Combine headers to create a fingerprint
    fingerprint_data = f"{user_agent}_{accept_language}_{accept_encoding}"
    
    # Add IP address (optional, but helps with uniqueness)
    ip_address = request.environ.get('HTTP_X_FORWARDED_FOR', request.environ.get('REMOTE_ADDR', ''))
    fingerprint_data += f"_{ip_address}"
    
    # Generate hash
    fingerprint = hashlib.sha256(fingerprint_data.encode()).hexdigest()[:16]
    return fingerprint

def get_or_create_auto_user(device_fingerprint):
    """Get existing auto user or create a new one"""
    with sqlite3.connect(ids_db_file) as conn:
        cursor = conn.cursor()
        
        # Check if user already exists
        cursor.execute('''
            SELECT user_id FROM auto_users WHERE device_fingerprint = ?
        ''', (device_fingerprint,))
        
        existing_user = cursor.fetchone()
        
        if existing_user:
            # Update last_seen
            cursor.execute('''
                UPDATE auto_users SET last_seen = ? WHERE device_fingerprint = ?
            ''', (datetime.now().isoformat(), device_fingerprint))
            conn.commit()
            return existing_user[0]
        
        # Create new auto user
        now = datetime.now().isoformat()
        
        # Get next user ID and increment counter
        cursor.execute('SELECT next_user_id FROM user_counter WHERE id = 1')
        next_id = cursor.fetchone()[0]
        
        # Insert new auto user
        cursor.execute('''
            INSERT INTO auto_users (user_id, device_fingerprint, created_at, last_seen)
            VALUES (?, ?, ?, ?)
        ''', (next_id, device_fingerprint, now, now))
        
        # Increment counter
        cursor.execute('''
            UPDATE user_counter SET next_user_id = next_user_id + 1 WHERE id = 1
        ''')
        
        conn.commit()
        return next_id

@app.route('/request-user-id', methods=['POST'])
def request_user_id():
    """Generate or retrieve user ID for TV clients"""
    try:
        # Generate device fingerprint
        device_fingerprint = generate_device_fingerprint(request)
        
        # Get or create auto user
        user_id = get_or_create_auto_user(device_fingerprint)
        
        # Store in session
        session['auto_user_id'] = user_id
        session['device_fingerprint'] = device_fingerprint
        
        return jsonify({
            'success': True,
            'user_id': user_id,
            'device_fingerprint': device_fingerprint,
            'message': f'User ID {user_id} assigned'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/verify-user-id', methods=['POST'])
def verify_user_id():
    """Verify if a user ID is valid and active"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        
        if not user_id:
            return jsonify({'valid': False, 'message': 'User ID required'}), 400
        
        with sqlite3.connect(ids_db_file) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT user_id, created_at, is_active FROM auto_users 
                WHERE user_id = ? AND is_active = 1
            ''', (user_id,))
            
            user = cursor.fetchone()
            
            if user:
                # Update last_seen
                cursor.execute('''
                    UPDATE auto_users SET last_seen = ? WHERE user_id = ?
                ''', (datetime.now().isoformat(), user_id))
                conn.commit()
                
                return jsonify({
                    'valid': True,
                    'user_id': user[0],
                    'created_at': user[1],
                    'message': f'User ID {user_id} is valid'
                })
            else:
                return jsonify({
                    'valid': False,
                    'message': 'Invalid or inactive user ID'
                })
                
    except Exception as e:
        return jsonify({
            'valid': False,
            'error': str(e)
        }), 500

def get_current_auto_user():
    """Get current auto user from session"""
    return session.get('auto_user_id')

#####################
### Spotify OAuth ###
#####################

SPOTIFY_CLIENT_ID = '7064e62e011b4563932083ae28312b16'
SPOTIFY_CLIENT_SECRET = 'd7bb179a6a494295a2013893f809805c'  # Get this from Spotify Dashboard
SPOTIFY_REDIRECT_URI = 'https://127.0.0.1/callback'

def save_spotify_tokens(user_id, access_token, refresh_token, expires_at, spotify_user_id=None):
    """Save Spotify tokens to ids database"""
    with sqlite3.connect(ids_db_file) as conn:
        cursor = conn.cursor()
        now = datetime.now().isoformat()
        
        cursor.execute('''
            INSERT OR REPLACE INTO spotify_tokens 
            (user_id, access_token, refresh_token, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (f"auto_{user_id}", access_token, refresh_token, expires_at.isoformat(), now, now))
        
        conn.commit()

def get_spotify_tokens(user_id):
    """Get Spotify tokens from ids database"""
    with sqlite3.connect(ids_db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT access_token, refresh_token, expires_at 
            FROM spotify_tokens WHERE user_id = ?
        ''', (f"auto_{user_id}",))
        row = cursor.fetchone()
        if row:
            return {
                'access_token': row[0],
                'refresh_token': row[1],
                'expires_at': datetime.fromisoformat(row[2])
            }
        return None

def update_spotify_access_token(user_id, access_token, expires_at):
    """Update access token in ids database"""
    with sqlite3.connect(ids_db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE spotify_tokens 
            SET access_token = ?, expires_at = ?, updated_at = ? 
            WHERE user_id = ?
        ''', (access_token, expires_at.isoformat(), datetime.now().isoformat(), f"auto_{user_id}"))
        conn.commit()

def refresh_spotify_token(user_id):
    """Refresh Spotify access token"""
    token_info = get_spotify_tokens(user_id)
    if not token_info:
        return False
    
    refresh_data = {
        'grant_type': 'refresh_token',
        'refresh_token': token_info['refresh_token'],
        'client_id': SPOTIFY_CLIENT_ID
    }
    
    response = requests.post(
        'https://accounts.spotify.com/api/token',
        data=refresh_data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'}
    )
    
    if response.status_code == 200:
        new_tokens = response.json()
        expires_at = datetime.now() + timedelta(seconds=new_tokens['expires_in'])
        
        update_spotify_access_token(
            user_id,
            new_tokens['access_token'],
            expires_at
        )
        return True
    
    return False

@app.route('/spotify-login')
def spotify_login():
    """Initiate Spotify OAuth flow"""
    # Check if auto user exists
    current_user = get_current_auto_user()
    if not current_user:
        # Try to get a user ID for this session
        device_fingerprint = generate_device_fingerprint(request)
        current_user = get_or_create_auto_user(device_fingerprint)
        session['auto_user_id'] = current_user
        session['device_fingerprint'] = device_fingerprint
    
    # Generate state and code challenge for security
    state = secrets.token_urlsafe(16)
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).decode().rstrip('=')
    
    # Store in session with user context
    session['spotify_state'] = state
    session['spotify_code_verifier'] = code_verifier
    session['spotify_user_id'] = current_user  # Store user ID with OAuth session
    
    print(f"Generated OAuth state: {state} for user {current_user}")  # Debug log
    
    # Build authorization URL
    auth_params = {
        'response_type': 'code',
        'client_id': SPOTIFY_CLIENT_ID,
        'scope': 'user-read-currently-playing user-read-playback-state user-modify-playback-state streaming user-read-private',
        'redirect_uri': SPOTIFY_REDIRECT_URI,
        'state': state,
        'code_challenge_method': 'S256',
        'code_challenge': code_challenge
    }
    
    auth_url = 'https://accounts.spotify.com/authorize?' + urllib.parse.urlencode(auth_params)
    return redirect(auth_url)

@app.route('/callback')
def spotify_callback():
    """Handle Spotify OAuth callback"""
    code = request.args.get('code')
    state = request.args.get('state')
    error = request.args.get('error')
    
    print(f"Callback received - State: {state}, Code: {code[:10] if code else None}...")  # Debug log
    
    if error:
        return f"Spotify authorization error: {error}", 400
    
    # Verify state
    session_state = session.get('spotify_state')
    session_user = session.get('spotify_user_id')
    
    print(f"Session state: {session_state}, Session user: {session_user}")  # Debug log
    
    if not code:
        return "Authorization code missing", 400
        
    if not state or state != session_state:
        return f"Invalid state. Expected: {session_state}, Got: {state}", 400
    
    if not session_user:
        return "User session missing. Please refresh the page and try again.", 401
    
    # Exchange code for tokens
    token_data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': SPOTIFY_REDIRECT_URI,
        'client_id': SPOTIFY_CLIENT_ID,
        'code_verifier': session.get('spotify_code_verifier')
    }
    
    token_headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    token_response = requests.post(
        'https://accounts.spotify.com/api/token',
        data=token_data,
        headers=token_headers
    )
    
    if token_response.status_code == 200:
        tokens = token_response.json()
        expires_at = datetime.now() + timedelta(seconds=tokens['expires_in'])
        
        # Get Spotify user info
        user_info_response = requests.get(
            'https://api.spotify.com/v1/me',
            headers={'Authorization': f"Bearer {tokens['access_token']}"}
        )
        
        spotify_user_id = None
        if user_info_response.status_code == 200:
            spotify_user_id = user_info_response.json().get('id')
        
        # Save tokens to ids database
        save_spotify_tokens(
            session_user,
            tokens['access_token'],
            tokens['refresh_token'],
            expires_at,
            spotify_user_id
        )
        
        # Update session to maintain user ID
        session['auto_user_id'] = session_user
        
        # Clean up OAuth session data
        session.pop('spotify_state', None)
        session.pop('spotify_code_verifier', None)
        session.pop('spotify_user_id', None)
        
        print(f"Spotify connected successfully for user {session_user}")  # Debug log
        
        return redirect('/tv?spotify=connected')
    else:
        return f"Failed to get tokens: {token_response.text}", 400

@app.route('/spotify-status')
def spotify_status():
    """Get current Spotify playback status"""
    current_user = get_current_auto_user()
    if not current_user:
        return jsonify({'error': 'No user ID found'}), 401
    
    token_info = get_spotify_tokens(current_user)
    if not token_info:
        return jsonify({'error': 'Spotify not connected'}), 401
    
    # Check if token is expired and refresh if needed
    if datetime.now() >= token_info['expires_at']:
        if not refresh_spotify_token(current_user):
            return jsonify({'error': 'Token expired and refresh failed'}), 401
        # Get updated tokens
        token_info = get_spotify_tokens(current_user)
    
    headers = {
        'Authorization': f"Bearer {token_info['access_token']}"
    }
    
    response = requests.get(
        'https://api.spotify.com/v1/me/player',
        headers=headers
    )
    
    if response.status_code == 200:
        return jsonify(response.json())
    elif response.status_code == 204:
        return jsonify({'is_playing': False, 'device': None})
    else:
        return jsonify({'error': 'Failed to get playback status'}), response.status_code

@app.route('/spotify-control', methods=['POST'])
def spotify_control():
    """Control Spotify playback"""
    current_user = get_current_auto_user()
    if not current_user:
        return jsonify({'error': 'No user ID found'}), 401
    
    token_info = get_spotify_tokens(current_user)
    if not token_info:
        return jsonify({'error': 'Spotify not connected'}), 401
    
    # Check if token is expired and refresh if needed
    if datetime.now() >= token_info['expires_at']:
        if not refresh_spotify_token(current_user):
            return jsonify({'error': 'Token expired and refresh failed'}), 401
        token_info = get_spotify_tokens(current_user)
    
    action = request.json.get('action')
    
    headers = {
        'Authorization': f"Bearer {token_info['access_token']}"
    }
    
    if action == 'play':
        response = requests.put('https://api.spotify.com/v1/me/player/play', headers=headers)
    elif action == 'pause':
        response = requests.put('https://api.spotify.com/v1/me/player/pause', headers=headers)
    elif action == 'next':
        response = requests.post('https://api.spotify.com/v1/me/player/next', headers=headers)
    elif action == 'previous':
        response = requests.post('https://api.spotify.com/v1/me/player/previous', headers=headers)
    else:
        return jsonify({'error': 'Invalid action'}), 400
    
    if response.status_code in [200, 204]:
        return jsonify({'success': True})
    else:
        return jsonify({'error': 'Control action failed', 'details': response.text}), response.status_code

@app.route('/spotify-disconnect', methods=['POST'])
def spotify_disconnect():
    """Disconnect Spotify from user account"""
    current_user = get_current_auto_user()
    if not current_user:
        return jsonify({'error': 'No user ID found'}), 401
    
    with sqlite3.connect(ids_db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM spotify_tokens WHERE user_id = ?', (f"auto_{current_user}",))
        conn.commit()
    
    return jsonify({'success': True})

#####################
### Timetable App ###
#####################

# imports
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
import msal
import jwt
from jwt.algorithms import RSAAlgorithm

# Load environment variables
load_dotenv()

# defs
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-change-this')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///timetable.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Database setup
db = SQLAlchemy(app)

GEMINI_LOG_DIR = Path(app.instance_path) / 'gemini_logs'
GEMINI_LOG_DIR.mkdir(parents=True, exist_ok=True)

# Login manager setup
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Google OAuth settings
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '897054939253-318fpnpmp02vp2b8ffh1bodi2n83hf4g.apps.googleusercontent.com')

# Microsoft OAuth settings
MICROSOFT_CLIENT_ID = os.getenv('MICROSOFT_CLIENT_ID', 'your-client-id')
MICROSOFT_CLIENT_SECRET = os.getenv('MICROSOFT_CLIENT_SECRET', 'your-client-secret')
MICROSOFT_AUTHORITY = "https://login.microsoftonline.com/consumers"
MICROSOFT_REDIRECT_PATH = "/auth/microsoft/callback"
MICROSOFT_SCOPE = ["User.Read"]

# Models
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    google_id = db.Column(db.String(100), unique=True, nullable=False)
    microsoft_id = db.Column(db.String(100), unique=True, nullable=True)
    email = db.Column(db.String(100), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    profile_pic = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    timetables = db.relationship('Timetable', backref='user', lazy=True)

class Timetable(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False, default='My Timetable')
    row_headers = db.Column(db.Text, default='[]')
    column_headers = db.Column(db.Text, default='[]')
    cells_data = db.Column(db.Text, default='{}')
    color_scheme = db.Column(db.Text, default='{}')
    time_slot_mode = db.Column(db.Boolean, default=True)
    time_slot_settings = db.Column(db.Text, default='{}')
    study_subjects = db.Column(db.Text, default='[]')
    theme = db.Column(db.String(50), default='academic')
    revision_settings = db.Column(db.Text, default='{}')
    notes_data = db.Column(db.Text, default='{}')
    study_time_data = db.Column(db.Text, default='{}')
    color_library = db.Column(db.Text, default='[]')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

DAY_ORDER = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
]

DAY_ALIASES = {
    'mon': 'Monday', 'monday': 'Monday',
    'tue': 'Tuesday', 'tues': 'Tuesday', 'tuesday': 'Tuesday',
    'wed': 'Wednesday', 'weds': 'Wednesday', 'wednesday': 'Wednesday',
    'thu': 'Thursday', 'thur': 'Thursday', 'thurs': 'Thursday', 'thursday': 'Thursday',
    'fri': 'Friday', 'friday': 'Friday',
    'sat': 'Saturday', 'saturday': 'Saturday',
    'sun': 'Sunday', 'sunday': 'Sunday'
}

def normalize_day_name(day_raw: str) -> str | None:
    if not day_raw:
        return None
    cleaned = day_raw.strip().lower().replace('.', '')
    if not cleaned:
        return None
    return DAY_ALIASES.get(cleaned, day_raw.strip().title())

def normalize_time_string(time_raw: str) -> str | None:
    if not time_raw:
        return None
    cleaned = time_raw.strip().lower().replace(' ', '').replace('.', '')
    if not cleaned:
        return None

    match = re.match(r'^(?P<hour>\d{1,2}):(?P<minute>\d{2})(?P<period>am|pm)?$', cleaned)
    if match:
        hour = int(match.group('hour'))
        minute = int(match.group('minute'))
        period = match.group('period')
        if period:
            hour = hour % 12
            if period == 'pm':
                hour += 12
        if 0 <= hour < 24 and 0 <= minute < 60:
            return f"{hour:02d}:{minute:02d}"

    match = re.match(r'^(?P<hour>\d{1,2})(?P<period>am|pm)$', cleaned)
    if match:
        hour = int(match.group('hour')) % 12
        if match.group('period') == 'pm':
            hour += 12
        return f"{hour:02d}:00"

    match = re.match(r'^(?P<hour>\d{1,2})(?P<minute>\d{2})$', cleaned)
    if match:
        hour = int(match.group('hour'))
        minute = int(match.group('minute'))
        if 0 <= hour < 24 and 0 <= minute < 60:
            return f"{hour:02d}:{minute:02d}"

    return None

def time_to_minutes(time_str: str) -> int:
    hour, minute = map(int, time_str.split(':'))
    return hour * 60 + minute

def build_row_label(start_time: str, end_time: str) -> str:
    return f"{start_time} - {end_time}"

def _safe_strip(value: object | None) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None

def normalize_date_string(date_raw: object | None) -> str | None:
    if date_raw is None:
        return None
    cleaned = str(date_raw).strip()
    if not cleaned:
        return None

    candidates = {
        cleaned,
        cleaned.replace('.', '/'),
        cleaned.replace('-', '/')
    }

    for candidate in candidates:
        for date_format in ('%Y-%m-%d', '%d/%m/%Y', '%d/%m/%y', '%d-%m-%Y', '%d-%m-%y'):
            try:
                parsed = datetime.strptime(candidate, date_format)
                return parsed.strftime('%Y-%m-%d')
            except ValueError:
                continue

    return None

def gemini_prompt_template() -> str:
    return (
        "You are an assistant that extracts timetable information from an image. "
        "Respond strictly in JSON using the following schema: {\\n"
        "  \"timetable_name\": string (optional),\\n"
        "  \"lessons\": [\\n"
        "    {\\n"
        "      \"day\": string (e.g. Monday),\\n"
        "      \"subject\": string,\\n"
        "      \"start_time\": string in 24h format (HH:MM),\\n"
        "      \"end_time\": string in 24h format (HH:MM),\\n"
        "      \"location\": string (optional),\\n"
        "      \"notes\": string (optional),\\n"
        "      \"start_date\": string in ISO format YYYY-MM-DD (optional),\\n"
        "      \"end_date\": string in ISO format YYYY-MM-DD (optional)\\n"
        "    }\\n"
        "  ]\\n"
        "}.\\n"
        "Always ensure start_time and end_time are in 24h format. "
        "If any value is unknown or unreadable, set that JSON field to null rather than omitting it. "
        "Do not include any additional commentary."
        "If there is a From and To column with dates, ignore them and don't append them to anything, also the same with the room / staff columns, also ignore codes in the subject names."
    )

def gemini_retry_prompt_template() -> str:
    return (
        "You previously saw a timetable image but did not extract any rows. "
        "Look carefully at every row and include each class you can read. "
        "Return the exact same JSON schema as before. If a value is unclear, set it to null rather than skipping the row. "
        "Do not add commentary or Markdown fences—output pure JSON only."
    )

DEFAULT_COLOR_SCHEME = {
    'primary': '#2563eb',
    'secondary': '#7c3aed',
    'success': '#059669',
    'warning': '#d97706',
    'danger': '#dc2626',
    'accent': '#0891b2',
    'background': '#f9fafb',
    'header': '#f3f4f6'
}

def _persist_gemini_log(entry: dict) -> str:
    """Persist Gemini interaction details for debugging and return a log identifier."""
    try:
        GEMINI_LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_id = f"{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}_{uuid.uuid4().hex[:8]}"
        log_path = GEMINI_LOG_DIR / f"{log_id}.json"
        log_path.write_text(json.dumps(entry, indent=2), encoding='utf-8')
        return log_id
    except Exception as exc:  # noqa: BLE001
        app.logger.exception('Failed to persist Gemini log: %s', exc)
        return ''

def extract_json_from_text(raw_text: str) -> tuple[dict | list | None, str | None]:
    """Attempt to parse JSON from Gemini output, returning (payload, error_message)."""
    cleaned = raw_text.strip()
    if cleaned.startswith('```'):
        cleaned = cleaned.strip('`')
        cleaned = cleaned.replace('json', '', 1).strip()

    # Normalize smart quotes to avoid JSON parsing issues
    cleaned = cleaned.replace('\u2018', "'").replace('\u2019', "'")
    cleaned = cleaned.replace('\u201c', '"').replace('\u201d', '"')

    try:
        return json.loads(cleaned), None
    except json.JSONDecodeError as err:
        first_brace = cleaned.find('{')
        last_brace = cleaned.rfind('}')
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            candidate = cleaned[first_brace:last_brace + 1]
            try:
                return json.loads(candidate), None
            except json.JSONDecodeError as inner_err:
                auto_closed = _close_json_braces(candidate)
                try:
                    return json.loads(auto_closed), None
                except json.JSONDecodeError as final_err:
                    return None, f"Failed to parse JSON snippet: {final_err.msg}"
        auto_closed = _close_json_braces(cleaned)
        try:
            return json.loads(auto_closed), None
        except json.JSONDecodeError as final_err:
            return None, f"Failed to parse JSON: {final_err.msg}"

def _close_json_braces(payload: str) -> str:
    """Best-effort attempt to append missing closing braces/brackets."""
    stack: list[str] = []
    result_chars: list[str] = []
    in_string = False
    escape_next = False

    for ch in payload:
        result_chars.append(ch)
        if escape_next:
            escape_next = False
            continue

        if ch == '\\':
            escape_next = True
            continue

        if ch == '"':
            in_string = not in_string
            continue

        if in_string:
            continue

        if ch in '{[':
            stack.append(ch)
        elif ch in '}]':
            if stack and ((stack[-1] == '{' and ch == '}') or (stack[-1] == '[' and ch == ']')):
                stack.pop()

    closing = ''.join('}' if ch == '{' else ']' for ch in reversed(stack))
    return ''.join(result_chars) + closing

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/auth/google', methods=['POST'])
def google_auth():
    token = request.json.get('idtoken')
    
    try:
        # Verify the token
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), GOOGLE_CLIENT_ID)
        
        # Get user info
        google_id = idinfo['sub']
        email = idinfo['email']
        name = idinfo['name']
        profile_pic = idinfo.get('picture', '')
        
        # Check if user exists
        user = User.query.filter_by(google_id=google_id).first()
        
        if not user:
            # Create new user
            user = User(
                google_id=google_id,
                email=email,
                name=name,
                profile_pic=profile_pic
            )
            db.session.add(user)
            db.session.commit()
            
        login_user(user)
        return jsonify({'success': True})
        
    except ValueError:
        return jsonify({'success': False, 'error': 'Invalid token'}), 400

@app.route('/auth/microsoft/login')
def microsoft_login():
    client = msal.ConfidentialClientApplication(
        MICROSOFT_CLIENT_ID, authority=MICROSOFT_AUTHORITY,
        client_credential=MICROSOFT_CLIENT_SECRET,
    )
    auth_url = client.get_authorization_request_url(
        MICROSOFT_SCOPE, redirect_uri=url_for('microsoft_callback', _external=True)
    )
    return redirect(auth_url)

@app.route('/auth/microsoft/callback')
def microsoft_callback():
    if request.args.get('error'):
        return f"Error: {request.args.get('error_description')}"
        
    code = request.args.get('code')
    client = msal.ConfidentialClientApplication(
        MICROSOFT_CLIENT_ID, authority=MICROSOFT_AUTHORITY,
        client_credential=MICROSOFT_CLIENT_SECRET,
    )
    result = client.acquire_token_by_authorization_code(
        code, scopes=MICROSOFT_SCOPE,
        redirect_uri=url_for('microsoft_callback', _external=True, _scheme='https')
    )
    
    if "error" in result:
        return f"Error: {result.get('error_description')}"
        
    # Get user info from token
    claims = result.get("id_token_claims")
    microsoft_id = claims.get("oid")
    email = claims.get("preferred_username") or claims.get("email")
    name = claims.get("name")
    
    # Check if user exists
    user = User.query.filter_by(microsoft_id=microsoft_id).first()
    
    if not user:
        # Check if user exists by email (link accounts)
        if email:
            user = User.query.filter_by(email=email).first()
            if user:
                user.microsoft_id = microsoft_id
                db.session.commit()
        
        if not user:
            # Create new user
            user = User(
                google_id=f"microsoft_{microsoft_id}", # Placeholder
                microsoft_id=microsoft_id,
                email=email,
                name=name,
                profile_pic=""
            )
            db.session.add(user)
            db.session.commit()
            
    login_user(user)
    return redirect(url_for('dashboard'))

@app.route('/dashboard')
@login_required
def dashboard():
    timetables = Timetable.query.filter_by(user_id=current_user.id).all()
    return render_template('dashboard.html', timetables=timetables, user=current_user)

@app.route('/timetable/<int:timetable_id>')
@login_required
def timetable_view(timetable_id):
    timetable = Timetable.query.filter_by(id=timetable_id, user_id=current_user.id).first_or_404()
    return render_template('timetable.html', timetable=timetable)

@app.route('/api/timetable/<int:timetable_id>', methods=['GET'])
@login_required
def get_timetable(timetable_id):
    timetable = Timetable.query.filter_by(id=timetable_id, user_id=current_user.id).first_or_404()
    return jsonify({
        'id': timetable.id,
        'name': timetable.name,
        'row_headers': json.loads(timetable.row_headers),
        'column_headers': json.loads(timetable.column_headers),
        'cells_data': json.loads(timetable.cells_data),
        'color_scheme': json.loads(timetable.color_scheme),
        'time_slot_mode': getattr(timetable, 'time_slot_mode', True),
        'time_slot_settings': json.loads(getattr(timetable, 'time_slot_settings', '{}') or '{}'),
        'study_subjects': json.loads(getattr(timetable, 'study_subjects', '[]') or '[]'),
        'theme': getattr(timetable, 'theme', 'academic'),
        'revision_settings': json.loads(getattr(timetable, 'revision_settings', '{}') or '{}'),
        'notes_data': json.loads(getattr(timetable, 'notes_data', '{}') or '{}'),
        'study_time_data': json.loads(getattr(timetable, 'study_time_data', '{}') or '{}'),
        'color_library': json.loads(getattr(timetable, 'color_library', '[]') or '[]')
    })

@app.route('/api/timetable/<int:timetable_id>', methods=['PUT'])
@login_required
def update_timetable(timetable_id):
    timetable = Timetable.query.filter_by(id=timetable_id, user_id=current_user.id).first_or_404()
    data = request.json
    
    if 'name' in data:
        timetable.name = data['name']
    if 'row_headers' in data:
        timetable.row_headers = json.dumps(data['row_headers'])
    if 'column_headers' in data:
        timetable.column_headers = json.dumps(data['column_headers'])
    if 'cells_data' in data:
        timetable.cells_data = json.dumps(data['cells_data'])
    if 'color_scheme' in data:
        timetable.color_scheme = json.dumps(data['color_scheme'])
    if 'time_slot_mode' in data:
        timetable.time_slot_mode = data['time_slot_mode']
    if 'time_slot_settings' in data:
        timetable.time_slot_settings = json.dumps(data['time_slot_settings'])
    if 'study_subjects' in data:
        timetable.study_subjects = json.dumps(data['study_subjects'])
    if 'theme' in data:
        timetable.theme = data['theme']
    if 'revision_settings' in data:
        timetable.revision_settings = json.dumps(data['revision_settings'])
    if 'notes_data' in data:
        timetable.notes_data = json.dumps(data['notes_data'])
    if 'study_time_data' in data:
        timetable.study_time_data = json.dumps(data['study_time_data'])
    if 'color_library' in data:
        timetable.color_library = json.dumps(data['color_library'])
    
    timetable.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({'success': True})

@app.route('/api/timetable', methods=['POST'])
@login_required
def create_timetable():
    data = request.json
    name = data.get('name', 'New Revision Timetable')
    theme = data.get('theme', 'academic')
    subjects = data.get('subjects', ['Mathematics', 'Science', 'English', 'History'])
    
    # Define theme-based color schemes
    theme_colors = {
        'academic': {
            'primary': '#2563eb',      # Blue
            'secondary': '#7c3aed',    # Purple  
            'success': '#059669',      # Green
            'warning': '#d97706',      # Orange
            'danger': '#dc2626',       # Red
            'accent': '#0891b2',       # Cyan
            'background': '#f9fafb',   # Light gray
            'header': '#f3f4f6'        # Light gray header
        },
        'pastel': {
            'primary': '#8b5cf6',      # Soft Purple
            'secondary': '#06b6d4',    # Soft Cyan
            'success': '#10b981',      # Soft Green
            'warning': '#f59e0b',      # Soft Yellow
            'danger': '#f87171',       # Soft Pink
            'accent': '#a78bfa',       # Light Purple
            'background': '#fef7ff',   # Very light purple
            'header': '#f5f3ff'        # Light purple header
        },
        'vibrant': {
            'primary': '#ec4899',      # Hot Pink
            'secondary': '#8b5cf6',    # Purple
            'success': '#10b981',      # Emerald
            'warning': '#f59e0b',      # Amber
            'danger': '#ef4444',       # Red
            'accent': '#06b6d4',       # Cyan
            'background': '#fff7ed',   # Very light orange
            'header': '#fed7aa'        # Light orange header
        },
        'nature': {
            'primary': '#059669',      # Forest Green
            'secondary': '#0891b2',    # Ocean Blue
            'success': '#65a30d',      # Lime
            'warning': '#ca8a04',      # Earth Yellow
            'danger': '#dc2626',       # Red
            'accent': '#0d9488',       # Teal
            'background': '#f0fdf4',   # Very light green
            'header': '#dcfce7'        # Light green header
        },
        'sunset': {
            'primary': '#ea580c',      # Orange
            'secondary': '#dc2626',    # Red
            'success': '#ca8a04',      # Gold
            'warning': '#f59e0b',      # Amber
            'danger': '#be123c',       # Deep Red
            'accent': '#f97316',       # Orange Red
            'background': '#fff7ed',   # Very light orange
            'header': '#fed7aa'        # Light orange header
        }
    }
    
    selected_colors = theme_colors.get(theme, theme_colors['academic'])
    
    # Generate automatic cell coloring based on subjects
    auto_cells_data = {}
    subject_colors = ['primary', 'secondary', 'success', 'warning', 'danger', 'accent']
    
    # Pre-populate more cells with subject colors for demonstration
    for row_idx in range(5):  # 5 time slots
        for col_idx in range(5):  # 5 days
            # Populate more cells (about 70% of the grid)
            if (row_idx + col_idx) % 3 != 2:  # Skip every 3rd cell instead of only populating every 3rd
                subject_idx = (row_idx * 2 + col_idx) % len(subjects)  # Better distribution
                color_idx = subject_idx % len(subject_colors)
                
                # Add some variety in priority levels
                priorities = ['high', 'medium', 'low']
                priority = priorities[(row_idx + col_idx) % len(priorities)]
                
                auto_cells_data[f"{row_idx}-{col_idx}"] = {
                    'content': subjects[subject_idx],
                    'color': subject_colors[color_idx],
                    'subject': subjects[subject_idx],
                    'priority': priority,
                    'completed': False
                }
    
    timetable = Timetable(
        user_id=current_user.id,
        name=name,
        row_headers=json.dumps(['9:00 - 10:00', '10:15 - 11:15', '11:30 - 12:30', '13:30 - 14:30', '14:45 - 15:45']),
        column_headers=json.dumps(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
        cells_data=json.dumps(auto_cells_data),
        color_scheme=json.dumps(selected_colors),
        time_slot_mode=True,
        time_slot_settings=json.dumps({
            'start_time': '9:00',
            'slot_duration': 60,
            'break_duration': 15,
            'lunch_break': {'start': '12:30', 'duration': 60},
            'time_format': '24h'
        }),
        study_subjects=json.dumps(subjects),
        theme=theme,
        revision_settings=json.dumps({
            'show_progress': True,
            'auto_color_subjects': True,
            'study_timer': True,
            'break_reminders': True,
            'difficulty_tracking': True
        }),
        notes_data=json.dumps({
            'general': '',
            'study': '',
            'todos': []
        }),
        study_time_data=json.dumps({
            'totalTimeAllTime': 0,
            'lastSessionDate': None
        }),
        color_library=json.dumps([])
    )
    
    db.session.add(timetable)
    db.session.commit()
    
    return jsonify({'success': True, 'id': timetable.id})

@app.route('/api/timetable/<int:timetable_id>', methods=['DELETE'])
@login_required
def delete_timetable(timetable_id):
    timetable = Timetable.query.filter_by(id=timetable_id, user_id=current_user.id).first_or_404()
    db.session.delete(timetable)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/timetable/import-ai', methods=['POST'])
@login_required
def import_timetable_ai():
    if 'timetableImage' not in request.files:
        return jsonify({'success': False, 'error': 'Please upload an image of your timetable.'}), 400

    uploaded_file = request.files['timetableImage']
    if uploaded_file.filename == '':
        return jsonify({'success': False, 'error': 'Please choose an image file before submitting.'}), 400

    image_bytes = uploaded_file.read()
    if not image_bytes:
        return jsonify({'success': False, 'error': 'Uploaded file appears to be empty.'}), 400

    mime_type = uploaded_file.mimetype or 'image/png'
    api_key = os.getenv('GEMINI_API_KEY')

    if not api_key:
        return jsonify({
            'success': False,
            'error': 'AI import is not configured on this server yet. Please contact the administrator.'
        }), 500

    try:
        import google.generativeai as genai  # type: ignore[import-not-found]
    except ImportError:
        app.logger.exception('google-generativeai package is not installed. Cannot run AI import.')
        return jsonify({
            'success': False,
            'error': 'AI import dependency missing on the server. Please install google-generativeai.'
        }), 500

    log_entry: dict[str, object] = {
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'user_id': current_user.id,
        'filename': uploaded_file.filename,
        'mime_type': mime_type
    }

    try:
        genai.configure(api_key=api_key)
        generation_config = {
            'temperature': 0.2,
            'top_p': 0.8,
            'max_output_tokens': 5048

        }
        model_name = 'gemini-flash-latest'
        model = genai.GenerativeModel(
            model_name=model_name,
            generation_config=generation_config
        )
        log_entry.update({
            'model': model_name,
            'generation_config': generation_config,
            'image_bytes_length': len(image_bytes)
        })
        attempt_prompts = [
            {'label': 'primary', 'text': gemini_prompt_template()},
            {'label': 'retry', 'text': gemini_retry_prompt_template()}
        ]
        candidate_texts: list[str] = []
        safety_blocked = False
        blocked_categories: set[str] = set()
        last_prompt_blocked = False
        last_prompt_categories: set[str] = set()
        log_entry['attempts'] = []

        for attempt_index, prompt_cfg in enumerate(attempt_prompts, start=1):
            attempt_log: dict[str, object] = {
                'attempt': attempt_index,
                'label': prompt_cfg['label']
            }

            response = model.generate_content([
                {'mime_type': mime_type, 'data': image_bytes},
                {'text': prompt_cfg['text']}
            ])

            attempt_texts: list[str] = []
            attempt_safety_blocked = False
            attempt_blocked_categories: set[str] = set()

            for candidate in getattr(response, 'candidates', []):
                finish_reason = getattr(candidate, 'finish_reason', None)
                if hasattr(finish_reason, 'name'):
                    finish_code = finish_reason.name.upper()
                elif isinstance(finish_reason, str):
                    finish_code = finish_reason.upper()
                else:
                    finish_code = str(finish_reason or '').upper()

                if finish_code == 'SAFETY':
                    attempt_safety_blocked = True
                for rating in getattr(candidate, 'safety_ratings', []) or []:
                    if getattr(rating, 'blocked', False):
                        attempt_safety_blocked = True
                        attempt_blocked_categories.add(getattr(rating, 'category', 'unknown'))

                parts = getattr(getattr(candidate, 'content', None), 'parts', []) or []
                for part in parts:
                    text_part = getattr(part, 'text', None)
                    if text_part:
                        attempt_texts.append(text_part)

            attempt_log['candidate_text_count'] = len(attempt_texts)
            attempt_log['safety_blocked'] = attempt_safety_blocked
            if attempt_blocked_categories:
                attempt_log['blocked_categories'] = sorted(attempt_blocked_categories)

            prompt_feedback = getattr(response, 'prompt_feedback', None)
            prompt_blocked = False
            prompt_categories: set[str] = set()
            if prompt_feedback and getattr(prompt_feedback, 'block_reason', None):
                prompt_blocked = True
                prompt_categories.add(str(getattr(prompt_feedback, 'block_reason')))
            for rating in getattr(prompt_feedback, 'safety_ratings', []) or []:
                if getattr(rating, 'blocked', False):
                    prompt_blocked = True
                    prompt_categories.add(getattr(rating, 'category', 'unknown'))

            attempt_log['prompt_blocked'] = prompt_blocked
            if prompt_categories:
                attempt_log['prompt_categories'] = sorted(prompt_categories)

            log_entry['attempts'].append(attempt_log)

            if attempt_texts:
                candidate_texts = attempt_texts
                safety_blocked = attempt_safety_blocked
                blocked_categories = attempt_blocked_categories
                break

            if attempt_safety_blocked:
                safety_blocked = True
                blocked_categories = attempt_blocked_categories
                log_entry.update({
                    'status': 'safety_blocked',
                    'message': 'Blocked by safety filters.',
                    'failed_attempt': attempt_index
                })
                log_id = _persist_gemini_log(log_entry)
                app.logger.warning(
                    'Gemini import blocked by safety filters. Categories: %s',
                    ', '.join(sorted(attempt_blocked_categories)) or 'unspecified'
                )
                return jsonify({
                    'success': False,
                    'error': 'The AI blocked this image due to safety filters. Try a clearer screenshot without personal info.',
                    'log_id': log_id or None
                }), 422

            last_prompt_blocked = prompt_blocked
            last_prompt_categories = prompt_categories

            if attempt_index < len(attempt_prompts):
                continue

        log_entry['candidate_texts'] = candidate_texts
        log_entry['response_has_candidates'] = bool(candidate_texts)
        log_entry['safety_blocked'] = safety_blocked
        log_entry['attempt_count'] = len(log_entry.get('attempts', []))
        if blocked_categories:
            log_entry['blocked_categories'] = sorted(blocked_categories)

        if not candidate_texts:
            log_entry.update({
                'status': 'no_candidates',
                'prompt_blocked': last_prompt_blocked,
                'prompt_categories': sorted(last_prompt_categories)
            })
            log_id = _persist_gemini_log(log_entry)
            app.logger.warning(
                'Gemini import produced no textual candidates. Prompt blocked: %s Categories: %s',
                last_prompt_blocked,
                ', '.join(sorted(last_prompt_categories)) or 'none'
            )
            return jsonify({
                'success': False,
                'error': 'The AI could not read anything useful from that image after two attempts. Try retaking the screenshot with clearer text.',
                'log_id': log_id or None
            }), 422

        payload_text = ''.join(candidate_texts).strip()
        ai_payload, parse_error = extract_json_from_text(payload_text)
        if ai_payload is None:
            log_entry.update({
                'status': 'parse_failed',
                'payload_text': payload_text,
                'parse_error': parse_error
            })
            log_id = _persist_gemini_log(log_entry)
            app.logger.warning(
                'Gemini import produced unparsable payload. Error: %s Payload sample: %s',
                parse_error or 'unknown',
                payload_text[:500]
            )
            return jsonify({
                'success': False,
                'error': 'The AI returned an unexpected format. Please try again with a clearer timetable image.',
                'log_id': log_id or None
            }), 502
        lessons_raw: list[dict] = []
        if isinstance(ai_payload, list):
            lessons_raw = [item for item in ai_payload if isinstance(item, dict)]
            ai_payload = {'lessons': lessons_raw}
        elif isinstance(ai_payload, dict):
            candidate_lessons = ai_payload.get('lessons')
            if isinstance(candidate_lessons, list):
                lessons_raw = [item for item in candidate_lessons if isinstance(item, dict)]
            else:
                for alt_key in ('schedule', 'entries', 'courses'):
                    alt_value = ai_payload.get(alt_key)
                    if isinstance(alt_value, list):
                        lessons_raw = [item for item in alt_value if isinstance(item, dict)]
                        ai_payload['lessons'] = lessons_raw
                        break
        else:
            ai_payload = {'lessons': []}

        lessons = lessons_raw
    except Exception as exc:  # noqa: BLE001
        log_entry.update({
            'status': 'exception',
            'error': str(exc)
        })
        _persist_gemini_log(log_entry)
        app.logger.exception('Gemini timetable import failed: %s', exc)
        return jsonify({
            'success': False,
            'error': 'Unable to process the timetable image right now. Please try again later.'
        }), 500

    parsed_lessons = []
    for lesson in lessons:
        day = normalize_day_name(_safe_strip(lesson.get('day')) or _safe_strip(lesson.get('weekday')))
        start_time = normalize_time_string(_safe_strip(lesson.get('start_time')) or _safe_strip(lesson.get('start')))
        end_time = normalize_time_string(_safe_strip(lesson.get('end_time')) or _safe_strip(lesson.get('end')))
        subject = _safe_strip(lesson.get('subject')) or _safe_strip(lesson.get('course')) or 'Lesson'
        location = _safe_strip(lesson.get('location')) or _safe_strip(lesson.get('room'))
        staff = _safe_strip(lesson.get('staff')) or _safe_strip(lesson.get('teacher'))
        start_date = normalize_date_string(lesson.get('start_date') or lesson.get('from_date'))
        end_date = normalize_date_string(lesson.get('end_date') or lesson.get('to_date'))
        base_notes = _safe_strip(lesson.get('notes'))

        if not day or not start_time or not end_time:
            continue

        start_minutes = time_to_minutes(start_time)
        end_minutes = time_to_minutes(end_time)
        if end_minutes <= start_minutes:
            continue

        notes_lines: list[str] = []
        if start_date and end_date:
            notes_lines.append(f"Dates: {start_date} → {end_date}")
        elif start_date:
            notes_lines.append(f"Starts: {start_date}")
        elif end_date:
            notes_lines.append(f"Ends: {end_date}")

        if base_notes:
            notes_lines.append(base_notes)

        notes_text = '\n'.join(notes_lines) if notes_lines else None

        parsed_lessons.append({
            'day': day,
            'start_time': start_time,
            'end_time': end_time,
            'subject': subject,
            'location': location,
            'notes': notes_text,
            'staff': staff,
            'start_date': start_date,
            'end_date': end_date,
            'duration': end_minutes - start_minutes
        })

    if not parsed_lessons:
        log_entry.update({
            'status': 'no_valid_lessons',
            'payload_text': payload_text,
            'parsed_lessons': []
        })
        log_id = _persist_gemini_log(log_entry)
        return jsonify({
            'success': False,
            'error': 'The AI could not detect any valid lessons in the uploaded timetable. Try a clearer image.',
            'log_id': log_id or None
        }), 422

    unique_days = {}
    for lesson in parsed_lessons:
        if lesson['day'] not in unique_days:
            unique_days[lesson['day']] = None

    ordered_days = sorted(
        unique_days.keys(),
        key=lambda d: DAY_ORDER.index(d) if d in DAY_ORDER else len(DAY_ORDER)
    )

    day_index_map = {day: idx for idx, day in enumerate(ordered_days)}

    row_map: dict[str, dict[str, str | int]] = {}
    for lesson in parsed_lessons:
        label = build_row_label(lesson['start_time'], lesson['end_time'])
        if label not in row_map:
            row_map[label] = {
                'label': label,
                'start': lesson['start_time'],
                'end': lesson['end_time'],
                'duration': lesson['duration']
            }

    ordered_rows = sorted(row_map.values(), key=lambda r: time_to_minutes(r['start']))
    row_index_map = {row['label']: idx for idx, row in enumerate(ordered_rows)}

    cells_data = {}
    subjects = set()

    for lesson in parsed_lessons:
        row_idx = row_index_map[build_row_label(lesson['start_time'], lesson['end_time'])]
        col_idx = day_index_map[lesson['day']]
        cell_key = f"{row_idx}-{col_idx}"

        subjects.add(lesson['subject'])

        lines = [lesson['subject']]
        if lesson['location']:
            lines.append(f"Room: {lesson['location']}")
        if lesson.get('staff'):
            lines.append(f"Staff: {lesson['staff']}")
        if lesson['notes']:
            lines.extend([segment for segment in lesson['notes'].split('\n') if segment])

        entry_text = '\n'.join(filter(None, lines))

        if cell_key in cells_data:
            existing = cells_data[cell_key]
            combined = [existing.get('content', '').strip(), entry_text.strip()]
            existing['content'] = '\n\n'.join([part for part in combined if part])
            subject_parts = [existing.get('subject'), lesson['subject']]
            existing['subject'] = ' / '.join([part for part in subject_parts if part])
        else:
            cells_data[cell_key] = {
                'content': entry_text,
                'color': 'primary',
                'subject': lesson['subject'],
                'priority': 'medium',
                'completed': False
            }

    timetable = Timetable(
        user_id=current_user.id,
        name=ai_payload.get('timetable_name') or 'AI Imported Timetable',
        row_headers=json.dumps([row['label'] for row in ordered_rows]),
        column_headers=json.dumps(ordered_days),
        cells_data=json.dumps(cells_data),
        color_scheme=json.dumps(DEFAULT_COLOR_SCHEME),
        time_slot_mode=False,
        time_slot_settings=json.dumps({}),
        study_subjects=json.dumps(sorted(subjects)),
        theme='academic',
        revision_settings=json.dumps({
            'show_progress': True,
            'auto_color_subjects': True,
            'study_timer': True,
            'break_reminders': True,
            'difficulty_tracking': True
        }),
        notes_data=json.dumps({
            'general': '',
            'study': '',
            'todos': []
        }),
        study_time_data=json.dumps({
            'totalTimeAllTime': 0,
            'lastSessionDate': None
        }),
        color_library=json.dumps([])
    )

    db.session.add(timetable)
    db.session.commit()

    log_entry.update({
        'status': 'success',
        'payload_text': payload_text,
        'parsed_lessons': parsed_lessons,
        'timetable_id': timetable.id,
        'ordered_days': ordered_days,
        'row_headers': [row['label'] for row in ordered_rows],
        'attempt_count': len(log_entry.get('attempts', []))
    })
    log_id = _persist_gemini_log(log_entry)

    return jsonify({
        'success': True,
        'id': timetable.id,
        'name': timetable.name,
        'log_id': log_id or None
    })

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('index'))


###################
### Chat Server ###
###################

# Directory to store uploaded images
image_upload_dir = 'static/uploads'
os.makedirs(image_upload_dir, exist_ok=True)

# SQLite database file
db_file = 'chat.db'

# Initialize SQLite database
def init_db():
    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                profilePic TEXT,
                message TEXT NOT NULL,
                image TEXT,
                reactions TEXT,
                time TEXT NOT NULL
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                bio TEXT DEFAULT '', -- Add bio column
                profilePic TEXT DEFAULT '' -- Add profilePic column
            )
        ''')
        conn.commit()

init_db()

# Save a message to the database
def save_message_to_db(username, profilePic, message, image):
    with sqlite3.connect(db_file) as conn:
        current_time = datetime.now().strftime('%H:%M')
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO messages (username, profilePic, message, image, reactions, time)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (username, profilePic, message, image, '', current_time))
        conn.commit()
        return cursor.lastrowid

# Load all messages from the database
def load_messages_from_db():
    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM messages ORDER BY id')
        rows = cursor.fetchall()
        # Reverse the order before sending to the client
        return [
            {'id': row[0], 'username': row[1], 'profilePic': row[2], 'message': row[3], 'image': row[4], 'reactions': row[5], 'time': row[6]}
            for row in (rows)
        ]

# Route to serve the chat page
@app.route('/chat')
def chat():
    return render_template('chat.html')

@app.route('/privatechat')
def private_chat():
    return render_template('private_chat.html')

@app.route('/sh')
def sh():
    return render_template('sh.html')

@app.route('/admin')
def admin():
    return render_template('admin.html')

@app.route('/surf')
def ss():
    return render_template('game.html')

@app.route('/fps')
def fps():
    return render_template('fps.html')

@app.route('/whiteboard')
def whiteboard():
    return render_template('whiteboard.html')

@app.route('/pictionary')
def pictionary():
    return render_template('pictionary.html')

# Socket.IO events
#@socketio.on('connect')
#def handle_connect():
    #print('A user connected')

#@socketio.on('disconnect')
#def handle_disconnect():
    #print('A user disconnected')

@socketio.on('edit_message')
def handle_edit_message(data):
        message_id = data.get('id')
        new_message = data.get('message')

        with sqlite3.connect(db_file) as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE messages SET message = ? WHERE id = ?', (new_message, message_id))
            conn.commit()

        # Broadcast the updated message to all clients
        emit('update_message', {'id': message_id, 'message': f"{new_message} (edited)"}, broadcast=True)



@socketio.on('delete_message')
def handle_delete_message(data):
        message_id = data.get('id')

        with sqlite3.connect(db_file) as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM messages WHERE id = ?', (message_id,))
            conn.commit()

        # Broadcast the removal of the message to all clients
        emit('remove_message', {'id': message_id}, broadcast=True)

@socketio.on('load_private_messages')
def handle_load_private_messages(data):
        room = data.get('room')
        time = datetime.now().strftime('%H:%M')
        if room:
            with sqlite3.connect(db_file) as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT * FROM messages WHERE room = ? ORDER BY id ASC', (room,))
                rows = cursor.fetchall()
                messages = [
                    {'id': row[0], 'username': row[1], 'profilePic': row[2], 'message': row[3], 'image': row[4], 'reactions': row[5], time: row[6]}
                    for row in rows
                ]
            emit('load_private_messages', messages, room=room)

@socketio.on('start_typing')
def handle_start_typing(data):
    username = data.get('username')
    if username and username in online_users:
        print(f"{username} started typing")
        online_users[username]['isTyping'] = True
        emit('update_online_users', [{'username': user, 'isTyping': info['isTyping']} for user, info in online_users.items()], broadcast=True)

@socketio.on('stop_typing')
def handle_stop_typing(data):
    username = data.get('username')
    if username and username in online_users:
        print(f"{username} stopped typing")
        online_users[username]['isTyping'] = False
        emit('update_online_users', [{'username': user, 'isTyping': info['isTyping']} for user, info in online_users.items()], broadcast=True)

@socketio.on('send_message')
def handle_send_message(data):
    username = data.get('username')
    profilePic = data.get('profilePic', '')
    message = data.get('message')
    image = data.get('image', '')

    # Save the message to the database
    message_id = save_message_to_db(username, profilePic, message, image)

    # Check if Word Chain is active and use the word to play the game
    if word_chain.get('active', 0) == 1:
        if message == '/endwordchain':
            word_chain['active'] = 0
            word_chain['last_word'] = None
            word_chain['used_words'].clear()
            emit('receive_message', {
                'username': 'Server',
                'profilePic': '',
                'message': f"{username} has ended the Word Chain game.",
                'image': '',
                'reactions': '',
                'time': datetime.now().strftime('%H:%M')
            }, broadcast=True)
            return
        print("Word Chain game active")
        word = message.lower()
        if word_chain['last_word'] and word[0] != word_chain['last_word'][-1]:
            emit('word_chain_invalid', {'message': 'Invalid word!'}, room=request.sid)
            emit('receive_message', {
                'username': 'Server',
                'profilePic': '',
                'message': f"Invalid word by {username}: {word}",
                'image': '',
                'reactions': '',
                'time': datetime.now().strftime('%H:%M')
            }, broadcast=True)
        elif word in word_chain['used_words']:
            emit('word_chain_invalid', {'message': 'Word already used!'}, room=request.sid)
            emit('receive_message', {
                'username': 'Server',
                'profilePic': '',
                'message': f"Word already used by {username}: {word}",
                'image': '',
                'reactions': '',
                'time': datetime.now().strftime('%H:%M')
            }, broadcast=True)
        else:
            word_chain['last_word'] = word
            word_chain['used_words'].add(word)
            emit('word_chain_update', {'word': word, 'username': username}, broadcast=True)
            emit('receive_message', {
                'username': username,
                'profilePic': profilePic,
                'message': message,
                'image': image,
                'reactions': '',
                'time': datetime.now().strftime('%H:%M')
            }, broadcast=True)

    # Broadcast the message to all connected clients
    emit('receive_message', {
        'id': message_id,
        'username': username,
        'profilePic': profilePic,
        'message': message,
        'image': image,
        'reactions': '',
        'time': datetime.now().strftime('%H:%M')
    }, broadcast=True)



@socketio.on('connect')
def handle_connect():
    print('A user connected')
    # Emit all messages to the newly connected client
    emit('load_messages', load_messages_from_db(), broadcast=False)

@socketio.on('login')
def handle_login(data):
    username = data.get('username')
    print(f"Login attempt: {username}")
    password = data.get('password')

    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE username = ? AND password = ?', (username, password))
        user = cursor.fetchone()

    if user:
        emit('login_success', username)  # Emit the username
    else:
        print(f"Login failed for: {username}")
        emit('login_failure', {'message': 'Invalid username or password'})

@socketio.on('register')
def handle_register(data):
    username = data.get('username')
    password = data.get('password')

    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()

        if user:
            emit('register_failure', {'message': 'Username already exists'})
        else:
            cursor.execute('INSERT INTO users (username, password) VALUES (?, ?)', (username, password))
            conn.commit()
            emit('register_success', {'message': 'Registration successful', 'username': username})
# Track online users
online_users = {}

@socketio.on('join')
def handle_join(data):
    
    username = data.get('username')  # Get the username from the client
    print(f"Join event received for: {username}")
    if username:
        print(f"{username} has come online")  # Debugging: Print the username
        online_users[username] = {'isTyping': False}

        # Add the user to their own private room
        join_room(username)
        print(f"{username} has joined their private room.")  # Debugging: Confirm room join

        # Notify all clients about the updated online users
        emit('update_online_users', [{'username': user, 'isTyping': info['isTyping']} for user, info in online_users.items()], broadcast=True)
        
@socketio.on('leave')
def handle_leave(data):
    username = data.get('username')
    if username and username in online_users:
        print(f"{username} has went offline")
        del online_users[username]
        emit('update_online_users', [{'username': user, 'isTyping': info['isTyping']} for user, info in online_users.items()], broadcast=True)

@socketio.on('get_user_data')
def handle_get_user_data(data):
    username = data.get('username')
    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT bio, profilePic FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
        if user:
            emit('user_data', {'bio': user[0], 'profilePic': user[1]})

@socketio.on('refresh_clients')
def handle_refresh_clients():
    # Broadcast the refresh event to all connected clients
    print("refreshing clients..")
    emit('test_event', {'message': 'Test event triggered'}, broadcast=True)
    emit('refresh_page', broadcast=True)

@socketio.on('update_user_data')
def handle_update_user_data(data):
    username = data.get('username')
    bio = data.get('bio', '')
    profilePic = data.get('profilePic', '')

    # Save the updated bio and profile picture to the database
    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET bio = ?, profilePic = ? WHERE username = ?', (bio, profilePic, username))
        conn.commit()

    # Broadcast the updated profile picture to all connected clients
    emit('profile_pic_updated', {'username': username, 'profilePic': profilePic}, broadcast=True)

@socketio.on('add_reaction')
def handle_add_reaction(data):
    message_id = data.get('id')
    reaction = data.get('reaction')

    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT reactions FROM messages WHERE id = ?', (message_id,))
        row = cursor.fetchone()
        if row:
            reactions = row[0] or ''
            reactions += f' {reaction}'
            cursor.execute('UPDATE messages SET reactions = ? WHERE id = ?', (reactions.strip(), message_id))
            conn.commit()

    print(reactions)

    # Broadcast the updated reactions to all clients
    socketio.emit('update_reactions', {
    'id': message_id,
    'reactions': reactions.strip()
})
    print(f"Reactions updated for message ID {message_id}: {reactions.strip()}")

# In-memory storage for chess games
chess_games = {}

@socketio.on('join_chess')
def handle_join_chess(data):
    username = data.get('username')
    room = data.get('room', 'chess_room')  # Default room for chess
    print(f"{username} has joined the chess game in room {room}")
    join_room(room)

    if room not in chess_games:
        chess_games[room] = {
            'players': [],
            'moves': [],
            'turn': 'white',  # White moves first
        }

    # Check if the player is already in the game
    if username in chess_games[room]['players']:
        emit('chess_joined', {'username': username, 'color': 'white' if chess_games[room]['players'][0] == username else 'black'}, room=room)
        return

    # Add the player if there's room
    if len(chess_games[room]['players']) < 2:
        chess_games[room]['players'].append(username)
        color = 'white' if len(chess_games[room]['players']) == 1 else 'black'
        emit('chess_joined', {'username': username, 'color': color}, room=room)

        # Start the game if two players have joined
        if len(chess_games[room]['players']) == 2:
            emit('chess_start', {'players': chess_games[room]['players'], 'turn': chess_games[room]['turn']}, room=room)
    else:
        emit('chess_full', {'message': 'The game is full. Please wait for the next round.'}, to=request.sid)
        
@socketio.on('chess_move')
def handle_chess_move(data):
    room = data.get('room', 'chess_room')
    move = data.get('move')  # Example: {'from': 'e2', 'to': 'e4'}

    if room in chess_games:
        chess_games[room]['moves'].append(move)
        chess_games[room]['turn'] = 'black' if chess_games[room]['turn'] == 'white' else 'white'
        emit('chess_update', {'move': move, 'turn': chess_games[room]['turn']}, room=room)

@socketio.on('leave_chess')
def handle_leave_chess(data):
    username = data.get('username')
    room = data.get('room', 'chess_room')
    print(f"{username} has left the chess game in room {room}")
    if room in chess_games and username in chess_games[room]['players']:
        chess_games[room]['players'].remove(username)
        emit('chess_player_left', {'username': username}, room=room)

        # Reset the game if all players leave
        if not chess_games[room]['players']:
            del chess_games[room]

# In-memory database for private messages
private_messages = {}

@socketio.on('private_message')
def handle_private_message(data):
    sender = data.get('username')  # Ensure the sender's username is included in the data
    recipient = data.get('recipient')
    message = data.get('message')
    print(f"Private message from {sender} to {recipient}: {message}")

    if sender and recipient and message:
        # Save the message in memory
        if recipient not in private_messages:
            private_messages[recipient] = []
        private_messages[recipient].append({'sender': sender, 'message': message})

        # Emit the message to the recipient
        emit('receive_private_message', {'sender': sender, 'message': message}, room=recipient)

        # Ensure the sender is in the room for acknowledgment
        join_room(sender)

    

@socketio.on('join_rps')
def handle_join_rps(data):
        username = data.get('username')
        print(f"{username} has joined the RPS game")
        if username:
            if 'rps_game' not in globals():
                global rps_game
                rps_game = {'players': [], 'choices': {}}

            

            if len(rps_game['players']) < 2:
                rps_game['players'].append(username)
                rps_game['choices'][username] = None
                join_room(username)  # Ensure the user joins their own room for communication
                if len(rps_game['players']) == 2:
                    player1, player2 = rps_game['players']
                    socketio.emit('rps_start', {'opponent': player2}, room=player1)
                    socketio.emit('rps_start', {'opponent': player1}, room=player2)
                else:
                    emit('rps_result', {'result': 'Waiting for another player to join...'})
                    message = username+' has joined rock paper scissors. Waiting for another player...'
                    save_message_to_db('Server', '', message, '')
                    if message:
                        emit('receive_message', {
                            'username': 'Server',
                            'profilePic': '',
                            'message': message,
                            'image': '',
                            'reactions': '',
                            'time': datetime.now().strftime('%H:%M')
                        }, broadcast=True)
            else:
                emit('rps_result', {'result': 'Game is full. Please wait for the next round.'})
                message = 'Rock paper scissors is now full. Please wait for the next round.'
                save_message_to_db('Server', '', message, '')
                if message:
                        emit('receive_message', {
                            'username': 'Server',
                            'profilePic': '',
                            'message': message,
                            'image': '',
                            'reactions': '',
                            'time': datetime.now().strftime('%H:%M')
                        }, broadcast=True)

@socketio.on('rps_choice')
def handle_rps_choice(data):
        username = data.get('username')
        choice = data.get('choice')
        if username in rps_game['players']:
            rps_game['choices'][username] = choice

            if all(rps_game['choices'].values()):
                player1, player2 = rps_game['players']
                choice1, choice2 = rps_game['choices'][player1], rps_game['choices'][player2]

                if choice1 == choice2:
                    result = "It's a tie!"
                elif (choice1 == 'rock' and choice2 == 'scissors') or \
                     (choice1 == 'scissors' and choice2 == 'paper') or \
                     (choice1 == 'paper' and choice2 == 'rock'):
                    result = f"{player1} wins!"
                    serverresult = f"{player1}"
                else:
                    result = f"{player2} wins!"
                    serverresult = f"{player2}"

                socketio.emit('rps_result', {'result': result}, room=player1)
                socketio.emit('rps_result', {'result': result}, room=player2)

                # Reset the game for the next round
                rps_game['players'] = []
                rps_game['choices'] = {}

                # Notify all players that the game is over
                message = f'The current Rock Paper Scissors game is over. \n{serverresult} won. \nYou may join the next round.'
                username = 'Server'
                profilePic = ''
                image = ''
                # Save the message to the database
                save_message_to_db(username, profilePic, message, image)
                if message:
                    emit('receive_message', {
                        'username': 'Server',
                        'profilePic': '',
                        'message': message,
                        'image': '',
                        'reactions': ''
                    }, broadcast=True)

@socketio.on('broadcast_message')
def handle_broadcast_message(data):
    """
    Broadcast a message to all connected clients.
    """
    message = data.get('message', 'Server Message')
    username = data.get('username', 'SERVER')  # Default to 'Server' if no username is provided
    profile_pic = data.get('profilePic', '')  # Optional profile picture

    # Emit the message to all clients
    emit('receive_message', {
        'id': None,  # You can generate an ID if needed
        'username': username,
        'profilePic': profile_pic,
        'message': message,
        'image': None,  # No image for server messages
        'reactions': ''
    }, broadcast=True)

@socketio.on('leave_rps')
def handle_leave_rps(data):
        username = data.get('username')
        if username in rps_game['players']:
            rps_game['players'].remove(username)
            del rps_game['choices'][username]
            socketio.emit('rps_result', {'result': f"{username} left the game. Game canceled."}, to='/')

# Mute and Unmute
@socketio.on('mute_user')
def handle_mute_user(data):
    username = data.get('username')
    if username:
        print(f"{username} has been muted")
        # Broadcast to all clients that the user is muted
        emit('user_muted', {'username': username}, broadcast=True)

@socketio.on('admin_fetch_messages')
def handle_admin_fetch_messages():
    messages = load_messages_from_db()
    emit('admin_messages', messages)

@socketio.on('admin_fetch_users')
def handle_admin_fetch_users():
    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT username, bio, profilePic FROM users')
        rows = cursor.fetchall()
        users = [{'username': row[0], 'bio': row[1], 'profilePic': row[2]} for row in rows]
    emit('admin_users', users)

@socketio.on('admin_fake_message')
def handle_admin_fake_message(data):
    username = data.get('username')
    profilePic = data.get('profilePic', '')
    message = data.get('message')
    image = data.get('image', '')
    time = datetime.now().strftime('%H:%M')

    # Save the message to the database
    message_id = save_message_to_db(username, profilePic, message, image)

    # Emit the fake message to all clients
    emit('receive_message', {
        'id': message_id,
        'username': username,
        'profilePic': profilePic,
        'message': message,
        'image': image,
        'reactions': '',
        'time': time
    }, broadcast=True)

@socketio.on('admin_edit_message')
def handle_admin_edit_message(data):
    message_id = data.get('id')
    new_message = data.get('message')
    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('UPDATE messages SET message = ? WHERE id = ?', (new_message, message_id))
        conn.commit()
    # Emit the updated message to all clients
    emit('update_message', {'id': message_id, 'message': f"{new_message}"}, broadcast=True)

@socketio.on('admin_delete_message')
def handle_admin_delete_message(data):
    message_id = data.get('id')
    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM messages WHERE id = ?', (message_id,))
        conn.commit()
    # Notify all clients about the deleted message
    emit('remove_message', {'id': message_id}, broadcast=True)

@socketio.on('admin_broadcast')
def handle_admin_broadcast(data):
        print("Admin broadcast initiated")
        print(data)
        alert_message = data.get('alert', 'Broadcast Alert')
        # Emit the broadcast alert to all connected clients
        emit('receive_alert', {'alert': alert_message}, broadcast=True)

@socketio.on('admin_refresh')
def handle_admin_broadcast(data):
        print("Admin refresh initiated")
        emit('receive_refresh', broadcast=True)

@socketio.on('admin_erase_chat')
def handle_admin_erase_chat():
    with sqlite3.connect(db_file) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM messages')
        conn.commit()
    # Notify all clients that the chat has been erased
    emit('admin_chat_erased', broadcast=True)

@socketio.on('join_tictactoe')
def handle_join_tictactoe(data):
    username = data.get('username')
    if 'tictactoe_game' not in globals():
        global tictactoe_game
        tictactoe_game = {
            'board': [''] * 9,
            'players': [],
            'currentPlayer': '',
            'isGameOver': False
        }

    if len(tictactoe_game['players']) < 2:
        tictactoe_game['players'].append(username)
        if len(tictactoe_game['players']) == 2:
            tictactoe_game['currentPlayer'] = tictactoe_game['players'][0]
            player1, player2 = tictactoe_game['players']
            socketio.emit('tictactoe_start', {'opponent': player2, 'isFirstPlayer': True}, room=player1)
            socketio.emit('tictactoe_start', {'opponent': player1, 'isFirstPlayer': False}, room=player2)
        else:
            emit('tictactoe_waiting', {'message': 'Waiting for another player to join...'})
    else:
        emit('tictactoe_full', {'message': 'Game is full. Please wait for the next round.'})

@socketio.on('tictactoe_move')
def handle_tictactoe_move(data):
    username = data.get('username')
    index = data.get('index')

    if tictactoe_game['isGameOver'] or tictactoe_game['board'][index] != '' or tictactoe_game['currentPlayer'] != username:
        return

    tictactoe_game['board'][index] = 'X' if tictactoe_game['currentPlayer'] == tictactoe_game['players'][0] else 'O'
    tictactoe_game['currentPlayer'] = tictactoe_game['players'][0] if tictactoe_game['currentPlayer'] == tictactoe_game['players'][1] else tictactoe_game['players'][1]

    socketio.emit('tictactoe_update', {
        'board': tictactoe_game['board'],
        'currentPlayer': tictactoe_game['currentPlayer']
    }, broadcast=True)

    winner = check_tictactoe_winner()
    if winner:
        tictactoe_game['isGameOver'] = True
        socketio.emit('tictactoe_game_over', {'winner': winner}, broadcast=True)
    elif all(cell != '' for cell in tictactoe_game['board']):
        tictactoe_game['isGameOver'] = True
        socketio.emit('tictactoe_game_over', {'winner': None}, broadcast=True)

def check_tictactoe_winner():
    winning_combinations = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],  # Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8],  # Columns
        [0, 4, 8], [2, 4, 6]              # Diagonals
    ]
    for combo in winning_combinations:
        a, b, c = combo
        if tictactoe_game['board'][a] == tictactoe_game['board'][b] == tictactoe_game['board'][c] and tictactoe_game['board'][a] != '':
            return tictactoe_game['board'][a]
    return None

# In-memory storage for whiteboard data
whiteboard_data = []
whiteboard_lock = threading.Lock()

@socketio.on('whiteboard_draw')
def handle_whiteboard_draw(data):
    # Broadcast drawing data to all clients
    emit('whiteboard_update', data, broadcast=True)

    # Save the drawing data to the in-memory database
    with whiteboard_lock:  # Ensure thread-safe access
        whiteboard_data.append(data)

@socketio.on('save_whiteboard')
def handle_save_whiteboard():
    # This event is triggered to ensure the whiteboard is saved
    emit('whiteboard_saved', {'message': 'Whiteboard saved successfully'}, broadcast=True)

@socketio.on('load_whiteboard')
def handle_load_whiteboard():
    with whiteboard_lock:  # Ensure thread-safe access
        emit('whiteboard_data', whiteboard_data, broadcast=False)

# Track active cursors
active_cursors = {}

@socketio.on('cursor_position')
def handle_cursor_position(data):
    user_id = data.get('id')
    position = data.get('position')
    if user_id and position:
        active_cursors[user_id] = position
        emit('cursor_update', {'id': user_id, 'position': position}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    user_id = request.sid  # Use the session ID as the unique user ID
    if user_id in active_cursors:
        del active_cursors[user_id]
        socketio.emit('cursor_disconnect', {'id': user_id}, broadcast=True)

    _handle_pictionary_disconnect(user_id)

@socketio.on('whiteboard_mouseup')
def handle_whiteboard_mouseup(data):
    # Save the whiteboard data automatically on mouseup
    with whiteboard_lock:  # Ensure thread-safe access
        whiteboard_data.append(data)
    emit('whiteboard_saved', {'message': 'Whiteboard saved successfully'}, broadcast=True)

@socketio.on('undo_whiteboard')
def handle_undo_whiteboard():
    # Remove the last drawing action from the in-memory database
    with whiteboard_lock:  # Ensure thread-safe access
        if whiteboard_data:
            whiteboard_data.pop()

    # Broadcast the updated whiteboard data to all clients
    emit('whiteboard_data', whiteboard_data, broadcast=True)
    
@socketio.on('anonymous_message')
def handle_anonymous_message(data):
    message = data.get('message')
    username = 'Anonymous'
    profilePic = ''
    image = ''
    time = datetime.now().strftime('%H:%M')
    # Save the message to the database
    save_message_to_db(username, profilePic, message, image)
    if message:
        emit('receive_message', {
            'username': 'Anonymous',
            'profilePic': '',
            'message': message,
            'image': '',
            'reactions': '',
            'time': datetime.now().strftime('%H:%M')
        }, broadcast=True)

@socketio.on('chess_move')
def handle_chess_move(data):
    # Broadcast the move to the opponent
    emit('chess_update', data, room=data.get('room'))

@socketio.on('load_more_messages')
def handle_load_more_messages(data):
    limit = data.get('limit', 20)  # Default to 20 messages
    offset = data.get('offset', 0)  # Default to 0 (no offset)
    messages = load_messages_from_db(limit=limit, offset=offset)
    emit('load_more_messages', messages)

# Polls

# In-memory storage for polls
polls = {}

@socketio.on('create_poll')
def handle_create_poll(data):
    poll_id = len(polls) + 1
    polls[poll_id] = {
        'question': data['question'],
        'options': {option: 0 for option in data['options']},
        'creator': data['creator']
    }
    emit('poll_created', {'poll_id': poll_id, 'poll': polls[poll_id]}, broadcast=True)

@socketio.on('vote_poll')
def handle_vote_poll(data):
    poll_id = data['poll_id']
    option = data['option']
    if poll_id in polls and option in polls[poll_id]['options']:
        polls[poll_id]['options'][option] += 1
        emit('poll_updated', {'poll_id': poll_id, 'poll': polls[poll_id]}, broadcast=True)

# Mini-Games

# Word Chain

# In-memory storage for word chain
word_chain = {'last_word': None, 'used_words': set()}

@socketio.on('word_chain')
def handle_word_chain(data):
    word = data['word'].lower()
    if word_chain['last_word'] and word[0] != word_chain['last_word'][-1]:
        emit('word_chain_invalid', {'message': 'Invalid word!'}, room=request.sid)
    elif word in word_chain['used_words']:
        emit('word_chain_invalid', {'message': 'Word already used!'}, room=request.sid)
    else:
        word_chain['last_word'] = word
        word_chain['used_words'].add(word)
        emit('word_chain_update', {'word': word, 'username': data['username']}, broadcast=True)

@socketio.on('start_wordchain')
def handle_start_wordchain(data):
    print("Starting Word Chain game")
    username = data.get('username')
    word_chain['last_word'] = None
    word_chain['used_words'] = set()
    emit('receive_message', {
        'username': 'Server',
        'message': f"{username} has started a Word Chain game! Type a word to play.",
        'profilePic': '',
        'time': datetime.now().strftime('%H:%M')
    }, broadcast=True)
    word_chain['active'] = 1

# Pictionary

GUESSER_POINTS = 10
DRAWER_POINTS = 5

pictionary = {
    'current_word': None,
    'drawer': None,
    'guesses': [],
    'round_active': False,
}

pictionary_players = []
pictionary_difficulty = 'easy'  # Default difficulty
game_in_progress = False
end_game_votes = set()


def _get_player_by_username(username):
    for player in pictionary_players:
        if player['username'] == username:
            return player
    return None


def _serialize_pictionary_players():
    return [
        {
            'username': player['username'],
            'ready': player.get('ready', False),
            'isHost': player.get('isHost', False),
            'isDrawing': player.get('isDrawing', False),
            'points': player.get('points', 0)
        }
        for player in pictionary_players
    ]


def _broadcast_player_state():
    socketio.emit('update_players', _serialize_pictionary_players(), broadcast=True)


def _reset_round_state():
    pictionary['current_word'] = None
    pictionary['drawer'] = None
    pictionary['round_active'] = False
    pictionary['guesses'] = []


def _eligible_players():
    eligible = [player for player in pictionary_players if player.get('ready', False)]
    return eligible or pictionary_players[:]


def _select_next_drawer():
    eligible = _eligible_players()
    if not eligible:
        return None

    previous_drawer = pictionary.get('drawer')
    usernames = [player['username'] for player in eligible]

    if previous_drawer in usernames:
        current_index = usernames.index(previous_drawer)
        next_index = (current_index + 1) % len(usernames)
        return eligible[next_index]

    return eligible[0]


def _schedule_new_round(delay=5):
    def _task():
        socketio.sleep(delay)
        if game_in_progress:
            start_new_round()

    socketio.start_background_task(_task)


def _final_scores_payload():
    return [
        {'username': player['username'], 'totalPoints': player.get('points', 0)}
        for player in pictionary_players
    ]


def _award_points_on_correct_guess(guesser_username):
    round_scores = []
    guesser = _get_player_by_username(guesser_username)
    if guesser:
        guesser['points'] = guesser.get('points', 0) + GUESSER_POINTS
        round_scores.append({
            'username': guesser_username,
            'pointsEarned': GUESSER_POINTS,
            'totalPoints': guesser['points']
        })

    drawer_username = pictionary.get('drawer')
    if drawer_username and drawer_username != guesser_username:
        drawer_player = _get_player_by_username(drawer_username)
        if drawer_player:
            drawer_player['points'] = drawer_player.get('points', 0) + DRAWER_POINTS
            round_scores.append({
                'username': drawer_username,
                'pointsEarned': DRAWER_POINTS,
                'totalPoints': drawer_player['points']
            })

    return round_scores


def _end_game(reason=None):
    global game_in_progress
    if not game_in_progress:
        return

    game_in_progress = False
    _reset_round_state()
    end_game_votes.clear()

    for player in pictionary_players:
        player['isDrawing'] = False
        player['ready'] = False

    if reason:
        socketio.emit('pictionary_system_message', {'message': reason}, broadcast=True)

    socketio.emit('game_ended', {'scores': _final_scores_payload()}, broadcast=True)
    _broadcast_player_state()


def _handle_pictionary_disconnect(sid):
    disconnected_player = next((player for player in pictionary_players if player.get('sid') == sid), None)
    if not disconnected_player:
        return

    username = disconnected_player['username']
    was_host = disconnected_player.get('isHost', False)
    was_drawer = pictionary.get('drawer') == username

    pictionary_players.remove(disconnected_player)
    end_game_votes.discard(username)

    if not pictionary_players:
        _end_game('All players left the game.')
        return

    if was_host:
        pictionary_players[0]['isHost'] = True
        socketio.emit('assign_host', {'isHost': True}, room=pictionary_players[0].get('sid'))

    if was_drawer and game_in_progress:
        pictionary['round_active'] = False
        socketio.emit(
            'pictionary_system_message',
            {'message': f"{username} (the drawer) disconnected. Selecting a new drawer."},
            broadcast=True
        )
        _broadcast_player_state()
        _schedule_new_round(delay=1)
    else:
        _broadcast_player_state()


def _is_current_drawer_sid(sid):
    drawer_username = pictionary.get('drawer')
    if not drawer_username:
        return False
    player = next((entry for entry in pictionary_players if entry.get('sid') == sid), None)
    return bool(player and player['username'] == drawer_username)


@socketio.on('join_pictionary')
def handle_join_pictionary(data):
    username = data.get('username')
    if not username:
        return

    existing_player = _get_player_by_username(username)
    if existing_player:
        existing_player['sid'] = request.sid
        existing_player.setdefault('points', 0)
        if not game_in_progress:
            existing_player['ready'] = False
        socketio.emit('pictionary_system_message', {'message': f"{username} rejoined the lobby."}, room=request.sid)
    else:
        is_host = len(pictionary_players) == 0
        new_player = {
            'username': username,
            'ready': False,
            'isHost': is_host,
            'isDrawing': False,
            'points': 0,
            'sid': request.sid
        }
        pictionary_players.append(new_player)

        if is_host:
            socketio.emit('assign_host', {'isHost': True}, room=request.sid)

        socketio.emit('pictionary_system_message', {'message': f"{username} joined the lobby."}, broadcast=True)

    _broadcast_player_state()


@socketio.on('ready_up')
def handle_ready_up(data):
    if game_in_progress:
        return

    username = data.get('username')
    ready = bool(data.get('ready'))
    player = _get_player_by_username(username)
    if not player:
        return

    player['ready'] = ready
    _broadcast_player_state()

    if pictionary_players and all(entry['ready'] for entry in pictionary_players):
        host_player = next((entry for entry in pictionary_players if entry.get('isHost')), None)
        if host_player:
            socketio.emit('game_ready_to_start', room=host_player.get('sid'))


def start_new_round():
    if not game_in_progress:
        return

    eligible_players = _eligible_players()
    if len(eligible_players) < 2:
        _end_game('Not enough players to continue the game.')
        return

    drawer_player = _select_next_drawer()
    if not drawer_player:
        socketio.emit('pictionary_system_message', {'message': 'Unable to select a drawer.'}, broadcast=True)
        return

    pictionary['current_word'] = generate_random_word()
    pictionary['drawer'] = drawer_player['username']
    pictionary['round_active'] = True
    pictionary['guesses'] = []

    for player in pictionary_players:
        player['isDrawing'] = player['username'] == pictionary['drawer']

    socketio.emit('new_round', {
        'drawer': pictionary['drawer'],
        'word': pictionary['current_word'],
        'difficulty': pictionary_difficulty
    }, broadcast=True)

    socketio.emit(
        'pictionary_system_message',
        {'message': f"New round started! {pictionary['drawer']} is drawing ({pictionary_difficulty} difficulty)."},
        broadcast=True
    )

    end_game_votes.clear()
    _broadcast_player_state()


@socketio.on('start_game')
def handle_start_game(data):
    global game_in_progress, pictionary_difficulty

    username = data.get('username')
    host_player = next((entry for entry in pictionary_players if entry.get('isHost')), None)

    if not host_player or host_player['username'] != username:
        return

    if game_in_progress:
        socketio.emit('game_error', {'message': 'Game already in progress'}, room=request.sid)
        return

    if len(pictionary_players) < 2:
        socketio.emit('game_error', {'message': 'Need at least two players to start the game'}, room=request.sid)
        return

    if not all(entry['ready'] for entry in pictionary_players):
        socketio.emit('game_error', {'message': 'Not all players are ready'}, room=request.sid)
        return

    requested_difficulty = (data.get('difficulty') or pictionary_difficulty).lower()
    allowed_difficulties = {'easy', 'medium', 'hard', 'extreme', 'custom'}
    if requested_difficulty in allowed_difficulties:
        pictionary_difficulty = requested_difficulty
        socketio.emit('difficulty_updated', {'difficulty': pictionary_difficulty}, broadcast=True)

    game_in_progress = True
    _reset_round_state()
    end_game_votes.clear()

    for player in pictionary_players:
        player['points'] = 0
        player['isDrawing'] = False

    socketio.emit('pictionary_system_message', {'message': 'Game starting!'}, broadcast=True)
    _broadcast_player_state()
    start_new_round()


@socketio.on('set_difficulty')
def handle_set_difficulty(data):
    global pictionary_difficulty

    username = data.get('username')
    difficulty = (data.get('difficulty') or '').lower()

    host_player = next((entry for entry in pictionary_players if entry.get('isHost')), None)
    if not host_player or host_player['username'] != username:
        return

    allowed_difficulties = {'easy', 'medium', 'hard', 'extreme', 'custom'}
    if difficulty not in allowed_difficulties:
        socketio.emit('game_error', {'message': 'Invalid difficulty selection'}, room=request.sid)
        return

    pictionary_difficulty = difficulty
    socketio.emit('difficulty_updated', {'difficulty': pictionary_difficulty}, broadcast=True)
    socketio.emit('pictionary_system_message', {
        'message': f"Difficulty set to {pictionary_difficulty}."
    }, broadcast=True)


@socketio.on('guess_pictionary')
def handle_guess_pictionary(data):
    if not game_in_progress or not pictionary.get('round_active'):
        return

    username = data.get('username')
    guess = (data.get('guess') or '').strip()

    if not username or not guess:
        return

    pictionary['guesses'].append({'username': username, 'guess': guess})

    if pictionary['current_word'] and guess.lower() == pictionary['current_word'].lower():
        pictionary['round_active'] = False
        round_scores = _award_points_on_correct_guess(username)

        socketio.emit('pictionary_correct', {'username': username}, broadcast=True)
        socketio.emit('receive_message', {
            'username': 'Server',
            'profilePic': '',
            'message': f"{username} guessed correctly! The word was: {pictionary['current_word']}",
            'time': datetime.now().strftime('%H:%M')
        }, broadcast=True)

        socketio.emit('round_end', {
            'word': pictionary['current_word'],
            'scores': round_scores
        }, broadcast=True)

        socketio.emit('clear_canvas', broadcast=True)
        _broadcast_player_state()
        _schedule_new_round()
    else:
        socketio.emit('pictionary_incorrect', {'username': username, 'guess': guess}, broadcast=True)


@socketio.on('vote_end_game')
def handle_vote_end_game(data):
    if not game_in_progress:
        return

    username = data.get('username')
    if not username or not _get_player_by_username(username):
        return

    end_game_votes.add(username)
    socketio.emit(
        'end_game_votes',
        {'votes': len(end_game_votes), 'total': len(_eligible_players())},
        broadcast=True
    )

    if len(end_game_votes) >= len(_eligible_players()):
        _end_game('All players voted to end the game.')


@socketio.on('round_timeout')
def handle_round_timeout(data):
    if not game_in_progress or not pictionary.get('round_active'):
        return

    pictionary['round_active'] = False
    word = pictionary.get('current_word') or 'Unknown'

    socketio.emit('pictionary_system_message', {
        'message': f"Time's up! The word was: {word}"
    }, broadcast=True)

    socketio.emit('round_end', {
        'word': word,
        'scores': []
    }, broadcast=True)

    _broadcast_player_state()
    _schedule_new_round()


@socketio.on('start_draw')
def handle_start_draw(data):
    if pictionary.get('round_active') and _is_current_drawer_sid(request.sid):
        socketio.emit('start_draw', data, broadcast=True, include_self=False)


@socketio.on('stop_draw')
def handle_stop_draw(data=None):
    if pictionary.get('round_active') and _is_current_drawer_sid(request.sid):
        socketio.emit('stop_draw', broadcast=True, include_self=False)


@socketio.on('draw')
def handle_draw(data):
    if pictionary.get('round_active') and _is_current_drawer_sid(request.sid):
        socketio.emit('draw', data, broadcast=True, include_self=False)


@socketio.on('fill')
def handle_fill(data):
    if pictionary.get('round_active') and _is_current_drawer_sid(request.sid):
        socketio.emit('fill', data, broadcast=True, include_self=False)


@socketio.on('undo_canvas')
def handle_undo_canvas():
    socketio.emit('undo_canvas', broadcast=True, include_self=False)


@socketio.on('clear_canvas')
def handle_clear_canvas():
    socketio.emit('clear_canvas', broadcast=True)


@socketio.on('draw_shape')
def handle_draw_shape(data):
    if pictionary.get('round_active') and _is_current_drawer_sid(request.sid):
        socketio.emit('draw_shape', data, broadcast=True, include_self=False)



def generate_random_word():
    # Predefined list of "easy" words
    easy_words = [
        "flower", "bridge", "ice cream cone", "ring", "diamond", "blanket", "bird", "bumblebee", "glasses", "girl",
        "grapes", "water", "dragon", "sheep", "float", "backpack", "mountains", "button", "roly poly/pill bug/doodle bug",
        "cherry", "bear", "island", "egg", "mitten", "leaf", "fork", "cookie", "lollipop", "frog", "star", "jacket",
        "square", "nose", "football", "crayon", "wheel", "triangle", "family", "knee", "cow", "candy", "branch", "ship",
        "rainbow", "grass", "cat", "bell", "zigzag", "jar", "spider", "kite", "duck", "zoo", "rock", "swimming pool",
        "beach", "window", "owl", "ghost", "house", "zebra", "pencil", "spider web", "sunglasses", "dog", "ear", "swing",
        "key", "shoe", "ï»¿airplane", "snail", "music", "bunny", "motorcycle", "cloud", "corn", "comb", "man", "Mickey Mouse",
        "door", "jail", "eyes", "smile", "bus", "beak", "horse", "snake", "pizza", "basketball", "carrot", "broom", "eye",
        "bed", "candle", "seashell", "cupcake", "king", "night", "feather", "computer", "bat", "ocean", "box", "helicopter",
        "ball", "pen", "face", "dream", "cube", "inchworm", "hand", "bounce", "hamburger", "legs", "slide", "dinosaur",
        "whale", "ladybug", "rabbit", "lion", "light", "popsicle", "elephant", "tree", "desk", "shirt", "chimney", "daisy",
        "spoon", "clock", "car", "sea", "tail", "feet", "hair", "mountain", "lizard", "milk", "moon", "line", "fish", "pants",
        "lips", "bracelet", "mouse", "hippo", "river", "neck", "turtle", "sea turtle", "Earth", "octopus", "monkey", "worm",
        "skateboard", "apple", "baby", "woman", "bee", "table", "ears", "bowl", "bunk bed", "coin", "pie", "finger",
        "caterpillar", "alligator", "coat", "bone", "book", "bike", "love", "arm", "crack", "cup", "giraffe", "fire", "kitten",
        "leg", "curl", "snowman", "flag", "angel", "heart", "purse", "doll", "pig", "cheese", "baseball", "oval", "butterfly",
        "balloon", "mouth", "crab", "fly", "hat", "bug", "ants", "hook", "circle", "ant", "bench", "starfish", "train", "head",
        "banana", "person", "bathroom", "bark", "nail", "drum", "bread", "stairs", "socks", "lamp", "alive", "monster",
        "suitcase", "rain", "plant", "camera", "rocket", "orange", "boat", "chicken", "pillow", "jellyfish", "boy", "lemon",
        "snowflake", "chair", "sun", "bow", "truck", "blocks", "robot"
    ]
    medium_words = [
        "feast", "tusk", "address", "tub", "goat", "pool", "day", "desk", "drawer", "strawberry", "empty", "music", "rat",
        "mail", "silverware", "nurse", "hero", "lawnmower", "sunglasses", "daddy longlegs", "go", "scale", "radish", "crib",
        "bathroom scale", "fairies", "heel", "cell phone", "motorcycle", "pipe", "wedge", "thermometer", "food", "pop",
        "dustpan", "zebra", "needle", "shipwreck", "paperclip", "state", "time", "corn dog", "towel", "dimple",
        "cheeseburger", "children", "constellation", "turkey", "tiger", "rocket", "dig", "ambulance", "banana split",
        "dragon", "dinner", "refrigerator", "hoof", "coast", "latitude", "piano", "fruit", "plate", "key", "harmonica",
        "lawn mower", "package", "broccoli", "unicorn", "cover", "class", "headband", "city", "map", "washing machine",
        "submarine", "stocking", "girlfriend", "vegetable", "campfire", "howl", "flamingo", "round", "hole", "cobra", "toe",
        "marshmallow", "movie theater", "wreath", "newspaper", "cobweb", "string", "dominoes", "drums", "black hole",
        "sleeping bag", "stump", "coyote", "ask", "quilt", "cheerleader", "subway", "homeless", "wall", "truck", "ladybug",
        "nut", "closed", "telephone", "full moon", "wheelbarrow", "mouse pad", "pan", "free", "potato", "chalk", "envelope",
        "see", "shape", "goldfish", "beehive", "blowfish", "elevator", "hula hoop", "aunt", "hospital", "oil", "cast",
        "popcorn", "snowflake", "shadow", "bike", "hot dog", "yarn", "corn", "celery", "cotton candy", "tricycle",
        "firefighter", "trip", "panda", "sword", "magnet", "garbage", "mailbox", "wave", "box", "stoplight", "eye patch",
        "cemetery", "chest", "dirt", "summer", "start", "scissors", "hotel", "penny", "sink", "step", "fanny pack",
        "bathtub", "stingray", "paint", "store", "organ", "table", "bagel", "candle", "lemon", "plank", "crumb", "floor",
        "braid", "curtains", "lid", "plug", "sandal", "kite", "anemone", "smile", "airport", "twig", "pond", "angel",
        "carpet", "babysitter", "spool", "shopping cart", "ticket", "cockroach", "rake", "base", "sock", "toast",
        "electricity", "tail", "seesaw", "blue jeans", "puzzle", "clown", "fin", "safe", "wagon", "queen", "sidekick",
        "wrench", "hopscotch", "tooth", "tank", "cork", "lucky", "aircraft", "janitor", "escalator", "barn", "jacket",
        "lifejacket", "eel", "quadruplets", "doormat", "golf", "juice", "porthole", "clam", "frying pan", "pea", "cowboy",
        "chip", "slide", "drill", "helium", "shovel", "zoo", "crayon", "chess", "positive", "America", "hiss", "cricket",
        "honey", "shampoo", "scar", "picture frame", "skateboard", "banjo", "salt", "birthday", "eraser", "coal", "milk",
        "computer", "compass", "pickle", "strap", "maid", "hurdle", "suitcase", "pocket", "notepad", "growl", "teeth",
        "coil", "sailboat", "tip", "bib", "trophy", "three-toed sloth", "spider web", "locket", "swimming pool", "ship",
        "skunk", "toothbrush", "hot-air balloon", "cracker", "poodle", "cardboard", "crow", "t-shirt", "lip", "spot",
        "sleep", "trampoline", "solar system", "alarm clock", "banana peel", "cocoon", "sea turtle", "pail", "cucumber",
        "cook", "garage", "zookeeper", "ocean", "toaster", "pencil", "fang", "rice", "jungle", "dad", "orange", "peach",
        "faucet", "scarecrow", "rain", "quicksand", "glue", "roof", "garden", "watch", "graph", "bug spray", "monster",
        "mask", "list", "hammer", "fire hydrant", "jelly", "marry", "room", "nature", "circus", "extension cord", "curb",
        "puddle", "minivan", "iPad", "lock", "knot", "butcher", "sunflower", "attic", "barrel", "insect", "colored pencil",
        "rattle", "chef", "jet ski", "cape", "pinecone", "shower", "peck", "mud", "fax", "detective", "ping pong", "inch",
        "gate", "beach", "tulip", "rib", "surfboard", "spine", "blanket", "toilet paper", "globe", "letter", "pelican",
        "french fries", "molecule", "snowball", "kayak", "hairbrush", "narwhal", "pilot", "sushi", "tightrope", "stork",
        "log", "carousel", "castle", "pet", "cabin", "sprinkler", "anvil", "crater", "magic", "laundry basket", "elbow",
        "coat", "soup", "dress", "harp", "rhinoceros", "kiss", "cactus", "crust", "race car", "curtain", "eagle", "kettle",
        "volcano", "bubble", "knee", "rolly polly", "blimp", "stroller", "door", "parachuting", "cul-de-sac", "hook", "nest",
        "safety goggles", "chin", "flood", "manatee", "wick", "lightsaber", "yo-yo", "brain", "sponge", "contain",
        "gasoline", "save", "cheek", "magic carpet", "wax", "wreck", "fox", "salt and pepper", "back", "maze", "DVD",
        "printer", "page", "spear", "sleeve", "electrical outlet", "parachute", "kitchen", "squirt gun", "tape", "bottle",
        "coin", "flute", "nail", "draw", "baby", "ink", "pie", "window", "artist", "dog leash", "hippopotamus", "yacht",
        "desert", "oar", "brush", "dragonfly", "umbrella", "pineapple", "match", "bowtie", "black widow", "piranha",
        "bald eagle", "hair", "dump truck", "torch", "buggy", "platypus", "donkey", "paper clips", "vase", "skate",
        "forehead", "elephant", "snail", "reindeer", "school bus", "light switch", "oven", "unite", "password", "flagpole",
        "tower", "newlywed", "drumstick", "spell", "squirrel", "waterfall", "playground", "librarian", "cake", "neck",
        "screwdriver", "aquarium", "meteor", "ferry", "pulley", "pollution", "ceiling fan", "cave", "library", "read",
        "connect", "tissue", "pot", "curve", "field", "germ", "spoon", "quarter", "gum", "soda", "napkin", "ring",
        "windmill", "claw", "middle", "apologize", "church", "lake", "eclipse", "spaceship", "weight", "party",
        "ironing board", "starfish", "trumpet", "wheelchair", "lap", "outside", "purse", "jump", "popsicle", "mattress",
        "enter", "wooly mammoth", "restaurant", "storm", "bell", "happy", "mouse", "seaweed", "stapler", "smoke", "north",
        "hail", "video camera", "cello", "wrist", "rowboat", "wing", "fur", "meat", "mini blinds", "soap", "hummingbird",
        "mug", "ladder", "sheep", "onion", "stem", "television", "light bulb", "bus", "grandma", "spare", "baggage",
        "monkey", "saltwater", "grape", "zipper", "net", "roller blading", "easel", "pirate", "fishing pole", "bushes",
        "pantry", "apple pie", "beaver", "photograph", "porcupine", "railroad", "hug", "school", "wallet", "tuba", "pizza",
        "seashell", "lamp", "corner", "dock", "snowboarding", "boot", "mouth", "front porch", "collar", "cannon",
        "rainstorm", "pancake", "guitar", "face", "cougar", "prince", "horn", "porch", "lung", "wood", "thumb", "giant",
        "seed", "toy", "forest", "ribbon", "mold", "chimney", "frame", "crack", "blueprint", "museum", "waffle", "equator",
        "mitten", "half", "sack", "glass", "trash can", "doorknob", "pumpkin", "pitchfork", "melt", "throat", "cub",
        "necktie", "fern", "yardstick", "flashlight", "ski", "sail", "rainbow", "iron", "camera", "cash", "bucket",
        "shallow", "unicycle", "merry-go-round", "bell pepper", "corndog", "knight", "bagpipe", "whisk", "hen", "rock",
        "Ferris wheel", "bag", "garbage truck", "pine tree", "highway", "trunk", "scientist", "tent", "watering can",
        "muffin", "catfish", "vest", "propeller", "cliff", "hockey", "noon", "lipstick", "throne", "farmer", "clownfish",
        "frog", "root", "mailman", "jail", "coconut", "chart", "bakery", "hip", "fungus", "gold", "slope", "thief",
        "pillowcase", "battery", "gravity", "shark", "teapot", "gift", "hair dryer", "earmuffs", "baker", "bicycle", "jar",
        "island", "penguin", "mop", "hill", "swing", "snow", "chameleon", "soccer", "parka", "sit", "stove", "lighthouse",
        "shake", "mushroom", "crown", "TV", "sand", "notebook", "tongs", "leak", "windshield", "powder", "art", "hunter",
        "pinwheel", "horse", "ice", "park", "outer space", "stamp", "shelf", "sky", "fan", "gap", "open", "rope",
        "helicopter", "farm", "pretzel", "batteries", "lobster", "treasure", "spill", "pear", "sister", "backbone",
        "bacteria", "violin", "chocolate chip cookie", "stain", "present", "orphan", "timer", "stomach", "goose",
        "breakfast", "saw", "lunchbox", "saddle", "gumball", "spring", "jewelry", "sunset", "song", "college", "calendar",
        "deer", "target", "pogo stick", "canoe", "Jupiter", "tractor", "sneeze", "top hat", "tire", "gingerbread man",
        "pajamas", "doghouse", "cheetah", "teacher", "skirt", "neighbor", "paper", "newborn", "doctor", "magazine", "fist",
        "taxi", "belt", "baseball", "marker", "button", "east", "hourglass", "robin", "princess", "swim", "chain", "glove",
        "pen", "sidewalk", "plant", "seal", "run", "fork", "saxophone", "king", "rose", "muscle", "dollar", "tie",
        "trapeze", "astronaut", "third plate", "grill", "basket", "brick", "liquid", "stick", "tennis", "hurricane",
        "scarf", "river", "owl", "razor", "tongue", "road", "whistle", "tadpole", "waist", "sign", "goblin", "shade",
        "limousine", "rocking chair", "palace", "puppet", "bat", "pendulum", "bomb", "rug", "mirror", "straw", "deep",
        "drink", "family", "nun", "dolphin", "sunburn", "shoulder", "peanut", "trap", "well", "seahorse", "birthday cake",
        "paw", "money", "loaf", "cage", "worm"
    ]
    hard_words = [
        "jeans", "Heinz", "boulevard", "torch", "logo", "earthquake", "ticket", "wig", "dust bunny", "handle",
        "end zone", "macho", "barbershop", "toy store", "fireman pole", "ringleader", "glue gun", "chime", "competition",
        "cream", "university", "pigpen", "aircraft carrier", "coach", "chef", "clog", "pain", "parking garage", "tag",
        "edge", "rubber", "fortress", "gumball", "palace", "owner", "s'mores", "wedding cake", "staple", "hairspray",
        "grasslands", "diagonal", "saddle", "last", "dizzy", "plow", "humidity", "juggle", "fizz", "border", "religion",
        "quit", "newsletter", "swoop", "hot tub", "clique", "dodgeball", "cure", "airport security", "sash", "centimeter",
        "golf cart", "acrobat", "atlas", "skating rink", "tugboat", "peasant", "pet store", "vanilla", "sponge",
        "firefighter", "guarantee", "stage", "brand", "stationery", "fur", "landlord", "trombone", "sunrise", "testify",
        "vacation", "first class", "water cycle", "braid", "crow's nest", "wallow", "toddler", "heater", "shrew",
        "letter opener", "baguette", "parade", "cubicle", "zipper", "comfy", "groom", "ceiling fan", "fiddle", "freshman",
        "safe", "dent", "tin", "win", "car dealership", "imagine", "bride", "dryer sheets", "drip", "chess", "dress shirt",
        "beluga whale", "son-in-law", "violent", "sword swallower", "movie", "pilot", "yard", "best friend",
        "stutter", "tackle", "wobble", "mayor", "plastic", "laser", "junk", "correct", "foil", "nanny", "volleyball", "mast",
        "interception", "record", "runt", "concession stand", "tip", "servant", "thrift store", "dorsal", "snooze", "level",
        "expert", "invent", "economics", "bleach", "bedbug", "mirror", "trip", "cabin", "baggage", "yodel", "drain", "cowboy",
        "rib", "jaw", "pro", "downpour", "chariot", "elope", "deliver", "hipster", "rodeo", "cloak", "extension cord",
        "roller coaster", "pickup truck", "density", "pest", "homework", "carpenter", "commercial", "chariot racing",
        "cheerleader", "ivy", "softball", "bookend", "amusement park", "lung", "cot", "devious", "cockpit", "publisher",
        "page", "grandpa", "police", "wheelie", "prize", "quicksand", "bald", "hoop", "hovercraft", "cattle", "plank", "fog",
        "story", "mysterious", "taxes", "vehicle", "biscuit", "albatross", "sun block", "tide", "cable car", "punk", "produce",
        "chameleon", "download", "crane", "sleep", "soak", "drill bit", "trapped", "chisel", "customer", "wag", "gas station",
        "jazz", "back flip", "government", "dead end", "optometrist", "swarm", "chemical", "mat", "taxidermist", "hurdle",
        "advertisement", "loveseat", "blueprint", "mine", "birthday", "think", "engaged", "cliff diving", "propose", "pail",
        "irrigation", "manatee", "important", "peace", "yawn", "germ", "barber", "elf", "delivery", "somersault", "swing dancing",
        "team", "blush", "great-grandfather", "diver", "stuffed animal", "leather", "sneeze", "prime meridian", "hydrogen",
        "yak", "black belt", "rhythm", "clown", "sandbox", "ashamed", "sandpaper", "drawback", "sushi", "frost", "zoom",
        "check", "season", "taxi", "shrink ray", "rudder", "pile", "gold", "gown", "arcade", "world", "glitter", "driveway",
        "bobsled", "president", "cape", "lecture", "injury", "athlete", "toolbox", "bruise", "parent", "shack", "apathetic",
        "cruise ship", "van", "welder", "toothpaste", "time", "living room", "cuckoo clock", "ping pong", "shelter", "dream",
        "nap", "carnival", "cough", "steam", "molar", "seat", "cartoon", "tow truck", "ruby", "spare", "hang glider",
        "lipstick", "distance", "time machine", "hand soap", "speakers", "recycle", "headache", "half", "bonnet", "disc jockey",
        "vitamin", "thief", "script", "tiptoe", "baseboards", "fiance", "judge", "vein", "Internet", "musician", "putty",
        "stay", "art gallery", "roommate", "picnic", "cruise", "caviar", "edit", "macaroni", "tourist", "water buffalo",
        "haircut", "traffic jam", "salmon", "husband", "drive-through", "yardstick", "retail", "sheep dog", "dew", "applause",
        "ski lift", "clamp", "washing machine", "hospital", "factory", "drugstore", "lunar rover", "science", "photosynthesis",
        "avocado", "darts", "dawn", "drought", "telephone booth", "cliff", "coworker", "degree", "sunburn", "wrap", "tablespoon",
        "hour", "lunch tray", "earache", "icicle", "plantation", "goalkeeper", "sled", "pawn", "honk", "synchronized swimming",
        "student", "nightmare", "migrate", "receipt", "leak", "passenger", "sugar", "pharaoh", "reveal", "song", "character",
        "suit", "carat", "cherub", "sweater vest", "yacht", "mime", "chairman", "vegetarian", "hermit crab", "pocket", "startup",
        "cellar", "cheat", "banister", "fresh water", "scream", "robe", "lie", "country", "fabric", "koala", "crop duster",
        "jungle", "sticky note", "twist", "darkness", "tank", "wool", "spaceship", "oxcart", "gold medal", "rim", "puppet",
        "limit", "scuba diving", "runoff", "captain", "aunt", "quadrant", "crust", "shower curtain", "eighteen-wheeler", "wind",
        "geologist", "RV", "cardboard", "obey", "printer ink", "ornament", "cargo", "glue stick", "gasoline", "partner",
        "ratchet", "crime", "surround", "reservoir", "flock", "moth", "laundry detergent", "prey", "school", "videogame",
        "plumber", "ginger", "zoo", "ski goggles", "foam", "lullaby", "ream", "thaw", "front", "bookstore", "lumberyard",
        "lace", "double", "snag", "turtleneck", "Quidditch", "snore", "geyser", "coil", "crate", "print", "idea", "blizzard",
        "shampoo", "cello", "eraser", "trail", "dripping", "recess", "cell phone charger", "myth", "rind", "baby-sitter",
        "houseboat", "florist", "boxing", "hut", "midnight", "poison", "fireside", "stew", "tow", "cousin", "flu", "ounce",
        "landscape", "wax", "gallon", "learn", "goblin", "miner", "postcard", "professor", "knight", "carpet", "rut",
        "stopwatch", "fast food", "stage fright", "mascot", "grocery store", "stadium", "cleaning spray", "coastline", "right",
        "sap", "date", "calm", "mold", "monsoon", "kneel", "truck stop", "chestnut", "quartz", "full", "signal", "vet", "lance",
        "log-in", "pharmacist", "jigsaw", "password", "wooly mammoth", "stow", "omnivore", "neighborhood", "scuff mark",
        "cushion", "electrical outlet", "connection", "actor", "weather", "bargain", "oar", "thunder", "deep", "classroom",
        "fade", "exercise", "balance beam", "bulldog", "dashboard", "swamp", "boa constrictor", "chicken coop", "sweater",
        "dance", "hail", "post office", "organ", "lap", "dentist", "pizza sauce", "snarl", "point", "company", "tearful",
        "yolk", "catalog", "costume", "toll road", "CD", "beanstalk", "whisk", "chain mail", "Jedi", "compare", "vanish",
        "garden hose", "human", "conveyor belt", "raft", "flavor", "attack", "ditch", "orbit"
    ]
    extreme_words = [
        "castaway", "stowaway", "scatter", "rest stop", "con", "doubtful", "navigate", "diversify", "resourceful",
        "observatory", "philosopher", "danger", "today", "handful", "figment", "apparatus", "pride", "mine car", "zero",
        "cover", "name", "practice", "leap year", "gymnast", "population", "flight", "inquisition", "ornithologist",
        "infect", "digestion", "joke", "hay wagon", "sleet", "twang", "temper", "mortified", "addendum", "dictate",
        "income tax", "Everglades", "drift", "slump", "fake flowers", "sidekick", "quiver", "mooch", "stockholder",
        "eureka", "publisher", "discovery", "profit", "flutter", "climate", "fathom", "implode", "champion", "realm",
        "translate", "panic", "paranoid", "promise", "courthouse", "depth", "exhibition", "hypothermia", "insurance",
        "infection", "blueprint", "education", "voicemail", "hobby", "confide", "cloudburst", "ray", "rival", "first mate",
        "transpose", "blunt", "opinion", "vanquish", "try", "intern", "galaxy", "theory", "periwinkle", "blacksmith",
        "voice", "armada", "soul", "wasabi", "companion", "czar", "ironic", "channel", "reimbursement", "one-way street",
        "schedule", "brunette", "Zen", "guru", "regret", "interject", "debt", "loiterer", "Atlantis", "gallop", "telepathy",
        "offstage", "ice fishing", "index", "smidgen", "quarantine", "archaeologist", "parody", "ligament", "aftermath",
        "big bang theory", "reaction", "parley", "wormhole", "plot", "stranger", "gravel", "memory", "carat", "shame",
        "snag", "pastry", "landfill", "zip code", "stagecoach", "income", "opaque", "feeder road", "default", "forklift",
        "doubloon", "inertia", "turret", "soulmate", "consent", "rhyme", "friction", "haberdashery", "semester",
        "exponential", "cutlass", "disgust", "tribe", "preteen", "property", "wish", "bushel", "effect", "occupant",
        "writhe", "welder", "mayhem", "cause", "guess", "doppelganger", "fad", "mortal", "dud", "enemy", "community",
        "upgrade", "texture", "remain", "condition", "pelt", "steamboat", "credit", "compromise", "duvet", "sapphire",
        "tournament", "copyright", "error", "stun", "century", "fun", "trademark", "confidant", "punishment", "statement",
        "nutmeg", "deceive", "lyrics", "overture", "convenience store", "P.O. box", "dryer sheet", "fuel", "creator",
        "cartography", "layover", "junk drawer", "rainwater", "brainstorm", "random", "expired", "license", "rhythm",
        "emperor", "in-law", "wetlands", "altitude", "history", "sophomore", "jig", "crow's nest", "incisor", "doubt",
        "feeling", "sickle", "aristocrat", "siesta", "buccaneer", "whiplash", "fragment", "employee", "flotsam", "cubit",
        "tutor", "trawler", "destruction", "system", "clue", "demanding", "kilogram", "irrational", "villain", "knowledge",
        "password", "treatment", "vision", "time zone", "cartoonist", "representative", "Chick-fil-A", "gondola",
        "psychologist", "group", "inning", "admire", "grain", "riddle", "water vapor", "VIP", "standing ovation",
        "committee", "pen pal", "coast", "refund", "president", "good-bye", "food court", "interference", "cranium",
        "slam dunk", "prepare", "cramp", "tinting", "dugout", "emigrate", "decipher", "form", "cashier", "fowl", "protestant",
        "improve", "tug", "detail", "ma'am", "lichen", "hang ten", "pomp", "swag", "crisp", "positive", "problem", "chord",
        "destination", "comparison", "bed and breakfast", "zone defense", "reward", "ï»¿acoustics", "tattle", "stout",
        "crew", "dispatch", "title", "descendant", "freshwater", "risk", "chaos", "scalawag", "neutron", "steel drum",
        "stuff", "gentleman", "pawnshop", "wealth", "acre", "county fair", "silt", "language", "organization", "society",
        "fun house", "member", "retire", "hearse"
    ]
    if pictionary_difficulty == 'easy':
        return random.choice(easy_words)
    if pictionary_difficulty == 'medium':
        return random.choice(medium_words)
    if pictionary_difficulty == 'hard':
        return random.choice(hard_words)
    if pictionary_difficulty == 'extreme':
        return random.choice(extreme_words)
    if pictionary_difficulty == 'custom':
        return generate_custom_word()
    return random.choice(easy_words)

def generate_custom_word():
    # Read custom words from a JSON file
    try:
        with open('custom_words.json', 'r') as file:
            custom_words = json.load(file)
            return random.choice(custom_words)
    except (FileNotFoundError, json.JSONDecodeError):
        # Fallback to a predefined word if the file is missing or invalid
        return "default_word"

# Submit custom word
@socketio.on('submit_custom_word')
def handle_submit_custom_word(data):
    custom_word = data.get('custom_word')
    if custom_word:
        # Append the new word to the custom words list
        try:
            with open('custom_words.json', 'r+') as file:
                try:
                    custom_words = json.load(file)
                except json.JSONDecodeError:
                    custom_words = []
                custom_words.append(custom_word)
                file.seek(0)
                json.dump(custom_words, file)
        except FileNotFoundError:
            with open('custom_words.json', 'w') as file:
                json.dump([custom_word], file)

        emit('custom_word_submitted', {'status': 'success'}, broadcast=True)
    else:
        emit('custom_word_submitted', {'status': 'error'}, broadcast=True)

# Read Custom_Words File
def read_custom_words():
    try:
        with open('custom_words.json', 'r') as file:
            custom_words = json.load(file)
            return custom_words
    except (FileNotFoundError, json.JSONDecodeError):
        return []

if __name__ == '__main__':
    socketio.run(app, debug=True)