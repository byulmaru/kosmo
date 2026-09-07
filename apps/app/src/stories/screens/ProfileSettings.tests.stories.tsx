import baseMeta, {
  DeactivateContract as deactivateContract,
  DeleteErrorContract as deleteErrorContract,
  DeleteRetryContract as deleteRetryContract,
  DeleteSuccessContract as deleteSuccessContract,
  PendingContract as pendingContract,
  ReactivateContract as reactivateContract,
  SettingsContract as settingsContract,
} from './ProfileSettings.stories';

export default { ...baseMeta, excludeStories: [], title: 'KOSMO/Screens/Profile Settings/Tests' };
export const DeactivateContract = deactivateContract;
export const DeleteErrorContract = deleteErrorContract;
export const ReactivateContract = reactivateContract;
export const DeleteRetryContract = deleteRetryContract;
export const DeleteSuccessContract = deleteSuccessContract;
export const PendingContract = pendingContract;

export const SettingsContract = settingsContract;
