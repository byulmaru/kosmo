import { createPubSub } from '@graphql-yoga/subscription';
import { redisEventTarget } from '../redis/pubsub';

export type NotificationAddedPayload = {
  readonly notificationId: string;
  readonly recipientProfileId: string | null;
};

export type InsertedNotificationEvent = NotificationAddedPayload & {
  readonly recipientAccountId: string;
};

export type NotificationEventCollector = InsertedNotificationEvent[];

type NotificationEvents = {
  notificationAdded: [recipientAccountId: string, payload: NotificationAddedPayload];
};

export const notificationPubSub = createPubSub<NotificationEvents>({
  eventTarget: redisEventTarget,
});

export const publishNotificationAdded = ({
  notificationId,
  recipientAccountId,
  recipientProfileId,
}: InsertedNotificationEvent): void => {
  try {
    notificationPubSub.publish('notificationAdded', recipientAccountId, {
      notificationId,
      recipientProfileId,
    });
  } catch {
    // A live notification event must not fail the committed notification write.
  }
};
