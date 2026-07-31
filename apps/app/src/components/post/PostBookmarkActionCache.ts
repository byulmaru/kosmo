import { ConnectionHandler } from 'relay-runtime';
import type { IEnvironment, RecordSourceProxy } from 'relay-runtime';

const bookmarkConnectionKey = 'BookmarkConnectionList_bookmarks';

export function getBookmarkConnectionId(profileId: string) {
  return ConnectionHandler.getConnectionID(profileId, bookmarkConnectionKey);
}

export function removeBookmarkFromActorStore(
  store: RecordSourceProxy,
  postId: string,
  bookmarkId: string,
  bookmarkConnectionId: string | null,
) {
  store.get(postId)?.setValue(null, 'viewerBookmark');
  const connection = bookmarkConnectionId ? store.get(bookmarkConnectionId) : null;
  if (connection) {
    ConnectionHandler.deleteNode(connection, bookmarkId);
  }
  store.delete(bookmarkId);
}

export function applyBookmarkDeleteResponse(
  environment: IEnvironment,
  postId: string,
  expectedBookmarkId: string,
  bookmarkConnectionId: string | null,
  responseBookmarkId: string | null | undefined,
  errors: ReadonlyArray<{ message: string }> | null | undefined,
) {
  const responseError = errors?.[0];
  if (responseError) {
    return new Error(responseError.message);
  }
  if (responseBookmarkId !== expectedBookmarkId) {
    return new Error('Bookmark delete response did not confirm the requested Bookmark.');
  }

  environment.commitUpdate((store) =>
    removeBookmarkFromActorStore(store, postId, expectedBookmarkId, bookmarkConnectionId),
  );
  return null;
}
