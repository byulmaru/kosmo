export type ActorState = {
  id: string;
  revision: number;
};

export type ActorAction =
  | { type: 'profile-selected'; profileId: string | null | undefined }
  | { type: 'retry' };

export const initialActorState: ActorState = { id: 'session', revision: 0 };

export function reduceActorState(state: ActorState, action: ActorAction): ActorState {
  return {
    id: action.type === 'profile-selected' ? (action.profileId ?? 'session') : state.id,
    revision: state.revision + 1,
  };
}
