package com.everydai.app.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import com.everydai.app.service.EverydAIService
import android.content.SharedPreferences
import android.preference.PreferenceManager
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    private val TAG = "BootReceiver"
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) {
            return
        }
        
        Log.d(TAG, "Device booted, checking if service should auto-start")
        
        // Check if service should auto-start (user preference)
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val autoStart = prefs.getBoolean("auto_start_on_boot", true)
        
        if (autoStart) {
            Log.d(TAG, "Starting everydAI service after boot")
            
            // Start the service
            val serviceIntent = Intent(context, EverydAIService::class.java)
            ContextCompat.startForegroundService(context, serviceIntent)
        }
    }
}
