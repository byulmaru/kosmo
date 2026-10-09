import Foundation
import ImageIO
import UIKit
import UserNotifications
import UserNotificationsUI

final class NotificationViewController: UIViewController, UNNotificationContentExtension {
  private let avatarContainer = UIView()
  private let avatarImageView = UIImageView()
  private let reactionBadge = UILabel()
  private let actorLabel = UILabel()
  private let recipientLabel = UILabel()
  private let postTextLabel = UILabel()
  private var avatarTask: BoundedAvatarLoader?
  private var avatarRequestID = UUID()

  override func viewDidLoad() {
    super.viewDidLoad()
    configureView()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard view.bounds.width > 0 else { return }
    let fittingSize = view.systemLayoutSizeFitting(
      CGSize(width: view.bounds.width, height: UIView.layoutFittingCompressedSize.height),
      withHorizontalFittingPriority: .required,
      verticalFittingPriority: .fittingSizeLevel,
    )
    if preferredContentSize != fittingSize {
      preferredContentSize = fittingSize
    }
  }

  func didReceive(_ notification: UNNotification) {
    cancelAvatarLoad()

    let presentation = Presentation(userInfo: notification.request.content.userInfo)
    actorLabel.text = presentation.actorLabel
    recipientLabel.text = presentation.recipientLabel
    recipientLabel.isHidden = presentation.recipientLabel.isEmpty
    postTextLabel.text = presentation.postText
    postTextLabel.isHidden = presentation.postText.isEmpty
    reactionBadge.text = presentation.reaction
    reactionBadge.isHidden = presentation.reaction.isEmpty
    avatarImageView.image = defaultAvatar
    view.setNeedsLayout()

    guard let avatarURL = presentation.avatarURL else { return }
    let requestID = UUID()
    avatarRequestID = requestID
    let task = BoundedAvatarLoader(
      url: avatarURL,
      timeout: avatarTimeout,
      maxBytes: maxAvatarBytes,
    ) { [weak self] data in
      guard
        let self,
        let data,
        let image = Self.decodeAvatar(data: data),
        self.avatarRequestID == requestID
      else {
        return
      }
      DispatchQueue.main.async {
        guard self.avatarRequestID == requestID else { return }
        self.avatarImageView.image = image
        self.avatarTask = nil
        self.view.setNeedsLayout()
      }
    }
    avatarTask = task
    task.start()
  }

  deinit {
    cancelAvatarLoad()
  }

  private func configureView() {
    view.backgroundColor = .clear

    avatarContainer.translatesAutoresizingMaskIntoConstraints = false
    avatarContainer.widthAnchor.constraint(equalToConstant: avatarSize).isActive = true
    avatarContainer.heightAnchor.constraint(equalToConstant: avatarSize).isActive = true

    avatarImageView.translatesAutoresizingMaskIntoConstraints = false
    avatarImageView.contentMode = .scaleAspectFill
    avatarImageView.clipsToBounds = true
    avatarImageView.layer.cornerRadius = avatarSize / 2
    avatarImageView.isAccessibilityElement = false
    avatarContainer.addSubview(avatarImageView)
    NSLayoutConstraint.activate([
      avatarImageView.leadingAnchor.constraint(equalTo: avatarContainer.leadingAnchor),
      avatarImageView.trailingAnchor.constraint(equalTo: avatarContainer.trailingAnchor),
      avatarImageView.topAnchor.constraint(equalTo: avatarContainer.topAnchor),
      avatarImageView.bottomAnchor.constraint(equalTo: avatarContainer.bottomAnchor),
    ])

    reactionBadge.translatesAutoresizingMaskIntoConstraints = false
    reactionBadge.font = .preferredFont(forTextStyle: .caption1)
    reactionBadge.adjustsFontForContentSizeCategory = true
    reactionBadge.textAlignment = .center
    reactionBadge.backgroundColor = .secondarySystemBackground
    reactionBadge.layer.cornerRadius = reactionBadgeSize / 2
    reactionBadge.clipsToBounds = true
    reactionBadge.isAccessibilityElement = true
    avatarContainer.addSubview(reactionBadge)
    NSLayoutConstraint.activate([
      reactionBadge.widthAnchor.constraint(greaterThanOrEqualToConstant: reactionBadgeSize),
      reactionBadge.heightAnchor.constraint(greaterThanOrEqualToConstant: reactionBadgeSize),
      reactionBadge.trailingAnchor.constraint(equalTo: avatarContainer.trailingAnchor),
      reactionBadge.bottomAnchor.constraint(equalTo: avatarContainer.bottomAnchor),
    ])

    actorLabel.font = .preferredFont(forTextStyle: .headline)
    actorLabel.adjustsFontForContentSizeCategory = true
    actorLabel.textColor = .label
    actorLabel.numberOfLines = 0

    recipientLabel.font = .preferredFont(forTextStyle: .subheadline)
    recipientLabel.adjustsFontForContentSizeCategory = true
    recipientLabel.textColor = .secondaryLabel
    recipientLabel.numberOfLines = 0

    postTextLabel.font = .preferredFont(forTextStyle: .body)
    postTextLabel.adjustsFontForContentSizeCategory = true
    postTextLabel.textColor = .label
    postTextLabel.numberOfLines = 0

    let textStack = UIStackView(arrangedSubviews: [actorLabel, recipientLabel, postTextLabel])
    textStack.translatesAutoresizingMaskIntoConstraints = false
    textStack.axis = .vertical
    textStack.spacing = 2
    textStack.alignment = .fill

    let contentStack = UIStackView(arrangedSubviews: [avatarContainer, textStack])
    contentStack.translatesAutoresizingMaskIntoConstraints = false
    contentStack.axis = .horizontal
    contentStack.alignment = .top
    contentStack.spacing = 8
    contentStack.setCustomSpacing(8, after: avatarContainer)
    view.addSubview(contentStack)

    NSLayoutConstraint.activate([
      contentStack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
      contentStack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
      contentStack.topAnchor.constraint(equalTo: view.layoutMarginsGuide.topAnchor),
      contentStack.bottomAnchor.constraint(equalTo: view.layoutMarginsGuide.bottomAnchor),
    ])
  }

  private func cancelAvatarLoad() {
    avatarTask?.cancel()
    avatarTask = nil
    avatarRequestID = UUID()
  }

  private static func decodeAvatar(data: Data) -> UIImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: Self.maxAvatarPixelSize,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
      return nil
    }
    return UIImage(cgImage: image)
  }

  private var defaultAvatar: UIImage? {
    UIImage(systemName: "person.crop.circle.fill")?.withTintColor(.secondaryLabel, renderingMode: .alwaysOriginal)
  }

  private struct Presentation {
    let actorLabel: String
    let recipientLabel: String
    let reaction: String
    let postText: String
    let avatarURL: URL?

    init(userInfo: [AnyHashable: Any]) {
      let actorName = userInfo["actorName"] as? String ?? ""
      let actorHandle = userInfo["actorHandle"] as? String ?? ""
      let recipientName = userInfo["recipientName"] as? String ?? ""
      let recipientHandle = userInfo["recipientHandle"] as? String ?? ""
      actorLabel = [actorName, actorHandle].filter { !$0.isEmpty }.joined(separator: " ")
      let recipientParts = [recipientName, recipientHandle].filter { !$0.isEmpty }
      recipientLabel = recipientParts.isEmpty ? "" : "\(recipientParts.joined(separator: " "))에게"
      reaction = userInfo["reaction"] as? String ?? ""
      postText = userInfo["postText"] as? String ?? ""
      if let avatarString = userInfo["actorAvatarUrl"] as? String,
         let url = URL(string: avatarString),
         url.scheme?.lowercased() == "https",
         url.host != nil {
        avatarURL = url
      } else {
        avatarURL = nil
      }
    }
  }

  private let avatarSize: CGFloat = 44
  private let reactionBadgeSize: CGFloat = 22
  private let avatarTimeout: TimeInterval = 3
  private let maxAvatarBytes = 512 * 1024
  private static let maxAvatarPixelSize = 192
}

private final class BoundedAvatarLoader: NSObject, URLSessionDataDelegate {
  private let url: URL
  private let timeout: TimeInterval
  private let maxBytes: Int
  private let completion: (Data?) -> Void
  private var session: URLSession?
  private var task: URLSessionDataTask?
  private var responseIsValid = false
  private var receivedData = Data()
  private var didFinish = false

  init(url: URL, timeout: TimeInterval, maxBytes: Int, completion: @escaping (Data?) -> Void) {
    self.url = url
    self.timeout = timeout
    self.maxBytes = maxBytes
    self.completion = completion
  }

  func start() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = timeout
    configuration.timeoutIntervalForResource = timeout
    configuration.httpShouldSetCookies = false
    configuration.urlCredentialStorage = nil
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    self.session = session
    var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
    request.httpShouldHandleCookies = false
    task = session.dataTask(with: request)
    task?.resume()
  }

  func cancel() {
    task?.cancel()
    session?.invalidateAndCancel()
    finish(with: nil)
  }

  func urlSession(
    _: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void,
  ) {
    guard
      let httpResponse = response as? HTTPURLResponse,
      (200...299).contains(httpResponse.statusCode),
      httpResponse.expectedContentLength <= Int64(maxBytes) || httpResponse.expectedContentLength < 0
    else {
      responseIsValid = false
      completionHandler(.cancel)
      return
    }
    responseIsValid = true
    completionHandler(.allow)
  }

  func urlSession(
    _: URLSession,
    dataTask: URLSessionDataTask,
    didReceive data: Data,
  ) {
    guard responseIsValid, receivedData.count <= maxBytes - data.count else {
      dataTask.cancel()
      finish(with: nil)
      return
    }
    receivedData.append(data)
  }

  func urlSession(
    _: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void,
  ) {
    completionHandler(nil)
  }

  func urlSession(
    _: URLSession,
    task: URLSessionTask,
    didCompleteWithError error: Error?,
  ) {
    finish(with: error == nil && responseIsValid ? receivedData : nil)
  }

  private func finish(with data: Data?) {
    guard !didFinish else { return }
    didFinish = true
    completion(data)
    session?.finishTasksAndInvalidate()
  }
}
