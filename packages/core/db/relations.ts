import { defineRelations } from 'drizzle-orm/relations';
import * as tables from './tables';

export const relations = defineRelations(tables, (r) => ({
  Accounts: {
    accountProfiles: r.many.AccountProfiles({
      from: r.Accounts.id,
      to: r.AccountProfiles.accountId,
    }),
    applicationAuthorizations: r.many.ApplicationAuthorizations({
      from: r.Accounts.id,
      to: r.ApplicationAuthorizations.accountId,
    }),
    applications: r.many.Applications({ from: r.Accounts.id, to: r.Applications.ownerAccountId }),
    oauthAuthorizationCodes: r.many.OAuthAuthorizationCodes({
      from: r.Accounts.id,
      to: r.OAuthAuthorizationCodes.accountId,
    }),
    oauthTokens: r.many.OAuthTokens({ from: r.Accounts.id, to: r.OAuthTokens.accountId }),
    sessions: r.many.Sessions({ from: r.Accounts.id, to: r.Sessions.accountId }),
  },
  AccountProfiles: {
    account: r.one.Accounts({
      from: r.AccountProfiles.accountId,
      to: r.Accounts.id,
      optional: false,
    }),
    profile: r.one.Profiles({
      from: r.AccountProfiles.profileId,
      to: r.Profiles.id,
      optional: false,
    }),
  },
  Applications: {
    applicationAuthorizations: r.many.ApplicationAuthorizations({
      from: r.Applications.id,
      to: r.ApplicationAuthorizations.applicationId,
    }),
    oauthAuthorizationCodes: r.many.OAuthAuthorizationCodes({
      from: r.Applications.id,
      to: r.OAuthAuthorizationCodes.applicationId,
    }),
    oauthTokens: r.many.OAuthTokens({ from: r.Applications.id, to: r.OAuthTokens.applicationId }),
    ownerAccount: r.one.Accounts({ from: r.Applications.ownerAccountId, to: r.Accounts.id }),
    sessions: r.many.Sessions({ from: r.Applications.id, to: r.Sessions.applicationId }),
  },
  ApplicationAuthorizations: {
    account: r.one.Accounts({
      from: r.ApplicationAuthorizations.accountId,
      to: r.Accounts.id,
      optional: false,
    }),
    application: r.one.Applications({
      from: r.ApplicationAuthorizations.applicationId,
      to: r.Applications.id,
      optional: false,
    }),
    profile: r.one.Profiles({ from: r.ApplicationAuthorizations.profileId, to: r.Profiles.id }),
  },
  OAuthAuthorizationCodes: {
    account: r.one.Accounts({
      from: r.OAuthAuthorizationCodes.accountId,
      to: r.Accounts.id,
      optional: false,
    }),
    application: r.one.Applications({
      from: r.OAuthAuthorizationCodes.applicationId,
      to: r.Applications.id,
      optional: false,
    }),
    profile: r.one.Profiles({ from: r.OAuthAuthorizationCodes.profileId, to: r.Profiles.id }),
  },
  OAuthTokens: {
    account: r.one.Accounts({ from: r.OAuthTokens.accountId, to: r.Accounts.id, optional: false }),
    application: r.one.Applications({
      from: r.OAuthTokens.applicationId,
      to: r.Applications.id,
      optional: false,
    }),
    profile: r.one.Profiles({ from: r.OAuthTokens.profileId, to: r.Profiles.id }),
  },
  Posts: {
    contents: r.many.PostContents({ from: r.Posts.id, to: r.PostContents.postId }),
    currentContent: r.one.PostContents({ from: r.Posts.currentContentId, to: r.PostContents.id }),
    profile: r.one.Profiles({ from: r.Posts.profileId, to: r.Profiles.id, optional: false }),
  },
  PostContents: {
    post: r.one.Posts({ from: r.PostContents.postId, to: r.Posts.id, optional: false }),
  },
  Profiles: {
    accountProfiles: r.many.AccountProfiles({
      from: r.Profiles.id,
      to: r.AccountProfiles.profileId,
    }),
    applicationAuthorizations: r.many.ApplicationAuthorizations({
      from: r.Profiles.id,
      to: r.ApplicationAuthorizations.profileId,
    }),
    followerFollows: r.many.ProfileFollows({
      from: r.Profiles.id,
      to: r.ProfileFollows.followerProfileId,
      alias: 'profile_follow_follower',
    }),
    followeeFollows: r.many.ProfileFollows({
      from: r.Profiles.id,
      to: r.ProfileFollows.followeeProfileId,
      alias: 'profile_follow_followee',
    }),
    oauthAuthorizationCodes: r.many.OAuthAuthorizationCodes({
      from: r.Profiles.id,
      to: r.OAuthAuthorizationCodes.profileId,
    }),
    oauthTokens: r.many.OAuthTokens({ from: r.Profiles.id, to: r.OAuthTokens.profileId }),
    posts: r.many.Posts({ from: r.Profiles.id, to: r.Posts.profileId }),
    sessions: r.many.Sessions({ from: r.Profiles.id, to: r.Sessions.activeProfileId }),
  },
  ProfileFollows: {
    followeeProfile: r.one.Profiles({
      from: r.ProfileFollows.followeeProfileId,
      to: r.Profiles.id,
      optional: false,
      alias: 'profile_follow_followee',
    }),
    followerProfile: r.one.Profiles({
      from: r.ProfileFollows.followerProfileId,
      to: r.Profiles.id,
      optional: false,
      alias: 'profile_follow_follower',
    }),
  },
  Sessions: {
    account: r.one.Accounts({ from: r.Sessions.accountId, to: r.Accounts.id, optional: false }),
    activeProfile: r.one.Profiles({ from: r.Sessions.activeProfileId, to: r.Profiles.id }),
    application: r.one.Applications({ from: r.Sessions.applicationId, to: r.Applications.id }),
  },
}));
