import { Awareness } from 'y-protocols/awareness';

export interface UserAwarenessState {
  name: string;
  color: string;
}

export class AwarenessManager {
  private awareness: Awareness;

  constructor(awareness: Awareness) {
    this.awareness = awareness;
  }

  public setLocalState(state: UserAwarenessState) {
    this.awareness.setLocalStateField('user', state);
  }

  public getLocalState(): UserAwarenessState | undefined {
    const state = this.awareness.getLocalState();
    return state?.user as UserAwarenessState | undefined;
  }

  public getAwareness(): Awareness {
    return this.awareness;
  }
}
