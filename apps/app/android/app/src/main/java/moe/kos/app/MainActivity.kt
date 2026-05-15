package moe.kos.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.browser.customtabs.CustomTabsIntent

private const val AUTHORIZE_URL = "https://id.byulmaru.co/oauth/authorize"
private const val REDIRECT_URI = "kosmo://login/callback"
private const val CALLBACK_PATH = "/login/callback"
private const val NATIVE_LOGIN_PATH = "/login/native"

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private var loginState: String? = null

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
        webView.settings.userAgentString = listOf(
            webView.settings.userAgentString,
            "KosmoApp/${BuildConfig.VERSION_NAME}",
        ).joinToString(" ")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                val url = request.url

                val origin = Uri.parse(BuildConfig.WEB_ORIGIN)
                if (url.scheme == origin.scheme && url.host == origin.host && url.path == NATIVE_LOGIN_PATH) {
                    startNativeLogin(url)
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

    private fun startNativeLogin(url: Uri) {
        if (BuildConfig.OIDC_CLIENT_ID.isBlank()) return

        val state = url.getQueryParameter("state") ?: return
        val codeChallenge = url.getQueryParameter("code_challenge") ?: return
        loginState = state

        val authorizeUri = Uri.parse(AUTHORIZE_URL).buildUpon()
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("client_id", BuildConfig.OIDC_CLIENT_ID)
            .appendQueryParameter("redirect_uri", REDIRECT_URI)
            .appendQueryParameter("scope", "openid profile")
            .appendQueryParameter("code_challenge", codeChallenge)
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

        if (returnedState != expectedState) return

        val sessionUri = Uri.parse(BuildConfig.WEB_ORIGIN).buildUpon()
            .path(CALLBACK_PATH)
            .appendQueryParameter("code", code)
            .appendQueryParameter("state", returnedState)
            .appendQueryParameter("redirect_uri", REDIRECT_URI)
            .build()

        loginState = null
        webView.loadUrl(sessionUri.toString())
    }
}
