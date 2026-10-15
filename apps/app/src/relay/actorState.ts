export type ActorState = {
  id: string;
  remainingFallbackProfileIds?: readonly string[];
};

export type ActorAction = {
  type: 'profile-selected';
  profileId: string | null | undefined;
  remainingFallbackProfileIds?: readonly string[];
};

export const initialActorState: ActorState = { id: 'session' };

export function reduceActorState(state: ActorState, action: ActorAction): ActorState {
  const nextState: ActorState = {
    id: action.type === 'profile-selected' ? (action.profileId ?? 'session') : state.id,
  };
  return action.remainingFallbackProfileIds === undefined
    ? nextState
    : { ...nextState, remainingFallbackProfileIds: action.remainingFallbackProfileIds };
}
