package com.everydai.app.receivers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.everydai.app.network.ServerApi
import com.everydai.app.util.SmsManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SMSReceiver : BroadcastReceiver() {
    private val TAG = "SMSReceiver"
    
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            return
        }
        
        val serverApi = ServerApi(context)
        val smsManager = SmsManager(context)
        
        // Get SMS messages from the intent
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isEmpty()) {
            return
        }
        
        // Combine message parts if needed
        val senderNumber = messages[0].originatingAddress ?: "Unknown"
        val messageBody = messages.joinToString("") { it.messageBody }
        
        Log.d(TAG, "SMS received from $senderNumber: ${messageBody.take(20)}...")
        
        // Send event to server
        CoroutineScope(Dispatchers.IO).launch {
            serverApi.sendSmsEvent(
                phoneNumber = senderNumber,
                messageBody = messageBody,
                isReceived = true
            )
        }
    }
}
