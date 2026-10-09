package moe.kos.notifications

import android.app.Notification
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.notifications.model.Notification as ExpoNotification
import expo.modules.notifications.notifications.model.triggers.FirebaseNotificationTrigger
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.roundToInt
import moe.kos.R

class KosmoPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {
  override suspend fun createNotification(
    notification: ExpoNotification,
    notificationBehavior: NotificationBehaviorRecord?
  ): Notification {
    val presentation = readPresentation(notification) ?:
      return super.createNotification(notification, notificationBehavior)
    val baseNotification = super.createNotification(notification, notificationBehavior)
    // This constructor copies the Expo notification's content intent, extras, channel,
    // alert behavior, and other NotificationCompat fields before adding custom views.
    val builder = NotificationCompat.Builder(context, baseNotification)
    if (notificationBehavior == null) {
      // Expo's background path has no presentation behavior. Keep the foreground path on
      // Expo's fallback channel while matching FCM's default channel for data-only delivery.
      builder.setChannelId(KosmoFirebaseMessagingService.FCM_FALLBACK_CHANNEL_ID)
    }
    val avatar = loadAvatar(presentation.avatarUrl)

    builder
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(createCollapsedView(presentation, avatar))
      .setCustomBigContentView(createExpandedView(presentation, avatar))
      .setCustomHeadsUpContentView(createHeadsUpView(presentation, avatar))

    return builder.build()
  }

  private fun readPresentation(notification: ExpoNotification): Presentation? {
    val trigger = notification.notificationRequest.trigger as? FirebaseNotificationTrigger ?: return null
    val remoteMessage = trigger.remoteMessage
    if (remoteMessage.notification != null) {
      return null
    }

    val data = remoteMessage.data
    if (data["presentationVersion"] != PRESENTATION_VERSION.toString()) {
      return null
    }
    val title = data["title"]?.takeUnless(String::isBlank) ?: return null
    val message = data["message"]?.takeUnless(String::isBlank) ?: return null
    return Presentation(
      title = title,
      message = message,
      actorName = data["actorName"]?.takeUnless(String::isBlank) ?: title,
      actorHandle = data["actorHandle"].orEmpty(),
      recipientName = data["recipientName"].orEmpty(),
      recipientHandle = data["recipientHandle"].orEmpty(),
      reaction = data["reaction"].orEmpty(),
      postText = data["postText"].orEmpty(),
      avatarUrl = data["actorAvatarUrl"],
    )
  }

  private fun createCollapsedView(presentation: Presentation, avatar: Bitmap): RemoteViews {
    return createView(
      layoutId = R.layout.kosmo_push_notification_collapsed,
      presentation = presentation,
      avatar = avatar,
      showSummary = true,
      showExpandedDetails = false,
    )
  }

  private fun createExpandedView(presentation: Presentation, avatar: Bitmap): RemoteViews {
    return createView(
      layoutId = R.layout.kosmo_push_notification_expanded,
      presentation = presentation,
      avatar = avatar,
      showSummary = false,
      showExpandedDetails = true,
    )
  }

  private fun createHeadsUpView(presentation: Presentation, avatar: Bitmap): RemoteViews {
    return createView(
      layoutId = R.layout.kosmo_push_notification_headsup,
      presentation = presentation,
      avatar = avatar,
      showSummary = true,
      showExpandedDetails = false,
    )
  }

  private fun createView(
    layoutId: Int,
    presentation: Presentation,
    avatar: Bitmap,
    showSummary: Boolean,
    showExpandedDetails: Boolean,
  ): RemoteViews {
    val views = RemoteViews(context.packageName, layoutId)
    views.setImageViewBitmap(R.id.kosmo_push_avatar, avatar)
    views.setTextViewText(R.id.kosmo_push_reaction, presentation.reaction)
    views.setViewVisibility(
      R.id.kosmo_push_reaction,
      if (presentation.reaction.isEmpty()) android.view.View.GONE else android.view.View.VISIBLE,
    )
    if (showSummary) {
      views.setTextViewText(R.id.kosmo_push_message, presentation.message)
    }
    if (showExpandedDetails) {
      views.setTextViewText(R.id.kosmo_push_title, actorLabel(presentation))
      views.setTextViewText(R.id.kosmo_push_recipient, recipientLabel(presentation))
      views.setTextViewText(R.id.kosmo_push_post_text, presentation.postText)
      views.setViewVisibility(
        R.id.kosmo_push_post_text,
        if (presentation.postText.isNotEmpty()) {
          android.view.View.VISIBLE
        } else {
          android.view.View.GONE
        },
      )
    }
    return views
  }

  private fun actorLabel(presentation: Presentation): String {
    return listOf(presentation.actorName, presentation.actorHandle)
      .filter(String::isNotBlank)
      .joinToString(" ")
  }

  private fun recipientLabel(presentation: Presentation): String {
    val label = listOf(presentation.recipientName, presentation.recipientHandle)
      .filter(String::isNotEmpty)
      .joinToString(" ")
    return if (label.isEmpty()) "" else "${label}에게"
  }

  private suspend fun loadAvatar(avatarUrl: String?): Bitmap {
    val fallback = BitmapFactory.decodeResource(context.resources, android.R.drawable.sym_def_app_icon)
      ?: throw IllegalStateException("Android default avatar resource is unavailable")
    val avatar = if (avatarUrl.isNullOrBlank() || !avatarUrl.startsWith("https://", ignoreCase = true)) {
      fallback
    } else {
      withContext(Dispatchers.IO) {
        val connection = (URL(avatarUrl).openConnection() as? HttpURLConnection)
          ?: return@withContext fallback
        try {
          connection.connectTimeout = AVATAR_TIMEOUT_MILLISECONDS
          connection.readTimeout = AVATAR_TIMEOUT_MILLISECONDS
          connection.instanceFollowRedirects = false
          connection.connect()
          if (connection.responseCode !in 200..299) {
            return@withContext fallback
          }
          if (connection.contentLengthLong > MAX_AVATAR_BYTES) {
            return@withContext fallback
          }
          val bytes = ByteArrayOutputStream().use { output ->
            connection.inputStream.use { input ->
              val buffer = ByteArray(8 * 1024)
              var total = 0
              while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > MAX_AVATAR_BYTES) return@use null
                output.write(buffer, 0, read)
              }
            }
            output.toByteArray()
          } ?: return@withContext fallback
          decodeAvatar(bytes, fallback)
        } catch (_: Exception) {
          fallback
        } finally {
          connection.disconnect()
        }
      }
    }
    return prepareAvatarForRemoteViews(avatar)
  }

  private fun prepareAvatarForRemoteViews(bitmap: Bitmap): Bitmap {
    if (bitmap.width <= 0 || bitmap.height <= 0) {
      return bitmap
    }

    val targetSize = (
      AVATAR_VIEW_SIZE_DP * context.resources.displayMetrics.density
    ).roundToInt().coerceAtLeast(1).coerceAtMost(MAX_AVATAR_OUTPUT_DIMENSION)
    val cropSize = minOf(bitmap.width, bitmap.height)
    val cropLeft = (bitmap.width - cropSize) / 2
    val cropTop = (bitmap.height - cropSize) / 2
    val cropped = if (
      cropLeft == 0 && cropTop == 0 && bitmap.width == cropSize && bitmap.height == cropSize
    ) {
      bitmap
    } else {
      Bitmap.createBitmap(bitmap, cropLeft, cropTop, cropSize, cropSize)
    }
    val scaled = if (cropped.width == targetSize && cropped.height == targetSize) {
      cropped
    } else {
      Bitmap.createScaledBitmap(cropped, targetSize, targetSize, true)
    }

    if (cropped !== bitmap && cropped !== scaled) {
      cropped.recycle()
    }
    if (bitmap !== cropped && bitmap !== scaled) {
      bitmap.recycle()
    }
    return scaled
  }

  private fun decodeAvatar(bytes: ByteArray, fallback: Bitmap): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      return fallback
    }

    val sampleSize = calculateSampleSize(bounds.outWidth, bounds.outHeight) ?: return fallback
    val options = BitmapFactory.Options().apply {
      inScaled = false
      inPreferredConfig = Bitmap.Config.ARGB_8888
      inSampleSize = sampleSize
    }
    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return fallback
    val decodedPixels = bitmap.width.toLong() * bitmap.height.toLong()
    if (
      bitmap.width > MAX_AVATAR_DIMENSION ||
      bitmap.height > MAX_AVATAR_DIMENSION ||
      decodedPixels > MAX_AVATAR_PIXELS
    ) {
      bitmap.recycle()
      return fallback
    }
    return bitmap
  }

  private fun calculateSampleSize(width: Int, height: Int): Int? {
    var sampleSize = 1
    while (
      sampledDimension(width, sampleSize) > MAX_AVATAR_DIMENSION ||
      sampledDimension(height, sampleSize) > MAX_AVATAR_DIMENSION ||
      sampledDimension(width, sampleSize) * sampledDimension(height, sampleSize) > MAX_AVATAR_PIXELS
    ) {
      if (sampleSize > Int.MAX_VALUE / 2) {
        return null
      }
      sampleSize *= 2
    }
    return sampleSize
  }

  private fun sampledDimension(size: Int, sampleSize: Int): Long {
    return (size.toLong() + sampleSize - 1L) / sampleSize
  }

  private data class Presentation(
    val title: String,
    val message: String,
    val actorName: String,
    val actorHandle: String,
    val recipientName: String,
    val recipientHandle: String,
    val reaction: String,
    val postText: String,
    val avatarUrl: String?,
  )

  companion object {
    private const val PRESENTATION_VERSION = 1
    private const val AVATAR_TIMEOUT_MILLISECONDS = 3_000
    private const val MAX_AVATAR_BYTES = 512 * 1024
    private const val MAX_AVATAR_DIMENSION = 512
    private const val MAX_AVATAR_PIXELS = 512L * 512L
    private const val AVATAR_VIEW_SIZE_DP = 44
    private const val MAX_AVATAR_OUTPUT_DIMENSION = 192
  }
}
