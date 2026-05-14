import AuthenticationServices
import CryptoKit
import Foundation
import Observation
import Security
import UIKit
import WebKit

@Observable
@MainActor
final class WebViewModel: NSObject {
    let webView: WKWebView

    private let authorizeURL = URL(string: "https://id.byulmaru.co/oauth/authorize")!
    private let redirectURI = "kosmo://login/callback"
    private let webOrigin = URL(string: "https://kos.moe")!
    private let callbackPath = "/login/callback"

    private var codeVerifier: String?
    private var state: String?
    private var authenticationSession: ASWebAuthenticationSession?

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()

        webView.navigationDelegate = self
        configureUserAgent()
    }

    private func startLogin() {
        let nextState = randomBase64URL()
        let nextCodeVerifier = randomBase64URL()
        state = nextState
        codeVerifier = nextCodeVerifier

        var components = URLComponents(url: authorizeURL, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: oidcClientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "scope", value: "openid profile"),
            URLQueryItem(name: "code_challenge", value: codeChallenge(nextCodeVerifier)),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: nextState),
        ]

        guard let url = components.url else { return }

        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "kosmo") {
            [weak self] callbackURL, _ in
            guard let callbackURL else { return }
            Task { @MainActor in
                self?.handleCallback(callbackURL)
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        authenticationSession = session
        session.start()
    }

    private func handleCallback(_ url: URL) {
        guard
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            components.scheme == "kosmo",
            components.host == "login",
            components.path == "/callback",
            let code = components.queryItems?.first(where: { $0.name == "code" })?.value,
            let returnedState = components.queryItems?.first(where: { $0.name == "state" })?.value,
            returnedState == state,
            let codeVerifier
        else { return }

        var sessionComponents = URLComponents(url: webOrigin, resolvingAgainstBaseURL: false)!
        sessionComponents.path = callbackPath
        sessionComponents.queryItems = [
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "state", value: returnedState),
            URLQueryItem(name: "code_verifier", value: codeVerifier),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
        ]

        state = nil
        self.codeVerifier = nil

        guard let sessionURL = sessionComponents.url else { return }
        webView.load(URLRequest(url: sessionURL))
    }

    private var oidcClientID: String {
        Bundle.main.object(forInfoDictionaryKey: "KOSMO_OIDC_CLIENT_ID") as? String ?? ""
    }

    private var appUserAgent: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        return "KosmoApp/\(version ?? "0.0.0")"
    }

    private func configureUserAgent() {
        webView.evaluateJavaScript("navigator.userAgent") { [weak self] userAgent, _ in
            Task { @MainActor in
                guard let self else { return }

                let defaultUserAgent = userAgent as? String
                self.webView.customUserAgent = [defaultUserAgent, self.appUserAgent]
                    .compactMap { $0 }
                    .joined(separator: " ")
                self.webView.load(URLRequest(url: self.webOrigin))
            }
        }
    }

    private func randomBase64URL() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncodedString()
    }

    private func codeChallenge(_ verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64URLEncodedString()
    }
}

extension WebViewModel: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void,
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        if url.scheme == "https", url.host == "kos.moe", url.path == "/login" {
            startLogin()
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }
}

extension WebViewModel: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}

private extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
