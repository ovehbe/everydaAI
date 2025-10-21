package com.everydai.app.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import com.everydai.app.MainActivity
import com.everydai.app.R
import com.everydai.app.network.ServerApi
import com.everydai.app.network.WebSocketManager
import kotlinx.coroutines.*
import java.util.concurrent.atomic.AtomicBoolean

class EverydAIService : LifecycleService() {
    
    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)
    private lateinit var webSocketManager: WebSocketManager
    private lateinit var serverApi: ServerApi
    
    companion object {
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "everydai_service_channel"
        private var isServiceRunning = AtomicBoolean(false)
        
        fun isRunning(context: Context): Boolean {
            return isServiceRunning.get()
        }
    }
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        
        // Initialize API client
        serverApi = ServerApi(applicationContext)
        
        // Initialize WebSocket
        webSocketManager = WebSocketManager(applicationContext)
        
        // Register listeners or observers as needed
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        
        startForeground(NOTIFICATION_ID, createNotification())
        isServiceRunning.set(true)
        
        // Connect to the server
        serviceScope.launch {
            try {
                webSocketManager.connect()
                // Send initialization data
                val deviceInfo = collectDeviceInfo()
                webSocketManager.send(deviceInfo)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        
        // Return sticky so service restarts if killed
        return Service.START_STICKY
    }
    
    private fun collectDeviceInfo(): String {
        // Collect basic device info to send to server
        // This would include device model, Android version, etc.
        return "{\"type\":\"init\",\"deviceModel\":\"${Build.MODEL}\",\"androidVersion\":\"${Build.VERSION.RELEASE}\"}"
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = getString(R.string.notification_channel_name)
            val descriptionText = getString(R.string.notification_channel_description)
            val importance = NotificationManager.IMPORTANCE_LOW
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = descriptionText
                setShowBadge(false)
            }
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun createNotification(): Notification {
        val pendingIntent: PendingIntent = Intent(this, MainActivity::class.java).let { notificationIntent ->
            PendingIntent.getActivity(
                this, 0, notificationIntent,
                PendingIntent.FLAG_IMMUTABLE
            )
        }
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.foreground_notification_title))
            .setContentText(getString(R.string.foreground_notification_text))
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        serviceJob.cancel()
        webSocketManager.disconnect()
        isServiceRunning.set(false)
    }
}
