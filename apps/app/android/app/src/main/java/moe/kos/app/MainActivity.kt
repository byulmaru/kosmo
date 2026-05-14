package moe.kos.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.browser.customtabs.CustomTabsIntent
import java.security.MessageDigest
import java.security.SecureRandom

private const val AUTHORIZE_URL = "https://id.byulmaru.co/oauth/authorize"
private const val REDIRECT_URI = "kosmo://login/callback"
private const val CALLBACK_PATH = "/login/callback"

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var loginState: String? = null
    private var codeVerifier: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(
            webView,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        CookieManager.getInstance().setAcceptCookie(true)
        configureWebView()
        configureBackNavigation()
        handleIntent(intent)

        if (savedInstanceState == null && webView.url == null) {
            webView.loadUrl(BuildConfig.WEB_ORIGIN)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun configureWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.cacheMode = WebSettings.LOAD_DEFAULT

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val url = request.url

                if (url.scheme == "https" && url.host == "kos.moe" && url.path == "/login") {
                    startNativeLogin()
                    return true
                }

                if (url.scheme == "http" || url.scheme == "https") return false

                startActivity(Intent(Intent.ACTION_VIEW, url))
                return true
            }
        }
    }

    private fun configureBackNavigation() {
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                        return
                    }

                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            },
        )
    }

    private fun startNativeLogin() {
        if (BuildConfig.OIDC_CLIENT_ID.isBlank()) return

        val state = randomBase64Url()
        val verifier = randomBase64Url()
        loginState = state
        codeVerifier = verifier

        val authorizeUri = Uri.parse(AUTHORIZE_URL).buildUpon()
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("client_id", BuildConfig.OIDC_CLIENT_ID)
            .appendQueryParameter("redirect_uri", REDIRECT_URI)
            .appendQueryParameter("scope", "openid profile")
            .appendQueryParameter("code_challenge", codeChallenge(verifier))
            .appendQueryParameter("code_challenge_method", "S256")
            .appendQueryParameter("state", state)
            .build()

        CustomTabsIntent.Builder().build().launchUrl(this, authorizeUri)
    }

    private fun handleIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "kosmo" || data.host != "login" || data.path != "/callback") return

        val code = data.getQueryParameter("code") ?: return
        val returnedState = data.getQueryParameter("state") ?: return
        val expectedState = loginState ?: return
        val verifier = codeVerifier ?: return

        if (returnedState != expectedState) return

        val sessionUri = Uri.parse(BuildConfig.WEB_ORIGIN).buildUpon()
            .path(CALLBACK_PATH)
            .appendQueryParameter("code", code)
            .appendQueryParameter("state", returnedState)
            .appendQueryParameter("code_verifier", verifier)
            .appendQueryParameter("redirect_uri", REDIRECT_URI)
            .build()

        loginState = null
        codeVerifier = null
        webView.loadUrl(sessionUri.toString())
    }

    private fun randomBase64Url(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    }

    private fun codeChallenge(verifier: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray())
        return Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
    }
}
