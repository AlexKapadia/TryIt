/**
 * Tests for the pure FSM in state.ts. The heart of these is the PRIVACY GUARD: it must be
 * impossible to reach `upload` or stage a file without first passing through consent-accept.
 * Property-based and exhaustive over events to prove no undefined edge silently advances.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  INITIAL_STATE,
  transition,
  hasStagedPhoto,
  type WidgetEvent,
  type WidgetState,
  type StagedPhoto,
} from './state.js';
import type { ErrorCode } from '@tryit/contracts';

const photo: StagedPhoto = {
  fileName: 'me.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1000,
  previewUrl: 'blob:preview',
};

const ALL_EVENTS: WidgetEvent[] = [
  { type: 'OPEN' },
  { type: 'CONSENT_ACCEPT' },
  { type: 'CONSENT_DECLINE' },
  { type: 'FILE_STAGED', photo },
  { type: 'FILE_CLEARED' },
  { type: 'SUBMIT' },
  { type: 'JOB_CREATED', jobId: 'job-1' },
  { type: 'JOB_SUCCEEDED', resultUrl: 'https://cdn/x.png' },
  { type: 'JOB_FAILED', errorCode: 'PROVIDER_ERROR' },
  { type: 'FILE_REJECTED', errorCode: 'INVALID_INPUT' },
  { type: 'RETRY' },
  { type: 'CLOSE' },
];

/** Drive the machine from idle through to the named state via the legitimate path. */
function reach(name: WidgetState['name']): WidgetState {
  let s = INITIAL_STATE;
  s = transition(s, { type: 'OPEN' }); // -> consent
  if (name === 'consent') return s;
  s = transition(s, { type: 'CONSENT_ACCEPT' }); // -> upload
  if (name === 'upload') return s;
  s = transition(s, { type: 'FILE_STAGED', photo });
  s = transition(s, { type: 'SUBMIT' }); // -> uploading
  if (name === 'uploading') return s;
  s = transition(s, { type: 'JOB_CREATED', jobId: 'j' }); // -> processing
  if (name === 'processing') return s;
  if (name === 'error') return transition(s, { type: 'JOB_FAILED', errorCode: 'PROVIDER_ERROR' });
  return transition(s, { type: 'JOB_SUCCEEDED', resultUrl: 'https://cdn/r.png' }); // -> result
}

describe('FSM happy-path transitions', () => {
  it('walks idle -> consent -> upload -> uploading -> processing -> result', () => {
    expect(INITIAL_STATE.name).toBe('idle');
    expect(reach('consent').name).toBe('consent');
    expect(reach('upload').name).toBe('upload');
    expect(reach('uploading').name).toBe('uploading');
    expect(reach('processing').name).toBe('processing');
    expect(reach('result').name).toBe('result');
  });

  it('processing -> error on JOB_FAILED, carrying the exact code', () => {
    const s = transition(reach('processing'), { type: 'JOB_FAILED', errorCode: 'RATE_LIMITED' });
    expect(s.name).toBe('error');
    expect(s.errorCode).toBe('RATE_LIMITED');
  });

  it('result carries the resultUrl', () => {
    expect(reach('result').resultUrl).toBe('https://cdn/r.png');
  });
});

describe('PRIVACY GUARD — no upload before explicit consent', () => {
  it('idle cannot reach upload by ANY event except OPEN->consent path', () => {
    for (const ev of ALL_EVENTS) {
      const next = transition(INITIAL_STATE, ev);
      // The only allowed escape from idle is to consent (never directly to upload).
      if (ev.type === 'OPEN') {
        expect(next.name).toBe('consent');
      } else {
        expect(next.name).toBe('idle');
      }
      expect(next.name).not.toBe('upload');
    }
  });

  it('consent->upload is reachable ONLY via CONSENT_ACCEPT', () => {
    const consent = reach('consent');
    for (const ev of ALL_EVENTS) {
      const next = transition(consent, ev);
      if (ev.type === 'CONSENT_ACCEPT') {
        expect(next.name).toBe('upload');
        expect(next.consentGiven).toBe(true);
      } else {
        expect(next.name).not.toBe('upload');
      }
    }
  });

  it('declining consent fails closed to idle and never proceeds', () => {
    const next = transition(reach('consent'), { type: 'CONSENT_DECLINE' });
    expect(next.name).toBe('idle');
    expect(next.consentGiven).toBe(false);
  });

  it('FILE_STAGED is refused when consentGiven is false (defence in depth)', () => {
    // Forge an upload-named state WITHOUT consent — staging must be refused.
    const forged: WidgetState = { name: 'upload', consentGiven: false };
    const next = transition(forged, { type: 'FILE_STAGED', photo });
    expect(next.photo).toBeUndefined();
    expect(hasStagedPhoto(next)).toBe(false);
  });

  it('error RETRY without consent fails closed to idle (cannot bypass consent)', () => {
    const forged: WidgetState = { name: 'error', consentGiven: false, errorCode: 'PROVIDER_ERROR' };
    expect(transition(forged, { type: 'RETRY' }).name).toBe('idle');
  });
});

describe('upload-screen guards', () => {
  it('SUBMIT does nothing without a staged photo', () => {
    const upload = reach('upload');
    expect(transition(upload, { type: 'SUBMIT' }).name).toBe('upload');
  });

  it('SUBMIT advances to uploading once a photo is staged', () => {
    let s = reach('upload');
    s = transition(s, { type: 'FILE_STAGED', photo });
    expect(transition(s, { type: 'SUBMIT' }).name).toBe('uploading');
  });

  it('FILE_CLEARED purges the staged photo', () => {
    let s = transition(reach('upload'), { type: 'FILE_STAGED', photo });
    expect(hasStagedPhoto(s)).toBe(true);
    s = transition(s, { type: 'FILE_CLEARED' });
    expect(hasStagedPhoto(s)).toBe(false);
  });

  it('FILE_REJECTED routes to error with the code AND purges the photo', () => {
    let s = transition(reach('upload'), { type: 'FILE_STAGED', photo });
    s = transition(s, { type: 'FILE_REJECTED', errorCode: 'PAYLOAD_TOO_LARGE' });
    expect(s.name).toBe('error');
    expect(s.errorCode).toBe('PAYLOAD_TOO_LARGE');
    expect(hasStagedPhoto(s)).toBe(false);
  });
});

describe('recovery & retry preserve consent and photo', () => {
  it('error RETRY with consent returns to upload, preserving the photo', () => {
    const errState: WidgetState = {
      name: 'error',
      consentGiven: true,
      photo,
      errorCode: 'PROVIDER_ERROR',
    };
    const next = transition(errState, { type: 'RETRY' });
    expect(next.name).toBe('upload');
    expect(next.photo).toEqual(photo);
    expect(next.errorCode).toBeUndefined();
  });

  it('result RETRY returns to upload and clears stale result/job', () => {
    const next = transition(reach('result'), { type: 'RETRY' });
    expect(next.name).toBe('upload');
    expect(next.resultUrl).toBeUndefined();
    expect(next.jobId).toBeUndefined();
  });
});

describe('CLOSE always returns to a clean idle (process-then-purge)', () => {
  it.each(['consent', 'upload', 'uploading', 'processing', 'result', 'error'] as const)(
    'CLOSE from %s -> idle with no photo and no consent',
    (name) => {
      const next = transition(reach(name), { type: 'CLOSE' });
      expect(next.name).toBe('idle');
      expect(next.consentGiven).toBe(false);
      expect(hasStagedPhoto(next)).toBe(false);
    },
  );
});

describe('purity & totality (property-based)', () => {
  const arbEvent: fc.Arbitrary<WidgetEvent> = fc.constantFrom(...ALL_EVENTS);
  const arbStateName = fc.constantFrom(
    'idle',
    'consent',
    'upload',
    'uploading',
    'processing',
    'result',
    'error',
  ) as fc.Arbitrary<WidgetState['name']>;
  const arbCode = fc.constantFrom<ErrorCode>(
    'INVALID_INPUT',
    'PROVIDER_ERROR',
    'RATE_LIMITED',
  );
  const arbState: fc.Arbitrary<WidgetState> = fc.record({
    name: arbStateName,
    consentGiven: fc.boolean(),
    photo: fc.option(fc.constant(photo), { nil: undefined }),
    errorCode: fc.option(arbCode, { nil: undefined }),
  }) as fc.Arbitrary<WidgetState>;

  it('is deterministic: same (state,event) -> identical result over many runs', () => {
    fc.assert(
      fc.property(arbState, arbEvent, (s, ev) => {
        const a = transition(s, ev);
        const b = transition(s, ev);
        expect(a).toEqual(b);
      }),
      { numRuns: 500 },
    );
  });

  it('never mutates the input state object', () => {
    fc.assert(
      fc.property(arbState, arbEvent, (s, ev) => {
        const snapshot = JSON.stringify(s);
        transition(s, ev);
        expect(JSON.stringify(s)).toBe(snapshot);
      }),
      { numRuns: 500 },
    );
  });

  it('fails closed to idle from an unknown state name (exhaustiveness guard)', () => {
    const rogue = { name: 'bogus', consentGiven: true } as unknown as WidgetState;
    expect(transition(rogue, { type: 'OPEN' }).name).toBe('idle');
  });

  it('always returns a valid, known state name (totality / fail-closed)', () => {
    const valid = new Set([
      'idle',
      'consent',
      'upload',
      'uploading',
      'processing',
      'result',
      'error',
    ]);
    fc.assert(
      fc.property(arbState, arbEvent, (s, ev) => {
        expect(valid.has(transition(s, ev).name)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('FILE_STAGED without consent NEVER introduces a photo that was not already there', () => {
    fc.assert(
      fc.property(arbState, (s) => {
        // Start from a state with NO photo and NO consent; staging must not add one.
        const clean: WidgetState = { ...s, consentGiven: false };
        delete (clean as { photo?: unknown }).photo;
        const next = transition(clean, { type: 'FILE_STAGED', photo });
        // Without consent, FILE_STAGED can never produce a staged photo (fail-closed).
        expect(next.photo).toBeUndefined();
      }),
      { numRuns: 300 },
    );
  });
});
