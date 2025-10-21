package com.everydai.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.everydai.app.databinding.ActivityMainBinding
import com.everydai.app.service.EverydAIService

class MainActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityMainBinding
    private val PERMISSIONS_REQUEST_CODE = 100
    
    private val requiredPermissions = arrayOf(
        Manifest.permission.READ_PHONE_STATE,
        Manifest.permission.CALL_PHONE,
        Manifest.permission.READ_CALL_LOG,
        Manifest.permission.READ_SMS,
        Manifest.permission.SEND_SMS,
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.INTERNET
    )
    
    // Permissions that require API level 26 (Oreo) or higher
    private val oreoAndAbovePermissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        arrayOf(Manifest.permission.ANSWER_PHONE_CALLS)
    } else {
        emptyArray()
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        binding.startServiceButton.setOnClickListener {
            checkAndRequestPermissions()
        }
        
        binding.settingsButton.setOnClickListener {
            // Open app settings for user to configure server URL, etc.
            // This would be a simple activity with preferences
        }
        
        binding.notificationPermissionButton.setOnClickListener {
            openNotificationListenerSettings()
        }
        
        // Update UI based on service status
        updateServiceStatus()
    }
    
    override fun onResume() {
        super.onResume()
        updateServiceStatus()
    }
    
    private fun updateServiceStatus() {
        val serviceRunning = EverydAIService.isRunning(this)
        binding.statusTextView.text = if (serviceRunning) "Service is running" else "Service is stopped"
        binding.startServiceButton.text = if (serviceRunning) "Stop Service" else "Start Service"
    }
    
    private fun checkAndRequestPermissions() {
        val permissionsToRequest = mutableListOf<String>()
        
        // Check standard permissions
        for (permission in requiredPermissions + oreoAndAbovePermissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                permissionsToRequest.add(permission)
            }
        }
        
        if (permissionsToRequest.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                permissionsToRequest.toTypedArray(),
                PERMISSIONS_REQUEST_CODE
            )
        } else {
            // All permissions granted, check notification access
            if (isNotificationServiceEnabled()) {
                toggleService()
            } else {
                openNotificationListenerSettings()
            }
        }
    }
    
    private fun toggleService() {
        if (EverydAIService.isRunning(this)) {
            stopService(Intent(this, EverydAIService::class.java))
        } else {
            ContextCompat.startForegroundService(this, Intent(this, EverydAIService::class.java))
        }
        updateServiceStatus()
    }
    
    private fun isNotificationServiceEnabled(): Boolean {
        val pkgName = packageName
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
        return flat != null && flat.contains(pkgName)
    }
    
    private fun openNotificationListenerSettings() {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
    
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        if (requestCode == PERMISSIONS_REQUEST_CODE) {
            var allGranted = true
            
            for (result in grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false
                    break
                }
            }
            
            if (allGranted) {
                // Check notification access
                if (isNotificationServiceEnabled()) {
                    toggleService()
                } else {
                    openNotificationListenerSettings()
                }
            } else {
                // Show dialog explaining why permissions are needed
                // Or guide the user to app settings
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                val uri = Uri.fromParts("package", packageName, null)
                intent.data = uri
                startActivity(intent)
            }
        }
    }
}
