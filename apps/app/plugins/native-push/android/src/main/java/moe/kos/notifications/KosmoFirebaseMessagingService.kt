package moe.kos.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.delegates.FirebaseMessagingDelegate
import io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService

/**
 * Keeps RNFirebase's token and control-message lifecycle while routing message
 * presentation through Expo Notifications, whose delegate owns the notification
 * request and response serialization used by the app.
 */
class KosmoFirebaseMessagingService : ReactNativeFirebaseMessagingService() {
  private val expoFirebaseMessagingDelegate: FirebaseMessagingDelegate by lazy {
    FirebaseMessagingDelegate(this)
  }

  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    // RNFirebase 26.4.0 keeps this callback as a no-op, but calling super preserves
    // the SDK-owned service boundary if that implementation changes.
    super.onMessageReceived(remoteMessage)
    if (
      remoteMessage.notification == null &&
      remoteMessage.data["presentationVersion"] == PRESENTATION_VERSION.toString()
    ) {
      ensureFcmFallbackChannel(this)
    }
    expoFirebaseMessagingDelegate.onMessageReceived(remoteMessage)
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    expoFirebaseMessagingDelegate.onNewToken(token)
  }

  override fun onDeletedMessages() {
    super.onDeletedMessages()
    expoFirebaseMessagingDelegate.onDeletedMessages()
  }

  private fun ensureFcmFallbackChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val notificationManager = context.getSystemService(NotificationManager::class.java) ?: return
    if (notificationManager.getNotificationChannel(FCM_FALLBACK_CHANNEL_ID) != null) {
      return
    }

    val labelResourceId = context.resources.getIdentifier(
      "fcm_fallback_notification_channel_label",
      "string",
      context.packageName,
    )
    val label = if (labelResourceId != 0) context.getString(labelResourceId) else "Misc"
    notificationManager.createNotificationChannel(
      NotificationChannel(
        FCM_FALLBACK_CHANNEL_ID,
        label,
        NotificationManager.IMPORTANCE_DEFAULT,
      ),
    )
  }

  companion object {
    const val FCM_FALLBACK_CHANNEL_ID = "fcm_fallback_notification_channel"
    private const val PRESENTATION_VERSION = 1
  }
}
