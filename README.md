# everydAI

AI assistant managing phone calls, WhatsApp, SMS, and notifications on Android with server-side logic and AI integration.

## Overview

everydAI is a comprehensive system that integrates your Android device's communication channels with AI capabilities. It consists of:

1. **Android App**: Headless background service that captures calls, SMS, and notifications
2. **Server**: Node.js application managing communication and AI processing
3. **AI Integration**: Two-tier AI approach using OpenAI and xAI Grok
4. **WhatsApp Integration**: Group-based interface for controlling the AI
5. **Call Handling**: Twilio integration for call processing

## Key Features

- **Communication Monitoring**: Capture calls, SMS, and app notifications
- **Intelligent Filtering**: Two-tier AI approach - cheap filtering and full processing
- **WhatsApp Interface**: Control the AI through a WhatsApp group
- **Call Handling**: Answer, summarize, and process phone calls
- **Secure Communication**: Encrypted WebSocket for device-server connection
- **Dynamic Rules**: AI learns patterns to filter notifications and messages

## Directory Structure

```
everydAI/
├── android/               # Android headless app
│   └── app/
│       ├── src/          # App source code
│       └── build.gradle  # Android build config
├── server/               # Node.js server
│   ├── index.js          # Main server entry
│   ├── routes/           # API routes
│   ├── services/         # Core services
│   ├── handlers/         # Event handlers
│   ├── middleware/       # Express middleware
│   ├── utils/            # Utility functions
│   └── config/           # Configuration files
└── desktop/              # Electron desktop app
    ├── main.js           # Main process
    ├── preload.js        # Preload script
    ├── renderer.js       # Renderer process
    ├── index.html        # Main UI
    └── styles.css        # UI styles
```

## Setup Instructions

### Android App

1. Open the project in Android Studio
2. Update the server URL in `res/values/strings.xml`
3. Build the APK using Gradle
4. Install on your Android device
5. Launch the app and grant all required permissions
6. Configure server connection in settings
7. Start the background service

### Server

1. Install Node.js (v18+)
2. Clone this repository
3. Navigate to the server directory
4. Copy `env.example` to `.env` and configure:
   - OpenAI API key
   - xAI Grok API key (if available)
   - Twilio credentials
   - JWT secret
5. Install dependencies: `npm install`
6. Start the server: `npm start`

### WhatsApp Integration

1. Start the server
2. Watch for the QR code in the console
3. Scan with WhatsApp on your phone
4. Create a group named "everydAI" and add contacts
5. Send a message to the group to verify connection

### Desktop Helper

1. Install Electron globally: `npm install -g electron`
2. Navigate to the desktop directory
3. Install dependencies: `npm install`
4. Start the app: `npm start` or `electron .`
5. Login using your server credentials
6. Configure the server connection in settings

## Configuration Options

### Android App

- Server URL
- WebSocket URL
- Auto-start on boot
- Notification filtering level
- Background service options

### Server

- Port
- API keys
- Security settings
- Logging levels
- AI processing thresholds

## API Endpoints

- `/api/auth/*`: Authentication routes
- `/api/events/*`: Handle device events
- `/api/whatsapp/*`: WhatsApp integrations
- `/api/calls/*`: Call processing with Twilio
- `/api/ai/*`: AI processing endpoints

## Deployment

### Android App

- Build signed APK
- Distribute via Google Play or direct installation

### Server

- Deploy on VPS (DigitalOcean, AWS, etc.)
- Set up environment variables
- Use PM2 for process management
- Configure Nginx as reverse proxy
- Set up SSL with Let's Encrypt

## Security Notes

- All API endpoints are protected with JWT authentication
- WebSocket connections require authentication
- Sensitive data is encrypted in transit
- API keys are stored in environment variables
- User passwords are hashed using bcrypt

## License

This project is licensed under the MIT License.
