import baseMeta, {
  DeactivateContract as deactivateContract,
  DeleteErrorContract as deleteErrorContract,
  DeleteRetryContract as deleteRetryContract,
  DeleteSuccessContract as deleteSuccessContract,
  PendingContract as pendingContract,
  ReactivateContract as reactivateContract,
} from './ProfileLifecycle.stories';

export default { ...baseMeta, excludeStories: [], title: 'KOSMO/Patterns/Profile/Lifecycle/Tests' };
export const DeactivateContract = deactivateContract;
export const DeleteErrorContract = deleteErrorContract;
export const ReactivateContract = reactivateContract;
export const DeleteRetryContract = deleteRetryContract;
export const DeleteSuccessContract = deleteSuccessContract;
export const PendingContract = pendingContract;
