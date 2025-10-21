package com.everydai.app.network

import android.content.Context
import android.util.Log
import com.everydai.app.R
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class WebSocketManager(private val context: Context) {
    private val TAG = "WebSocketManager"
    
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS) // No timeout for WebSocket
        .connectTimeout(10, TimeUnit.SECONDS)
        .pingInterval(30, TimeUnit.SECONDS)
        .build()
    
    private val messageChannel = Channel<String>(Channel.BUFFERED)
    val messages = messageChannel.receiveAsFlow()
    
    fun connect() {
        val websocketUrl = context.getString(R.string.websocket_url)
        val request = Request.Builder()
            .url(websocketUrl)
            .build()
        
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket connection established")
            }
            
            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "Received message: $text")
                try {
                    messageChannel.trySend(text)
                    
                    // Process message based on type
                    val json = JSONObject(text)
                    when (json.optString("type")) {
                        "command" -> handleCommand(json)
                        "response" -> handleResponse(json)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error processing message", e)
                }
            }
            
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket failure", t)
                // Attempt to reconnect after delay
                reconnectWithDelay()
            }
            
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closed: $reason")
            }
        })
    }
    
    fun send(message: String): Boolean {
        return webSocket?.send(message) ?: false
    }
    
    fun disconnect() {
        webSocket?.close(1000, "Closing connection")
        webSocket = null
    }
    
    private fun reconnectWithDelay() {
        // Implement exponential backoff for reconnection
        Thread.sleep(5000)
        connect()
    }
    
    private fun handleCommand(json: JSONObject) {
        when (json.optString("command")) {
            "sendSms" -> {
                val destination = json.optString("destination")
                val message = json.optString("message")
                // Delegate to SMS manager
                // SMSManager.sendSms(destination, message)
            }
            "makeCall" -> {
                val phoneNumber = json.optString("phoneNumber")
                // Delegate to call manager
                // CallManager.makeCall(phoneNumber)
            }
            // Handle other commands
        }
    }
    
    private fun handleResponse(json: JSONObject) {
        // Handle server responses to our requests
        val requestId = json.optString("requestId")
        val success = json.optBoolean("success")
        val data = json.optJSONObject("data")
        
        // Process response
        Log.d(TAG, "Received response for request $requestId: $success")
    }
}
