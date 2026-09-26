export type PodCondition = 'timeReached' | 'secretPresent' | 'commitmentReady'
export type PodTrialState = Record<PodCondition, boolean> & { opened: boolean }
export type PodTrialAction = { type: 'toggle'; condition: PodCondition } | { type: 'open' } | { type: 'reset' }

export const INITIAL_POD_TRIAL: PodTrialState = {
  timeReached: false,
  secretPresent: false,
  commitmentReady: false,
  opened: false,
}

export function podTrialStage(state: PodTrialState): 0 | 1 | 2 {
  if (!state.timeReached || !state.secretPresent || !state.commitmentReady) return 0
  return state.opened ? 2 : 1
}

export function podTrialReducer(state: PodTrialState, action: PodTrialAction): PodTrialState {
  if (action.type === 'reset') return { ...INITIAL_POD_TRIAL }
  if (action.type === 'toggle') return { ...state, [action.condition]: !state[action.condition], opened: false }
  if (action.type === 'open' && podTrialStage(state) === 1) return { ...state, opened: true }
  return state
}
