import baseMeta, {
  DeleteFlowContract as deleteFlowContract,
  PendingContract as pendingContract,
  SettingsContract as settingsContract,
} from './ProfileSettings.stories';

export default { ...baseMeta, excludeStories: [], title: 'KOSMO/Screens/Profile Settings/Tests' };
export const DeleteFlowContract = deleteFlowContract;
export const PendingContract = pendingContract;
export const SettingsContract = settingsContract;
