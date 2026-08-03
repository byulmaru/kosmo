import { ConnectionHandler, ROOT_ID } from 'relay-runtime';

export const homeTimelineConnectionKey = 'PostList_homeTimeline';
export const profilePostsConnectionKey = 'PostList_profile_posts';

export function getCreatedPostConnectionIds(profileId: string, replyParentId?: string): string[] {
  const connections = [ConnectionHandler.getConnectionID(ROOT_ID, homeTimelineConnectionKey)];
  if (!replyParentId) {
    connections.push(ConnectionHandler.getConnectionID(profileId, profilePostsConnectionKey));
  }
  return connections;
}
