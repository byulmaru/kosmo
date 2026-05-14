import SwiftUI

@main
struct KosmoApp: App {
    @State private var model = WebViewModel()

    var body: some Scene {
        WindowGroup {
            WebViewScreen(model: model)
                .ignoresSafeArea()
        }
    }
}
