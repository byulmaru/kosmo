export type ActorState = {
  id: string;
};

export type ActorAction = { type: 'profile-selected'; profileId: string | null | undefined };

export const initialActorState: ActorState = { id: 'session' };

export function reduceActorState(state: ActorState, action: ActorAction): ActorState {
  return {
    id: action.type === 'profile-selected' ? (action.profileId ?? 'session') : state.id,
  };
}
