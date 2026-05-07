import './query';

import { registerGlobalId } from '@/graphql/id';
import { Account } from './node';

registerGlobalId(Account);

export default Account;
