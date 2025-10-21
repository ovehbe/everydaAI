package com.everydai.app.util

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.speech.tts.TextToSpeech
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.annotation.RequiresPermission
import com.everydai.app.network.WebSocketManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

class CallManager(private val context: Context) {
    private val TAG = "CallManager"
    
    // Audio settings
    private val sampleRate = 16000
    private val channelConfig = AudioFormat.CHANNEL_IN_MONO
    private val audioFormat = AudioFormat.ENCODING_PCM_16BIT
    private val bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat) * 3
    
    // Call audio handling
    private var audioRecord: AudioRecord? = null
    private var audioTrack: AudioTrack? = null
    private var recordingJob: Job? = null
    private var isRecording = false
    
    // Text to speech for AI responses
    private var textToSpeech: TextToSpeech? = null
    private var isTtsInitialized = false
    
    // Active call tracking
    private var activeCallId: String? = null
    private var activeCallNumber: String? = null
    
    // WebSocket for real-time communication
    private var webSocketManager: WebSocketManager? = null
    
    init {
        initTextToSpeech()
    }
    
    /**
     * Set WebSocket manager for real-time communication
     */
    fun setWebSocketManager(wsManager: WebSocketManager) {
        this.webSocketManager = wsManager
    }
    
    /**
     * Initialize text-to-speech engine
     */
    private fun initTextToSpeech() {
        textToSpeech = TextToSpeech(context) { status ->
            isTtsInitialized = status == TextToSpeech.SUCCESS
            if (isTtsInitialized) {
                textToSpeech?.language = Locale.US
                textToSpeech?.setSpeechRate(1.0f)
                textToSpeech?.setPitch(1.0f)
                Log.d(TAG, "TTS initialized successfully")
            } else {
                Log.e(TAG, "Failed to initialize TTS")
            }
        }
    }
    
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
            
            // Generate call ID and store active call info
            activeCallId = UUID.randomUUID().toString()
            activeCallNumber = phoneNumber
            
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
    fun answerIncomingCall(phoneNumber: String? = null): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Log.e(TAG, "Answering calls requires Android 8.0 or higher")
            return false
        }
        
        return try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            telecomManager.acceptRingingCall()
            
            // Store active call info
            activeCallId = UUID.randomUUID().toString()
            activeCallNumber = phoneNumber
            
            Log.d(TAG, "Answered incoming call")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to answer call", e)
            false
        }
    }
    
    /**
     * Reject an incoming call
     * Requires API level 28+ (Android 9.0+)
     */
    fun rejectIncomingCall(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            Log.e(TAG, "Rejecting calls requires Android 9.0 or higher")
            return false
        }
        
        return try {
            val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            telecomManager.endCall()
            Log.d(TAG, "Rejected incoming call")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to reject call", e)
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
            
            // Stop audio recording if active
            stopRecording()
            
            // Clear active call data
            activeCallId = null
            activeCallNumber = null
            
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
     * Start recording call audio and streaming it to the server
     */
    fun startCallAudioProcessing() {
        if (isRecording) {
            Log.d(TAG, "Already recording call audio")
            return
        }
        
        // Check if WebSocket is available
        if (webSocketManager == null) {
            Log.e(TAG, "WebSocket manager not set")
            return
        }
        
        try {
            // Initialize audio recorder
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize
            )
            
            // Initialize audio playback for AI responses
            audioTrack = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setSampleRate(sampleRate)
                        .setEncoding(audioFormat)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build()
                )
                .setBufferSizeInBytes(bufferSize)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()
            
            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord not initialized")
                return
            }
            
            // Start recording
            audioRecord?.startRecording()
            audioTrack?.play()
            isRecording = true
            
            // Start streaming in coroutine
            recordingJob = CoroutineScope(Dispatchers.IO).launch {
                streamAudio()
            }
            
            Log.d(TAG, "Started call audio processing")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting call audio processing", e)
            stopRecording()
        }
    }
    
    /**
     * Stream audio to server and process responses
     */
    private suspend fun streamAudio() = withContext(Dispatchers.IO) {
        try {
            val buffer = ByteArray(bufferSize)
            
            while (isActive && isRecording) {
                val readSize = audioRecord?.read(buffer, 0, buffer.size) ?: -1
                
                if (readSize > 0) {
                    // Send audio chunk to server
                    val audioChunk = buffer.copyOf(readSize)
                    sendAudioChunk(audioChunk)
                    
                    // Short delay to prevent flooding
                    delay(100)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error streaming audio", e)
        }
    }
    
    /**
     * Send audio chunk to server
     */
    private fun sendAudioChunk(audioData: ByteArray) {
        if (webSocketManager == null || activeCallId == null) {
            return
        }
        
        try {
            // Convert audio to base64 for transmission
            val base64Audio = android.util.Base64.encodeToString(
                audioData, android.util.Base64.DEFAULT
            )
            
            // Create message payload
            val audioMessage = JSONObject().apply {
                put("type", "call_audio")
                put("callId", activeCallId)
                put("phoneNumber", activeCallNumber)
                put("audio", base64Audio)
                put("timestamp", System.currentTimeMillis())
            }
            
            // Send via WebSocket
            webSocketManager?.send(audioMessage.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Error sending audio chunk", e)
        }
    }
    
    /**
     * Stop recording call audio
     */
    fun stopRecording() {
        isRecording = false
        
        // Cancel recording coroutine
        recordingJob?.cancel()
        recordingJob = null
        
        // Release audio resources
        try {
            audioRecord?.stop()
            audioRecord?.release()
            audioRecord = null
            
            audioTrack?.stop()
            audioTrack?.release()
            audioTrack = null
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping audio recording", e)
        }
        
        Log.d(TAG, "Stopped call audio processing")
    }
    
    /**
     * Speak text during a call (AI response)
     */
    fun speakDuringCall(text: String) {
        if (!isTtsInitialized) {
            Log.e(TAG, "TTS not initialized")
            return
        }
        
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                textToSpeech?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "call_response")
            } else {
                @Suppress("DEPRECATION")
                textToSpeech?.speak(text, TextToSpeech.QUEUE_FLUSH, null)
            }
            
            Log.d(TAG, "Speaking during call: $text")
        } catch (e: Exception) {
            Log.e(TAG, "Error speaking during call", e)
        }
    }
    
    /**
     * Process an AI response to a call
     */
    fun processAiCallResponse(response: JSONObject) {
        try {
            val responseType = response.optString("responseType")
            val text = response.optString("text")
            
            when (responseType) {
                "speak" -> {
                    // Speak the AI response during the call
                    speakDuringCall(text)
                }
                "end_call" -> {
                    // AI decided to end the call
                    speakDuringCall(text)
                    // Delay before ending call to allow speech to complete
                    CoroutineScope(Dispatchers.Main).launch {
                        delay(3000) // 3 seconds
                        endCall()
                    }
                }
                "transcription" -> {
                    // This is just a transcription update, no action needed
                    // The server will handle sending this to connected clients
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing AI call response", e)
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
     * Clean up resources when service is destroyed
     */
    fun cleanup() {
        stopRecording()
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        textToSpeech = null
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
