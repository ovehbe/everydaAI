package com.everydai.app.service

import android.app.Notification
import android.content.pm.ApplicationInfo
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.everydai.app.network.ServerApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.*

class NotificationListenerService : NotificationListenerService() {
    private val TAG = "NotificationListener"
    private lateinit var serverApi: ServerApi
    
    // List of packages to ignore
    private val ignoredPackages = setOf(
        "com.android.systemui",
        "android",
        "com.everydai.app" // Ignore our own notifications
    )
    
    override fun onCreate() {
        super.onCreate()
        serverApi = ServerApi(applicationContext)
        Log.d(TAG, "Notification listener service created")
    }
    
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        // Skip if notification is from a system app or an ignored package
        if (isSystemApp(sbn.packageName) || ignoredPackages.contains(sbn.packageName)) {
            return
        }
        
        Log.d(TAG, "Notification from: ${sbn.packageName}")
        
        // Get notification content
        val notification = sbn.notification ?: return
        val extras = notification.extras
        
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        
        // Skip empty notifications
        if (title.isEmpty() && text.isEmpty()) {
            return
        }
        
        // Generate a stable notification ID
        val notificationId = "${sbn.packageName}:${sbn.id}:${sbn.postTime}"
        
        // Process WhatsApp notifications specially
        if (sbn.packageName == "com.whatsapp") {
            processWhatsAppNotification(sbn, title, text)
        }
        
        // Send to server
        CoroutineScope(Dispatchers.IO).launch {
            serverApi.sendNotificationEvent(
                packageName = sbn.packageName,
                title = title,
                text = text,
                notificationId = notificationId
            )
        }
    }
    
    private fun processWhatsAppNotification(sbn: StatusBarNotification, title: String, text: String) {
        // Special handling for WhatsApp messages
        // This could extract the sender name, group name, etc.
        Log.d(TAG, "Processing WhatsApp notification: $title")
    }
    
    private fun isSystemApp(packageName: String): Boolean {
        return try {
            val appInfo = packageManager.getApplicationInfo(packageName, 0)
            (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
        } catch (e: Exception) {
            false
        }
    }
    
    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        // We could track removed notifications if needed
    }
    
    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.d(TAG, "Notification listener connected")
    }
    
    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.d(TAG, "Notification listener disconnected")
        
        // Request rebind
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            requestRebind(ComponentName(applicationContext, NotificationListenerService::class.java))
        }
    }
}
