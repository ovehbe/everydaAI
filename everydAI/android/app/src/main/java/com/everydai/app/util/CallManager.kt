package com.everydai.app.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.annotation.RequiresPermission

class CallManager(private val context: Context) {
    private val TAG = "CallManager"
    
    /**
     * Make a phone call
     */
    @RequiresPermission(value = "android.permission.CALL_PHONE")
    fun makeCall(phoneNumber: String): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_CALL)
            intent.data = Uri.parse("tel:$phoneNumber")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            Log.d(TAG, "Initiating call to $phoneNumber")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to make call", e)
            false
        }
    }
    
    /**
     * Answer an incoming call
     * Requires API level 26+ (Android 8.0+)
     */
    @RequiresPermission(value = "android.permission.ANSWER_PHONE_CALLS")
    fun answerIncomingCall(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Log.e(TAG, "Answering calls requires Android 8.0 or higher")
            return false
        }
        
        return try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            telecomManager.acceptRingingCall()
            Log.d(TAG, "Answered incoming call")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to answer call", e)
            false
        }
    }
    
    /**
     * End the current call
     * Requires API level 28+ (Android 9.0+)
     */
    fun endCall(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            Log.e(TAG, "Ending calls requires Android 9.0 or higher")
            return false
        }
        
        return try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            telecomManager.endCall()
            Log.d(TAG, "Ended current call")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to end call", e)
            false
        }
    }
    
    /**
     * Check if a call is currently in progress
     */
    fun isCallActive(): Boolean {
        val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        return when (telephonyManager.callState) {
            TelephonyManager.CALL_STATE_OFFHOOK, TelephonyManager.CALL_STATE_RINGING -> true
            else -> false
        }
    }
    
    /**
     * Get call history
     */
    fun getRecentCalls(limit: Int = 10): List<CallRecord> {
        val calls = mutableListOf<CallRecord>()
        
        try {
            val uri = android.provider.CallLog.Calls.CONTENT_URI
            val projection = arrayOf(
                android.provider.CallLog.Calls.NUMBER,
                android.provider.CallLog.Calls.TYPE,
                android.provider.CallLog.Calls.DATE,
                android.provider.CallLog.Calls.DURATION
            )
            val sortOrder = "${android.provider.CallLog.Calls.DATE} DESC"
            
            context.contentResolver.query(
                uri,
                projection,
                null,
                null,
                sortOrder
            )?.use { cursor ->
                val numberIndex = cursor.getColumnIndex(android.provider.CallLog.Calls.NUMBER)
                val typeIndex = cursor.getColumnIndex(android.provider.CallLog.Calls.TYPE)
                val dateIndex = cursor.getColumnIndex(android.provider.CallLog.Calls.DATE)
                val durationIndex = cursor.getColumnIndex(android.provider.CallLog.Calls.DURATION)
                
                var count = 0
                while (cursor.moveToNext() && count < limit) {
                    val number = cursor.getString(numberIndex)
                    val type = cursor.getInt(typeIndex)
                    val date = cursor.getLong(dateIndex)
                    val duration = cursor.getInt(durationIndex)
                    
                    val callType = when (type) {
                        android.provider.CallLog.Calls.INCOMING_TYPE -> CallType.INCOMING
                        android.provider.CallLog.Calls.OUTGOING_TYPE -> CallType.OUTGOING
                        android.provider.CallLog.Calls.MISSED_TYPE -> CallType.MISSED
                        else -> CallType.UNKNOWN
                    }
                    
                    calls.add(
                        CallRecord(
                            phoneNumber = number,
                            timestamp = date,
                            duration = duration,
                            type = callType
                        )
                    )
                    
                    count++
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to retrieve call history", e)
        }
        
        return calls
    }
    
    /**
     * Data class for call records
     */
    data class CallRecord(
        val phoneNumber: String,
        val timestamp: Long,
        val duration: Int,
        val type: CallType
    )
    
    /**
     * Enum for call types
     */
    enum class CallType {
        INCOMING,
        OUTGOING,
        MISSED,
        UNKNOWN
    }
}
