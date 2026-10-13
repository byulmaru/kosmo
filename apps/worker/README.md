# Worker Operations

## Manually starting an Operational Notification

Start `operationalNotificationDeliveryWorkflow` on the `kosmo` task queue with the stable workflow ID `operational-notification:<sendId>`. The workflow takes one argument:

```json
{
  "sendId": "00000000-0000-4000-8000-000000000101",
  "data": {
    "title": "Scheduled maintenance",
    "body": "Maintenance starts soon",
    "href": "/account/settings?tab=security#top"
  }
}
```

`sendId` must be a UUID. `title` must be non-empty, `body` is optional, and `href` must be an app-root-relative path or an absolute HTTP(S) URL. For an app path, retain its query and fragment. A workflow client starts it with `workflowId: operational-notification:<sendId>` and passes the object above as its single workflow argument.

Set `workflowIdConflictPolicy` to `FAIL` so any start against an active execution with the same workflow ID is rejected. To rerun a completed execution, set `workflowIdReusePolicy` to `ALLOW_DUPLICATE` and pass the same `sendId` and data. The first successful capture atomically stores one Notification per Account that is ACTIVE at capture time. A continuation pages over those stored rows and never captures the audience again. Matching retries leave each row and its `readAt` unchanged; a rerun with different normalized data fails non-retryably. If capture finds no ACTIVE Accounts, it creates no row or marker, so a later run may capture the audience active at that later time; use a new `sendId` for a new intended announcement.

Each stored notification starts the existing `pushNotificationDeliveryWorkflow` with the normal `USE_EXISTING` conflict and `REJECT_DUPLICATE` reuse policies. Its 24-hour eligibility and read-independent delivery behavior remain in force.
