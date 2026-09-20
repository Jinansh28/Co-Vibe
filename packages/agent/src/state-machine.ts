export type AgentState =
  | 'created'
  | 'planning'
  | 'executing'
  | 'validating'
  | 'needs_fix'
  | 'awaiting_review'
  | 'accepted'
  | 'rejected'
  | 'failed'
  | 'completed';

export const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  created: ['planning', 'executing', 'failed'],
  planning: ['executing', 'failed'],
  executing: ['validating', 'failed'],
  validating: ['needs_fix', 'awaiting_review', 'failed'],
  needs_fix: ['executing', 'planning', 'failed'],
  awaiting_review: ['accepted', 'rejected'],
  accepted: ['completed'],
  rejected: ['completed', 'planning', 'failed'],
  failed: [],
  completed: [],
};

export class InvalidStateTransitionError extends Error {
  constructor(from: AgentState, to: AgentState) {
    super(`INVALID_STATE_TRANSITION: Cannot transition from ${from} to ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export type PersistFn = (newState: AgentState) => Promise<void>;

export class AgentStateMachine {
  private currentState: AgentState;
  private persistFn?: PersistFn;

  constructor(initialState: AgentState = 'created', persistFn?: PersistFn) {
    this.currentState = initialState;
    this.persistFn = persistFn;
  }

  get state(): AgentState {
    return this.currentState;
  }

  canTransition(to: AgentState): boolean {
    return VALID_TRANSITIONS[this.currentState].includes(to);
  }

  async transition(to: AgentState): Promise<void> {
    if (!this.canTransition(to)) {
      throw new InvalidStateTransitionError(this.currentState, to);
    }

    if (this.persistFn) {
      await this.persistFn(to);
    }

    this.currentState = to;
  }
}
