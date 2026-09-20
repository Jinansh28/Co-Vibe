import { describe, it, expect, vi } from 'vitest';
import { AgentStateMachine, InvalidStateTransitionError } from '../src/state-machine.js';

describe('AgentStateMachine', () => {
  it('should initialize with default state "created"', () => {
    const sm = new AgentStateMachine();
    expect(sm.state).toBe('created');
  });

  it('should initialize with provided state', () => {
    const sm = new AgentStateMachine('planning');
    expect(sm.state).toBe('planning');
  });

  it('should transition to a valid state', async () => {
    const sm = new AgentStateMachine('created');
    await sm.transition('planning');
    expect(sm.state).toBe('planning');
    
    await sm.transition('executing');
    expect(sm.state).toBe('executing');
    
    await sm.transition('validating');
    expect(sm.state).toBe('validating');
    
    await sm.transition('awaiting_review');
    expect(sm.state).toBe('awaiting_review');
    
    await sm.transition('accepted');
    expect(sm.state).toBe('accepted');
    
    await sm.transition('completed');
    expect(sm.state).toBe('completed');
  });

  it('should throw InvalidStateTransitionError on illegal moves', async () => {
    const sm = new AgentStateMachine('created');
    await expect(sm.transition('accepted')).rejects.toThrow(InvalidStateTransitionError);
    await expect(sm.transition('accepted')).rejects.toThrow(/Cannot transition from created to accepted/);
    expect(sm.state).toBe('created'); // state remains unchanged
  });

  it('should call persistFn transactionally on valid transition', async () => {
    const persistFn = vi.fn().mockResolvedValue(undefined);
    const sm = new AgentStateMachine('executing', persistFn);
    
    await sm.transition('validating');
    
    expect(persistFn).toHaveBeenCalledWith('validating');
    expect(persistFn).toHaveBeenCalledTimes(1);
    expect(sm.state).toBe('validating');
  });

  it('should not update memory state if persistFn throws', async () => {
    const error = new Error('Database connection failed');
    const persistFn = vi.fn().mockRejectedValue(error);
    const sm = new AgentStateMachine('executing', persistFn);
    
    await expect(sm.transition('validating')).rejects.toThrow('Database connection failed');
    
    // state remains unchanged due to transactional failure
    expect(sm.state).toBe('executing');
    expect(persistFn).toHaveBeenCalledWith('validating');
  });
});
