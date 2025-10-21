package com.everydai.app.network

import android.content.Context
import android.util.Log
import com.everydai.app.R
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.*
import java.util.concurrent.TimeUnit

class ServerApi(private val context: Context) {
    private val TAG = "ServerApi"
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()
    
    private val gson = Gson()
    private val contentType = "application/json; charset=utf-8".toMediaType()
    
    // Base URL from resources
    private val baseUrl: String
        get() = context.getString(R.string.server_url)
    
    // Event types
    enum class EventType {
        CALL_INCOMING,
        CALL_ANSWERED,
        CALL_ENDED,
        SMS_RECEIVED,
        SMS_SENT,
        NOTIFICATION_RECEIVED
    }
    
    /**
     * Send event data to the server
     */
    suspend fun sendEvent(eventType: EventType, data: Map<String, Any>): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val eventData = mapOf(
                    "type" to eventType.name,
                    "timestamp" to Date().time,
                    "data" to data
                )
                
                val requestBody = gson.toJson(eventData).toRequestBody(contentType)
                val request = Request.Builder()
                    .url("$baseUrl/api/events")
                    .post(requestBody)
                    .build()
                
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        Log.e(TAG, "Failed to send event: ${response.code}")
                        return@withContext false
                    }
                    
                    return@withContext true
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error sending event", e)
                return@withContext false
            }
        }
    }
    
    /**
     * Send call data to the server
     */
    suspend fun sendCallEvent(phoneNumber: String, callType: EventType, duration: Int = 0, callId: String = UUID.randomUUID().toString()): Boolean {
        val data = mapOf(
            "phoneNumber" to phoneNumber,
            "duration" to duration,
            "callId" to callId
        )
        
        return sendEvent(callType, data)
    }
    
    /**
     * Send SMS data to the server
     */
    suspend fun sendSmsEvent(phoneNumber: String, messageBody: String, isReceived: Boolean): Boolean {
        val eventType = if (isReceived) EventType.SMS_RECEIVED else EventType.SMS_SENT
        
        val data = mapOf(
            "phoneNumber" to phoneNumber,
            "messageBody" to messageBody,
            "messageId" to UUID.randomUUID().toString()
        )
        
        return sendEvent(eventType, data)
    }
    
    /**
     * Send notification data to the server
     */
    suspend fun sendNotificationEvent(packageName: String, title: String, text: String, notificationId: String): Boolean {
        val data = mapOf(
            "packageName" to packageName,
            "appName" to getAppNameFromPackage(packageName),
            "title" to title,
            "text" to text,
            "notificationId" to notificationId
        )
        
        return sendEvent(EventType.NOTIFICATION_RECEIVED, data)
    }
    
    private fun getAppNameFromPackage(packageName: String): String {
        val pm = context.packageManager
        return try {
            pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
        } catch (e: Exception) {
            packageName
        }
    }
}
