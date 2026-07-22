import { Instances, Posts, Profiles } from '@kosmo/core/db';
import { sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { visibleProfileWhere } from '@/profile/visibility';
import { postVisibilityAccessCondition } from './visibility';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { UserContext } from '@/context';

const sourceChainOuterPostAlias = 'source_chain_outer_post';
const sourceChainPostAlias = 'source_chain_post';
const sourceChainProfileAlias = 'source_chain_profile';
const sourceChainInstanceAlias = 'source_chain_instance';

const SourceChainOuterPosts = alias(Posts, sourceChainOuterPostAlias);
const SourceChainPosts = alias(Posts, sourceChainPostAlias);
const SourceChainProfiles = alias(Profiles, sourceChainProfileAlias);
const SourceChainInstances = alias(Instances, sourceChainInstanceAlias);

type SourceChainAccessInput = {
  ctx: UserContext;
  postId: AnyPgColumn;
};

export const postSourceChainAccessWhere = ({
  ctx,
  postId,
}: SourceChainAccessInput): SQL<boolean> => {
  const sourceVisible = postVisibilityAccessCondition({
    columns: {
      postProfileId: SourceChainPosts.profileId,
      postState: SourceChainPosts.state,
      postVisibility: SourceChainPosts.visibility,
      profileVisible: sql<boolean>`${visibleProfileWhere({
        profile: SourceChainProfiles,
        instance: SourceChainInstances,
      })}`,
    },
    ctx,
  });
  const sourceChain = sql.identifier('source_chain');
  const chainId = sql`${sourceChain}.${sql.identifier('id')}`;
  const chainRepostSourceId = sql`${sourceChain}.${sql.identifier('repost_source_id')}`;
  const chainPath = sql`${sourceChain}.${sql.identifier('path')}`;
  const chainCycle = sql`${sourceChain}.${sql.identifier('cycle')}`;

  return sql<boolean>`not exists (
    with recursive ${sourceChain}(
      ${sql.identifier('id')},
      ${sql.identifier('repost_source_id')},
      ${sql.identifier('path')},
      ${sql.identifier('cycle')}
    ) as (
      select
        ${SourceChainPosts.id},
        ${SourceChainPosts.repostSourceId},
        array[${SourceChainPosts.id}]::uuid[],
        false
      from ${Posts} as ${sql.identifier(sourceChainOuterPostAlias)}
      inner join ${Posts} as ${sql.identifier(sourceChainPostAlias)}
        on ${SourceChainPosts.id} = ${SourceChainOuterPosts.repostSourceId}
      where ${SourceChainOuterPosts.id} = ${postId}

      union all

      select
        ${SourceChainPosts.id},
        ${SourceChainPosts.repostSourceId},
        ${chainPath} || ${SourceChainPosts.id},
        ${SourceChainPosts.id} = any(${chainPath})
      from ${sourceChain}
      inner join ${Posts} as ${sql.identifier(sourceChainPostAlias)}
        on ${SourceChainPosts.id} = ${chainRepostSourceId}
      where not ${chainCycle}
    )
    select 1
    from ${sourceChain}
    inner join ${Posts} as ${sql.identifier(sourceChainPostAlias)}
      on ${SourceChainPosts.id} = ${chainId}
    inner join ${Profiles} as ${sql.identifier(sourceChainProfileAlias)}
      on ${SourceChainProfiles.id} = ${SourceChainPosts.profileId}
    inner join ${Instances} as ${sql.identifier(sourceChainInstanceAlias)}
      on ${SourceChainInstances.id} = ${SourceChainProfiles.instanceId}
    where ${chainCycle}
       or ${SourceChainPosts.currentContentId} is null
       or not (${sourceVisible})
  )`;
};
