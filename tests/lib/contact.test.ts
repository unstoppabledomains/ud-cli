import { jest } from '@jest/globals';
import type { ContactPromptContext } from '../../src/lib/contact.js';

// Mock spinner before importing the module that uses it
const startMock = jest.fn();
const succeedMock = jest.fn();
const failMock = jest.fn();
jest.unstable_mockModule('../../src/lib/spinner.js', () => ({
  createSpinner: jest.fn(async () => ({ start: startMock, succeed: succeedMock, fail: failMock })),
}));

const { promptContactCreation } = await import('../../src/lib/contact.js');

/** Create a mock promptInput that returns values from a queue. */
function createMockPromptInput(values: string[]) {
  let i = 0;
  return jest.fn(async () => values[i++] ?? '');
}

const VALID_FIELDS = [
  'Jane',         // firstName
  'Doe',          // lastName
  'jane@test.com', // email
  '1',            // dialingPrefix
  '2125551234',   // phone number
  '123 Main St',  // street
  'New York',     // city
  'NY',           // stateProvince
  '10001',        // postalCode
  'us',           // countryCode (lowercase — should be uppercased)
];

describe('promptContactCreation', () => {
  let consoleSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    startMock.mockClear();
    succeedMock.mockClear();
    failMock.mockClear();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a contact with all valid fields', async () => {
    const mockPrompt = createMockPromptInput([...VALID_FIELDS]);
    const mockCallAction = jest.fn(async () => ({ id: 'ct-1' }));
    const ctx: ContactPromptContext = { promptInput: mockPrompt, callAction: mockCallAction };

    const result = await promptContactCreation(ctx);

    expect(result).toBe(true);
    expect(mockCallAction).toHaveBeenCalledWith('ud_contact_create', {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@test.com',
      phone: { dialingPrefix: '1', number: '2125551234' },
      street: '123 Main St',
      city: 'New York',
      stateProvince: 'NY',
      postalCode: '10001',
      countryCode: 'US', // uppercased
    });
    expect(succeedMock).toHaveBeenCalled();
  });

  it('returns false when user cancels at first prompt', async () => {
    const mockPrompt = createMockPromptInput(['']); // empty = cancel
    const mockCallAction = jest.fn<ContactPromptContext['callAction']>();
    const ctx: ContactPromptContext = { promptInput: mockPrompt, callAction: mockCallAction };

    const result = await promptContactCreation(ctx);

    expect(result).toBe(false);
    expect(mockCallAction).not.toHaveBeenCalled();
  });

  it('returns false when user cancels mid-flow', async () => {
    const mockPrompt = createMockPromptInput(['Jane', 'Doe', '']); // cancel at email
    const mockCallAction = jest.fn<ContactPromptContext['callAction']>();
    const ctx: ContactPromptContext = { promptInput: mockPrompt, callAction: mockCallAction };

    const result = await promptContactCreation(ctx);

    expect(result).toBe(false);
    expect(mockCallAction).not.toHaveBeenCalled();
  });

  it('returns false when API call fails', async () => {
    const mockPrompt = createMockPromptInput([...VALID_FIELDS]);
    const mockCallAction = jest.fn<ContactPromptContext['callAction']>().mockRejectedValue(new Error('Server error'));
    const ctx: ContactPromptContext = { promptInput: mockPrompt, callAction: mockCallAction };

    const result = await promptContactCreation(ctx);

    expect(result).toBe(false);
    expect(failMock).toHaveBeenCalled();
  });

  it('shows account email hint when provided', async () => {
    const mockPrompt = createMockPromptInput(['']); // cancel immediately
    const ctx: ContactPromptContext = { promptInput: mockPrompt, callAction: jest.fn<ContactPromptContext['callAction']>() };

    await promptContactCreation(ctx, 'Tip: Use your account email for auto-verification');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('auto-verification'),
    );
  });

  it('does not show account email hint when not provided', async () => {
    const mockPrompt = createMockPromptInput(['']); // cancel immediately
    const ctx: ContactPromptContext = { promptInput: mockPrompt, callAction: jest.fn<ContactPromptContext['callAction']>() };

    await promptContactCreation(ctx);

    // Should still show the header but not hint
    const allArgs = consoleSpy.mock.calls.flat().map(String);
    expect(allArgs.some(a => a.includes('auto-verification'))).toBe(false);
  });
});
