package com.everydai.app.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import android.util.Log
import com.everydai.app.network.ServerApi
import com.everydai.app.util.CallManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.*
import java.util.concurrent.ConcurrentHashMap

class CallReceiver : BroadcastReceiver() {
    private val TAG = "CallReceiver"
    
    companion object {
        // Track ongoing calls with start time
        private val ongoingCalls = ConcurrentHashMap<String, Long>()
        
        // Generate a stable call ID for a phone number
        private fun getCallId(phoneNumber: String): String {
            return UUID.nameUUIDFromBytes(phoneNumber.toByteArray()).toString()
        }
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        val serverApi = ServerApi(context)
        val callManager = CallManager(context)
        
        // Handle different intents
        when (intent.action) {
            "android.intent.action.PHONE_STATE" -> {
                val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
                val phoneNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER) ?: return
                
                val callId = getCallId(phoneNumber)
                
                when (state) {
                    TelephonyManager.EXTRA_STATE_RINGING -> {
                        Log.d(TAG, "Incoming call from $phoneNumber")
                        
                        // Record call start time
                        ongoingCalls[callId] = System.currentTimeMillis()
                        
                        // Send event to server
                        CoroutineScope(Dispatchers.IO).launch {
                            serverApi.sendCallEvent(
                                phoneNumber = phoneNumber,
                                callType = ServerApi.EventType.CALL_INCOMING,
                                callId = callId
                            )
                        }
                    }
                    TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                        Log.d(TAG, "Call answered: $phoneNumber")
                        
                        // Call was answered
                        if (!ongoingCalls.containsKey(callId)) {
                            ongoingCalls[callId] = System.currentTimeMillis()
                        }
                        
                        // Send event to server
                        CoroutineScope(Dispatchers.IO).launch {
                            serverApi.sendCallEvent(
                                phoneNumber = phoneNumber,
                                callType = ServerApi.EventType.CALL_ANSWERED,
                                callId = callId
                            )
                        }
                    }
                    TelephonyManager.EXTRA_STATE_IDLE -> {
                        Log.d(TAG, "Call ended: $phoneNumber")
                        
                        // Calculate call duration if we have the start time
                        val startTime = ongoingCalls.remove(callId)
                        val duration = if (startTime != null) {
                            ((System.currentTimeMillis() - startTime) / 1000).toInt()
                        } else {
                            0
                        }
                        
                        // Send event to server
                        CoroutineScope(Dispatchers.IO).launch {
                            serverApi.sendCallEvent(
                                phoneNumber = phoneNumber,
                                callType = ServerApi.EventType.CALL_ENDED,
                                duration = duration,
                                callId = callId
                            )
                        }
                    }
                }
            }
            "android.intent.action.NEW_OUTGOING_CALL" -> {
                val phoneNumber = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER) ?: return
                Log.d(TAG, "Outgoing call to $phoneNumber")
                
                // This will be followed by PHONE_STATE changes, so we don't need to track it separately
            }
        }
    }
}
