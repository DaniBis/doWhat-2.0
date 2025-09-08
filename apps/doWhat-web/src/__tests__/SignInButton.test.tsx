import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import SignInButton from '../components/SignInButton';
import { supabase } from '../lib/supabase/browser';

// Mock the supabase client
jest.mock('../lib/supabase/browser', () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn()
    }
  }
}));

const mockSignInWithOAuth = jest.mocked(supabase.auth.signInWithOAuth);

describe('SignInButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const { getByText } = render(<SignInButton />);
    expect(getByText('Sign in with Google')).toBeInTheDocument();
  });

  it('calls signInWithOAuth when clicked', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null } as any);
    
    const { getByText } = render(<SignInButton />);
    const button = getByText('Sign in with Google');
    
    fireEvent.click(button);
    
    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'http://localhost/auth/callback'
        }
      });
    });
  });
});
