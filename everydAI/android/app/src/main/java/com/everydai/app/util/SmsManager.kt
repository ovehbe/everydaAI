package com.everydai.app.util

import android.content.Context
import android.telephony.SmsManager
import android.util.Log
import com.everydai.app.network.ServerApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsManager(private val context: Context) {
    private val TAG = "SmsManager"
    private val serverApi = ServerApi(context)
    
    /**
     * Send an SMS message
     */
    fun sendSms(phoneNumber: String, message: String, callback: (Boolean) -> Unit) {
        try {
            val smsManager = context.getSystemService(SmsManager::class.java)
            
            // For long messages, divide the message
            val parts = smsManager.divideMessage(message)
            
            if (parts.size > 1) {
                // Send as multipart message
                smsManager.sendMultipartTextMessage(
                    phoneNumber,
                    null,
                    parts,
                    null,
                    null
                )
            } else {
                // Send as single message
                smsManager.sendTextMessage(
                    phoneNumber,
                    null,
                    message,
                    null,
                    null
                )
            }
            
            // Report success
            Log.d(TAG, "SMS sent to $phoneNumber")
            callback(true)
            
            // Notify server
            CoroutineScope(Dispatchers.IO).launch {
                serverApi.sendSmsEvent(
                    phoneNumber = phoneNumber,
                    messageBody = message,
                    isReceived = false
                )
            }
        } catch (e: Exception) {
            // Report failure
            Log.e(TAG, "Failed to send SMS", e)
            callback(false)
        }
    }
    
    /**
     * Read SMS messages from a specific sender
     */
    fun readSmsHistory(phoneNumber: String, limit: Int = 10): List<SmsMessage> {
        val messages = mutableListOf<SmsMessage>()
        
        try {
            // Query the SMS content provider
            val uri = android.provider.Telephony.Sms.CONTENT_URI
            val selection = "address = ?"
            val selectionArgs = arrayOf(phoneNumber)
            val sortOrder = "date DESC"
            
            context.contentResolver.query(
                uri,
                null,
                selection,
                selectionArgs,
                sortOrder
            )?.use { cursor ->
                val idxBody = cursor.getColumnIndex("body")
                val idxDate = cursor.getColumnIndex("date")
                val idxType = cursor.getColumnIndex("type")
                
                var count = 0
                while (cursor.moveToNext() && count < limit) {
                    val body = cursor.getString(idxBody)
                    val date = cursor.getLong(idxDate)
                    val type = cursor.getInt(idxType) // 1 = received, 2 = sent
                    
                    messages.add(
                        SmsMessage(
                            body = body,
                            timestamp = date,
                            isIncoming = type == 1,
                            sender = phoneNumber
                        )
                    )
                    count++
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read SMS history", e)
        }
        
        return messages
    }
    
    /**
     * Data class for SMS messages
     */
    data class SmsMessage(
        val body: String,
        val timestamp: Long,
        val isIncoming: Boolean,
        val sender: String
    )
}
