# everydAI Deployment Guide

This guide provides detailed instructions for deploying the everydAI system in a production environment.

## Android App Deployment

### Building for Production

1. Open the project in Android Studio
2. Update the server URL in `android/app/src/main/res/values/strings.xml`:
   ```xml
   <string name="server_url">https://your-production-server.com</string>
   <string name="websocket_url">wss://your-production-server.com/ws</string>
   ```
3. Generate a signed APK:
   - Go to Build > Generate Signed Bundle/APK
   - Select APK and follow the wizard
   - Use your existing keystore or create a new one
   - Select release build variant
   - Finish the build

### Distribution

1. **Google Play Store**:
   - Create a developer account if you don't have one
   - Create a new application
   - Upload the signed APK
   - Complete store listing, content rating, etc.
   - Publish to the Play Store

2. **Direct Installation**:
   - Host the APK on a secure server
   - Share the download link
   - Enable "Install from unknown sources" on the target device
   - Download and install the APK

## Server Deployment

### Prerequisites

- VPS with Ubuntu 22.04 LTS (recommended)
- Node.js v18+ installed
- Nginx installed
- Domain name pointing to your server
- SSH access to the server

### Setting Up the Server

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/everydAI.git
   cd everydAI/server
   ```

2. Install dependencies:
   ```bash
   npm install --production
   ```

3. Create environment file:
   ```bash
   cp env.example .env
   nano .env
   ```
   
   Update the following variables:
   ```
   PORT=3000
   NODE_ENV=production
   JWT_SECRET=your_very_strong_random_secret_key
   OPENAI_API_KEY=your_openai_api_key
   XAI_GROK_API_KEY=your_xai_grok_api_key
   TWILIO_ACCOUNT_SID=your_twilio_account_sid
   TWILIO_AUTH_TOKEN=your_twilio_auth_token
   TWILIO_PHONE_NUMBER=your_twilio_phone_number
   WHATSAPP_SESSION_PATH=/path/to/persistent/storage/whatsapp-session
   CORS_ORIGIN=https://your-domain.com
   ```

4. Install PM2 for process management:
   ```bash
   npm install -g pm2
   ```

5. Create PM2 configuration:
   ```bash
   touch ecosystem.config.js
   nano ecosystem.config.js
   ```
   
   Add the following content:
   ```javascript
   module.exports = {
     apps: [{
       name: 'everydAI',
       script: 'index.js',
       instances: 1,
       autorestart: true,
       watch: false,
       max_memory_restart: '1G',
       env: {
         NODE_ENV: 'production'
       }
     }]
   };
   ```

6. Start the server with PM2:
   ```bash
   pm2 start ecosystem.config.js
   ```

7. Set up PM2 to start on boot:
   ```bash
   pm2 startup
   pm2 save
   ```

### Setting Up Nginx as Reverse Proxy

1. Create Nginx configuration:
   ```bash
   sudo nano /etc/nginx/sites-available/everydai
   ```
   
   Add the following content:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

2. Enable the site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/everydai /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

### Setting Up SSL with Let's Encrypt

1. Install Certbot:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. Get SSL certificate:
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

3. Set up auto-renewal:
   ```bash
   sudo systemctl status certbot.timer
   ```

### Setting up WhatsApp Web

1. Start the server and check logs:
   ```bash
   pm2 logs everydAI
   ```

2. When you see the QR code, scan it with WhatsApp on your phone
3. Make sure the session data is saved to the persistent storage path defined in the `.env` file

## Monitoring and Maintenance

1. Monitor server status:
   ```bash
   pm2 status
   pm2 monit
   ```

2. View logs:
   ```bash
   pm2 logs everydAI
   ```

3. Restart after updates:
   ```bash
   git pull
   npm install
   pm2 restart everydAI
   ```

4. Set up log rotation:
   ```bash
   sudo nano /etc/logrotate.d/pm2-everydai
   ```
   
   Add the following content:
   ```
   /home/yourusername/.pm2/logs/*.log {
       daily
       rotate 7
       compress
       delaycompress
       missingok
       notifempty
       create 0640 yourusername yourusername
   }
   ```

## Backup and Recovery

1. Set up regular backups of:
   - WhatsApp session data
   - Configuration files
   - User data and rules

2. Use a cron job for automated backups:
   ```bash
   0 2 * * * tar -czf /backup/everydai-$(date +\%Y\%m\%d).tar.gz /path/to/everydAI/server/config /path/to/persistent/storage/whatsapp-session
   ```

## Security Recommendations

1. Set up a firewall (UFW):
   ```bash
   sudo ufw allow ssh
   sudo ufw allow http
   sudo ufw allow https
   sudo ufw enable
   ```

2. Keep system and dependencies updated:
   ```bash
   sudo apt update
   sudo apt upgrade
   npm audit fix
   ```

3. Set up fail2ban to protect against brute force attacks

4. Consider using a stronger authentication method for API access

5. Regularly review server logs for suspicious activities

## Scaling Considerations

1. For higher loads, consider:
   - Increasing PM2 instances
   - Using a load balancer
   - Separating services (WhatsApp, AI, etc.) into different containers

2. Database integration:
   - Add MongoDB or PostgreSQL for storing user data, rules, and logs
   - Update the code to use database instead of file storage

## Troubleshooting

1. If WhatsApp disconnects frequently:
   - Check for proper handling of network changes
   - Ensure session storage is correctly configured
   - Consider using a different WhatsApp Web library

2. If AI responses are slow:
   - Check API rate limits
   - Consider implementing a caching mechanism
   - Optimize filtering thresholds

3. If the Android app stops working:
   - Check battery optimization settings
   - Verify permissions
   - Check WebSocket connection stability
