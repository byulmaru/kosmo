package moe.kos.notifications

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class KosmoPushPresentationModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = MODULE_NAME

  override fun getConstants(): Map<String, Any> =
    mapOf(PRESENTATION_VERSION_KEY to PRESENTATION_VERSION)

  companion object {
    const val MODULE_NAME = "KosmoPushPresentation"
    private const val PRESENTATION_VERSION_KEY = "presentationVersion"
    const val PRESENTATION_VERSION = 1
  }
}
