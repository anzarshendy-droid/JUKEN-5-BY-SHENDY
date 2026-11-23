package com.sag65.juken5

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID
import kotlin.concurrent.thread

class MainActivity : Activity() {
    companion object {
        private const val APP_URL = "https://ais-pre-ehcgorabdkd7svhl2ahsou-494385704911.asia-northeast1.run.app"
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb")
        private const val REQ_PERMISSIONS = 1001
    }

    private lateinit var webView: WebView
    private var btSocket: BluetoothSocket? = null
    private var btOut: OutputStream? = null
    @Volatile
    private var reading = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestRuntimePermissions()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.setGeolocationEnabled(true)
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            settings.userAgentString = settings.userAgentString.replace("; wv", "")
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            webViewClient = WebViewClient()
            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(
                    origin: String?,
                    callback: GeolocationPermissions.Callback?
                ) {
                    callback?.invoke(origin, true, false)
                }
            }
            addJavascriptInterface(BluetoothClassicBridge(), "JukenAndroidClassic")
            loadUrl(APP_URL)
        }
        setContentView(webView)
    }

    private fun requestRuntimePermissions() {
        val perms = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            perms.add(Manifest.permission.BLUETOOTH_CONNECT)
            perms.add(Manifest.permission.BLUETOOTH_SCAN)
        }
        val missing = perms.filter {
            checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            requestPermissions(missing.toTypedArray(), REQ_PERMISSIONS)
        }
    }

    private fun getBtAdapter(): BluetoothAdapter? {
        val mgr = getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return mgr?.adapter
    }

    inner class BluetoothClassicBridge {
        @SuppressLint("MissingPermission")
        @JavascriptInterface
        fun listPairedDevices(): String {
            val arr = JSONArray()
            try {
                val bonded = getBtAdapter()?.bondedDevices ?: emptySet()
                for (dev in bonded) {
                    val obj = JSONObject()
                    obj.put("name", dev.name ?: dev.address)
                    obj.put("address", dev.address)
                    arr.put(obj)
                }
            } catch (_: Exception) {
            }
            return arr.toString()
        }

        @SuppressLint("MissingPermission")
        @JavascriptInterface
        fun connect(address: String): Boolean {
            disconnect()
            val adapter = getBtAdapter() ?: return false
            try {
                adapter.cancelDiscovery()
            } catch (_: Exception) {
            }
            val device = try {
                adapter.getRemoteDevice(address)
            } catch (_: Exception) {
                return false
            }

            val socketCandidates = listOf<() -> BluetoothSocket>(
                { device.createRfcommSocketToServiceRecord(SPP_UUID) },
                { device.createInsecureRfcommSocketToServiceRecord(SPP_UUID) },
                {
                    val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
                    method.invoke(device, 1) as BluetoothSocket
                }
            )

            for (createSocket in socketCandidates) {
                var candidate: BluetoothSocket? = null
                try {
                    candidate = createSocket()
                    candidate.connect()
                    btSocket = candidate
                    btOut = candidate.outputStream
                    reading = true
                    startReaderThread(candidate.inputStream)
                    return true
                } catch (_: Exception) {
                    try {
                        candidate?.close()
                    } catch (_: Exception) {
                    }
                }
            }
            disconnect()
            return false
        }

        @JavascriptInterface
        fun sendHex(hex: String): Boolean {
            return try {
                val clean = hex.replace(Regex("[^0-9a-fA-F]"), "")
                val bytes = ByteArray(clean.length / 2) { i ->
                    clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
                }
                btOut?.write(bytes)
                btOut?.flush()
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun disconnect() {
            reading = false
            try {
                btSocket?.close()
            } catch (_: Exception) {
            }
            btSocket = null
            btOut = null
        }
    }

    private fun startReaderThread(input: InputStream) {
        thread(start = true) {
            val buf = ByteArray(512)
            while (reading) {
                try {
                    val count = input.read(buf)
                    if (count <= 0) break
                    val hex = buf.take(count).joinToString("") { "%02X".format(it) }
                    runOnUiThread {
                        webView.evaluateJavascript("window.__onJukenNativeRx && window.__onJukenNativeRx('$hex');", null)
                    }
                } catch (_: Exception) {
                    if (reading) {
                        reading = false
                        runOnUiThread {
                            webView.evaluateJavascript("window.__onJukenNativeDisconnect && window.__onJukenNativeDisconnect('Koneksi Bluetooth Classic terputus.');", null)
                        }
                    }
                    break
                }
            }
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        reading = false
        try {
            btSocket?.close()
        } catch (_: Exception) {
        }
        super.onDestroy()
    }
}
