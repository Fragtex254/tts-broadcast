import { describe, it, expect } from 'vitest';
import { getApiErrorMessage } from './apiError';

describe('getApiErrorMessage', () => {
  it('should return fallback for non-object errors', () => {
    expect(getApiErrorMessage('string error', 'fallback')).toBe('fallback');
    expect(getApiErrorMessage(123, 'fallback')).toBe('fallback');
    expect(getApiErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('should extract error message from Axios-like error', () => {
    const axiosError = {
      response: {
        data: {
          error: 'Rate limit exceeded',
        },
      },
    };
    expect(getApiErrorMessage(axiosError, 'fallback')).toBe('Rate limit exceeded');
  });

  it('should return fallback when response.data.error is missing', () => {
    const error = { response: { data: {} } };
    expect(getApiErrorMessage(error, 'fallback')).toBe('fallback');
  });

  it('should return fallback for empty object', () => {
    expect(getApiErrorMessage({}, 'fallback')).toBe('fallback');
  });
});
